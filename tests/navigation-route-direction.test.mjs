import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=source.indexOf('const assertForwardRoute=');
const end=source.indexOf('const fetchRoute=async(',start);
assert.ok(start>=0&&end>start,'Forward route validator exists');
const map={distance(a,b){const lat=(a[0]+b[0])*Math.PI/360;return Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*Math.cos(lat))}};
const validate=vm.runInNewContext(source.slice(start,end)+';assertForwardRoute',{map});
const origin={lat:40,lng:29},target={lat:40.01,lng:29.01};
const line=coords=>({geometry:{type:'LineString',coordinates:coords}});
test('accepts forward route geometry',()=>assert.equal(validate(line([[29,40],[29.01,40.01]]),origin,target).geometry.coordinates.length,2));
test('rejects reversed route geometry',()=>assert.throws(()=>validate(line([[29.01,40.01],[29,40]]),origin,target),/ters/));
test('rejects malformed route geometry',()=>assert.throws(()=>validate(line([[29,40]]),origin,target),/eksik/));
test('reverse guard applies to both driving and pedestrian responses',()=>{
 assert.match(source,/return assertForwardRoute\(data\.routes\[0\],origin,target\)/);
 assert.match(source,/return assertForwardRoute\(\{geometry:\{type:'LineString',coordinates:coords\}/);
});
test('arrow matching considers heading and route continuity',()=>{
 assert.match(source,/const reliableHeading=headingMotionActive/);
 assert.match(source,/const headingPenalty=reliableHeading/);
 assert.match(source,/const continuityPenalty=lastMatchedProgress/);
});

test('hairpin route snap follows GPS heading instead of nearest opposite lane',()=>{
 const begin=source.indexOf('if(path?.length>1){let bestScore=Infinity;');
 const finish=source.indexOf('const snapDistance=map.distance',begin);
 assert.ok(begin>=0&&finish>begin,'snap candidate selection is present');
 const choose=vm.runInNewContext('(function(){'+source.slice(begin,finish)+';return {snappedLat,snappedLng,arrowBearing}})',{map,Math,Number});
 const path=[[29,40],[29,40.001],[29.00005,40.001],[29.00005,40]];
 const segmentMeters=111.195;
 const routeCache={cumulative:[0,segmentMeters,segmentMeters+4.3,segmentMeters*2+4.3],distances:[segmentMeters,4.3,segmentMeters]};
 const run=heading=>vm.runInNewContext('(function(){'+source.slice(begin,finish)+';return {snappedLat,snappedLng,arrowBearing}})()',{
   map,Math,Number,path,lat:40.0005,lng:29.00004,accuracy:5,
   headingMotionActive:true,lastHeading:heading,pos:{coords:{speed:9}},
   routeCache,lastMatchedProgress:null,snappedLat:40.0005,snappedLng:29.00004,arrowBearing:heading
 });
 const south=run(180),north=run(0);
 assert.ok(Math.abs(south.arrowBearing-180)<1,'southbound chooses southbound segment');
 assert.ok(Math.abs(north.arrowBearing-0)<1,'northbound chooses northbound segment');
});
