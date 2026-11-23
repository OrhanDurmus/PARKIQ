#!/usr/bin/env node
// Read-only preflight for separating the public landing from the mobile app.
// Run: node scripts/check-public-landing-cutover.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = JSON.parse(read('capacitor.config.json'));
const url = config.server?.url || '';
if (/^https:\/\/(?:www\.)?rotapark\.com\.tr\/?$/i.test(url)) {
  errors.push('Mobile Capacitor shell still loads the public rotapark.com.tr origin. Rebuild and test against a protected app origin or bundled assets BEFORE switching the public domain.');
}
if (url && !/^https:\/\//i.test(url)) errors.push('Capacitor remote server URL must use HTTPS.');
if (url && !Array.isArray(config.server?.allowNavigation)) warnings.push('Review Capacitor navigation allowlist.');
const landing = read('launch-preview/index.html');
if (!/ÇOK YAKINDA/.test(landing) || !/TÜM PLATFORMLARDA/.test(landing)) errors.push('Coming-soon message is missing.');
if (!/info@rotapark\.com\.tr/.test(landing)) errors.push('Public contact email is missing.');
if (/(?:\+90|\b0?5\d{2}[\s().-]*\d{3}[\s().-]*\d{2}[\s().-]*\d{2}\b)/.test(landing)) errors.push('Possible personal phone number in public landing.');
if (/instagram\.com|instagram\.svg/i.test(landing)) errors.push('Instagram reference found in public landing.');
if (/https?:\/\/(?:beta\.)?rotapark\.com\.tr\/(?:api|admin)(?:\/|["'])/i.test(landing)) warnings.push('Landing references private application endpoints.');
console.log('ROTAPARK public landing cutover preflight');
for (const item of warnings) console.log('WARN: ' + item);
for (const item of errors) console.error('BLOCK: ' + item);
if (errors.length) { console.error('NOT READY: ' + errors.length + ' blocking issue(s). No deployment performed.'); process.exitCode = 1; }
else console.log('Local checks passed. Still verify Access rules, direct origins, API and device builds manually before switching DNS.');
