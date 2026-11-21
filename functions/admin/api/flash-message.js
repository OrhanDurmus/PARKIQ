import {key, historyPrefix, archive, json, publishFlashMessage} from '../../_lib/flash-message.mjs';
const TEAM='plain-feather-2800.cloudflareaccess.com';
const decode64=v=>{const b=atob(v.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function verifiedAdmin(request,env){
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token)return false;
 const parts=token.split('.');if(parts.length!==3)return false;
 let header,claims;
 try{header=JSON.parse(new TextDecoder().decode(decode64(parts[0])));claims=JSON.parse(new TextDecoder().decode(decode64(parts[1])))}catch{return false}
 if(header.alg!=='RS256'||!header.kid||claims.iss!=='https://'+TEAM||!claims.exp||claims.exp<=Date.now()/1000||claims.nbf>Date.now()/1000)return false;
 // Optional strict application audience when configured in Pages environment.
 if(env.ACCESS_ADMIN_AUD&&!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(env.ACCESS_ADMIN_AUD))return false;
 const permitted=String(env.ACCESS_ADMIN_EMAILS||'o.durmus1903@gmail.com').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
 if(!permitted.includes(String(claims.email||'').toLowerCase()))return false;
 try{
  const response=await fetch('https://'+TEAM+'/cdn-cgi/access/certs',{cf:{cacheTtl:300,cacheEverything:true}});
  if(!response.ok)return false;
  const certs=await response.json();
  const jwk=(certs.keys||[]).find(k=>k.kid===header.kid&&k.kty==='RSA');
  if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch{return false}
}

export async function onRequestGet({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 if(!env.ISPARK_SNAPSHOTS)return json({ok:false,error:'storage_unavailable'},503);
 const kv=env.ISPARK_SNAPSHOTS;
 const item=await kv.get(key,'json');
 if(new URL(request.url).searchParams.get('view')==='history'){
  const listing=await kv.list({prefix:historyPrefix,limit:100});
  const records=(await Promise.all(listing.keys.map(k=>kv.get(k.name,'json')))).filter(Boolean).sort((a,b)=>b.createdAt-a.createdAt);
  let counts={};if(env.DB){try{await env.DB.prepare("CREATE TABLE IF NOT EXISTS flash_message_events (announcement_id TEXT NOT NULL, device_id TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(announcement_id,device_id,event))").run();const stats=await env.DB.prepare('SELECT announcement_id,event,COUNT(*) AS total FROM flash_message_events GROUP BY announcement_id,event').all();for(const row of stats.results||[]){if(!counts[row.announcement_id])counts[row.announcement_id]={views:0,acks:0};counts[row.announcement_id][row.event==='ack'?'acks':'views']=row.total}}catch{}}
  for(const record of records)record.stats=counts[record.id]||{views:0,acks:0};
  return json({ok:true,history:records,partial:!listing.list_complete,activeId:item&&item.expiresAt>Date.now()?item.id:null});
 }
 return json({ok:true,message:item&&item.expiresAt>Date.now()?item:null});
}
export async function onRequestPost({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 return publishFlashMessage(request,env);
}
export async function onRequestDelete({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 if(!env.ISPARK_SNAPSHOTS)return json({ok:false,error:'storage_unavailable'},503);
 const current=await env.ISPARK_SNAPSHOTS.get(key,'json');
 if(current)await archive(env.ISPARK_SNAPSHOTS,{...current,removedAt:Date.now(),removalReason:'admin_removed'});
 await env.ISPARK_SNAPSHOTS.delete(key);return json({ok:true});
}
