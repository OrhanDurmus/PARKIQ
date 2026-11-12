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
 if(!body.trim()||/\bsrc\s*=/.test(attrs))continue;
 const path=join(dir,'inline-'+checked+(/\btype\s*=\s*["']module["']/.test(attrs)?'.mjs':'.cjs'));
 writeFileSync(path,body);
 execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
 checked++;
}
for(const path of ['functions/api/community-parking.js','functions/api/occupancy-prediction.js','functions/api/occupancy-ingest.js']){
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
const api=readFileSync('functions/api/community-parking.js','utf8');
assert.match(api,/data\.type==='departure'\?900:7200/);
assert.match(api,/community:departure:rate:/);
console.log('PASS: '+checked+' JavaScript syntax checks and feature invariants');
