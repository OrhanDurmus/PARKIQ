import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../functions/api/auth-config.js', import.meta.url), 'utf8');
const { onRequestGet } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

async function response(env) {
  const res = await onRequestGet({ env });
  return { status: res.status, cache: res.headers.get('Cache-Control'), body: await res.json() };
}

test('accepts a valid Supabase configuration', async () => {
  const res = await response({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test' });
  assert.equal(res.status, 200);
  assert.equal(res.cache, 'no-store');
  assert.deepEqual(res.body, { configured: true, url: 'https://example.supabase.co', anonKey: 'sb_publishable_test' });
});

test('normalizes whitespace and trailing slashes from environment values', async () => {
  const res = await response({ SUPABASE_URL: '  https://example.supabase.co///  ', SUPABASE_ANON_KEY: '  sb_publishable_test\n' });
  assert.deepEqual(res.body, { configured: true, url: 'https://example.supabase.co', anonKey: 'sb_publishable_test' });
});

test('rejects absent or malformed configuration without exposing keys', async () => {
  for (const env of [
    {},
    { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: '   ' },
    { SUPABASE_URL: 'http://example.supabase.co', SUPABASE_ANON_KEY: 'secret' },
    { SUPABASE_URL: 'https://evil.example.com', SUPABASE_ANON_KEY: 'secret' },
  ]) {
    const res = await response(env);
    assert.deepEqual(res.body, { configured: false });
  }
});
