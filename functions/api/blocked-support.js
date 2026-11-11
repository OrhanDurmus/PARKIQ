const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 if(!env.ISPARK_SNAPSHOTS||!env.DB)return reply({ok:false,error:'unavailable'},503);
 let body;try{const raw=await request.text();if(raw.length>2500)return reply({ok:false,error:'too_large'},413);body=JSON.parse(raw)}catch{return reply({ok:false,error:'invalid_request'},400)}
 const ticket=String(body.ticket||''),message=String(body.message||'').trim();
 if(!/^[a-f0-9-]{72}$/i.test(ticket)||message.length<15||message.length>1200)return reply({ok:false,error:'invalid_request'},400);
 const kv=env.ISPARK_SNAPSHOTS;
 const record=await kv.get('support:ticket:'+ticket,'json');if(!record||Date.now()-record.createdAt>600000)return reply({ok:false,error:'expired_ticket'},403);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const ipKey='support:limit:ip:'+await digest(ip),emailKey='support:limit:email:'+await digest(record.email);
 if(await kv.get(ipKey)||await kv.get(emailKey))return reply({ok:false,error:'rate_limited'},429);
 try{
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS blocked_account_appeals (id TEXT PRIMARY KEY, email TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\', created_at INTEGER NOT NULL)').run();
  const requestId=crypto.randomUUID(),accessToken=crypto.randomUUID()+crypto.randomUUID();const tokenHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(accessToken)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS support_reply_access (request_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, request_type TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
  await env.DB.prepare('INSERT INTO blocked_account_appeals (id,email,message,status,created_at) VALUES (?,?,?,?,?)').bind(requestId,record.email,message,'open',Date.now()).run();
  await env.DB.prepare('INSERT INTO support_reply_access (request_id,token_hash,request_type,created_at) VALUES (?,?,?,?)').bind(requestId,tokenHash,'blocked',Date.now()).run();
  await kv.put(ipKey,'1',{expirationTtl:3600});await kv.put(emailKey,'1',{expirationTtl:86400});await kv.delete('support:ticket:'+ticket);
  return reply({ok:true,requestId,accessToken});
 }catch{return reply({ok:false,error:'storage_unavailable'},503)}
}
