// Protected by Cloudflare Access application covering /admin/*.
// Read-only endpoint; never return ownership hashes or moderation secrets.
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({env,request}){
  if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
  const kv=env?.ISPARK_SNAPSHOTS;
  if(!kv?.list||!kv?.get)return json({ok:false,error:'not_configured'},503);
  try{
    let cursor,keys=[],pages=0;
    do{
      const batch=await kv.list({prefix:'community:street:',limit:200,...(cursor?{cursor}:{})});
      keys.push(...batch.keys.map(k=>k.name));cursor=batch.list_complete?undefined:batch.cursor;pages++;
    }while(cursor&&pages<5);
    const now=Date.now();
    const history=new URL(request.url).searchParams.get('view')==='history';
    if(history){const audit=await kv.list({prefix:'community:audit:deleted:',limit:100});const events=(await Promise.all(audit.keys.map(k=>kv.get(k.name,'json')))).filter(Boolean).sort((a,b)=>b.deletedAt-a.deletedAt);return json({ok:true,events,partial:!audit.list_complete,checkedAt:now});}
    const items=(await Promise.all(keys.map(k=>kv.get(k,'json'))))
      .filter(x=>x&&x.expiresAt>now&&Number.isFinite(x.lat)&&Number.isFinite(x.lng))
      .sort((a,b)=>b.createdAt-a.createdAt).slice(0,200)
      .map(({ownerTokenHash,...publicFields})=>publicFields);
    return json({ok:true,points:items,partial:!!cursor,checkedAt:now});
  }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
// Moderation requires a cryptographically verified Cloudflare Access identity,
// not merely a client-supplied email or an unverified request header.
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
export async function onRequestDelete({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 const kv=env?.ISPARK_SNAPSHOTS;if(!kv?.get||!kv?.delete)return json({ok:false,error:'not_configured'},503);
 let data;try{const raw=await request.text();if(raw.length>300)return json({ok:false,error:'too_large'},413);data=JSON.parse(raw)}catch{return json({ok:false,error:'invalid_json'},400)}
 const id=String(data?.id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return json({ok:false,error:'invalid_id'},400);
 try{
  const key='community:street:'+id;const record=await kv.get(key,'json');
  if(!record)return json({ok:false,error:'not_found'},404);
  const deletedAt=Date.now();
  const allowedReasons=['wrong_location','duplicate','misleading','inappropriate','admin_removed'];
  const reason=allowedReasons.includes(data.reason)?data.reason:'admin_removed';
  const event={id,deletedAt,createdAt:record.createdAt||null,type:record.type||null,address:String(record.address||'').slice(0,240),lat:Number.isFinite(record.lat)?record.lat:null,lng:Number.isFinite(record.lng)?record.lng:null,displayName:String(record.displayName||'Misafir').slice(0,80),identityVerified:false,reason};
  await kv.put('community:audit:deleted:'+String(deletedAt)+':'+id,JSON.stringify(event),{expirationTtl:60*60*24*90});
  await kv.delete(key);
  return json({ok:true,id});
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
