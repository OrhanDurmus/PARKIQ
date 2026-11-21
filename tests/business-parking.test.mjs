import assert from 'node:assert/strict';
import {test} from 'node:test';
import {onRequestGet} from '../functions/api/business-parking.js';

const request = new Request('https://rotapark.test/api/business-parking?lat=41&lng=29');

test('business parking distinguishes an outage from a successful empty result', async () => {
 const makeEnv = error => ({DB: {prepare: () => ({
  run: async () => {},
  bind: () => ({async all() {
   if (error) throw error;
   return {results: []};
  }}),
 })}});
 const available = await onRequestGet({request, env: makeEnv()});
 assert.equal(available.status, 200);
 assert.deepEqual(await available.json(), {points: []});
 const unavailable = await onRequestGet({request, env: makeEnv(new Error('internal fixture details'))});
 assert.equal(unavailable.status, 503);
 assert.equal(unavailable.headers.get('Cache-Control'), 'no-store');
 assert.deepEqual(await unavailable.json(), {error: 'İşletme otopark verileri şu anda alınamıyor.'});
});

test('isolated database serves only approved businesses with locations inside the radius',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync}=await import('node:fs');
 const db=new DatabaseSync(':memory:');
 try{
  for(const file of ['schema.sql','migrations/0002_business_locations.sql','migrations/0003_occupancy.sql','migrations/0004_business_hours.sql','migrations/0005_business_pricing.sql']){
   db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  }
  db.exec(`
   INSERT INTO business_applications (id,name,district,status) VALUES
    (1,'Approved fixture','Fatih','approved'),(2,'Pending fixture','Fatih','pending'),
    (3,'Rejected fixture','Fatih','rejected'),(4,'No location fixture','Fatih','approved'),
    (5,'Far fixture','Şile','approved');
   INSERT INTO business_locations (application_id,lat,lng) VALUES
    (1,41,29),(2,41,29),(3,41,29),(5,41.3,29.5);
   INSERT INTO business_pricing (application_id,hourly_price) VALUES (1,75);
  `);
  const env={DB:{prepare(sql){
   const statement=db.prepare(sql);
   return {run:()=>statement.run(),bind:(...args)=>({all:()=>({results:statement.all(...args)})})};
  }}};
  const response=await onRequestGet({request,env});
  assert.equal(response.status,200);
  const {points}=await response.json();
  assert.deepEqual(points.map(p=>[p.applicationId,p.verifiedBusiness,p.hourlyPrice]),[[1,true,75]]);
  const empty=await onRequestGet({request:new Request('https://rotapark.test/api/business-parking?lat=39.93&lng=32.86'),env});
  assert.deepEqual(await empty.json(),{points:[]});
 }finally{db.close();}
});
