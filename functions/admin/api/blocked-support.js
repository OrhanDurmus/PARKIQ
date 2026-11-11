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

const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestGet({request,env}){
 if(!await verifiedAdmin(request,env))return reply({ok:false,error:'forbidden'},403);
 if(!env.DB)return reply({ok:false,error:'storage_unavailable'},503);
 try{await env.DB.prepare("CREATE TABLE IF NOT EXISTS blocked_account_appeals (id TEXT PRIMARY KEY, email TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)").run();
 const rows=await env.DB.prepare('SELECT id,email,message,status,created_at FROM blocked_account_appeals ORDER BY created_at DESC LIMIT 100').all();return reply({ok:true,items:rows.results||[]})}catch{return reply({ok:false,error:'storage_unavailable'},503)}
}
export async function onRequestPost({request,env}){
 if(!await verifiedAdmin(request,env))return reply({ok:false,error:'forbidden'},403);
 if(!env.DB)return reply({ok:false,error:'storage_unavailable'},503);
 let body;try{body=await request.json()}catch{return reply({ok:false},400)}
 if(!/^[0-9a-f-]{36}$/i.test(String(body.id||''))||!['open','reviewed','closed'].includes(body.status))return reply({ok:false},400);
 try{await env.DB.prepare('UPDATE blocked_account_appeals SET status=? WHERE id=?').bind(body.status,body.id).run();return reply({ok:true})}catch{return reply({ok:false},503)}
}
