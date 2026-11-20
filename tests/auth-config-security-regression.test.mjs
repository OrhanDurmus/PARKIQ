import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/auth-config.js';

const request = async (env) => {
  const response = await onRequestGet({ env });
  return { status: response.status, body: await response.json() };
};

test('missing Preview bindings never expose a public configuration', async () => {
  assert.deepEqual(await request({}), { status: 200, body: { configured: false } });
});

test('service role JWT must never be returned to clients', async () => {
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const key = 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.signature';
  assert.deepEqual(await request({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: key }), { status: 200, body: { configured: false } });
});

test('malformed JWT must not crash auth-config endpoint', async () => {
  assert.deepEqual(await request({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'header.invalid-json.signature' }), { status: 200, body: { configured: false } });
});

test('public publishable key is returned only for a valid Supabase host', async () => {
  const key = 'sb_publishable_testkey';
  const valid = await request({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: key });
  assert.deepEqual(valid, { status: 200, body: { configured: true, url: 'https://project.supabase.co', anonKey: key } });
  const invalid = await request({ SUPABASE_URL: 'https://project.supabase.co.attacker.test', SUPABASE_ANON_KEY: key });
  assert.deepEqual(invalid, { status: 200, body: { configured: false } });
});
