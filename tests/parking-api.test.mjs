import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequestGet } from '../functions/api/parking.js';
import { onRequestGet as readIspark } from '../functions/api/ispark-occupancy.js';

const origin='https://rotapark.test';
const center={lat:40.9,lng:29.2};
const point=(name,overrides={})=>({name,lat:center.lat,lng:center.lng,...overrides});
async function query(points,radius){
  const request=new Request(origin+'/api/parking?lat='+center.lat+'&lng='+center.lng+(radius==null?'':'&radius='+encodeURIComponent(radius)));
  const env={ASSETS:{fetch:async()=>Response.json({points,source:'test',updatedAt:'2026-11-08'})}};
  const response=await onRequestGet({request,env});
  assert.equal(response.status,200);
  return (await response.json()).points.map(p=>p.name);
}
test('Marmara national parking is included even within broad Istanbul rectangle',async()=>{
 const request=new Request(origin+'/api/parking?lat=40.65&lng=29.25&radius=10');
 const national={points:[{name:'Yalova OSM',lat:40.65,lng:29.25,osmType:'way',osmId:'120'}],source:'national'};
 const istanbul={points:[],source:'istanbul'};
 const env={ASSETS:{fetch:async input=>Response.json(String(input).includes('parking-turkiye.json')?national:istanbul)}};
 const response=await onRequestGet({request,env});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).points.map(p=>p.name),['Yalova OSM']);
});
test('Istanbul curated parking takes precedence over nationwide duplicate',async()=>{
 const request=new Request(origin+'/api/parking?lat=40.9&lng=29.2');
 const national={points:[point('national',{osmType:'way',osmId:'123'})],source:'national'};
 const istanbul={points:[point('curated',{osmType:'way',osmId:'123'})],source:'istanbul'};
 const env={ASSETS:{fetch:async input=>Response.json(String(input).includes('parking-turkiye.json')?national:istanbul)}};
 const response=await onRequestGet({request,env});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).points.map(p=>p.name),['curated']);
});
test('confirmed and verified outside-Istanbul records are excluded',async()=>{
  assert.deepEqual(await query([
    point('excluded',{geographicStatus:'confirmed_outside_istanbul',geographicReviewVerified:true}),
    point('inside',{geographicStatus:'inside'}),
  ]),['inside']);
});
test('unverified and review-only outside candidates remain visible',async()=>{
  const names=await query([
    point('unverified',{geographicStatus:'confirmed_outside_istanbul',geographicReviewVerified:false}),
    point('candidate',{geographicStatus:'outside_candidate',geographicReviewVerified:true}),
    point('missing-status',{geographicReviewVerified:true}),
    point('missing-verification',{geographicStatus:'confirmed_outside_istanbul'}),
  ]);
  assert.deepEqual(names,['unverified','candidate','missing-status','missing-verification']);
});
test('verified status must be a strict boolean, not a truthy string',async()=>{
  assert.deepEqual(await query([point('string',{geographicStatus:'confirmed_outside_istanbul',geographicReviewVerified:'true'})]),['string']);
});
test('geographic filter does not change the distance limit',async()=>{
  assert.deepEqual(await query([point('far',{lat:41.2}),point('near')]),['near']);
});

test('invalid parking coordinates cannot appear in search results',async()=>{
  const names=await query([
    point('null latitude',{lat:null}),
    point('string longitude',{lng:'29.2'}),
    point('out of range',{lat:100}),
    point('missing longitude',{lng:undefined}),
    point('valid'),
  ]);
  assert.deepEqual(names,['valid']);
});

test('search radius 3, 10, 20 and 30 km controls returned records',async()=>{
  const points=[point('1km',{lat:center.lat+0.009}),point('5km',{lat:center.lat+0.045}),point('15km',{lat:center.lat+0.135}),point('25km',{lat:center.lat+0.225})];
  assert.deepEqual(await query(points,3),['1km']);
  assert.deepEqual(await query(points,10),['1km','5km']);
  assert.deepEqual(await query(points,20),['1km','5km','15km']);
  assert.deepEqual(await query(points,30),['1km','5km','15km','25km']);
});
test('unsupported search radius falls back to 10 km',async()=>{
  assert.deepEqual(await query([point('5km',{lat:center.lat+0.045}),point('15km',{lat:center.lat+0.135})],999),['5km']);
});

// Regression: do not silently cap city results at 250 records.
test('returns all eligible records beyond the former 250-record limit',async()=>{
 const points=Array.from({length:275},(_,i)=>point('parking-'+i,{lat:center.lat+(i%20)*0.0001,lng:center.lng+Math.floor(i/20)*0.0001}));
 assert.equal((await query(points,10)).length,275);
});

test('unique ISPARK snapshot matches a generic OSM parking across spatial cell boundaries',async()=>{
 const generic=point('Otopark kaydı',{lat:40.900099,lng:29.200099,osmType:'node',osmId:'92001'});
 const official={id:8123,name:'İSPARK Doğrulanmış Test Otoparkı',lat:40.900101,lng:29.200101};
 const env={
  ASSETS:{fetch:async()=>Response.json({points:[generic],source:'test'})},
  ISPARK_SNAPSHOTS:{get:async()=>({points:[official]})},
 };
 const response=await onRequestGet({request:new Request(origin+'/api/parking?lat=40.9&lng=29.2'),env});
 assert.equal(response.status,200);
 const [p]=(await response.json()).points;
 assert.equal(p.name,official.name);
 assert.equal(p.isparkParkID,official.id);
 assert.equal(p.nameSource,'ibb-ispark-coordinate-match');
});
test('ISPARK snapshot matching refuses ambiguous nearby OSM facilities',async()=>{
 const first=point('Otopark kaydı',{lat:40.900099,lng:29.200099,osmType:'node',osmId:'92002'});
 const second=point('Otopark kaydı',{lat:40.900101,lng:29.200101,osmType:'node',osmId:'92003'});
 const env={
  ASSETS:{fetch:async()=>Response.json({points:[first,second],source:'test'})},
  ISPARK_SNAPSHOTS:{get:async()=>({points:[{id:8124,name:'İSPARK Belirsiz Test Otoparkı',lat:40.9001,lng:29.2001}]})},
 };
 const response=await onRequestGet({request:new Request(origin+'/api/parking?lat=40.9&lng=29.2'),env});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).points.map(p=>p.name),['Otopark kaydı','Otopark kaydı']);
});
test('ISPARK snapshot matching never assigns a distant official facility',async()=>{
 const env={
  ASSETS:{fetch:async()=>Response.json({points:[point('Otopark kaydı',{osmType:'node',osmId:'92004'})],source:'test'})},
  ISPARK_SNAPSHOTS:{get:async()=>({points:[{id:8125,name:'İSPARK Uzak Test Otoparkı',lat:40.9002,lng:29.2}]})},
 };
 const response=await onRequestGet({request:new Request(origin+'/api/parking?lat=40.9&lng=29.2'),env});
 assert.equal(response.status,200);
 assert.equal((await response.json()).points[0].name,'Otopark kaydı');
});

test('ISPARK snapshot ignores missing and out-of-range official coordinates',async()=>{
 const generic=point('Otopark kaydı',{osmType:'node',osmId:'93001'});
 const env={
  ASSETS:{fetch:async()=>Response.json({points:[generic],source:'test'})},
  ISPARK_SNAPSHOTS:{get:async()=>({points:[
   {id:91,name:'İSPARK Eksik Koordinat',lat:null,lng:null},
   {id:92,name:'İSPARK Boş Koordinat',lat:'',lng:''},
   {id:93,name:'İSPARK Geçersiz Enlem',lat:100,lng:29.2},
   {id:94,name:'İSPARK Doğru Koordinat',lat:40.9,lng:29.2},
  ]})},
 };
 const response=await onRequestGet({request:new Request(origin+'/api/parking?lat=40.9&lng=29.2'),env});
 assert.equal(response.status,200);
 const [p]=(await response.json()).points;
 assert.equal(p.name,'İSPARK Doğru Koordinat');
 assert.equal(p.isparkParkID,94);
});

test('D1 exclusions and both city assets start before any read completes', async () => {
 const started = [];
 let release;
 const waiting = new Promise(resolve => { release = resolve; });
 const env = {
  DB: {prepare: () => ({async all() { started.push('exclusions'); await waiting; return {results: []}; }})},
  ASSETS: {async fetch(input) {
   const path = new URL(input).pathname;
   started.push(path);
   await waiting;
   return Response.json({points: []});
  }},
 };
 const response = onRequestGet({request: new Request(origin + '/api/parking?lat=40.9&lng=29.2'), env});
 try {
  assert.deepEqual(started, ['exclusions', '/data/parking-turkiye.json', '/data/parking.json']);
 } finally {
  release();
 }
 assert.equal((await response).status, 200);
});

test('a failed national asset read still serves available curated Istanbul coverage', async () => {
 const env = {ASSETS: {async fetch(input) {
  if (new URL(input).pathname === '/data/parking-turkiye.json') throw Error('unavailable');
  return Response.json({points: [point('curated')]});
 }}};
 const result = await onRequestGet({request: new Request(origin + '/api/parking?lat=40.9&lng=29.2'), env});
 assert.equal(result.status, 200);
 const data = await result.json();
 assert.deepEqual(data.points.map(p => p.name), ['curated']);
 assert.equal(data.partial,true);
});

test('an expired asset cache preserves recent records during an outage and marks coverage partial', async t => {
 const start = Date.UTC(2026,10,19);
 const now = t.mock.method(Date,'now',() => start);
 let unavailable = false;
 const env = {ASSETS:{async fetch(){
  if(unavailable)throw Error('source unavailable');
  return Response.json({points:[point('curated')]});
 }}};
 const request = new Request(origin+'/api/parking?lat=40.9&lng=29.2');
 const first = await onRequestGet({request,env});
 assert.equal((await first.json()).partial,false);
 unavailable = true;
 now.mock.mockImplementation(() => start+61000);
 const fallback = await (await onRequestGet({request,env})).json();
 assert.equal(fallback.partial,true);
 assert.equal(fallback.points[0].name,'curated');
 now.mock.mockImplementation(() => start+86461000);
 assert.equal((await onRequestGet({request,env})).status,503);
});

test('IBB rows keep capacity and free spaces separate and deduplicate by official ID', async t => {
 const now = Date.UTC(2026,10,19,9);
 t.mock.method(Date,'now',() => now);
 const base = {parkName:'İSPARK Test',lat:40.9,lng:29.2,capacity:80};
 t.mock.method(globalThis,'fetch',async () => Response.json([
  {...base,parkID:12,emptyCapacity:40},
  {...base,parkID:12,emptyCapacity:25,lastUpdate:new Date(now-10000).toISOString()},
  {...base,parkID:13,emptyCapacity:90,lastUpdate:new Date(now).toISOString()},
  {...base,parkID:14,emptyCapacity:5,lastUpdate:new Date(now+120000).toISOString()},
 ]));
 const response = await readIspark({request:new Request(origin+'/api/ispark-occupancy'),env:{}});
 const result = await response.json();
 assert.equal(result.sourceRecordCount,4);
 assert.equal(result.liveCount,1);
 assert.deepEqual(result.points.map(({id,capacity,freeSpaces,verifiedLive})=>[id,capacity,freeSpaces,verifiedLive]),[
  ['12',80,25,true],['13',80,null,false],['14',80,5,false],
 ]);
});

test('an unavailable IBB source returns KV records without live labels', async t => {
 t.mock.method(globalThis,'fetch',async () => new Response(null,{status:503}));
 const env={ISPARK_SNAPSHOTS:{get:async()=>({
  receivedAt:new Date().toISOString(),
  points:[{id:'4',name:'İSPARK',capacity:40,freeSpaces:8,verifiedLive:true,occupancyUpdatedAt:new Date().toISOString()}],
 })}};
 const response=await readIspark({request:new Request(origin+'/api/ispark-occupancy'),env});
 const result=await response.json();
 assert.equal(result.upstreamUnavailable,true);
 assert.equal(result.liveCount,0);
 assert.equal(result.points[0].freeSpaces,8);
 assert.equal(result.points[0].verifiedLive,false);
 assert.equal(result.points[0].occupancyUpdatedAt,null);
});
