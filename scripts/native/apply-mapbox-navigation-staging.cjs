#!/usr/bin/env node
// Isolated Mapbox Navigation SDK Android staging installer. Never use on production builds.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),android=path.join(root,'android');
const required=p=>{if(!fs.existsSync(p))throw Error('Missing '+path.relative(root,p));return fs.readFileSync(p,'utf8')};
const settings=path.join(android,'settings.gradle'),gradle=path.join(android,'app/build.gradle');
const manifest=path.join(android,'app/src/main/AndroidManifest.xml');
let s=required(settings),g=required(gradle),m=required(manifest);
const secret=process.env.MAPBOX_DOWNLOADS_TOKEN||'',publicToken=process.env.MAPBOX_PUBLIC_TOKEN||'';
if(!/^sk\.[A-Za-z0-9._-]+$/.test(secret))throw Error('MAPBOX_DOWNLOADS_TOKEN missing or invalid');
if(!/^pk\.[A-Za-z0-9._-]+$/.test(publicToken))throw Error('MAPBOX_PUBLIC_TOKEN missing or invalid');
if(g.includes('com.google.android.libraries.navigation'))throw Error('Google Navigation SDK found: use a fresh Capacitor Android project');
if(!s.includes('ROTAPARK_MAPBOX_MAVEN')){
 s += `
\n// ROTAPARK_MAPBOX_MAVEN staging-only repository
pluginManagement {
    repositories {
        maven {
            url 'https://api.mapbox.com/downloads/v2/releases/maven'
            credentials { username = 'mapbox'; password = System.getenv('MAPBOX_DOWNLOADS_TOKEN') ?: '' }
            authentication { basic(BasicAuthentication) }
        }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
`;
}
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
 pg=pg.replace('repositories {','repositories {\n        // ROTAPARK_MAPBOX_MAVEN\n        '+repo);
}
if(!g.includes('com.mapbox.navigationcore:android:3.34.4')){
 g+='\n// ROTAPARK staging-only Mapbox Navigation SDK\ndependencies { implementation "com.mapbox.navigationcore:android:3.34.4" }\n';
}
if(!m.includes('android.permission.ACCESS_FINE_LOCATION')){
 m=m.replace('<application','<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <application');
}
const res=path.join(android,'app/src/main/res/values/mapbox_access_token.xml');
fs.mkdirSync(path.dirname(res),{recursive:true});
fs.writeFileSync(res,'<?xml version="1.0" encoding="utf-8"?><resources><string name="mapbox_access_token">'+publicToken+'</string></resources>\n');
fs.writeFileSync(gradle,g);fs.writeFileSync(projectGradle,pg);fs.writeFileSync(manifest,m);
console.log('Mapbox SDK 3.34.4 staging dependencies configured; no native guidance UI installed yet.');
