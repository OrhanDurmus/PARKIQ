// Run: node --test tests/nearby-push.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async path => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
};
const recipients = await load('../functions/lib/nearby-push-recipients.js');
const delivery = await load('../functions/lib/nearby-push-delivery.js');

test('1km circle excludes distant locations and accepts nearby ones', () => {
  assert.equal(recipients.distanceMeters(40,29,40,29),0);
  assert.ok(recipients.distanceMeters(40,29,40.008,29)<1000);
  assert.ok(recipients.distanceMeters(40,29,40.01,29)>1000);
});
test('recipient query filters precise distance after bounding box', async () => {
  const rows=[
    {endpoint_hash:'a',latitude:40.008,longitude:29},
    {endpoint_hash:'b',latitude:40.01,longitude:29}
  ];
  const db={prepare(sql){
    assert.match(sql,/nearby_push_deliveries/);
    return {bind(...args){assert.equal(args[4],'report-1');return {all:async()=>({results:rows})}}};
  }};
  const matches=await recipients.findNearbyPushRecipients(db,{latitude:40,longitude:29,reportId:'report-1'});
  assert.deepEqual(matches.map(x=>x.endpoint_hash),['a']);
});
test('delivery reservation accepts valid report IDs and deduplicates', async () => {
  let reserved=false;
  const db={prepare(sql){assert.match(sql,/INSERT OR IGNORE/);return {bind(){return {run:async()=>({meta:{changes:reserved?0:1}})}}}}};
  const id='a'.repeat(64);
  assert.equal(await delivery.reserveNearbyPushDelivery(db,'report-1',id),true);
  reserved=true;
  assert.equal(await delivery.reserveNearbyPushDelivery(db,'report-1',id),false);
  await assert.rejects(delivery.reserveNearbyPushDelivery(db,'report/id',id),/invalid_push_delivery_reservation/);
});

test('queued nearby reports expire after two hours and reject missing/future timestamps',()=>{
 const now=Date.parse('2026-11-17T20:00:00Z');
 assert.equal(recipients.isActiveNearbyReport(now-1000,now),true);
 assert.equal(recipients.isActiveNearbyReport(now-2*60*60*1000+1,now),true);
 assert.equal(recipients.isActiveNearbyReport(now-2*60*60*1000,now),false);
 assert.equal(recipients.isActiveNearbyReport(now+1000,now),false);
 assert.equal(recipients.isActiveNearbyReport(undefined,now),false);
});

test('deleted or mismatched street reports never trigger queued pushes',async()=>{
 const now=Date.parse('2026-11-17T20:00:00Z');
 const id='a'.repeat(8)+'-'+['b'.repeat(4),'c'.repeat(4),'d'.repeat(4),'e'.repeat(12)].join('-');
 const job={reportId:id,createdAt:now-1000,ownerId:'owner'};
 const report={id,type:'space',createdAt:job.createdAt,expiresAt:now+1000,ownerId:'owner'};
 const kv={get:async()=>report};
 assert.equal(await recipients.isStoredNearbyReportActive(kv,job,now),true);
 assert.equal(await recipients.isStoredNearbyReportActive({get:async()=>null},job,now),false);
 assert.equal(await recipients.isStoredNearbyReportActive(undefined,job,now),false);
 assert.equal(await recipients.isStoredNearbyReportActive({get:async()=>({...report,type:'no_space'})},job,now),false);
 assert.equal(await recipients.isStoredNearbyReportActive({get:async()=>({...report,createdAt:now-2000})},job,now),false);
 assert.equal(await recipients.isStoredNearbyReportActive({get:async()=>({...report,ownerId:'other'})},job,now),false);
 assert.equal(await recipients.isStoredNearbyReportActive(kv,job,now+2000),false);
});


test('subscription registration preserves endpoint ownership across accounts',async()=>{
 const api=await load('../functions/api/nearby-push.js');
 const oldFetch=globalThis.fetch;
 let owner='account-a';
 let sqlSeen='';
 globalThis.fetch=async()=>Response.json({id:owner});
 const endpoint='https://fcm.googleapis.com/fcm/send/test';
 const subscription={endpoint,keys:{p256dh:'A'.repeat(44),auth:'B'.repeat(24)}};
 const db={prepare(sql){
  sqlSeen=sql;
  return {bind(...values){return {run:async()=>{
   const attemptedOwner=values[6];
   if(attemptedOwner!=='account-a')return {meta:{changes:0}};
   return {meta:{changes:1}};
  }}}};
 }};
 const request=()=>new Request('https://rotapark.com.tr/api/nearby-push',{
  method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},
  body:JSON.stringify({subscription,latitude:40.9,longitude:29.3})
 });
 try{
  const env={DB:db,WEB_PUSH_PUBLIC_KEY:'public',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public'};
  assert.equal((await api.onRequestPost({request:request(),env})).status,200);
  assert.match(sqlSeen,/WHERE nearby_push_subscriptions\.owner_id=excluded\.owner_id/);
  assert.doesNotMatch(sqlSeen.split(' WHERE ')[0],/owner_id=excluded\.owner_id/);
  owner='account-b';
  const denied=await api.onRequestPost({request:request(),env});
  assert.equal(denied.status,409);
  assert.equal((await denied.json()).error,'subscription_owned_by_another_account');
 }finally{globalThis.fetch=oldFetch}
});
