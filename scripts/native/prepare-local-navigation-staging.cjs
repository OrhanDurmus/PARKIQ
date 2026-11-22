#!/usr/bin/env node
// Explicit opt-in for a local-asset Android navigation test APK only.
// Mutates capacitor.config.json only in a disposable staging build workspace. Never commit the result.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const configPath=path.join(root,'capacitor.config.json');
if(fs.existsSync(path.join(root,'capacitor.config.ts')))throw new Error('Existing TypeScript Capacitor config; refusing ambiguous override');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.appId!=='tr.com.rotapark.app'||config.webDir!=='www')throw new Error('Unexpected Capacitor configuration');
if(!config.server?.url?.includes('rotapark-staging.pages.dev'))throw new Error('Expected staging server URL; review config');
if(!fs.existsSync(path.join(root,'www/index.html')))throw new Error('Run npm run mobile:prepare before switching to local assets');
delete config.server;
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
console.log('Local-asset staging config applied in working tree only; restore tracked JSON after build.');
