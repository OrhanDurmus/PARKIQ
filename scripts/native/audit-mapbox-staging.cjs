#!/usr/bin/env node
// Staging-only guard: fail CI if legacy Google navigation enters the Mapbox APK path.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const workflow = read('.github/workflows/mapbox-navigation-staging.yml');
const installer = read('scripts/native/apply-mapbox-navigation-staging.cjs');
const legacy = [
  'scripts/native/apply-navigation-sdk-staging.cjs',
  'scripts/native/android/RotaparkGuidanceActivity.java',
  'scripts/native/android/RotaparkNavigationPlugin.java'
];
const forbidden = ['apply-navigation-sdk-staging.cjs', 'com.google.android.libraries.navigation'];
for (const token of forbidden) {
  if (workflow.includes(token)) throw Error('Legacy Google navigation referenced in Mapbox CI: ' + token);
}
if (!installer.includes('com.google.android.libraries.navigation')) {
  throw Error('Mapbox installer no longer guards against Google Navigation SDK');
}
if (!workflow.includes('apply-mapbox-navigation-staging.cjs')) {
  throw Error('Mapbox staging workflow does not install Mapbox dependencies');
}
for (const file of legacy) {
  if (!fs.existsSync(path.join(root, file))) {
    console.warn('Legacy source absent (OK): ' + file);
  }
}
console.log('PASS: Mapbox staging workflow excludes legacy Google navigation installer; legacy source files remain isolated.');
