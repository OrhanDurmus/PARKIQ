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
async function attachApprovedEntrances(points,env,origin){
 // Optional reviewed-only asset: missing or malformed data must never block parking search.
 try{
  const asset=await env.ASSETS.fetch(new URL('/data/parking-entrances-approved.json',origin).toString());
  if(!asset.ok)return points;
  const data=await asset.json();
  if(data?.schemaVersion!==1||!data.entrances||Array.isArray(data.entrances)||typeof data.entrances!=='object')return points;
  return points.map(p=>{
   const key=p.osmType&&p.osmId?String(p.osmType)+'/'+String(p.osmId):String(p.osmId||'');
   const entry=Object.prototype.hasOwnProperty.call(data.entrances,key)?data.entrances[key]:null;
   if(!entry||entry.entranceVerified!==true)return p;
   const lat=entry.entranceLat,lng=entry.entranceLng;
   if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0))return p;
   if(distanceSq({lat,lng},Number(p.lat),Number(p.lng))>500**2)return p;
   if(!String(entry.entranceOsmUrl||'').startsWith('https://www.openstreetmap.org/node/')||
      !String(entry.roadOsmUrl||'').startsWith('https://www.openstreetmap.org/way/')||
      !String(entry.evidenceUrl||'').startsWith('https://'))return p;
   return {...p,entranceLat:lat,entranceLng:lng,entranceVerified:true};
  });
 }catch{return points}
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
 const radiusRaw=Number(url.searchParams.get('radius')||10),radiusKm=[3,10,20,30].includes(radiusRaw)?radiusRaw:10,radiusSq=(radiusKm*1000)**2;
 if(!inTurkey(lat,lng))return Response.json({error:'Koordinatlar Türkiye sınırları dışında'},{status:400});
 if(inIstanbul(lat,lng)){
  const asset=await env.ASSETS.fetch(new URL('/data/parking.json',url.origin).toString());
  if(!asset.ok)return Response.json({error:'İstanbul otopark veri dosyası bulunamadı'},{status:503});
  try{
   const data=await asset.json();
   if(!Array.isArray(data.points))throw Error('Invalid data');
   const points=data.points.filter(p=>validPoint(p)&&!(p.geographicStatus==='confirmed_outside_istanbul'&&p.geographicReviewVerified===true)&&distanceSq(p,lat,lng)<=radiusSq).sort((a,b)=>distanceSq(a,lat,lng)-distanceSq(b,lat,lng)).slice(0,250);
   return response(await attachApprovedEntrances(points,env,url.origin),data.source,data.updatedAt);
  }catch{return Response.json({error:'İstanbul otopark dosyası okunamadı'},{status:503})}
 }
 // Static nationwide dataset avoids public Overpass outages during user searches.
 const asset=await env.ASSETS.fetch(new URL('/data/parking-turkiye.json',url.origin).toString());
 if(!asset.ok)return Response.json({error:'Türkiye otopark veri dosyası henüz yayınlanmadı. GitHub Actions veri yenilemesi çalıştırılmalı.'},{status:503});
 try{
  const data=await asset.json();
  if(!Array.isArray(data.points))throw Error('Invalid data');
  const points=data.points.filter(p=>validPoint(p)&&distanceSq(p,lat,lng)<=radiusSq).sort((a,b)=>distanceSq(a,lat,lng)-distanceSq(b,lat,lng)).slice(0,250);
  return response(await attachApprovedEntrances(points,env,url.origin),data.source,data.updatedAt);
 }catch{return Response.json({error:'Türkiye otopark veri dosyası okunamadı'},{status:503})}
}
