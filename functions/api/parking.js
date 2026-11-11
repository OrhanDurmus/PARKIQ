// ROTAPARK: Istanbul's curated extract remains primary; other Turkish cities use bounded OSM queries.
const inTurkey=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=35.5&&lat<=42.5&&lng>=25.5&&lng<=45.0;
const inIstanbul=(lat,lng)=>lat>=40&&lat<=42.5&&lng>=26&&lng<=31;
const distanceSq=(p,lat,lng)=>{const dy=(p.lat-lat)*111195,dx=(p.lng-lng)*111195*Math.cos(lat*Math.PI/180);return dx*dx+dy*dy};
const validPoint=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
// Verified co-located parking records (within 12 m, unique named OSM parking feature).
// Do not infer business identities from a nearby street or unrelated POI.
const reviewedNames={
 'node/7592484269':'İspark Merter Katlı Otopark',
 'way/1540107114':'Darüşşafaka Metro Otoparkı'
};
const enrichName=p=>{
 const key=String(p.osmType||'')+'/'+String(p.osmId||'').replace(/^(node|way|relation)\//,'');
 if(!/^(?:Otopark kaydı|Otopark|Parking)$/iu.test(String(p.name||'').trim()))return p;
 const reviewed=reviewedNames[key];
 if(reviewed)return {...p,name:reviewed,nameSource:'reviewed-co-located-osm'};
 const operator=String(p.operator||'').trim();
 if(operator&&!/^(?:otopark|otopark kaydı|personel otoparkı|bina otoparkı|özel otopark|park alanı|tır & kamyon park alanı)$/iu.test(operator)){
  return {...p,name:operator+' · Otopark',nameSource:'osm-operator-label'};
 }
 return p;
};
// Do not offer restricted facilities as public parking destinations.
// Keep untagged facilities visible but explicitly mark their access as unverified.
const parkingAccess=p=>String(p.access??p['access']??p.tags?.access??p.motorVehicleAccess??p.motor_vehicle??p.tags?.motor_vehicle??'').trim().toLowerCase();
const restrictedParking=p=>['private','no','customers','residents','employees','staff','permit','delivery','destination','agricultural','forestry','military'].includes(parkingAccess(p))||p.publicAccess===false||p.isPublic===false;
const publicParking=p=>!restrictedParking(p);
const labelParkingAccess=p=>({...p,publicAccessStatus:p.verifiedBusiness===true||['yes','permissive'].includes(parkingAccess(p))?'public':'unverified'});
const response=(points,source,updatedAt)=>Response.json({points,source,updatedAt},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fromOsm(el){
 const t=el.tags||{},lat=Number(el.lat??el.center?.lat),lng=Number(el.lon??el.center?.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
 const fee=t.fee==='yes'?'yes':t.fee==='no'?'no':'unknown';
 const kind=t.parking==='underground'?'underground':t.parking==='multi-storey'?'multi-storey':t.parking==='surface'?'surface':t.parking==='street_side'?'street_side':'unknown';
 const name=String(t.name||t['name:tr']||'Otopark kaydı').slice(0,160);
 return {lat,lng,name,fee,kind,address:String(t['addr:street']||'').slice(0,160),operator:String(t.operator||'').slice(0,120),capacity:/^\d+$/.test(t.capacity||'')?Number(t.capacity):null,osmId:el.type+'/'+el.id,source:'OpenStreetMap',verifiedBusiness:false,freeSpaces:null,occupancyUpdatedAt:null};
}
// Precise, unique coordinate matches only. Never infer a business from an address alone.
async function attachOfficialIsparkNames(points,env){
 if(!env?.ISPARK_SNAPSHOTS?.get)return points;
 try{
  const snapshot=await env.ISPARK_SNAPSHOTS.get('latest','json');
  const official=(Array.isArray(snapshot?.points)?snapshot.points:[]).filter(p=>p&&typeof p.name==='string'&&p.name.trim().length>4&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
  if(!official.length)return points;
  const generic=p=>/^(?:Otopark kaydı|Otopark|Parking)$/iu.test(String(p.name||'').trim());
  const meters=(a,b)=>Math.hypot((Number(a.lat)-Number(b.lat))*111195,(Number(a.lng)-Number(b.lng))*111195*Math.cos(Number(a.lat)*Math.PI/180));
  const match=new Map();
  for(let i=0;i<points.length;i++){
   const p=points[i];if(!generic(p))continue;
   const nearby=official.filter(o=>meters(p,o)<=12);
   if(nearby.length!==1)continue;
   const officialPoint=nearby[0];
   if(points.some((other,j)=>j!==i&&meters(other,officialPoint)<=12))continue;
   match.set(i,{name:officialPoint.name.trim().slice(0,160),id:officialPoint.id??null});
  }
  return points.map((p,i)=>match.has(i)?{...p,name:match.get(i).name,nameSource:'ibb-ispark-coordinate-match',isparkParkID:match.get(i).id,sourceSnapshot:true}:p);
 }catch{return points}
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
// Only admin-approved reports for locations that are not parking are hidden.
// Missing D1 data must not make the entire parking API unavailable.
// Resolve both legacy prefixed IDs (way/123) and current split IDs (way, 123).
const normalizedOsmKey=(type,id)=>{
 const raw=String(id??'').trim(),prefix=String(type??'').trim();
 const match=/^(node|way|relation)\/(\d+)$/.exec(raw);
 if(match)return match[1]+'/'+match[2];
 return ['node','way','relation'].includes(prefix)&&/^\d+$/.test(raw)?prefix+'/'+raw:'';
};
async function approvedNonParkingIds(env){
 if(!env.DB)return new Set();
 try{
  const result=await env.DB.prepare("SELECT DISTINCT osm_type,osm_id FROM parking_accuracy_reports WHERE status='approved' AND reason='not_parking'").all();
  return new Set((result.results||[]).map(r=>normalizedOsmKey(r.osm_type,r.osm_id)).filter(Boolean));
 }catch{return new Set()}
}
// Previously confirmed records stay excluded independently of the D1 review table.
const confirmedNotParking=new Set(['way/882355136','way/1414411432']);
const parkingOsmKey=p=>normalizedOsmKey(p.osmType,p.osmId);
export async function onRequestGet({request,env}){
 const url=new URL(request.url),lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
 const radiusRaw=Number(url.searchParams.get('radius')||10),radiusKm=[3,10,20,30].includes(radiusRaw)?radiusRaw:10,radiusSq=(radiusKm*1000)**2;
 if(!inTurkey(lat,lng))return Response.json({error:'Koordinatlar Türkiye sınırları dışında'},{status:400});
 const excluded=await approvedNonParkingIds(env);
 if(inIstanbul(lat,lng)){
  const asset=await env.ASSETS.fetch(new URL('/data/parking.json',url.origin).toString());
  if(!asset.ok)return Response.json({error:'İstanbul otopark veri dosyası bulunamadı'},{status:503});
  try{
   const data=await asset.json();
   if(!Array.isArray(data.points))throw Error('Invalid data');
   const points=data.points.filter(p=>validPoint(p)&&publicParking(p)&&!excluded.has(parkingOsmKey(p))&&!confirmedNotParking.has(parkingOsmKey(p))&&!(p.geographicStatus==='confirmed_outside_istanbul'&&p.geographicReviewVerified===true)&&distanceSq(p,lat,lng)<=radiusSq).sort((a,b)=>distanceSq(a,lat,lng)-distanceSq(b,lat,lng)).slice(0,250);
   return response((await attachOfficialIsparkNames(await attachApprovedEntrances(points,env,url.origin),env)).map(enrichName).map(labelParkingAccess),data.source,data.updatedAt);
  }catch{return Response.json({error:'İstanbul otopark dosyası okunamadı'},{status:503})}
 }
 // Static nationwide dataset avoids public Overpass outages during user searches.
 const asset=await env.ASSETS.fetch(new URL('/data/parking-turkiye.json',url.origin).toString());
 if(!asset.ok)return Response.json({error:'Türkiye otopark veri dosyası henüz yayınlanmadı. GitHub Actions veri yenilemesi çalıştırılmalı.'},{status:503});
 try{
  const data=await asset.json();
  if(!Array.isArray(data.points))throw Error('Invalid data');
  const points=data.points.filter(p=>validPoint(p)&&publicParking(p)&&!excluded.has(parkingOsmKey(p))&&!confirmedNotParking.has(parkingOsmKey(p))&&distanceSq(p,lat,lng)<=radiusSq).sort((a,b)=>distanceSq(a,lat,lng)-distanceSq(b,lat,lng)).slice(0,250);
  return response((await attachApprovedEntrances(points,env,url.origin)).map(labelParkingAccess),data.source,data.updatedAt);
 }catch{return Response.json({error:'Türkiye otopark veri dosyası okunamadı'},{status:503})}
}
