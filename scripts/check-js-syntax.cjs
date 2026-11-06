const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let count = 0;
for (const [, attrs, body] of scripts) {
  if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
  if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/.test(attrs)) continue;
  new vm.Script(body, {filename: 'index.html:inline-' + (++count) + '.js'});
}
new vm.Script(fs.readFileSync('sw.js', 'utf8'), {filename: 'sw.js'});
if (!count) throw new Error('No inline JavaScript was checked');
const checks = [
  ['Parking loader must be asynchronous', /async function loadParking\s*\(/],
  ['Parking search must use both data sources', /fetch\('\/api\/parking'/],
  ['Business parking source must be requested', /fetch\('\/api\/business-parking'/],
  ['Parking list must render result cards', /for\s*\(const p of points\.slice\(0,parkingListLimit\)\)/],
  ['Load-more control must exist', /parkingListLimit\s*\+=\s*60/],
  ['Data freshness indicator must exist', /id="parkingDataFreshness"/],
  ['Navigation action must exist', /navigateToParking\s*\(/]
];
for (const [label, pattern] of checks) {
  if (!pattern.test(html)) throw new Error('Regression check failed: ' + label);
}
console.log('Syntax and regression checks OK: ' + count + ' inline script(s), sw.js, ' + checks.length + ' app checks');
