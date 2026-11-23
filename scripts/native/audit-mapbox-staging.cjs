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

if (process.argv.includes('--generated-android')) {
  const android = path.join(root, 'android');
  const appGradle = fs.readFileSync(path.join(android, 'app/build.gradle'), 'utf8');
  const manifest = fs.readFileSync(path.join(android, 'app/src/main/AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(android, 'app/src/main/java/tr/com/rotapark/app/MainActivity.java'), 'utf8');
  const projectGradle = fs.readFileSync(path.join(android, 'build.gradle'), 'utf8');
  const parkingAsset = path.join(android, 'app/src/main/assets/rotapark-parking.json');
  const nativeMap = fs.readFileSync(path.join(android, 'app/src/main/java/tr/com/rotapark/app/RotaparkNativeMapActivity.java'), 'utf8');
  if (!nativeMap.includes('rotapark-parking.json') || !nativeMap.includes('loadParkingSummary')) throw Error('Native parking asset reader missing');
  if (!fs.existsSync(parkingAsset) || fs.statSync(parkingAsset).size === 0) throw Error('Native parking data asset missing or empty');
  if (!main.includes('ROTAPARK_NATIVE_MAP_STAGING_LAUNCH') || !main.includes('RotaparkNativeMapActivity.class')) throw Error('Native map is not the staging launch screen');
  if (!manifest.includes('android:name=".RotaparkNativeMapActivity"')) throw Error('Native map Activity missing from manifest');
  if (!appGradle.includes('com.mapbox.navigationcore:android:3.34.4')) {
    throw Error('Generated APK does not include expected Mapbox SDK dependency');
  }
  if (!projectGradle.includes('ROTAPARK_MAPBOX_MAVEN')) {
    throw Error('Generated Android project missing Mapbox Maven repository');
  }
  if (!manifest.includes('android.permission.ACCESS_FINE_LOCATION')) {
    throw Error('Generated Android manifest missing precise location permission');
  }
  if (/com\.google\.android\.libraries\.navigation|RotaparkGuidanceActivity|RotaparkNavigationPlugin/.test(
      [appGradle, manifest, main].join('\n'))) {
    throw Error('Legacy Google navigation wiring detected in generated Mapbox APK');
  }
  const javaRoot = path.join(android, 'app/src/main/java');
  const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes:true}).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]) : [];
  for (const file of walk(javaRoot).filter(f => f.endsWith('.java') || f.endsWith('.kt'))) {
    if (/com\.google\.android\.libraries\.navigation/.test(fs.readFileSync(file,'utf8'))) {
      throw Error('Legacy Google SDK Java/Kotlin import detected: ' + path.relative(root,file));
    }
  }
  console.log('PASS: Generated Android APK wiring includes Mapbox and excludes Google Navigation SDK.');
}
