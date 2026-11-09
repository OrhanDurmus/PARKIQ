// ROTAPARK: authenticated, size-limited İSPARK snapshot ingestion from iOS Shortcuts.
// Required Cloudflare Pages bindings: KV ISPARK_SNAPSHOTS; secret ISPARK_UPLOAD_TOKEN.
// Never treat upstream counts as verified live: the source lacks per-record update timestamps.
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const KEY='latest';
const isNum=v=>Number.isFinite(Number(v))&&v!==null&&v!==''&&v!==undefined;
export async function onRequestPost({request,env}){
  if(!env?.ISPARK_SNAPSHOTS||!env?.ISPARK_UPLOAD_TOKEN)return json({ok:false,error:'not_configured'},503);
  const auth=request.headers.get('Authorization')||'';
  // Compare full values, never accept token via URL or query parameters.
  const expected='Bearer '+env.ISPARK_UPLOAD_TOKEN;
  const a=new TextEncoder().encode(auth),b=new TextEncoder().encode(expected);
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a[i]||0)^(b[i]||0);
  if(diff!==0)return json({ok:false,error:'unauthorized'},401);
  const len=Number(request.headers.get('Content-Length'));
  if(Number.isFinite(len)&&len>1500000)return json({ok:false,error:'too_large'},413);
  let raw;
  try{
    const reader=request.body?.getReader();
    if(!reader)return json({ok:false,error:'empty_body'},400);
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();return json({ok:false,error:'too_large'},413);}chunks.push(value);}
    raw=new Uint8Array(size);let pos=0;for(const c of chunks){raw.set(c,pos);pos+=c.byteLength;}
  }catch{return json({ok:false,error:'invalid_body'},400);}
  let rows;
  try{const parsed=JSON.parse(new TextDecoder().decode(raw));rows=Array.isArray(parsed)?parsed:null;}catch{return json({ok:false,error:'invalid_json'},400);}
  if(!rows||rows.length<1||rows.length>2000)return json({ok:false,error:'invalid_rows'},400);
  const points=[];
  for(const item of rows){
    if(!item||typeof item!=='object')continue;
    const id=item.parkID??item.parkId;
    const name=item.parkName;
    const lat=Number(item.lat),lng=Number(item.lng);
    const capacity=isNum(item.capacity)?Number(item.capacity):null;
    const free=isNum(item.emptyCapacity)?Number(item.emptyCapacity):null;
    if(id==null||typeof name!=='string'||!name.trim()||name.length>160||!isNum(item.lat)||!isNum(item.lng)||lat<40||lat>42.5||lng<26||lng>31)continue;
    points.push({id:String(id).slice(0,32),name:name.trim(),lat,lng,
      capacity:Number.isInteger(capacity)&&capacity>0?capacity:null,
      freeSpaces:Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity)?free:null,
      occupancyUpdatedAt:null,verifiedLive:false,sourceSnapshot:true});
  }
  if(points.length===0)return json({ok:false,error:'no_valid_parks'},400);
  const receivedAt=new Date().toISOString();
  const snapshot={source:'IBB İSPARK',receivedAt,points,liveCount:0,verifiedLive:false,sourceSnapshot:true};
  try{await env.ISPARK_SNAPSHOTS.put(KEY,JSON.stringify(snapshot),{expirationTtl:86400});}
  catch{return json({ok:false,error:'storage_unavailable'},503);}
  return json({ok:true,accepted:points.length,receivedAt});
}
