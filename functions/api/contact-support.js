const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 if(!env.DB||!env.ISPARK_SNAPSHOTS)return reply({ok:false,error:'unavailable'},503);
 let body;try{const raw=await request.text();if(raw.length>3000)return reply({ok:false,error:'too_large'},413);body=JSON.parse(raw)}catch{return reply({ok:false,error:'invalid_request'},400)}
 const topic=String(body.topic||''),message=String(body.message||'').trim(),email=String(body.email||'').trim().toLowerCase(),website=String(body.website||'');
 if(website)return reply({ok:true});
 if(!['Navigasyon desteği','Otopark bilgisi düzeltme','Genel destek'].includes(topic)||message.length<15||message.length>2000||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return reply({ok:false,error:'invalid_request'},400);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const key='support:contact:limit:v2:'+hash;if(await env.ISPARK_SNAPSHOTS.get(key))return reply({ok:false,error:'rate_limited'},429);
 try{await env.DB.prepare("CREATE TABLE IF NOT EXISTS contact_support_requests (id TEXT PRIMARY KEY, email TEXT NOT NULL, topic TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)").run();
 const requestId=crypto.randomUUID(),accessToken=crypto.randomUUID()+crypto.randomUUID();const tokenHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(accessToken)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS support_reply_access (request_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, request_type TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
  await env.DB.prepare('INSERT INTO contact_support_requests (id,email,topic,message,status,created_at) VALUES (?,?,?,?,?,?)').bind(requestId,email,topic,message,'open',Date.now()).run();
  await env.DB.prepare('INSERT INTO support_reply_access (request_id,token_hash,request_type,created_at) VALUES (?,?,?,?)').bind(requestId,tokenHash,'contact',Date.now()).run();
 await env.ISPARK_SNAPSHOTS.put(key,'1',{expirationTtl:60});return reply({ok:true,requestId,accessToken})}catch{return reply({ok:false,error:'storage_unavailable'},503)}
}
