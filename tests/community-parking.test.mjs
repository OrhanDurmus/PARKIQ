import assert from 'node:assert/strict';
import {test} from 'node:test';
import {onRequestPost} from '../functions/api/community-parking.js';

const env={SUPABASE_URL:'https://rotapark-test.supabase.co',SUPABASE_ANON_KEY:'test-anon-key',ISPARK_SNAPSHOTS:{put:async()=>{},get:async()=>null}};
const originalFetch=globalThis.fetch;
async function attempt(lat,lng){
 globalThis.fetch=async(url)=>new Response(url.includes('/auth/v1/user')?JSON.stringify({id:'test-user',email:'test@example.com'}):'false',{status:200,headers:{'Content-Type':'application/json'}});
 const request=new Request('https://rotapark.test/api/community-parking',{method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json'},body:JSON.stringify({lat,lng,type:'space',ownerToken:'a'.repeat(64),note:'',address:'Test',displayName:'Test'})});
 try{return await onRequestPost({request,env})}finally{globalThis.fetch=originalFetch}
}
test('Ankara and Izmir street reports are accepted',async()=>{
 for(const [lat,lng] of [[39.9334,32.8597],[38.4237,27.1428]]){
  const response=await attempt(lat,lng);assert.equal(response.status,201);const data=await response.json();assert.equal(data.point.lat,lat);assert.equal(data.point.lng,lng);
 }
});
test('coordinates outside Turkey are rejected',async()=>{
 const response=await attempt(48.8566,2.3522);assert.equal(response.status,400);
});
