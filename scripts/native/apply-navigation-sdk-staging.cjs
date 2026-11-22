#!/usr/bin/env node
// Apply the opt-in Android Navigation SDK probe to a generated Capacitor project.
// No credentials, runtime activation or production changes.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const android=path.join(root,'android');
const requireFile=p=>{if(!fs.existsSync(p))throw new Error('Missing '+path.relative(root,p)+'; run npx cap add android first');return fs.readFileSync(p,'utf8')};
const write=(p,s)=>fs.writeFileSync(p,s);
const app=path.join(android,'app');
const javaDir=path.join(app,'src/main/java/tr/com/rotapark/app');
const gradle=path.join(app,'build.gradle');
const manifest=path.join(app,'src/main/AndroidManifest.xml');
const vars=path.join(android,'variables.gradle');
const projectGradle=path.join(android,'build.gradle');
const wrapper=path.join(android,'gradle/wrapper/gradle-wrapper.properties');
const required=[gradle,manifest,vars,projectGradle,wrapper];
for(const file of required)requireFile(file);
let g=requireFile(gradle),m=requireFile(manifest),v=requireFile(vars),pg=requireFile(projectGradle),w=requireFile(wrapper);
const pristine=/com\.android\.tools\.build:gradle:8\.7\.2/.test(pg)&&/gradle-8\.11\.1-all\.zip/.test(w)&&/minSdkVersion\s*=\s*23/.test(v);
const patched=/com\.android\.tools\.build:gradle:8\.13\.2/.test(pg)&&/gradle-8\.13-all\.zip/.test(w)&&/minSdkVersion\s*=\s*24/.test(v);
if(!pristine&&!patched)throw new Error('Unexpected Capacitor Android toolchain; review versions before patching');
pg=pg.replace('com.android.tools.build:gradle:8.7.2','com.android.tools.build:gradle:8.13.2');
w=w.replace('gradle-8.11.1-all.zip','gradle-8.13-all.zip');
v=v.replace(/minSdkVersion\s*=\s*23/,'minSdkVersion = 24').replace(/(compileSdkVersion|targetSdkVersion)\s*=\s*35/g,'$1 = 36');
if(!g.includes('com.google.android.libraries.navigation:navigation:7.9.0')){
g+=`\n// ROTAPARK staging-only Google Navigation SDK probe\nandroid { compileOptions { coreLibraryDesugaringEnabled true } }\ndependencies {\n implementation 'com.google.android.libraries.navigation:navigation:7.9.0'\n coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.1.5'\n}\n`;
}
if(!m.includes('RotaparkGuidanceActivity')){
m=m.replace('</application>','<activity android:name="tr.com.rotapark.app.RotaparkGuidanceActivity" android:exported="false" />\n    </application>');
}
// Enable only explicitly configured staging test APKs. Never print or commit the key.
const sdkKey=process.env.ROTAPARK_STAGING_GOOGLE_MAPS_API_KEY||'';
if(sdkKey){
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(sdkKey))throw new Error('Invalid staging Google Maps API key format');
 if(!m.includes('com.google.android.geo.API_KEY')){
  m=m.replace('</application>','<meta-data android:name="com.google.android.geo.API_KEY" android:value="'+sdkKey+'" />\n    <meta-data android:name="rotapark.navigation.sdk.enabled" android:value="true" />\n    </application>');
 }else if(!m.includes('rotapark.navigation.sdk.enabled')){
  throw new Error('Existing Google Maps key without ROTAPARK SDK opt-in; inspect generated manifest');
 }
}
fs.mkdirSync(javaDir,{recursive:true});
for(const name of ['RotaparkGuidanceActivity.java','RotaparkNavigationPlugin.java']){
 const src=path.join(root,'scripts/native/android',name);
 write(path.join(javaDir,name),requireFile(src));
}
// Register the native Capacitor bridge in this staging-only generated Android app.
const mainActivity=path.join(javaDir,'MainActivity.java');
let main=requireFile(mainActivity);
if(!main.includes('registerPlugin(RotaparkNavigationPlugin.class)')){
  const anchor='public class MainActivity extends BridgeActivity {';
  if(!main.includes(anchor))throw new Error('Unexpected MainActivity layout; cannot safely register SDK plugin');
  main=main.replace(anchor,anchor+"\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(RotaparkNavigationPlugin.class);\n        super.onCreate(savedInstanceState);\n    }");
}
write(mainActivity,main);
write(gradle,g);write(manifest,m);write(vars,v);write(projectGradle,pg);write(wrapper,w);
console.log('Staging SDK native sources and dependency installed; navigation remains disabled until secure key and plugin wiring are validated.');
