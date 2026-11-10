// ROTAPARK: guarded İSPARK occupancy adapter. Unverified or stale data is never shown as live.
const SOURCE='https://api.ibb.gov.tr/ispark/Park';
// Recover UTF-8 text accidentally decoded as Windows-1252 by iOS Shortcuts.
const cp1252={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
const repairName=name=>{
  if(typeof name!=='string'||!/[ÃÄÅ]/.test(name))return name;
  const bytes=[];
  for(const ch of name){const code=ch.codePointAt(0);const byte=code<=255?code:cp1252[code];if(byte===undefined)return name;bytes.push(byte);}
  try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes));return /[\uFFFD]/.test(decoded)?name:decoded;}catch{return name;}
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
  const fresh=Number.isFinite(stamp)&&Math.abs(Date.now()-stamp)<=15*60*1000;
  if(!name||lat===null||lng===null||lat<40||lat>42.5||lng<26||lng>31)return null;
  return {id:id==null?null:String(id),name:repairName(String(name)).slice(0,160),lat,lng,capacity:Number.isInteger(capacity)&&capacity>0?capacity:null,freeSpaces:Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity)?free:null,occupancyUpdatedAt:fresh?new Date(stamp).toISOString():null,verifiedLive:fresh&&Number.isInteger(free)&&free>=0&&(capacity===null||free<=capacity),sourceSnapshot:true};
};
// Cache only successful snapshots; never cache an unavailable response.
export async function onRequestGet({request,context,env}){
  const cache=typeof caches!=='undefined'?caches.default:null;
  const cacheKey=new Request(new URL('/api/ispark-occupancy',request.url).toString(),{method:'GET'});
  if(cache){
    try{const hit=await cache.match(cacheKey);if(hit)return hit;}catch(error){console.warn('ispark cache read failed',error?.name);}
  }
  let upstreamStatus=null;
  let stage='fetch';
  let attempts=0;
  try{
    let response;
    for(let attempt=1;attempt<=2;attempt++){
      attempts=attempt;
      try{
        response=await fetch(SOURCE,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
        upstreamStatus=response.status;
        if(response.ok)break;
        if(attempt===2||![429,500,502,503,504].includes(response.status))throw Error('Source HTTP '+response.status);
      }catch(error){
        if(attempt===2)throw error;
        // Retry transient network failures and timeouts only.
        if(error?.name==='AbortError'&&request.signal?.aborted)throw error;
      }
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    if(!response?.ok)throw Error('Source HTTP '+upstreamStatus);
    stage='parse';
    const payload=await response.json();
    stage='shape';
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.parks)?payload.parks:null;
    if(!rows)throw Error('Unknown source response');
    stage='normalize';
    const points=rows.slice(0,2000).map(normalize).filter(Boolean);
    if(rows.length===0||points.length===0){stage='normalize';throw Error('No valid parking records');}
    const result=Response.json({source:'IBB İSPARK',points,sourceRecordCount:rows.length,receivedAt:new Date().toISOString(),liveCount:points.filter(p=>p.verifiedLive).length},{headers:{'Cache-Control':'public, max-age=60'}});
    if(cache){
      const write=cache.put(cacheKey,result.clone()).catch(error=>console.warn('ispark cache write failed',error?.name));
      if(context?.waitUntil)context.waitUntil(write);else await write;
    }
    return result;
  }catch(error){
    const errorName=error instanceof Error?error.name:'UnknownError';
    const reason=upstreamStatus!==null&&upstreamStatus>=400?'upstream_http_'+upstreamStatus:stage==='fetch'?(errorName==='TimeoutError'?'timeout':'network_error'):stage==='parse'?'invalid_json':stage==='shape'?'unexpected_payload':stage==='normalize'?'no_valid_parking_records':'processing_error';
    console.error('ispark-occupancy upstream failure',{stage,reason,upstreamStatus,errorName,attempts});
    // Upstream unavailable: serve an explicitly non-live KV snapshot, if present.
    if(typeof env?.ISPARK_SNAPSHOTS?.get==='function'){
      try{
        const snapshot=await env.ISPARK_SNAPSHOTS.get('latest','json');
        const received=Date.parse(snapshot?.receivedAt||'');
        const age=Date.now()-received;
        if(Array.isArray(snapshot?.points)&&snapshot.points.length>0&&Number.isFinite(received)&&age>=0&&age<86400000){
          return Response.json({...snapshot,liveCount:0,verifiedLive:false,sourceSnapshot:true,upstreamUnavailable:true,diagnostic:{stage,reason,upstreamStatus,attempts},snapshotAgeMinutes:Math.floor(age/60000),points:snapshot.points.map(p=>({...p,name:repairName(p.name),verifiedLive:false,occupancyUpdatedAt:null,sourceSnapshot:true}))},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
        }
      }catch(kvError){console.warn('ispark KV fallback read failed',kvError?.name);}
    }
    return Response.json({source:'IBB İSPARK',points:[],liveCount:0,unavailable:true,diagnostic:{stage,reason,upstreamStatus,attempts}},{headers:{'Cache-Control':'no-store'}});
  }
}
