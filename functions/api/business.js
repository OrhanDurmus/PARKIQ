const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const trim=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:'Veritabanı henüz bağlanmadı. E-posta başvurusunu kullanın.',code:'DB_NOT_CONFIGURED'},503);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON gerekli'},415);
 if(Number(request.headers.get('content-length')||0)>10000)return json({error:'İstek çok büyük'},413);
 let raw;try{raw=await request.json()}catch{return json({error:'Geçersiz JSON'},400)}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return json({error:'Geçersiz başvuru'},400);
 if(raw.website)return json({ok:true},202);
 const name=trim(raw.name,100),district=trim(raw.district,300),contact=trim(raw.contact,160);
 if(name.length<2||district.length<5||!contact)return json({error:'İşletme adı, adres ve iletişim bilgisi gerekli.'},400);
 const kind=trim(raw.kind,60),capacity=trim(raw.capacity,10),fee=trim(raw.fee,40),details=trim(raw.details,800),requestType=trim(raw.request,100);
 try{
 const r=await env.DB.prepare('INSERT INTO business_applications (name,district,contact,kind,capacity,fee,details,request_type) VALUES (?,?,?,?,?,?,?,?)').bind(name,district,contact,kind,capacity,fee,details,requestType).run();
 return json({ok:true,id:r.meta.last_row_id},201)
 }catch{return json({error:'Başvuru kaydedilemedi.'},500)}
}
