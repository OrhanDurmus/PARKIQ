import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { shieldGuard, shieldReadJson, shieldRpc } from '../functions/_lib/shield.mjs';
import { onRequest as shieldApi } from '../functions/api/shield.js';

function fixture(t, mode = 'normal') {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../migrations/staging-shield.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            async run() { return { success: true, meta: statement.run(...args) }; },
            async all() { return { success: true, results: statement.all(...args) }; },
          };
        },
      };
    },
  };
  const host = 'shield.example.test';
  const env = {
    SHIELD_STAGE: 'staging', SHIELD_STAGING_HOST: host, SHIELD_DB: db,
    SHIELD_IP_HMAC_KEY: 'test-secret-'.repeat(4),
    SHIELD_SUPABASE_PROJECT_REF: 'test-project',
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test',
  };
  const calls = [];
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json(mode);
  });
  const request = new Request('https://' + host + '/api/tts', {
    headers: { 'CF-Connecting-IP': '192.0.2.1' },
  });
  return { sqlite, env, request, calls, upstream };
}

test('parallel requests respect the defensive client quota and record refusals', async t => {
  const { env, request, sqlite } = fixture(t, 'defense');
  const responses = await Promise.all(Array.from({ length: 12 }, () =>
    shieldGuard({ env, request }, 'tts', 0)));
  assert.equal(responses.filter(result => result === null).length, 10);
  assert.equal(responses.filter(result => result?.status === 429).length, 2);
  assert.equal(sqlite.prepare('SELECT total FROM shield_signals').get().total, 2);
  assert.equal(sqlite.prepare("SELECT used FROM shield_quota WHERE subject = 'global'").get().used, 10);
});

test('global cost cap reserves the final slot once across concurrent requests', async t => {
  const { env, request, sqlite } = fixture(t);
  sqlite.exec("INSERT INTO shield_quota VALUES ('tts', 0, 'global', 2999)");
  const results = await Promise.all([0, 1].map(() => shieldGuard({ env, request }, 'tts', 0)));
  assert.equal(results.filter(response => response === null).length, 1);
  assert.equal(results.find(Boolean).status, 429);
  assert.equal(sqlite.prepare("SELECT used FROM shield_quota WHERE subject = 'global'").get().used, 3000);
});

test('emergency denies paid speech while preserving OTP and fallback with the guard disabled', async t => {
  const { env, request, sqlite } = fixture(t, 'emergency');
  assert.equal((await shieldGuard({ env, request }, 'tts', 0)).status, 503);
  assert.equal(await shieldGuard({ env, request }, 'otp-preflight', 0), null);
  assert.equal(sqlite.prepare("SELECT used FROM shield_quota WHERE subject = 'global'").get().used, 1);
  assert.equal(await shieldGuard({ env: {}, request }, 'tts', 0), null);
});

test('wrong host, private key and missing binding fail closed', async t => {
  const { env, request, calls } = fixture(t);
  assert.equal((await shieldGuard({ env: { ...env, SHIELD_STAGING_HOST: 'other.example.test' }, request }, 'tts', 0)).status, 503);
  assert.equal((await shieldGuard({ env: { ...env, SHIELD_DB: undefined }, request }, 'tts', 0)).status, 503);
  await assert.rejects(shieldRpc({ ...env, SUPABASE_ANON_KEY: 'sb_secret_test' }, 'rotapark_shield_mode', {}));
  assert.equal(calls.length, 0);
});

test('bounded JSON accepts small streams and rejects excess bytes without Content-Length', async () => {
  assert.deepEqual(await shieldReadJson(new Request('https://shield.example.test', {
    method: 'POST', body: '{"mode":"normal"}',
  })), { mode: 'normal' });
  await assert.rejects(shieldReadJson(new Request('https://shield.example.test', {
    method: 'POST', body: 'a'.repeat(4097),
  })), RangeError);
});

test('control API uses the user token and leaves revision validation to the database', async t => {
  const { env, calls, upstream } = fixture(t);
  upstream.mock.mockImplementationOnce(async () => new Response(null, { status: 403 }));
  const url = 'https://' + env.SHIELD_STAGING_HOST + '/api/shield';
  assert.equal((await shieldApi({ env, request: new Request(url) })).status, 401);
  const request = new Request(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-victimless-session' },
    body: JSON.stringify({ mode: 'normal', revision: 0 }),
  });
  assert.equal((await shieldApi({ env, request })).status, 403);
  assert.equal(calls.length, 0);

  const retry = request => shieldApi({ env, request });
  const response = await retry(new Request(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-founder-session' },
    body: JSON.stringify({ mode: 'defense', revision: 2 }),
  }));
  assert.equal(response.status, 200);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-founder-session');
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_mode: 'defense', p_revision: 2 });
});
