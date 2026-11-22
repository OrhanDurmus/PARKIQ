#!/usr/bin/env node
// Explicit opt-in for a local-asset Android navigation test APK only.
// Never change the tracked capacitor.config.json or production deployment.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const configPath=path.join(root,'capacitor.config.json');
const output=path.join(root,'capacitor.config.ts');
if(fs.existsSync(output))throw new Error('Existing capacitor.config.ts; refusing to override');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.appId!=='tr.com.rotapark.app'||config.webDir!=='www')throw new Error('Unexpected Capacitor configuration');
if(!config.server?.url?.includes('rotapark-staging.pages.dev'))throw new Error('Expected staging server URL; review config');
delete config.server;
fs.writeFileSync(output,'// Generated for local-asset staging APK; do not commit.\nexport default '+JSON.stringify(config,null,2)+';\n');
console.log('Created temporary local-asset staging Capacitor config; tracked JSON unchanged.');
