// Cloudflare Worker cron: trusted, secret-backed occupancy collection.
// Deploy separately from Pages; bind ROTAPARK_OCCUPANCY_INGEST_SECRET as a Worker secret.
// Diagnostic output is restricted to known, non-sensitive error codes.
const KNOWN_INGEST_ERRORS = new Set([
  'unauthorized',
  'not_configured',
  'source_unavailable',
  'database_write_failed',
  'ingest_failed'
]);

async function describeFailure(res) {
  let reason = 'unknown';
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && KNOWN_INGEST_ERRORS.has(body.error)) {
      reason = body.error;
    }
  } catch {
    // Cloudflare or another intermediary may return HTML instead of JSON.
  }
  return 'Occupancy ingest HTTP ' + res.status + ' (reason: ' + reason + ')';
}

export default {
 async scheduled(_event,env,ctx){
  const secret=env.ROTAPARK_OCCUPANCY_INGEST_SECRET;
  const endpoint=env.ROTAPARK_OCCUPANCY_INGEST_URL||'https://parkiq.pages.dev/api/occupancy-ingest';
  if(typeof secret!=='string'||secret.length<32)throw Error('Missing strong ingestion secret');
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.pathname!=='/api/occupancy-ingest'||url.username||url.password||url.search)throw Error('Invalid ingestion endpoint');
  ctx.waitUntil((async()=>{
   const res=await fetch(url.toString(),{
    method:'POST',
    headers:{Authorization:'Bearer '+secret,'Cache-Control':'no-store'},
    signal:AbortSignal.timeout(25000)
   });
   if(!res.ok)throw Error(await describeFailure(res));
   const body=await res.json();
   if(body?.ok!==true)throw Error('Occupancy ingest returned non-success');
   console.log('Occupancy ingest finished',{reported:body.inserted??0,reason:body.reason||null});
  })());
 }
};
