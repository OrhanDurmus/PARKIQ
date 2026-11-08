// Run: node --test tests/approved-entrance-api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../functions/api/parking.js',import.meta.url),'utf8');
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const origin='https://rotapark.test';
const parking={lat:38.42853,lng:27.152311,name:'Kahramanlar',osmType:'way',osmId:'600623501'};
const valid={entranceVerified:true,entranceLat:38.4286,entranceLng:27.1524,entranceOsmUrl:'https://www.openstreetmap.org/node/123',roadOsmUrl:'https://www.openstreetmap.org/way/456',evidenceUrl:'https://example.org/verified'};
async function request(approved,point=parking){
 const assets={
  '/data/parking-turkiye.json':{points:[point],source:'test',updatedAt:'2026-11-08'},
  '/data/parking-entrances-approved.json':approved
 };
 const env={ASSETS:{fetch:async url=>{
  const data=assets[new URL(url).pathname];
  return data===undefined?new Response('missing',{status:404}):Response.json(data);
 }}};
 const response=await onRequestGet({request:new Request(origin+'/api/parking?lat=38.42853&lng=27.152311'),env});
 assert.equal(response.status,200);
 return (await response.json()).points[0];
}
test('explicitly approved OSM identity attaches reviewed entrance',async()=>{
 const p=await request({schemaVersion:1,entrances:{'way/600623501':valid}});
 assert.equal(p.entranceVerified,true);assert.equal(p.entranceLat,valid.entranceLat);
});
test('missing approved asset preserves ordinary parking search',async()=>{
 const p=await request(undefined);
 assert.equal(p.entranceVerified,undefined);
});
test('wrong OSM identity never applies entrance',async()=>{
 const p=await request({schemaVersion:1,entrances:{'way/999':valid}});
 assert.equal(p.entranceVerified,undefined);
});
test('unverified, distant, or malformed entrance is rejected',async()=>{
 for(const e of [{...valid,entranceVerified:false},{...valid,entranceLat:39.0},{...valid,roadOsmUrl:''},{...valid,entranceLat:'38.4286'}]){
  const p=await request({schemaVersion:1,entrances:{'way/600623501':e}});
  assert.equal(p.entranceVerified,undefined);
 }
});
test('national OSM identity never matches a different parking',async()=>{
 const p=await request({schemaVersion:1,entrances:{'way/600623501':valid}},{...parking,osmId:'999'});
 assert.equal(p.entranceVerified,undefined);
});
