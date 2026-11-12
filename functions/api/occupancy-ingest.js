// Trusted ingestion only: call from a scheduled job with ROTAPARK_OCCUPANCY_INGEST_SECRET.
// The public IBB adapter may return snapshots without timestamps: never ingest those as fresh.
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 const expected=env.ROTAPARK_OCCUPANCY_INGEST_SECRET;
 const token=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'')?.[1];
 if(!expected||!token||token!==expected)return json({ok:false,error:'unauthorized'},401);
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const service=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)||!service)return json({ok:false,error:'not_configured'},503);
 try{
  const source=await fetch(new URL('/api/ispark-occupancy',request.url),{cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!source.ok)return json({ok:false,error:'source_unavailable'},503);
  const payload=await source.json();
  const points=Array.isArray(payload?.points)?payload.points:[];
  const now=Date.now();
  const rows=points.filter(p=>p.verifiedLive===true&&p.id!=null&&Number.isInteger(p.freeSpaces)&&p.freeSpaces>=0&&
    p.occupancyUpdatedAt&&Number.isFinite(Date.parse(p.occupancyUpdatedAt))&&
    Math.abs(now-Date.parse(p.occupancyUpdatedAt))<=15*60000)
    .slice(0,1000).map(p=>({
      parking_id:'ispark:'+String(p.id).slice(0,160),
      observed_at:new Date(p.occupancyUpdatedAt).toISOString(),
      free_spaces:p.freeSpaces,
      capacity:Number.isInteger(p.capacity)&&p.capacity>=p.freeSpaces?p.capacity:null,
      source:'ibb_ispark'
    }));
  if(!rows.length)return json({ok:true,inserted:0,reason:'no_verified_live_rows'});
  const result=await fetch(base+'/rest/v1/rotapark_occupancy_snapshots?on_conflict=parking_id,observed_at,source',{
    method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify(rows),signal:AbortSignal.timeout(10000)
  });
  if(!result.ok)return json({ok:false,error:'database_write_failed'},503);
  return json({ok:true,inserted:rows.length});
 }catch{return json({ok:false,error:'ingest_failed'},503)}
}
