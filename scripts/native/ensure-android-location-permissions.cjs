#!/usr/bin/env node
// Staging Android generated-manifest location permission guard.
const fs=require('node:fs');
const path=require('node:path');
const manifest=path.resolve(__dirname,'../../android/app/src/main/AndroidManifest.xml');
let xml=fs.readFileSync(manifest,'utf8');
const permissions=['android.permission.ACCESS_COARSE_LOCATION','android.permission.ACCESS_FINE_LOCATION'];
for(const permission of permissions){
 const re=new RegExp('<uses-permission\\s+[^>]*android:name=["\\']'+permission.replace(/\./g,'\\.')+'["\\'][^>]*/?>');
 if(!re.test(xml))xml=xml.replace(/<application\b/,'<uses-permission android:name="'+permission+'" />\n    <application');
}
for(const permission of permissions){
 if(!xml.includes('android:name="'+permission+'"'))throw Error('Missing '+permission);
}
fs.writeFileSync(manifest,xml);
console.log('Staging Android location permissions verified.');
