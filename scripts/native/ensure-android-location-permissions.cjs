#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const manifest=path.resolve(__dirname,'../../android/app/src/main/AndroidManifest.xml');
let xml=fs.readFileSync(manifest,'utf8');
for(const permission of ['android.permission.ACCESS_COARSE_LOCATION','android.permission.ACCESS_FINE_LOCATION']){
  if(!xml.includes('android:name="'+permission+'"')){
    if(!xml.includes('<application'))throw Error('Android manifest missing application element');
    xml=xml.replace('<application','<uses-permission android:name="'+permission+'" />\n    <application');
  }
}
fs.writeFileSync(manifest,xml);
console.log('Staging Android location permissions verified.');
