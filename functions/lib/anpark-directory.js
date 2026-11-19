// Reviewed operator data is separate from the regenerable Geofabrik extract.
export const ANPARK_SOURCE='https://www.anpark.com.tr/wp-json/anpark/v1/parks';
const key=p=>p.osmType&&p.osmId?`${p.osmType}/${String(p.osmId).replace(/^(node|way|relation)\//,'')}`:String(p.osmId||'');
const meters=(a,b)=>Math.hypot((a.lat-b.lat)*111195,(a.lng-b.lng)*111195*Math.cos(a.lat*Math.PI/180));
const restricted=p=>['private','no','customers','residents','employees','staff','permit','delivery','destination','agricultural','forestry','military'].includes(String(p.access||'').toLowerCase())||p.publicAccess===false||p.isPublic===false;

export function mergeAnparkDirectory(points,directory,allOsmPoints=[],excluded=new Set()){
 if(directory?.schemaVersion!==1||directory.sourceUrl!==ANPARK_SOURCE||!Array.isArray(directory.points))return points;
 const merged=new Map(points.map(p=>[key(p)||p.id||JSON.stringify(p),p]));
 const used=new Set();
 for(const row of directory.points){
  // active=false is a publication status, not proof of a permanently closed site.
  if(row.active!==true||!/^\d+$/.test(String(row.id))||used.has(String(row.id))||typeof row.name!=='string'||!row.name.trim()||
   !Number.isFinite(row.lat)||!Number.isFinite(row.lng)||row.lat<39.2||row.lat>40.8||row.lng<31.5||row.lng>33.8)continue;
  used.add(String(row.id));
  const match=row.reviewedOsmMatch,osmKey=match?key(match):'';
  if(osmKey&&excluded.has(osmKey))continue;
  const candidate=osmKey?allOsmPoints.find(p=>key(p)===osmKey):null;
  // No proximity-only joins: identity, reviewed name and coordinates must all agree.
  const matched=candidate&&candidate.name===match.name&&meters(candidate,row)<=150&&!restricted(candidate)&&
   (!candidate.operator||['ANPARK','BELTAŞ','Ankara Büyükşehir Belediyesi'].includes(candidate.operator));
  const evidence={anparkFacilityId:String(row.id),operator:'ANPARK',operatorSource:ANPARK_SOURCE,
   operatorCheckedAt:directory.checkedAt,operatorEvidence:'official-directory',officialName:row.name,
   officialLocation:{lat:row.lat,lng:row.lng},officialCapacity:row.capacity>0?row.capacity:null,
   officialSchedule:row.schedule||null};
  if(matched){
   merged.set(osmKey,{...candidate,...evidence});
  }else{
   const id='anpark:'+row.id;
   merged.set(id,{id,name:row.name,lat:row.lat,lng:row.lng,address:row.address||'',district:row.district||'',
    kind:row.type==='yolustu'?'street_side':row.type==='acik'?'surface':'unknown',fee:'unknown',
    capacity:row.capacity>0?row.capacity:null,source:'ANPARK / BELTAŞ',sourceUrl:ANPARK_SOURCE,
    sourceCheckedAt:directory.checkedAt,sourceUpdatedAt:null,verifiedBusiness:false,access:'yes',publicAccessStatus:'public',
    freeSpaces:null,occupancyUpdatedAt:null,entranceVerified:false,...evidence});
  }
 }
 return [...merged.values()];
}
