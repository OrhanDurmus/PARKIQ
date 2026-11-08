// ROTAPARK: Istanbul's curated extract remains primary; other Turkish cities use bounded OSM queries.
const inTurkey=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=35.5&&lat<=42.5&&lng>=25.5&&lng<=45.0;
const inIstanbul=(lat,lng)=>lat>=40&&lat<=42.5&&lng>=26&&lng<=31;
const distanceSq=(p,lat,lng)=>{const dy=(p.lat-lat)*111195,dx=(p.lng-lng)*111195*Math.cos(lat*Math.PI/180);return dx*dx+dy*dy};
const validPoint=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
const response=(points,source,updatedAt)=>Response.json({points,source,updatedAt},{headers:{'Cache-Control':'public,max-age=600','X-Content-Type-Options':'nosniff'}});
function fromOsm(el){
 const t=el.tags||{},lat=Number(el.lat??el.center?.lat),lng=Number(el.lon??el.center?.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
 const fee=t.fee==='yes'?'yes':t.fee==='no'?'no':'unknown';
 const kind=t.parking==='underground'?'underground':t.parking==='multi-storey'?'multi-storey':t.parking==='surface'?'surface':t.parking==='street_side'?'street_side':'unknown';
 const name=String(t.name||t['name:tr']||'Otopark kaydı').slice(0,160);
 return {lat,lng,name,fee,kind,address:String(t['addr:street']||'').slice(0,160),operator:String(t.operator||'').slice(0,120),capacity:/^\d+$/.test(t.capacity||'')?Number(t.capacity):null,osmId:el.type+'/'+el.id,source:'OpenStreetMap',verifiedBusiness:false,freeSpaces:null,occupancyUpdatedAt:null};
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
 if(!inTurkey(lat,lng))return Response.json({error:'Koordinatlar Türkiye sınırları dışında'},{status:400});
 if(inIstanbul(lat,lng)){
  const asset=await env.ASSETS.fetch(new URL('/data/parking.json',url.origin).toString());
  if(!asset.ok)return Response.json({error:'İstanbul otopark veri dosyası bulunamadı'},{status:503});
  try{
   const data=await asset.json();
   if(!Array.isArray(data.points))throw Error('Invalid data');
   const points=data.points.filter(p=>validPoint(p)&&!(p.geographicStatus==='confirmed_outside_istanbul'&&p.geographicReviewVerified===true)&&distanceSq(p,lat,lng)<=10000**2).sort((a,b)=>distanceSq(a,lat,lng)-distanceSq(b,lat,lng)).slice(0,250);
   return response(points,data.source,data.updatedAt);
  }catch{return Response.json({error:'İstanbul otopark dosyası okunamadı'},{status:503})}
 }
 // Static nationwide dataset avoids public Overpass outages during user searches.
 const asset=await env.ASSETS.fetch(new URL('/data/parking-turkiye.json',url.origin).toString());
 if(!asset.ok)return Response.json({error:'Türkiye otopark veri dosyası henüz yayınlanmadı. GitHub Actions veri yenilemesi çalıştırılmalı.'},{status:503});
 try{
  const data=await asset.json();
  if(!Array.isArray(data.points))throw Error('Invalid data');
  const points=data.points.filter(p=>validPoint(p)&&distanceSq(p,lat,lng)<=10000**2).sort((a,b)=>distanceSq(a,lat,lng)-distanceSq(b,lat,lng)).slice(0,250);
  return response(points,data.source,data.updatedAt);
 }catch{return Response.json({error:'Türkiye otopark veri dosyası okunamadı'},{status:503})}
}
