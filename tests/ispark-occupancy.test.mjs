import assert from 'node:assert/strict';
import {test} from 'node:test';
import {onRequestGet} from '../functions/api/ispark-occupancy.js';
import {onRequestPost} from '../functions/api/ispark-upload.js';

test('İSPARK only reads storage, shares misses and rechecks freshness at serve time', async t => {
  const start = Date.parse('2026-11-21T19:00:00Z');
  let now = start;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Upstream must stay off the read path'));
  const edge = new Map();
  Object.defineProperty(globalThis, 'caches', {configurable:true, value:{default:{
    async match(key) {
      const hit = edge.get(key.url);
      if (hit?.expires > now) return hit.response.clone();
    },
    async put(key, response) {
      const seconds = Number(response.headers.get('cache-control').match(/max-age=(\d+)/)[1]);
      edge.set(key.url, {response, expires:now+seconds*1000});
    }
  }}});
  t.after(() => delete globalThis.caches);

  let reads = 0;
  let storageDown = false;
  const snapshot = {collectedAt:new Date(start).toISOString(), points:[
    {id:'1', freeSpaces:3, measuredAt:new Date(start-14*60000-45000).toISOString()},
    {id:'2', freeSpaces:2},
    {id:'3', freeSpaces:1, measuredAt:new Date(start+1).toISOString()}
  ]};
  const env = {ISPARK_SNAPSHOTS:{async get() {
    reads++;
    if (storageDown) throw new Error('Storage unavailable');
    return snapshot;
  }}};
  const request = new Request('https://staging.test/api/ispark-occupancy');
  const call = async () => (await onRequestGet({request, env})).json();
  const simultaneous = await Promise.all([call(), call(), call()]);
  assert.equal(reads, 1);
  assert.deepEqual(simultaneous.map(d => d.liveCount), [1,1,1]);
  assert.equal(simultaneous[0].points[1].verifiedLive, false);
  assert.equal(simultaneous[0].points[2].verifiedLive, false);

  now += 16000;
  const hit = await call();
  assert.equal(hit.points[0].occupancyUpdatedAt, null);
  assert.equal(hit.points[0].measuredAt, snapshot.points[0].measuredAt);
  assert.equal(reads, 1);

  now += 15000;
  storageDown = true;
  const fallback = await call();
  assert.equal(fallback.diagnostic.reason, 'storage_unavailable');
  assert.equal(fallback.upstreamUnavailable, true);
  assert.equal(fallback.liveCount, 0);
  assert.equal(fallback.points[0].freeSpaces, 3);
  assert.equal(reads, 2);

  now = start + 15*60000;
  storageDown = false;
  const stale = await call();
  assert.equal(stale.diagnostic.reason, 'snapshot_stale');
  assert.equal(stale.liveCount, 0);
  now = start + 24*60*60000;
  assert.equal((await call()).unavailable, true);
});

test('İSPARK upload preserves the last good collection after partial or older uploads', async t => {
  const now = Date.parse('2026-11-21T19:00:00Z');
  t.mock.method(Date, 'now', () => now);
  let saved;
  const env = {ISPARK_UPLOAD_TOKEN:'test', ISPARK_SNAPSHOTS:{
    async get() {return saved},
    async put(key, value) {assert.equal(key, 'latest'); saved=JSON.parse(value)}
  }};
  const rows = Array.from({length:200}, (_, i) => ({
    parkID:i+1, parkName:'Otopark '+i, lat:41, lng:29, capacity:100, emptyCapacity:0,
    lastUpdate:'2026-11-21 21:58:00'
  }));
  const upload = (body, token='test') => onRequestPost({env, request:new Request('https://staging.test/api/ispark-upload', {
    method:'POST', headers:{Authorization:'Bearer '+token}, body:JSON.stringify(body)
  })});
  const collection = (values, age) => ({rows:values, collectedAt:new Date(now-age).toISOString()});
  assert.equal((await upload(collection(rows,1000), 'incorrect')).status, 401);
  assert.equal((await upload(collection(rows,1000))).status, 200);
  assert.equal(saved.points[0].measuredAt, '2026-11-21T18:58:00.000Z');
  assert.equal(saved.points[0].freeSpaces, 0);
  const original = saved;
  assert.equal((await upload(collection(rows.slice(0,120),500))).status, 409);
  assert.equal((await upload(collection(rows,2000))).status, 409);
  assert.equal((await upload(collection(rows.map(() => rows[0]),500))).status, 400);
  assert.equal(saved, original);
  assert.equal((await upload(rows)).status, 200);
  assert.equal(saved.points.length, 200);
});
