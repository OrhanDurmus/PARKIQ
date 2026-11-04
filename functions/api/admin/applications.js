const json=(v,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function auth(request,env){const token=env.ADMIN_TOKEN;return typeof token==='string'&&token.length>=32&&request.headers.get('Authorization')==='Bearer '+token}
export async function onRequestGet({request,env}){
 if(!auth(request,env))return json({error:'Yetkisiz'},401);
 if(!env.DB)return json({error:'D1 DB bağlantısı yok'},503);
 const u=new URL(request.url),status=u.searchParams.get('status');
 if(status&&!['pending','approved','rejected'].includes(status))return json({error:'Geçersiz filtre'},400);
 try{const query=status?'SELECT * FROM business_applications WHERE status = ? ORDER BY id DESC LIMIT 100':'SELECT * FROM business_applications ORDER BY id DESC LIMIT 100';const q=env.DB.prepare(query);const r=await(status?q.bind(status).all():q.all());return json({applications:r.results})}catch{return json({error:'Başvurular okunamadı'},500)}
}
export async function onRequestPatch({request,env}){
 if(!auth(request,env))return json({error:'Yetkisiz'},401);
 if(!env.DB)return json({error:'D1 DB bağlantısı yok'},503);
 let body;try{body=await request.json()}catch{return json({error:'Geçersiz JSON'},400)}
 const id=Number(body?.id),status=body?.status;
 if(!Number.isSafeInteger(id)||id<=0||!['pending','approved','rejected'].includes(status))return json({error:'Geçersiz istek'},400);
 try{const r=await env.DB.prepare("UPDATE business_applications SET status=?,updated_at=datetime('now') WHERE id=?").bind(status,id).run();return json({ok:r.meta.changes>0})}catch{return json({error:'Güncellenemedi'},500)}
}
