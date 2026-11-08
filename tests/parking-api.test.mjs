import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequestGet } from '../functions/api/parking.js';

const origin='https://rotapark.test';
const center={lat:40.9,lng:29.2};
const point=(name,overrides={})=>({name,lat:center.lat,lng:center.lng,...overrides});
async function query(points){
  const request=new Request(origin+'/api/parking?lat='+center.lat+'&lng='+center.lng);
  const env={ASSETS:{fetch:async()=>Response.json({points,source:'test',updatedAt:'2026-11-08'})}};
  const response=await onRequestGet({request,env});
  assert.equal(response.status,200);
  return (await response.json()).points.map(p=>p.name);
}
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
