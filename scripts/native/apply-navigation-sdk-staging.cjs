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
if(!/com\.android\.tools\.build:gradle:8\.7\.2/.test(pg)||!/gradle-8\.11\.1-all\.zip/.test(w)||!/minSdkVersion\s*=\s*23/.test(v))throw new Error('Unexpected Capacitor Android toolchain; review versions before patching');
pg=pg.replace('com.android.tools.build:gradle:8.7.2','com.android.tools.build:gradle:8.13.2');
w=w.replace('gradle-8.11.1-all.zip','gradle-8.13-all.zip');
v=v.replace(/minSdkVersion\s*=\s*23/,'minSdkVersion = 24').replace(/(compileSdkVersion|targetSdkVersion)\s*=\s*35/g,'$1 = 36');
if(!g.includes('com.google.android.libraries.navigation:navigation:7.9.0')){
g+=`\n// ROTAPARK staging-only Google Navigation SDK probe\nandroid { compileOptions { coreLibraryDesugaringEnabled true } }\ndependencies {\n implementation 'com.google.android.libraries.navigation:navigation:7.9.0'\n coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.1.5'\n}\n`;
}
if(!m.includes('RotaparkGuidanceActivity')){
m=m.replace('</application>','<activity android:name="tr.com.rotapark.app.RotaparkGuidanceActivity" android:exported="false" />\n    </application>');
}
fs.mkdirSync(javaDir,{recursive:true});
for(const name of ['RotaparkGuidanceActivity.java','RotaparkNavigationPlugin.java']){
 const src=path.join(root,'scripts/native/android',name);
 write(path.join(javaDir,name),requireFile(src));
}
write(gradle,g);write(manifest,m);write(vars,v);write(projectGradle,pg);write(wrapper,w);
console.log('Staging SDK native sources and dependency installed; navigation remains disabled until secure key and plugin wiring are validated.');
