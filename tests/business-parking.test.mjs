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
