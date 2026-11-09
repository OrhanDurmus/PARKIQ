// ROTAPARK: guarded İSPARK occupancy adapter. Unverified or stale data is never shown as live.
const SOURCE='https://api.ibb.gov.tr/ispark/Park';
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const first=(o,keys)=>keys.map(k=>o[k]).find(v=>v!==undefined&&v!==null&&v!=='');
const normalize=(item)=>{
  if(!item||typeof item!=='object')return null;
  const id=first(item,['parkID','parkId','ParkID','id','ID']);
  const name=first(item,['parkName','ParkName','name','Name']);
  const lat=number(first(item,['lat','latitude','Latitude']));
  const lng=number(first(item,['lng','lon','longitude','Longitude']));
  const capacity=number(first(item,['capacity','Capacity']));
  const free=number(first(item,['emptyCapacity','EmptyCapacity','freeSpaces','FreeSpaces']));
  const updated=first(item,['lastUpdate','LastUpdate','updatedAt','UpdatedAt','occupancyUpdatedAt','updateDate','UpdateDate']);
  const raw=updated?String(updated).trim():'';
  const iso=raw&&/^\\d{4}-\\d\\d-\\d\\d[ T]\\d\\d:\\d\\d/.test(raw)&&!/(Z|[+-]\\d\\d:?\\d\\d)$/.test(raw)?raw.replace(' ','T')+'+03:00':raw;
  const stamp=iso?Date.parse(iso):NaN;
  // The public endpoint exposes capacity counts but no per-parking update timestamp.
  // Never call these figures verified live; expose as source-reported snapshots only.
  const fresh=Number.isFinite(stamp)&&Math.abs(Date.now()-stamp)<=15*60*1000;
  if(!name||lat===null||lng===null||lat<40||lat>42.5||lng<26||lng>31)return null;
  return {id:id==null?null:String(id),name:String(name).slice(0,160),lat,lng,capacity:Number.isInteger(capacity)&&capacity>0?capacity:null,freeSpaces:Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity)?free:null,occupancyUpdatedAt:fresh?new Date(stamp).toISOString():null,verifiedLive:fresh&&Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity),sourceSnapshot:true};
};
export async function onRequestGet(){
  try{
    const response=await fetch(SOURCE,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Source HTTP '+response.status);
    const payload=await response.json();
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.parks)?payload.parks:null;
    if(!rows)throw Error('Unknown source response');
    const points=rows.slice(0,2000).map(normalize).filter(Boolean);
    return Response.json({source:'IBB İSPARK',points,liveCount:points.filter(p=>p.verifiedLive).length},{headers:{'Cache-Control':'public, max-age=60'}});
  }catch{
    return Response.json({source:'IBB İSPARK',points:[],liveCount:0,unavailable:true},{headers:{'Cache-Control':'no-store'}});
  }
}
