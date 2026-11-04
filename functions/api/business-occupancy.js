const reply=(v,s=200)=>Response.json(v,{status:s,headers:{"Cache-Control":"no-store"}});
async function getOwner(request,env){
 const token=(request.headers.get("Authorization")||"").replace(/^Bearer /,"");
 if(!/^[0-9a-f]{64}$/.test(token))return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,"0")).join("");
 return env.DB.prepare("SELECT a.id,a.name,a.capacity,o.free_spaces,o.updated_at,h.opens_at,h.closes_at,h.is_24h FROM business_occupancy o JOIN business_applications a ON a.id=o.application_id LEFT JOIN business_hours h ON h.application_id=a.id WHERE o.token_hash=? AND a.status='approved'").bind(hash).first();
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
 const validTime=t=>typeof t==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t);
 const hours=body.hours;
 if(hours!==undefined){
 if(!hours||typeof hours!=='object'||typeof hours.is24h!=='boolean'||(!hours.is24h&&(!validTime(hours.opensAt)||!validTime(hours.closesAt)||hours.opensAt===hours.closesAt)))return reply({error:"Geçerli açılış ve kapanış saati girin"},400);
 }
 const cap=body.capacity===undefined?Number(a.capacity):Number(body.capacity);if(body.capacity!==undefined&&(!Number.isSafeInteger(cap)||cap<1||cap>100000))return reply({error:"Kapasite 1 ile 100000 arasında olmalı"},400);if(Number.isSafeInteger(cap)&&cap>0&&n>cap)return reply({error:"Kapasite aşıldı"},400);
 if(body.capacity!==undefined){await env.DB.batch([env.DB.prepare("UPDATE business_applications SET capacity=?,updated_at=datetime('now') WHERE id=?").bind(String(cap),a.id),env.DB.prepare("UPDATE business_occupancy SET free_spaces=?,updated_at=datetime('now') WHERE application_id=?").bind(n,a.id)]);}else{await env.DB.prepare("UPDATE business_occupancy SET free_spaces=?,updated_at=datetime('now') WHERE application_id=?").bind(n,a.id).run();}
 if(hours!==undefined){await env.DB.prepare("INSERT INTO business_hours (application_id,opens_at,closes_at,is_24h) VALUES (?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET opens_at=excluded.opens_at,closes_at=excluded.closes_at,is_24h=excluded.is_24h").bind(a.id,hours.is24h?null:hours.opensAt,hours.is24h?null:hours.closesAt,hours.is24h?1:0).run();}
 return reply({ok:true,freeSpaces:n,capacity:cap||null});
 }catch{return reply({error:"Güncelleme başarısız"},500)}
}