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
console.log('Syntax OK: ' + count + ' inline script(s) and sw.js');
