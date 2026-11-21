import assert from 'node:assert/strict';
import {test} from 'node:test';
import {onRequestGet} from '../functions/api/ispark-occupancy.js';

test('İSPARK shares upstream work, serves last-good data without live flags, and backs off on failure',async t=>{
 const storage=new Map();
 let clock=+new Date();
 t.mock.method(Date,'now',()=>clock);
 // Use a real base timestamp and advance it to expire cache entries.
 const expiry=(maxAge)=>clock+Number(maxAge.match(/max-age=(\d+)/)[1])*1000;
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{
  async match(key){
   const entry=storage.get(key.url);
   return entry?.until>clock?entry.response.clone():undefined;
  },
  async put(key,response){storage.set(key.url,{until:expiry(response.headers.get('cache-control')),response:response.clone()});}
 }}});
 t.after(()=>delete globalThis.caches);
 let calls=0,down=false;
 let measuredAt=new Date(clock-14*60000-45000).toISOString();
 t.mock.method(globalThis,'fetch',async()=>{
  calls++;
  if(down)throw new DOMException('timeout','TimeoutError');
  return Response.json([
   {parkID:7,parkName:'Verified',lat:41,lng:29,capacity:5,emptyCapacity:3,lastUpdate:measuredAt},
   {parkID:8,parkName:'Unstamped',lat:41,lng:29,capacity:10,emptyCapacity:4}
  ]);
 });
 const request=new Request('https://staging.test/api/ispark-occupancy');
 const call=async(env={})=>(await onRequestGet({request,env})).json();
 const simultaneous=await Promise.all([call(),call(),call()]);
 assert.equal(calls,1);
 assert.deepEqual(simultaneous.map(d=>d.liveCount),[1,1,1]);
 assert.equal(simultaneous[0].points[1].verifiedLive,false);

 clock+=16000;
 assert.equal((await call()).liveCount,0);
 assert.equal(calls,1);
 clock+=45000;
 down=true;
 const fallback=await call();
 assert.equal(fallback.upstreamUnavailable,true);
 assert.equal(fallback.diagnostic.reason,'timeout');
 assert.equal(fallback.liveCount,0);
 assert.equal(fallback.points[0].freeSpaces,3);
 assert.equal(fallback.points[0].occupancyUpdatedAt,null);
 assert.equal((await call()).upstreamUnavailable,true);
 assert.equal(calls,2);

 clock+=24*60*60000;
 assert.equal((await call()).unavailable,true);
 assert.equal(calls,3);
 clock+=31000;
 down=false;
 measuredAt=new Date(clock).toISOString();
 assert.equal((await call()).liveCount,1);
 assert.equal(calls,4);
});
