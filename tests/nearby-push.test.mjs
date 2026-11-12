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
