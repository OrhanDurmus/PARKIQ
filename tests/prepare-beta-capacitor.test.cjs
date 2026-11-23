#!/usr/bin/env node
// Regression tests for the isolated beta Capacitor configuration generator.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const source = path.resolve(__dirname, '..', 'scripts', 'prepare-beta-capacitor.cjs');

function fixture(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rotapark-beta-config-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(source, path.join(root, 'scripts', 'prepare-beta-capacitor.cjs'));
  const original = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(path.join(root, 'capacitor.config.json'), original);
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-beta-capacitor.cjs'), ...args], {encoding:'utf8'});
  return {root, original, run, cleanup:()=>fs.rmSync(root, {recursive:true,force:true})};
}
const production = {appId:'tr.com.rotapark.app',appName:'ROTAPARK',webDir:'www',server:{url:'https://rotapark.com.tr',cleartext:false,allowNavigation:['rotapark.com.tr']}};

test('beta output is isolated; production config remains unchanged', () => {
  const f=fixture(production);
  try {
    const result=f.run();
    assert.equal(result.status,0,result.stderr);
    const beta=JSON.parse(fs.readFileSync(path.join(f.root,'build','beta','capacitor.config.json'),'utf8'));
    assert.equal(beta.server.url,'https://beta.rotapark.com.tr');
    assert.deepEqual(beta.server.allowNavigation,['beta.rotapark.com.tr']);
    assert.equal(beta.server.cleartext,false);
    assert.equal(beta.appId,production.appId);
    assert.equal(fs.readFileSync(path.join(f.root,'capacitor.config.json'),'utf8'),f.original);
  } finally { f.cleanup(); }
});

test('check mode does not create output or modify production', () => {
  const f=fixture(production);
  try {
    const result=f.run('--check');
    assert.equal(result.status,0,result.stderr);
    assert.equal(fs.existsSync(path.join(f.root,'build')),false);
    assert.equal(fs.readFileSync(path.join(f.root,'capacitor.config.json'),'utf8'),f.original);
  } finally { f.cleanup(); }
});

test('unexpected app ID fails closed', () => {
  const f=fixture({...production,appId:'other.app'});
  try {
    const result=f.run();
    assert.notEqual(result.status,0);
    assert.equal(fs.existsSync(path.join(f.root,'build')),false);
  } finally { f.cleanup(); }
});

test('insecure source origin fails closed', () => {
  const f=fixture({...production,server:{...production.server,url:'http://rotapark.com.tr'}});
  try {
    const result=f.run();
    assert.notEqual(result.status,0);
    assert.equal(fs.existsSync(path.join(f.root,'build')),false);
  } finally { f.cleanup(); }
});
