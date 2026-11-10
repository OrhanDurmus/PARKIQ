// Cloudflare Access signed JWT required for all account moderation actions.
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
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

const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function onRequestGet({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 const kv=env?.ISPARK_SNAPSHOTS;if(!kv?.list||!kv?.get)return json({ok:false,error:'not_configured'},503);
 try{
  let cursor,keys=[],pages=0;
  do{const page=await kv.list({prefix:'community:user:seen:',limit:200,...(cursor?{cursor}:{})});keys.push(...page.keys.map(x=>x.name));cursor=page.list_complete?undefined:page.cursor;pages++}while(cursor&&pages<5);
  const users=(await Promise.all(keys.map(k=>kv.get(k,'json')))).filter(u=>u&&validId(u.id));
  const enriched=await Promise.all(users.map(async u=>({...u,blocked:!!(await kv.get('community:user:blocked:'+u.id))})));
  enriched.sort((a,b)=>b.lastReportAt-a.lastReportAt);
  return json({ok:true,users:enriched,partial:!!cursor});
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
export async function onRequestPost({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 const kv=env?.ISPARK_SNAPSHOTS;if(!kv?.put||!kv?.delete||!kv?.get)return json({ok:false,error:'not_configured'},503);
 let data;try{const raw=await request.text();if(raw.length>500)return json({ok:false,error:'too_large'},413);data=JSON.parse(raw)}catch{return json({ok:false,error:'invalid_json'},400)}
 const id=String(data?.id||''),action=data?.action;
 if(!validId(id)||!['block','unblock'].includes(action))return json({ok:false,error:'invalid_request'},400);
 try{
  const known=await kv.get('community:user:seen:'+id);if(!known)return json({ok:false,error:'unknown_user'},404);
  if(action==='block')await kv.put('community:user:blocked:'+id,JSON.stringify({blockedAt:Date.now()}));
  else await kv.delete('community:user:blocked:'+id);
  await kv.put('community:audit:user:'+Date.now()+':'+crypto.randomUUID(),JSON.stringify({id,action,at:Date.now()}),{expirationTtl:60*60*24*90});
  return json({ok:true,id,blocked:action==='block'});
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
