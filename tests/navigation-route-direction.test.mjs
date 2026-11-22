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
