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

const key='admin:flash:current';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 if(!env.ISPARK_SNAPSHOTS)return json({ok:false,error:'storage_unavailable'},503);
 const item=await env.ISPARK_SNAPSHOTS.get(key,'json');
 return json({ok:true,message:item&&item.expiresAt>Date.now()?item:null});
}
export async function onRequestPost({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 if(!env.ISPARK_SNAPSHOTS)return json({ok:false,error:'storage_unavailable'},503);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const message=String(body?.message||'').trim();
 if(message.length<1||message.length>400)return json({ok:false,error:'Mesaj 1-400 karakter olmalı.'},400);
 const duration=Number(body?.durationHours);
 if(![1,6,24,72].includes(duration))return json({ok:false,error:'invalid_duration'},400);
 const now=Date.now(),item={id:crypto.randomUUID(),message,createdAt:now,expiresAt:now+duration*3600000};
 await env.ISPARK_SNAPSHOTS.put(key,JSON.stringify(item),{expirationTtl:duration*3600});
 return json({ok:true,message:item});
}
export async function onRequestDelete({request,env}){
 if(!await verifiedAdmin(request,env))return json({ok:false,error:'admin_authorization_required'},403);
 if(!env.ISPARK_SNAPSHOTS)return json({ok:false,error:'storage_unavailable'},503);
 await env.ISPARK_SNAPSHOTS.delete(key);return json({ok:true});
}
