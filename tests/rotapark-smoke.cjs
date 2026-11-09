const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const checks = [
  ['HTML document', /<!doctype html>/i],
  ['Search input', /id=["']q["']/],
  ['Parking search control', /id=["']parking["']/],
  ['Map container', /id=["']map["']/],
  ['Navigation status', /id=["']routeStatus["']/],
  ['Nearby parking list', /id=["']nearestFive["']/],
  ['Support section', /id=["']contactSupport["']/],
  ['Official support email', /mailto:info@rotapark\.com\.tr/],
];
for (const [label, pattern] of checks) {
  assert.match(html, pattern, label + ' is missing');
  console.log('PASS ' + label);
}
assert.doesNotMatch(html, /mailto:parkiq\.business@gmail\.com/i, 'Old business email must not be used');
console.log('PASS Old business email removed');

// Guard the map refresh and parking filtering optimizations against regressions.
assert.match(html, /map\.on\('moveend',[\s\S]*?clearTimeout\(pinViewportTimer\)/, 'Map move must debounce marker redraw');
assert.match(html, /map\.on\('zoomend',\(\)=>\{if\(!allParking\.length\)return;clearTimeout\(pinViewportTimer\)/, 'Map zoom must share the move debounce timer');
assert.match(html, /if\(parkingLayer\)parkingLayer\.clearLayers\(\);else parkingLayer=L\.layerGroup\(\)\.addTo\(map\)/, 'Parking marker layer must be reused');
assert.match(html, /const points=allParking\.filter\(p=>/, 'Parking filtering must use a single array pass');
assert.match(html, /if\(zoom>=16\)\{key=p\.lat\+'\,'\+p\.lng\}else\{const pixel=map\.project/, 'High zoom must avoid unnecessary projection');
console.log('PASS Map and parking performance regression checks');

// Preserve navigation guard and popup metadata behavior during future refactors.
assert.match(html, /map\.on\('moveend',[\s\S]*?routeWatch===null&&![\s\S]*?navigation-active/, 'Map move redraw must pause during navigation');
assert.match(html, /map\.on\('zoomend',[\s\S]*?routeWatch===null&&![\s\S]*?navigation-active/, 'Map zoom redraw must pause during navigation');
assert.match(html, /const availabilityText=availability\(e\),capacityText=capacityInfo\(e\),hoursText=hoursInfo\(e\)/, 'Popup metadata should be evaluated once');
assert.match(html, /detailButton\.onclick=\(\)=>showDetails\(e\)/, 'Parking popup details action must remain available');
assert.match(html, /link\.onclick=\(\)=>navigateToParking\(e\.lat,e\.lng,e\.name\|\|'Otopark'\)/, 'Parking popup route action must remain available');
console.log('PASS Navigation guard and parking popup regression checks');

// Prevent reintroducing the duplicate map refresh path or layer recreation.
assert.doesNotMatch(html, /zoomRefreshTimer/, 'Separate zoom refresh timer must not return');
assert.doesNotMatch(html, /map\.removeLayer\(parkingLayer\)/, 'Parking layer must not be detached on redraw');
assert.doesNotMatch(html, /points\.push\(\.\.\.filtered\)/, 'Parking filtering must not copy a second result array');
console.log('PASS No duplicate redraw and filtering paths');
