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
const api=readFileSync('functions/api/community-parking.js','utf8');
assert.match(api,/data\.type==='departure'\?900:7200/);
assert.match(api,/community:departure:rate:/);
console.log('PASS: '+checked+' JavaScript syntax checks and feature invariants');
