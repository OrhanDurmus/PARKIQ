// ROTAPARK: authenticated, size-limited İSPARK snapshot ingestion from iOS Shortcuts.
// Required Cloudflare Pages bindings: KV ISPARK_SNAPSHOTS; secret ISPARK_UPLOAD_TOKEN.
import { measurementTime, repairName, SNAPSHOT_WINDOW_MS } from '../_shared/ispark.js';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const KEY='latest';
const isNum=v=>(typeof v==='number'||(typeof v==='string'&&v.trim()!==''))&&Number.isFinite(Number(v));
export async function onRequestPost({request,env}){
  // Report only binding presence, never secret values or request credentials.
  const kv=env?.ISPARK_SNAPSHOTS;
  const hasKv=typeof kv?.put==='function'&&typeof kv?.get==='function';
  const hasToken=typeof env?.ISPARK_UPLOAD_TOKEN==='string'&&env.ISPARK_UPLOAD_TOKEN.length>0;
  if(!hasKv||!hasToken)return json({ok:false,error:'not_configured',diagnostic:{kvBinding:hasKv?'present':kv==null?'missing':'invalid',kvBindingType:typeof kv,kvPutType:typeof kv?.put,uploadToken:hasToken?'present':'missing'}},503);
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
  let rows, collectedAt;
  try{
    // iOS Shortcuts may send the source JSON as text, a JSON list,
    // or wrap it in a dictionary when using its request-body editor.
    let parsed=JSON.parse(new TextDecoder().decode(raw));
    collectedAt=parsed?.collectedAt;
    for(let depth=0;depth<3;depth++){
      if(Array.isArray(parsed))break;
      if(typeof parsed==='string'){parsed=JSON.parse(parsed);continue;}
      if(parsed&&typeof parsed==='object'){
        const candidate=parsed.parks??parsed.rows??parsed.data??parsed.payload??parsed.ISPARK_VERI??parsed.text;
        if(candidate!==undefined){parsed=candidate;continue;}
      }
      break;
    }
    rows=Array.isArray(parsed)?parsed:null;
  }catch{return json({ok:false,error:'invalid_json'},400);}
  if(!rows||rows.length<1||rows.length>2000){
    // Safe structural diagnostics: no payload, credentials, or parking data.
    const decoded=new TextDecoder().decode(raw);
    let parsedType='unknown',topKeys=[],arrayLength=null;
    try{
      const root=JSON.parse(decoded);
      parsedType=Array.isArray(root)?'array':root===null?'null':typeof root;
      if(root&&typeof root==='object'&&!Array.isArray(root))topKeys=Object.keys(root).slice(0,12);
      if(Array.isArray(root))arrayLength=root.length;
    }catch{}
    return json({ok:false,error:'invalid_rows',diagnostic:{parsedType,topKeys,arrayLength,bodyBytes:raw.length,firstChar:decoded.trim().slice(0,1)}},400);
  }
  const now=Date.now();
  const receivedAt=new Date(now).toISOString();
  const automated=collectedAt!==undefined;
  if(automated){
    const stamp=typeof collectedAt==='string'&&collectedAt.endsWith('Z')?Date.parse(measurementTime(collectedAt)??''):NaN;
    if(!Number.isFinite(stamp)||stamp>now||now-stamp>5*60*1000)
      return json({ok:false,error:'invalid_collection_time'},400);
    collectedAt=new Date(stamp).toISOString();
  }
  const points=[];
  const ids=new Set();
  for(const item of rows){
    if(!item||typeof item!=='object')continue;
    const id=item.parkID??item.parkId;
    const name=item.parkName;
    const lat=Number(item.lat),lng=Number(item.lng);
    const capacity=isNum(item.capacity)?Number(item.capacity):null;
    const free=isNum(item.emptyCapacity)?Number(item.emptyCapacity):null;
    if(id==null||typeof name!=='string'||!name.trim()||name.length>160||!isNum(item.lat)||!isNum(item.lng)||lat<40||lat>42.5||lng<26||lng>31)continue;
    const parkId=String(id).trim().slice(0,32);
    if(!parkId||ids.has(parkId))continue;
    ids.add(parkId);
    const measuredAt=measurementTime(item.lastUpdate??item.LastUpdate??item.updatedAt??item.UpdatedAt??item.occupancyUpdatedAt??item.updateDate??item.UpdateDate);
    points.push({id:parkId,name:repairName(name.trim()),lat,lng,
      capacity:Number.isInteger(capacity)&&capacity>0?capacity:null,
      freeSpaces:Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity)?free:null,
      measuredAt,occupancyUpdatedAt:null,verifiedLive:false,sourceSnapshot:true});
  }
  if(points.length===0)return json({ok:false,error:'no_valid_parks'},400);
  if(automated&&points.length<100)return json({ok:false,error:'incomplete_snapshot'},400);
  const snapshot={source:'IBB İSPARK',receivedAt,...(automated?{collectedAt}:{}),points,sourceSnapshot:true};
  try{
    const previous=await kv.get(KEY,'json');
    const previousTime=Date.parse(previous?.collectedAt??previous?.receivedAt??'');
    if(Number.isFinite(previousTime)&&now-previousTime<SNAPSHOT_WINDOW_MS){
      if(Date.parse(collectedAt??receivedAt)<=previousTime)
        return json({ok:false,error:'older_snapshot'},409);
      if(points.length<Math.ceil((previous.points?.length??0)*0.8))
        return json({ok:false,error:'incomplete_snapshot'},409);
    }
    await kv.put(KEY,JSON.stringify(snapshot),{expirationTtl:86400});
  }
  catch{return json({ok:false,error:'storage_unavailable'},503);}
  return json({ok:true,accepted:points.length,receivedAt});
}
