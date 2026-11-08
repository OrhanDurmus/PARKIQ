export async function onRequestGet({request,env}){
 const headers={'Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff'};
 if(!env.DB)return Response.json({points:[]},{headers});
 const url=new URL(request.url),lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<35.5||lat>42.5||lng<25.5||lng>45)return Response.json({error:'Geçersiz koordinat'},{status:400});
 try{
 const radius=3000,rad=Math.PI/180;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS business_hours (application_id INTEGER PRIMARY KEY, opens_at TEXT, closes_at TEXT, is_24h INTEGER NOT NULL DEFAULT 0)').run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS business_pricing (application_id INTEGER PRIMARY KEY, hourly_price REAL, daily_price REAL, currency TEXT NOT NULL DEFAULT 'TRY', updated_at TEXT NOT NULL DEFAULT (datetime('now')))" ).run();const rows=await env.DB.prepare("SELECT a.id,a.name,a.district,a.kind,a.fee,a.capacity,a.details,l.lat,l.lng,o.free_spaces,o.updated_at,o.free_spaces,o.updated_at AS occupancy_updated_at,h.opens_at,h.closes_at,h.is_24h,p.hourly_price,p.daily_price FROM business_applications a JOIN business_locations l ON l.application_id=a.id LEFT JOIN business_occupancy o ON o.application_id=a.id LEFT JOIN business_hours h ON h.application_id=a.id LEFT JOIN business_pricing p ON p.application_id=a.id WHERE a.status='approved' AND l.lat BETWEEN ? AND ? AND l.lng BETWEEN ? AND ? LIMIT 500").bind(lat-.04,lat+.04,lng-.055,lng+.055).all();
 const points=(rows.results||[]).filter(p=>{const x=(p.lat-lat)*111195,y=(p.lng-lng)*111195*Math.cos(lat*rad);return x*x+y*y<=radius*radius}).slice(0,100).map(p=>({lat:p.lat,lng:p.lng,name:p.name,address:p.district,kind:p.kind==='Açık otopark'?'surface':p.kind==='Yer altı otoparkı'?'underground':p.kind==='Kapalı / katlı otopark'?'multi-storey':'unknown',fee:p.fee==='Ücretli'?'yes':p.fee==='Ücretsiz'?'no':'unknown',operator:p.name,capacity:p.capacity,verifiedBusiness:true,applicationId:p.id,freeSpaces:p.free_spaces,occupancyUpdatedAt:p.occupancy_updated_at,opensAt:p.opens_at,closesAt:p.closes_at,is24h:p.is_24h===1,hourlyPrice:p.hourly_price,dailyPrice:p.daily_price}));
 return Response.json({points},{headers});
 }catch{return Response.json({points:[],warning:'İşletme doluluk tablosu kurulumu bekleniyor'},{headers:{'Cache-Control':'no-store'}})}
}
