import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequestGet } from '../functions/api/parking.js';

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
 assert.equal(result.headers.get('X-Parking-Partial'),'1');
 assert.deepEqual((await result.json()).points.map(p => p.name), ['curated']);
});

test('concurrent searches share each static download and JSON parse', async () => {
 const reads = new Map();
 const parses = new Map();
 const env = {ASSETS: {async fetch(input) {
  const path = new URL(input).pathname;
  if (path.endsWith('parking-entrances-approved.json')) return new Response(null, {status: 404});
  reads.set(path, (reads.get(path) || 0) + 1);
  return {ok: true, async json() {
   parses.set(path, (parses.get(path) || 0) + 1);
   return {points: [point('shared', {osmType: 'way', osmId: '412'})]};
  }};
 }}};
 const request = new Request(origin + '/api/parking?lat=40.9&lng=29.2');
 const responses = await Promise.all(Array.from({length: 5}, () => onRequestGet({request, env})));
 for (const response of responses) {
  assert.deepEqual((await response.json()).points.map(p => p.name), ['shared']);
 }
 assert.deepEqual([...reads.values()], [1, 1]);
 assert.deepEqual([...parses.values()], [1, 1]);
});
