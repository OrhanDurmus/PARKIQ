import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const html=readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const dir=mkdtempSync(join(tmpdir(),'rotapark-smoke-'));
let checked=0;
for(const [,attrs,body] of scripts){
 if(!body.trim()||/\bsrc\s*=/.test(attrs)||/\btype\s*=\s*["'](?:application\/ld\+json|importmap|application\/json)["']/i.test(attrs))continue;
 const path=join(dir,'inline-'+checked+(/\btype\s*=\s*["']module["']/.test(attrs)?'.mjs':'.cjs'));
 writeFileSync(path,body);
 execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
 checked++;
}
for(const path of ['functions/api/community-parking.js','functions/api/occupancy-prediction.js','functions/api/occupancy-ingest.js','workers/occupancy-cron.js']){
 execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
 checked++;
}
assert.match(html,/Buradan Çıkıyorum \(Yer Boşaldı\)/);
assert.match(html,/setInterval\(checkNavigationOccupancy,45000\)/);
assert.match(html,/verifiedLive===true/);
assert.match(html,/showEtaOccupancy/);
assert.match(html,/clearInterval\(occupancyWatchTimer\);occupancyWatchTimer=null/);
assert.match(html,/String\(p\.id\)===String\(target\.isparkParkID/);
const prediction=readFileSync('functions/api/occupancy-prediction.js','utf8');
assert.ok(prediction.includes('Bearer (\\S+)'),'Prediction API must parse Bearer JWT');
const ingest=readFileSync('functions/api/occupancy-ingest.js','utf8');
assert.match(ingest,/ROTAPARK_OCCUPANCY_INGEST_SECRET/);
assert.match(ingest,/resolution=ignore-duplicates/);
const sql=readFileSync('supabase/migrations/20261112_occupancy_eta.sql','utf8');
assert.match(sql,/rotapark_snapshot_unique/);
assert.match(sql,/latest\.observed_at is null or latest\.observed_at < now\(\) - interval '30 minutes'/);
const api=readFileSync('functions/api/community-parking.js','utf8');
assert.match(api,/data\.type==='departure'\?900:7200/);
assert.match(api,/community:departure:rate:/);
// Exercise the prediction handler without external credentials or network calls.
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(prediction).toString('base64'));
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test-anon'};
const makeRequest=(url,token)=>new Request(url,{headers:token?{Authorization:'Bearer '+token}:{}});
const invalid=await onRequestGet({request:makeRequest('https://rotapark.test/api/occupancy-prediction?parkingId=ispark%3A1&etaMinutes=-1','test-jwt'),env});
assert.equal(invalid.status,400,'Invalid ETA must be rejected');
const unauth=await onRequestGet({request:makeRequest('https://rotapark.test/api/occupancy-prediction?parkingId=ispark%3A1&etaMinutes=10'),env});
assert.equal(unauth.status,401,'Missing JWT must be rejected');
const originalFetch=globalThis.fetch;
let observed=null;
try{
 globalThis.fetch=async(url,opts)=>{observed={url,opts};return Response.json([{predicted_free_spaces:4,latest_free_spaces:6,sample_count:9,confidence:'medium'}])};
 const ok=await onRequestGet({request:makeRequest('https://rotapark.test/api/occupancy-prediction?parkingId=ispark%3A1&etaMinutes=10','test-jwt'),env});
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).prediction.predicted_free_spaces,4);
 assert.equal(observed.opts.headers.Authorization,'Bearer test-jwt');
 assert.deepEqual(JSON.parse(observed.opts.body),{p_parking_id:'ispark:1',p_eta_minutes:10});
}finally{globalThis.fetch=originalFetch}
// Ingestion must reject unauthenticated calls, skip unverified snapshots,
// and write only verified timestamped records using the service role.
const {onRequestPost:ingestPost}=await import('data:text/javascript;base64,'+Buffer.from(ingest).toString('base64'));
const ingestUrl='https://rotapark.test/api/occupancy-ingest';
const ingestEnv={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',ROTAPARK_OCCUPANCY_INGEST_SECRET:'test-secret'};
const denied=await ingestPost({request:new Request(ingestUrl,{method:'POST'}),env:ingestEnv});
assert.equal(denied.status,401,'Ingestion must require secret');
const ingestionCalls=[];
try{
 globalThis.fetch=async(url,opts)=>{
  ingestionCalls.push({url:String(url),opts});
  if(String(url).includes('/api/ispark-occupancy'))return Response.json({points:[
   {id:'12',verifiedLive:true,freeSpaces:3,capacity:10,occupancyUpdatedAt:new Date().toISOString()},
   {id:'13',verifiedLive:false,freeSpaces:0,capacity:10,occupancyUpdatedAt:new Date().toISOString()},
   {id:'14',verifiedLive:true,freeSpaces:1,capacity:10,occupancyUpdatedAt:'2020-01-01T00:00:00Z'}
  ]});
  return new Response(null,{status:201});
 };
 const accepted=await ingestPost({request:new Request(ingestUrl,{method:'POST',headers:{Authorization:'Bearer test-secret'}}),env:ingestEnv});
 assert.equal(accepted.status,200);
 const saved=ingestionCalls.find(c=>c.url.includes('/rest/v1/rotapark_occupancy_snapshots'));
 assert.ok(saved,'Ingestion should write verified snapshots');
 assert.equal(saved.opts.headers.Authorization,'Bearer test-service');
 const records=JSON.parse(saved.opts.body);
 assert.equal(records.length,1,'Reject unverified and stale snapshots');
 assert.equal(records[0].parking_id,'ispark:12');
}finally{globalThis.fetch=originalFetch}
console.log('PASS: '+checked+' JavaScript syntax checks and feature invariants');
