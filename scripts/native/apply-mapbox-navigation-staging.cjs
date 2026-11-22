#!/usr/bin/env node
// Isolated Mapbox Navigation SDK Android staging installer. Never use on production builds.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),android=path.join(root,'android');
const required=p=>{if(!fs.existsSync(p))throw Error('Missing '+path.relative(root,p));return fs.readFileSync(p,'utf8')};
const gradle=path.join(android,'app/build.gradle');
const manifest=path.join(android,'app/src/main/AndroidManifest.xml');
let g=required(gradle),m=required(manifest);
const secret=process.env.MAPBOX_DOWNLOADS_TOKEN||'',publicToken=process.env.MAPBOX_PUBLIC_TOKEN||'';
if(!/^sk\.[A-Za-z0-9._-]+$/.test(secret))throw Error('MAPBOX_DOWNLOADS_TOKEN missing or invalid');
if(!/^pk\.[A-Za-z0-9._-]+$/.test(publicToken))throw Error('MAPBOX_PUBLIC_TOKEN missing or invalid');
if(g.includes('com.google.android.libraries.navigation'))throw Error('Google Navigation SDK found: use a fresh Capacitor Android project');
// Maven repository for dependency resolution in Capacitor's standard Gradle project.
const projectGradle=path.join(android,'build.gradle');
let pg=required(projectGradle);
if(!pg.includes('ROTAPARK_MAPBOX_MAVEN')){
 const repo=`maven {
            url 'https://api.mapbox.com/downloads/v2/releases/maven'
            credentials { username = 'mapbox'; password = System.getenv('MAPBOX_DOWNLOADS_TOKEN') ?: '' }
            authentication { basic(BasicAuthentication) }
        }`;
 if(!pg.includes('repositories {'))throw Error('Unexpected project build.gradle');
 pg=pg.replace(/repositories\s*\{/g, 'repositories {\n        // ROTAPARK_MAPBOX_MAVEN\n        '+repo);
}
if(!g.includes('com.mapbox.navigationcore:android:3.34.4')){
 g+='\n// ROTAPARK staging-only Mapbox Navigation SDK\ndependencies { implementation "com.mapbox.navigationcore:android:3.34.4" }\n';
}
if(!g.includes('com.mapbox.maps:android:11.')) {
 g+='\n// ROTAPARK native map screen (staging)\ndependencies { implementation "com.mapbox.maps:android:11.16.0" }\n';
}
if(!m.includes('RotaparkNativeMapActivity')) {
 m=m.replace('</application>', '    <activity android:name=".RotaparkNativeMapActivity" android:exported="false" />\n    </application>');
}
// Staging launch flow: native map first; Android Back returns to legacy WebView for comparison.
const mainActivity=path.join(android,'app/src/main/java/tr/com/rotapark/app/MainActivity.java');
let mainJava=required(mainActivity);
if(!mainJava.includes('ROTAPARK_NATIVE_MAP_STAGING_LAUNCH')) {
 if(!/public class MainActivity extends BridgeActivity\s*\{/.test(mainJava)) throw Error('Unexpected Capacitor MainActivity; refusing to change launcher');
 mainJava=mainJava.replace(/public class MainActivity extends BridgeActivity\s*\{/, `public class MainActivity extends BridgeActivity {
    // ROTAPARK_NATIVE_MAP_STAGING_LAUNCH
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) {
            startActivity(new android.content.Intent(this, RotaparkNativeMapActivity.class));
        }
    }`);
 fs.writeFileSync(mainActivity,mainJava);
}
const nativeSrc=path.join(root,'scripts/native/android/RotaparkNativeMapActivity.java');
const nativeDst=path.join(android,'app/src/main/java/tr/com/rotapark/app/RotaparkNativeMapActivity.java');
fs.mkdirSync(path.dirname(nativeDst),{recursive:true});
fs.copyFileSync(nativeSrc,nativeDst);
if(!m.includes('android.permission.ACCESS_FINE_LOCATION')){
 m=m.replace('<application','<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <application');
}
// Bundle the existing parking dataset as an Android asset for the native data layer.
// Do not fetch the website or depend on WebView at runtime.
const parkingSource=path.join(root,'data/parking-turkiye.json');
if(!fs.existsSync(parkingSource))throw Error('Native parking dataset missing: data/parking-turkiye.json');
const parkingAsset=path.join(android,'app/src/main/assets/rotapark-parking.json');
fs.mkdirSync(path.dirname(parkingAsset),{recursive:true});
fs.copyFileSync(parkingSource,parkingAsset);
console.log('Bundled parking dataset for native Android: '+fs.statSync(parkingAsset).size+' bytes');
const res=path.join(android,'app/src/main/res/values/mapbox_access_token.xml');
fs.mkdirSync(path.dirname(res),{recursive:true});
fs.writeFileSync(res,'<?xml version="1.0" encoding="utf-8"?><resources><string name="mapbox_access_token">'+publicToken+'</string></resources>\n');
fs.writeFileSync(gradle,g);fs.writeFileSync(projectGradle,pg);fs.writeFileSync(manifest,m);
console.log('Mapbox SDK 3.34.4 staging dependencies configured; native map Activity installed (not yet launched); guidance UI not installed.');
