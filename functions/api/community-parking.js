// Community reports are short-lived observations, not verified legal parking permissions.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const keyPrefix='community:street:';
const validCoord=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=40&&lat<=42.5&&lng>=26&&lng<=31;
const store=env=>env?.ISPARK_SNAPSHOTS;
export async function onRequestGet({env}){
 const kv=store(env);if(!kv?.list||!kv?.get)return json({ok:false,error:'not_configured'},503);
 try{
  const keys=await kv.list({prefix:keyPrefix,limit:200});
  const items=(await Promise.all(keys.keys.map(x=>kv.get(x.name,'json')))).filter(x=>x&&x.expiresAt>Date.now()&&validCoord(x.lat,x.lng)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,150);
  return json({ok:true,points:items});
 }catch(e){return json({ok:false,error:'storage_unavailable'},503)}
}
export async function onRequestPost({request,env}){
 const kv=store(env);if(!kv?.put||!kv?.get)return json({ok:false,error:'not_configured'},503);
 const length=Number(request.headers.get('content-length')||0);if(length>2500)return json({ok:false,error:'too_large'},413);
 let data;try{const raw=await request.text();if(raw.length>2500)return json({ok:false,error:'too_large'},413);data=JSON.parse(raw)}catch{return json({ok:false,error:'invalid_json'},400)}
 const lat=Number(data.lat),lng=Number(data.lng),note=String(data.note||'').trim(),address=String(data.address||'').trim();
 if(!validCoord(lat,lng)||note.length>160||address.length>200||!['space','no_space'].includes(data.type))return json({ok:false,error:'invalid_report'},400);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 // One report per IP per 10 minutes. KV is eventually consistent; this is a soft abuse limit.
 const ipKey='community:rate:'+ip;
 try{
  if(await kv.get(ipKey))return json({ok:false,error:'rate_limited'},429);
  const id=crypto.randomUUID(),now=Date.now();
  const point={id,lat:Math.round(lat*1e5)/1e5,lng:Math.round(lng*1e5)/1e5,type:data.type,note,address,createdAt:now,expiresAt:now+2*60*60*1000};
  await kv.put(keyPrefix+id,JSON.stringify(point),{expirationTtl:7200});
  await kv.put(ipKey,'1',{expirationTtl:600});
  return json({ok:true,point},201);
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
