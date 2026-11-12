const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validEndpoint=value=>{try{const url=new URL(value);return url.protocol==='https:'&&value.length<2048&&/^(?:[a-z0-9-]+\.)*(?:push\.apple\.com|push\.services\.mozilla\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)$/i.test(url.hostname)}catch{return false}};
export async function onRequestGet({env}) {
 const key=env.WEB_PUSH_PUBLIC_KEY;
 const configuration={publicKey:typeof key==='string'&&/^[A-Za-z0-9_-]{80,120}$/.test(key),database:typeof env.DB?.prepare==='function',queue:typeof env.NEARBY_PUSH_QUEUE?.send==='function'};
 // A public key alone does not mean reports can reach the delivery worker.
 // Expose only binding availability, never subscription records or secrets.
 if(!Object.values(configuration).every(Boolean))return reply({ok:false,error:'push_not_configured',configuration},503);
 return reply({ok:true,publicKey:key,configuration});
}
export async function onRequestPost({request,env}){
 if(!env.DB||!env.WEB_PUSH_PUBLIC_KEY)return reply({ok:false,error:'push_not_configured'},503);
 if(Number(request.headers.get('content-length'))>8192)return reply({ok:false},413);
 let data;try{data=await request.json()}catch{return reply({ok:false},400)}
 const subscription=data?.subscription,endpoint=subscription?.endpoint;
 const lat=Number(data?.latitude),lng=Number(data?.longitude);
 if(typeof endpoint!=='string'||!validEndpoint(endpoint)||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<35.5||lat>42.5||lng<25.5||lng>45||typeof subscription?.keys?.p256dh!=='string'||typeof subscription?.keys?.auth!=='string'||!/^[A-Za-z0-9_-]{40,200}$/.test(subscription.keys.p256dh)||!/^[A-Za-z0-9_-]{15,80}$/.test(subscription.keys.auth))return reply({ok:false,error:'invalid_subscription'},400);
 const id=await hash(endpoint);
 try{
  await env.DB.prepare("INSERT INTO nearby_push_subscriptions(endpoint_hash,endpoint,p256dh,auth,latitude,longitude) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,latitude=excluded.latitude,longitude=excluded.longitude,updated_at=datetime('now')").bind(id,endpoint,subscription.keys.p256dh,subscription.keys.auth,lat,lng).run();
  return reply({ok:true});
 }catch{return reply({ok:false,error:'database_unavailable'},503)}
}

export async function onRequestDelete({request,env}){
 if(!env.DB)return reply({ok:false,error:'database_unavailable'},503);
 const origin=request.headers.get('origin');
 if(origin!==new URL(request.url).origin)return reply({ok:false,error:'invalid_origin'},403);
 if(Number(request.headers.get('content-length'))>8192)return reply({ok:false},413);
 let data;try{data=await request.json()}catch{return reply({ok:false,error:'invalid_json'},400)}
 const endpoint=data?.endpoint,auth=data?.auth;
 if(typeof endpoint!=='string'||!validEndpoint(endpoint)||typeof auth!=='string'||!/^[A-Za-z0-9_-]{15,80}$/.test(auth))return reply({ok:false,error:'invalid_endpoint'},400);
 try{
  await env.DB.prepare('DELETE FROM nearby_push_subscriptions WHERE endpoint_hash=? AND auth=?').bind(await hash(endpoint),auth).run();
  return reply({ok:true});
 }catch{return reply({ok:false,error:'database_unavailable'},503)}
}
