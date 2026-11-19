import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {mergeAnparkDirectory,ANPARK_SOURCE} from '../functions/lib/anpark-directory.js';
import {onRequestGet} from '../functions/api/parking.js';
const directory=JSON.parse(readFileSync(new URL('../data/anpark-official.json',import.meta.url)));
const national=JSON.parse(readFileSync(new URL('../data/parking-turkiye.json',import.meta.url)));
const osmKey=p=>p.osmType+'/'+p.osmId;

test('official ANPARK snapshot keeps 24 source identities and 23 active facilities',()=>{
 assert.equal(directory.sourceUrl,ANPARK_SOURCE);assert.equal(directory.points.length,24);
 assert.equal(new Set(directory.points.map(p=>p.id)).size,24);
 assert.equal(directory.points.filter(p=>p.active===true).length,23);
 assert.equal(directory.points.find(p=>p.id==='1096').active,false);
 for(const p of directory.points){assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lng));}
});

test('reviewed joins preserve every OSM identity and coordinate, without proximity-only reassignment',()=>{
 const before=JSON.stringify(national.points);
 const merged=mergeAnparkDirectory(national.points,directory,national.points);
 const original=new Map(national.points.map(p=>[osmKey(p),p]));
 const updated=merged.filter(p=>p.osmId);
 assert.equal(updated.length,national.points.length);
 const changed=[];
 for(const p of updated){const q=original.get(osmKey(p));assert.ok(q);assert.equal(p.lat,q.lat);assert.equal(p.lng,q.lng);assert.equal(p.name,q.name);if(JSON.stringify(p)!==JSON.stringify(q))changed.push(osmKey(p));}
 assert.deepEqual(changed.sort(),['node/13025867011','way/421433589']);
 assert.equal(merged.filter(p=>p.anparkFacilityId).length,23);
 assert.equal(merged.length,national.points.length+21);
 assert.equal(JSON.stringify(national.points),before);
 for(const p of merged.filter(p=>p.anparkFacilityId)){
  assert.notEqual(p.verifiedBusiness,true);assert.notEqual(p.entranceVerified,true);
 }
});

test('official nearby street parking does not reclassify malls, universities or private facilities',()=>{
 const official=directory.points.find(p=>p.id==='1106');
 const near=[{osmType:'way',osmId:'private',name:'Panora AVM otoparkı',operator:'Private Mall',access:'customers',lat:official.lat,lng:official.lng},
  {osmType:'way',osmId:'university',name:'Üniversite Otoparkı',operator:'Üniversite',lat:official.lat,lng:official.lng}];
 const result=mergeAnparkDirectory(near,{...directory,points:[official]},near);
 assert.deepEqual(result.slice(0,2),near);assert.equal(result.length,3);assert.equal(result[2].anparkFacilityId,'1106');
});

test('reviewed identity cannot override changed names, operators, coordinates or approved exclusions',()=>{
 const row=directory.points.find(p=>p.id==='1118');const original=national.points.find(p=>osmKey(p)==='way/421433589');
 for(const change of [{name:'Başka otopark'},{operator:'Özel işletme'},{lat:40.5},{access:'private'}]){
  const p={...original,...change};const result=mergeAnparkDirectory([p],{...directory,points:[row]},[p]);
  assert.deepEqual(result[0],p);assert.equal(result[1].id,'anpark:1118');
 }
 assert.deepEqual(mergeAnparkDirectory([],{...directory,points:[row]},[original],new Set(['way/421433589'])),[]);
 assert.deepEqual(mergeAnparkDirectory([original],{...directory,sourceUrl:'https://invalid.test'},[original]),[original]);
});

test('Ankara 30km API returns 22 ANPARK facilities, preserves all 2515 original regional records',async()=>{
 const env={ASSETS:{async fetch(input){const path=new URL(input).pathname;
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)))}catch{return new Response('',{status:404})}
 }}};
 const query=async(lat,lng,radius)=>{const r=await onRequestGet({request:new Request(`https://test/api/parking?lat=${lat}&lng=${lng}&radius=${radius}`),env});assert.equal(r.status,200);return (await r.json()).points};
 const rows=await query(39.9334,32.8597,30);
 assert.equal(rows.length,2535);assert.equal(rows.filter(p=>p.anparkFacilityId).length,22);
 assert.equal(rows.filter(p=>p.osmId).length,2515);
 assert.ok(!rows.some(p=>p.anparkFacilityId==='1096'||p.anparkFacilityId==='1104'));
 const kizilcahamam=await query(40.468634,32.630351,3);assert.ok(kizilcahamam.some(p=>p.anparkFacilityId==='1104'));
 const byOsm=new Map(rows.filter(p=>p.osmId).map(p=>[osmKey(p),p]));
 assert.equal(byOsm.get('node/13025867011').operator,'ANPARK');
 assert.equal(byOsm.get('way/421433589').operator,'ANPARK');
});
