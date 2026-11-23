#!/usr/bin/env node
// Generate an isolated beta Capacitor configuration without editing production config.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'capacitor.config.json');
const output = path.join(root, 'build', 'beta', 'capacitor.config.json');
const origin = 'https://beta.rotapark.com.tr';
const config = JSON.parse(fs.readFileSync(source, 'utf8'));
if (config.appId !== 'tr.com.rotapark.app') throw new Error('Unexpected appId; inspect before beta packaging');
if (config.server?.url && !/^https:\/\//.test(config.server.url)) throw new Error('Insecure production origin');
const beta = {
  ...config,
  appId: 'tr.com.rotapark.app.beta',
  appName: 'ROTAPARK Beta',
  server: { ...config.server, url: origin, cleartext: false, allowNavigation: ['beta.rotapark.com.tr'] }
};
if (process.argv.includes('--check')) {
  if (beta.server.url !== origin || beta.server.allowNavigation.some(x => x !== 'beta.rotapark.com.tr')) process.exit(1);
  console.log('PASS: isolated beta config can be generated; production configuration remains unchanged.');
} else {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(beta, null, 2) + '\n', {flag:'w'});
  console.log('Wrote ' + path.relative(root, output));
  console.log('This file is NOT used automatically by Capacitor. Copy it into a temporary build workspace only after Access/WebView authentication is validated.');
}
