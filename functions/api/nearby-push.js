const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validEndpoint=value=>{try{const url=new URL(value);return url.protocol==='https:'&&value.length<2048&&/^(?:[a-z0-9-]+\.)*(?:push\.apple\.com|push\.services\.mozilla\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)$/i.test(url.hostname)}catch{return false}};
export async function onRequestGet({env}) {
 const key=env.WEB_PUSH_PUBLIC_KEY;
 return key&&/^[A-Za-z0-9_-]{80,120}$/.test(key)?reply({ok:true,publicKey:key}):reply({ok:false,error:'push_not_configured'},503);
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
  await env.DB.prepare("INSERT INTO nearby_push_subscriptions(endpoint_hash,endpoint,p256dh,auth,latitude,longitude) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,updated_at=datetime('now')").bind(id,endpoint,subscription.keys.p256dh,subscription.keys.auth,lat,lng).run();
  return reply({ok:true});
 }catch{return reply({ok:false,error:'database_unavailable'},503)}
}
