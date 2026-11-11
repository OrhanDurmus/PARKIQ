const respond=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestPost({request,env}){
 if(!env.DB)return respond({ok:false},503);
 let body;try{body=await request.json()}catch{return respond({ok:false},400)}
 const id=String(body.requestId||''),token=String(body.accessToken||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f-]{72}$/i.test(token))return respond({ok:false},403);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 try{const auth=await env.DB.prepare('SELECT token_hash,request_type FROM support_reply_access WHERE request_id=?').bind(id).first();if(!auth||auth.token_hash!==hash)return respond({ok:false},403);
 const table=auth.request_type==='blocked'?'blocked_account_appeals':auth.request_type==='contact'?'contact_support_requests':null;if(!table)return respond({ok:false},403);
 const item=await env.DB.prepare('SELECT status,created_at FROM '+table+' WHERE id=?').bind(id).first();if(!item)return respond({ok:false},404);
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS support_admin_replies (request_id TEXT PRIMARY KEY, message TEXT NOT NULL, replied_at INTEGER NOT NULL)").run();
 const answer=await env.DB.prepare('SELECT message,replied_at FROM support_admin_replies WHERE request_id=?').bind(id).first();
 return respond({ok:true,status:item.status,createdAt:item.created_at,reply:answer?.message||null,repliedAt:answer?.replied_at||null})
 }catch{return respond({ok:false},503)}
}
