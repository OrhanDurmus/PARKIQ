import assert from 'node:assert/strict';
import {test} from 'node:test';
import {onRequestDelete,onRequestPost} from '../functions/api/community-parking.js';

const env={SUPABASE_URL:'https://rotapark-test.supabase.co',SUPABASE_ANON_KEY:'test-anon-key',ISPARK_SNAPSHOTS:{put:async()=>{},get:async()=>null}};
const originalFetch=globalThis.fetch;
async function attempt(lat,lng,displayName='Test'){
 globalThis.fetch=async(url)=>new Response(url.includes('/auth/v1/user')?JSON.stringify({id:'test-user',email:'private-alias@example.test',user_metadata:{full_name:'Private OAuth Name'}}):'false',{status:200,headers:{'Content-Type':'application/json'}});
 const request=new Request('https://rotapark.test/api/community-parking',{method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json'},body:JSON.stringify({lat,lng,type:'space',ownerToken:'a'.repeat(64),note:'',address:'Test',displayName})});
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

test('public reports only use a profile name explicitly supplied with the report', async () => {
 const anonymous = await attempt(39.9334, 32.8597, '');
 assert.equal(anonymous.status, 201);
 assert.equal((await anonymous.json()).point.displayName, 'ROTAPARK kullanıcısı');
 const named = await attempt(39.9334, 32.8597, 'Park gönüllüsü');
 assert.equal(named.status, 201);
 assert.equal((await named.json()).point.displayName, 'Park gönüllüsü');
});

test('only the authenticated owner may delete an account-owned street report', async () => {
 const id = '12345678-9abc-def0-1234-56789abcdef0';
 const ownerToken = 'a'.repeat(64);
 const ownerTokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ownerToken))), byte => byte.toString(16).padStart(2, '0')).join('');
 const deleted = [];
 const store = {
  get: async key => key === 'community:street:' + id ? {ownerId: 'test-owner', ownerTokenHash} : null,
  delete: async key => deleted.push(key),
 };
 const attemptDelete = token => onRequestDelete({
  env: {...env, ISPARK_SNAPSHOTS: store},
  request: new Request('https://rotapark.test/api/community-parking', {
   method: 'DELETE', headers: {Authorization: 'Bearer ' + token}, body: JSON.stringify({id, ownerToken}),
  }),
 });
 const previousFetch = globalThis.fetch;
 globalThis.fetch = async (_url, {headers}) => Response.json({id: headers.Authorization.slice(7)});
 try {
  assert.equal((await attemptDelete('test-other-user')).status, 403);
  assert.deepEqual(deleted, []);
  assert.equal((await attemptDelete('test-owner')).status, 200);
  assert.deepEqual(deleted, ['community:street:' + id]);
 } finally {
  globalThis.fetch = previousFetch;
 }
});
