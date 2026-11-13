import {requirePushUser} from '../lib/push-auth.js';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validEndpoint=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&value.length<2048&&/^(?:[a-z0-9-]+\.)*(?:push\.apple\.com|push\.services\.mozilla\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)$/i.test(url.hostname)}catch{return false}};
export async function onRequestGet({env}) {
 const key=env.WEB_PUSH_PUBLIC_KEY;
 const configuration={publicKey:typeof key==='string'&&/^[A-Za-z0-9_-]{80,120}$/.test(key),database:typeof env.DB?.prepare==='function',queue:typeof env.NEARBY_PUSH_QUEUE?.send==='function'};
 // A public key alone does not mean reports can reach the delivery worker.
 // Expose only binding availability, never subscription records or secrets.
 if(!Object.values(configuration).every(Boolean))return reply({ok:false,error:'push_not_configured',configuration},503);
 return reply({ok:true,publicKey:key,configuration});
}
// Read the stream with a byte cap; Content-Length is only an early rejection.
async function readBody(request) {
 if(Number(request.headers.get('content-length'))>4096)throw {status:413,error:'too_large'};
 const reader=request.body?.getReader();if(!reader)throw {status:400,error:'invalid_json'};
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw {status:413,error:'too_large'}}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}catch{throw {status:400,error:'invalid_json'}}
}
async function mutate({request,env},remove) {
 if(!env.DB?.prepare||(!remove&&!env.WEB_PUSH_PUBLIC_KEY))return reply({ok:false,error:'push_not_configured'},503);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return reply({ok:false,error:'invalid_origin'},403);
 try{
  const user=await requirePushUser(request,env);
  const data=await readBody(request);
  // Atomic per-account fixed window. Failed ownership attempts also consume quota.
  const bucket=Math.floor(Date.now()/3600000);
  const rate=await env.DB.prepare(`INSERT INTO nearby_push_rate_limits(user_id,bucket,requests) VALUES(?,?,1)
   ON CONFLICT(user_id) DO UPDATE SET bucket=excluded.bucket,
   requests=CASE WHEN nearby_push_rate_limits.bucket=excluded.bucket THEN nearby_push_rate_limits.requests+1 ELSE 1 END
   RETURNING requests`).bind(user.id,bucket).first();
  if(!rate||rate.requests>20)return reply({ok:false,error:'rate_limited'},429);
  const sub=data.subscription,endpoint=remove?data.endpoint:sub?.endpoint;
  if(typeof endpoint!=='string'||!validEndpoint(endpoint))return reply({ok:false,error:'invalid_subscription'},400);
  const id=await hash(endpoint);
  if(remove){
   const row=await env.DB.prepare('SELECT user_id,auth,p256dh FROM nearby_push_subscriptions WHERE endpoint_hash=?').bind(id).first();
   if(!row)return reply({ok:true});
   // Legacy rows may only be removed with both original browser-held keys.
   if(row.user_id!==user.id&&!(row.user_id===null&&row.auth===data.auth&&row.p256dh===data.p256dh))return reply({ok:false,error:'subscription_forbidden'},403);
   await env.DB.prepare('DELETE FROM nearby_push_subscriptions WHERE endpoint_hash=? AND (user_id=? OR (user_id IS NULL AND auth=? AND p256dh=?))').bind(id,user.id,data.auth||'',data.p256dh||'').run();
   return reply({ok:true});
  }
  if(data.consent!==true)return reply({ok:false,error:'consent_required'},400);
  const lat=data.latitude,lng=data.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<35.5||lat>42.5||lng<25.5||lng>45||typeof sub?.keys?.p256dh!=='string'||typeof sub?.keys?.auth!=='string'||!/^[A-Za-z0-9_-]{40,200}$/.test(sub.keys.p256dh)||!/^[A-Za-z0-9_-]{15,80}$/.test(sub.keys.auth))return reply({ok:false,error:'invalid_subscription'},400);
  // Single SQLite write serializes quota and ownership checks, including concurrent claims.
  const saved=await env.DB.prepare(`INSERT INTO nearby_push_subscriptions(endpoint_hash,endpoint,p256dh,auth,latitude,longitude,user_id,consented_at)
   SELECT ?,?,?,?,?,?,?,datetime('now') WHERE
   ((SELECT COUNT(*) FROM nearby_push_subscriptions WHERE user_id=?)<5
    OR EXISTS(SELECT 1 FROM nearby_push_subscriptions WHERE endpoint_hash=? AND user_id=?))
   ON CONFLICT(endpoint_hash) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,
    latitude=excluded.latitude,longitude=excluded.longitude,user_id=excluded.user_id,
    consented_at=excluded.consented_at,updated_at=datetime('now')
   WHERE nearby_push_subscriptions.user_id=excluded.user_id
    OR (nearby_push_subscriptions.user_id IS NULL AND nearby_push_subscriptions.auth=excluded.auth AND nearby_push_subscriptions.p256dh=excluded.p256dh)
   RETURNING endpoint_hash`).bind(id,endpoint,sub.keys.p256dh,sub.keys.auth,lat,lng,user.id,user.id,id,user.id).first();
  if(!saved)return reply({ok:false,error:'subscription_forbidden_or_limit'},409);
  return reply({ok:true});
 }catch(error){return reply({ok:false,error:error?.error||'service_unavailable'},error?.status||503)}
}
export const onRequestPost=context=>mutate(context,false);
export const onRequestDelete=context=>mutate(context,true);
