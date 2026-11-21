// ROTAPARK: guarded İSPARK occupancy adapter. Unverified or stale data is never shown as live.
const SOURCE='https://api.ibb.gov.tr/ispark/Park';
// Recover UTF-8 text accidentally decoded as Windows-1252 by iOS Shortcuts.
const cp1252={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
const repairName=name=>{
  if(typeof name!=='string')return name;
  let current=name;
  for(let pass=0;pass<3&&/[ÃÄÅÂ]/.test(current);pass++){
    const bytes=[];let possible=true;
    for(const ch of current){const code=ch.codePointAt(0);const byte=code<=255?code:cp1252[code];if(byte===undefined){possible=false;break;}bytes.push(byte);}
    if(!possible)break;
    try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes));if(decoded===current||decoded.includes('\uFFFD'))break;current=decoded;}catch{break;}
  }
  return current;
};
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
  const iso=raw&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(raw)&&!/(Z|[+-]\d\d:?\d\d)$/.test(raw)?raw.replace(' ','T')+'+03:00':raw;
  const stamp=iso?Date.parse(iso):NaN;
  // The public endpoint exposes capacity counts but no per-parking update timestamp.
  // Never call these figures verified live; expose as source-reported snapshots only.
  const fresh=Number.isFinite(stamp)&&Math.abs(Date.now()-stamp)<=freshWindow;
  if(!name||lat===null||lng===null||lat<40||lat>42.5||lng<26||lng>31)return null;
  return {id:id==null?null:String(id),name:repairName(String(name)).slice(0,160),lat,lng,capacity:Number.isInteger(capacity)&&capacity>0?capacity:null,freeSpaces:Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity)?free:null,occupancyUpdatedAt:fresh?new Date(stamp).toISOString():null,verifiedLive:fresh&&Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity),sourceSnapshot:true};
};
const freshWindow=15*60*1000;
const snapshotWindow=24*60*60*1000;
const pending=new Map();

function applyFreshness(snapshot,allowLive){
  const now=Date.now();
  const points=snapshot.points.map(point=>{
    const stamp=Date.parse(point.occupancyUpdatedAt||'');
    const verifiedLive=allowLive&&point.verifiedLive===true&&Number.isInteger(point.freeSpaces)&&Math.abs(now-stamp)<=freshWindow;
    return {...point,verifiedLive,occupancyUpdatedAt:verifiedLive?point.occupancyUpdatedAt:null};
  });
  return {...snapshot,points,liveCount:points.filter(point=>point.verifiedLive).length};
}
async function readCache(cache,key){
  try{return await (await cache?.match(key))?.json()}
  catch{return null}
}
async function writeCache(cache,key,snapshot,seconds){
  try{await cache?.put(key,Response.json(snapshot,{headers:{'Cache-Control':'public, max-age='+seconds}}))}
  catch(error){console.warn('ispark cache write failed',error?.name)}
}
function snapshotTime(snapshot){
  const received=Date.parse(snapshot?.receivedAt||''),age=Date.now()-received;
  return Array.isArray(snapshot?.points)&&snapshot.points.length&&age>=0&&age<snapshotWindow?received:0;
}

async function fetchOccupancy(cache,keys,env){
  const recent=await readCache(cache,keys.recent);
  if(Array.isArray(recent?.points)&&(!recent.upstreamUnavailable||snapshotTime(recent)))return recent;
  let upstreamStatus=null,stage='fetch';
  try{
    const response=await fetch(SOURCE,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(4500)});
    upstreamStatus=response.status;
    if(!response.ok)throw Error('Source HTTP '+upstreamStatus);
    stage='parse';
    const payload=await response.json();
    stage='shape';
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:payload?.parks;
    if(!Array.isArray(rows))throw Error('Unknown source response');
    stage='normalize';
    const points=rows.slice(0,2000).map(normalize).filter(Boolean);
    if(!points.length)throw Error('No valid parking records');
    const snapshot={source:'IBB İSPARK',points,sourceRecordCount:rows.length,receivedAt:new Date(Date.now()).toISOString()};
    await Promise.all([writeCache(cache,keys.recent,snapshot,60),writeCache(cache,keys.lastGood,snapshot,snapshotWindow/1000)]);
    return snapshot;
  }catch(error){
    const errorName=error instanceof Error?error.name:'UnknownError';
    const reason=upstreamStatus!==null&&upstreamStatus>=400?'upstream_http_'+upstreamStatus:stage==='fetch'?(errorName==='TimeoutError'?'timeout':'network_error'):stage==='parse'?'invalid_json':stage==='shape'?'unexpected_payload':'no_valid_parking_records';
    const diagnostic={stage,reason,upstreamStatus,attempts:1};
    console.warn('ispark-occupancy upstream failure',{...diagnostic,errorName});
    const cached=await readCache(cache,keys.lastGood);
    let stored=null;
    try{stored=await env?.ISPARK_SNAPSHOTS?.get('latest','json')}catch(error){console.warn('ispark KV fallback read failed',error?.name)}
    const snapshot=snapshotTime(stored)>snapshotTime(cached)?stored:cached;
    const timestamp=snapshotTime(snapshot);
    const fallback=timestamp?{
      ...snapshot,points:snapshot.points.filter(point=>point&&typeof point==='object').map(point=>({...point,name:repairName(point.name),sourceSnapshot:true})),
      verifiedLive:false,sourceSnapshot:true,upstreamUnavailable:true,diagnostic,snapshotAgeMinutes:Math.floor((Date.now()-timestamp)/60000)
    }:{source:'IBB İSPARK',points:[],unavailable:true,diagnostic};
    // Keep the retry window internal. Never cache a failed fetch in the last-good slot.
    await writeCache(cache,keys.recent,applyFreshness(fallback,false),30);
    return fallback;
  }
}
export async function onRequestGet({request,env}){
  const cache=typeof caches!=='undefined'?caches.default:null;
  const url=new URL('/api/ispark-occupancy',request.url);
  url.search='?cache=v2';
  const recent=new Request(url);
  url.search='?cache=v2-last-good';
  const lastGood=new Request(url);
  // In-flight sharing is scoped to this deployment's host.
  let task=pending.get(recent.url);
  if(!task){
    task=fetchOccupancy(cache,{recent,lastGood},env).finally(()=>pending.delete(recent.url));
    pending.set(recent.url,task);
  }
  const snapshot=await task;
  const degraded=snapshot.upstreamUnavailable===true||snapshot.unavailable===true;
  const result=applyFreshness(snapshot,!degraded);
  // Re-evaluate per-record timestamps on every serve, including edge cache hits.
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  return Response.json(result,{headers});
}
