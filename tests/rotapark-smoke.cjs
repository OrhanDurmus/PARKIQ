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
