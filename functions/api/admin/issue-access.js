const reply=(v,s=200)=>Response.json(v,{status:s,headers:{"Cache-Control":"no-store"}});
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
export async function onRequestPost({request,env}){
 if(!env.DB||!env.ADMIN_TOKEN||request.headers.get("Authorization")!=="Bearer "+env.ADMIN_TOKEN)return reply({error:"Yetkisiz"},401);
 let body;try{body=await request.json()}catch{return reply({error:"Geçersiz veri"},400)}
 const id=Number(body.id);if(!Number.isSafeInteger(id)||id<1)return reply({error:"Geçersiz başvuru"},400);
 const row=await env.DB.prepare("SELECT a.id FROM business_applications a JOIN business_locations l ON l.application_id=a.id WHERE a.id=? AND a.status='approved'").bind(id).first();
 if(!row)return reply({error:"Onaylı ve konumlu işletme bulunamadı"},404);
 const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
 const token=Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
 const hash=await digest(token);
 await env.DB.prepare("INSERT INTO business_occupancy(application_id,token_hash,free_spaces,updated_at) VALUES(?,?,NULL,NULL) ON CONFLICT(application_id) DO UPDATE SET token_hash=excluded.token_hash,free_spaces=NULL,updated_at=NULL").bind(id,hash).run();
 return reply({ok:true,token,id});
}