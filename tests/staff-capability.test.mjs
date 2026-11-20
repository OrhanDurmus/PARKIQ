import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/staff/capability.js';
test('rejects missing and unknown capability without querying auth', async () => {
  for (const path of ['/api/staff/capability','/api/staff/capability?permission=founder.assign']) {
    const response = await onRequestGet({ request: new Request('https://staging.example' + path), env: {} });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
test('does not reveal permission to anonymous clients', async () => {
  const response = await onRequestGet({ request: new Request('https://staging.example/api/staff/capability?permission=support.read'), env: {} });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'authentication_required' });
});

const env = { SUPABASE_URL: 'https://staging-test.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key' };
const request = () => new Request('https://staging.example/api/staff/capability?permission=support.read', {
  headers: { Authorization: 'Bearer test-user-token' },
});
async function withMockedFetch(allowed, callback) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'test-user-id' });
    if (String(url).endsWith('/rest/v1/rpc/rotapark_staff_has_permission')) return Response.json(allowed);
    throw Error('unexpected upstream request');
  };
  try { return await callback(calls); } finally { globalThis.fetch = original; }
}
test('granted permission responds 200 without exposing identity or credentials', async () => {
  await withMockedFetch(true, async calls => {
    const response = await onRequestGet({ request: request(), env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { allowed: true, permission: 'support.read' });
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1].options.body).p_permission, 'support.read');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer test-user-token');
  });
});
test('revoked permission responds 403 and never reveals protected data', async () => {
  await withMockedFetch(false, async calls => {
    const response = await onRequestGet({ request: request(), env });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'permission_denied' });
    assert.equal(calls.length, 2);
  });
});
test('missing staging auth configuration fails closed with 503', async () => {
  const response = await onRequestGet({ request: request(), env: {} });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'authorization_unavailable' });
});
