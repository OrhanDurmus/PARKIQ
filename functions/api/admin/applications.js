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

export async function onRequestDelete({request,env}){
 if(!auth(request,env))return json({error:'Yetkisiz'},401);
 if(!env.DB)return json({error:'D1 DB bağlantısı yok'},503);
 let body;try{body=await request.json()}catch{return json({error:'Geçersiz JSON'},400)}
 const id=Number(body?.id);
 if(!Number.isSafeInteger(id)||id<=0||body?.confirm!=='DELETE')return json({error:'Silme onayı geçersiz'},400);
 try{await env.DB.prepare('CREATE TABLE IF NOT EXISTS business_hours (application_id INTEGER PRIMARY KEY, opens_at TEXT, closes_at TEXT, is_24h INTEGER NOT NULL DEFAULT 0)').run();const found=await env.DB.prepare('SELECT id FROM business_applications WHERE id=?').bind(id).first();if(!found)return json({error:'Başvuru bulunamadı'},404);await env.DB.batch([env.DB.prepare('DELETE FROM business_hours WHERE application_id=?').bind(id),env.DB.prepare('DELETE FROM business_occupancy WHERE application_id=?').bind(id),env.DB.prepare('DELETE FROM business_locations WHERE application_id=?').bind(id),env.DB.prepare('DELETE FROM business_applications WHERE id=?').bind(id)]);return json({ok:true,deletedId:id})}catch{return json({error:'Başvuru silinemedi'},500)}
}
