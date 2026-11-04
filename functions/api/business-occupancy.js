const reply=(v,s=200)=>Response.json(v,{status:s,headers:{"Cache-Control":"no-store"}});
async function getOwner(request,env){
 const token=(request.headers.get("Authorization")||"").replace(/^Bearer /,"");
 if(!/^[0-9a-f]{64}$/.test(token))return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,"0")).join("");
 return env.DB.prepare("SELECT a.id,a.name,a.capacity,o.free_spaces,o.updated_at FROM business_occupancy o JOIN business_applications a ON a.id=o.application_id WHERE o.token_hash=? AND a.status='approved'").bind(hash).first();
}
export async function onRequestGet({request,env}){
 if(!env.DB)return reply({error:"Veritabanı yok"},503);
 try{const a=await getOwner(request,env);return a?reply({business:a}):reply({error:"Erişim reddedildi"},401)}catch{return reply({error:"Veritabanı hatası"},500)}
}
export async function onRequestPost({request,env}){
 if(!env.DB)return reply({error:"Veritabanı yok"},503);
 try{
 const a=await getOwner(request,env);if(!a)return reply({error:"Erişim reddedildi"},401);
 const body=await request.json(),n=body.freeSpaces;
 if(!Number.isSafeInteger(n)||n<0||n>100000)return reply({error:"Geçerli sayı girin"},400);
 const cap=Number(a.capacity);if(a.capacity&&Number.isSafeInteger(cap)&&cap>0&&n>cap)return reply({error:"Kapasite aşıldı"},400);
 await env.DB.prepare("UPDATE business_occupancy SET free_spaces=?,updated_at=datetime('now') WHERE application_id=?").bind(n,a.id).run();
 return reply({ok:true,freeSpaces:n});
 }catch{return reply({error:"Güncelleme başarısız"},500)}
}