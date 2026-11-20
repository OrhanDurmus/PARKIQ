import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStaffPermission } from '../functions/_lib/staff-permissions.mjs';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key' };
const request = (token = 'valid') => new Request('https://staging.example/api', {
  headers: token ? { Authorization: 'Bearer ' + token } : {},
});
const mock = (userStatus = 200, permissionStatus = 200, allowed = true) => async (url) =>
  url.endsWith('/auth/v1/user')
    ? new Response(JSON.stringify({ id: 'user-123' }), { status: userStatus })
    : new Response(JSON.stringify(allowed), { status: permissionStatus });
test('rejects unknown permissions before upstream calls', async () => {
  let calls = 0;
  const r = await checkStaffPermission(request(), env, 'founder.assign', async () => { calls++; });
  assert.equal(r.status, 403); assert.equal(calls, 0);
});
test('rejects missing bearer token', async () => {
  assert.equal((await checkStaffPermission(request(null), env, 'support.read')).status, 401);
});
test('rejects bad credentials', async () => {
  assert.equal((await checkStaffPermission(request(), env, 'support.read', mock(401))).status, 401);
});
test('rejects denied permission', async () => {
  assert.equal((await checkStaffPermission(request(), env, 'support.read', mock(200, 200, false))).status, 403);
});
test('fails closed if RPC fails', async () => {
  assert.equal((await checkStaffPermission(request(), env, 'support.read', mock(200, 500))).status, 503);
});
test('fails closed if RPC has malformed output', async () => {
  assert.equal((await checkStaffPermission(request(), env, 'support.read', mock(200, 200, { allowed: true }))).status, 503);
});
test('fails closed on upstream exception or missing config', async () => {
  assert.equal((await checkStaffPermission(request(), env, 'support.read', () => { throw Error('network'); })).status, 503);
  assert.equal((await checkStaffPermission(request(), {}, 'support.read')).status, 503);
});
test('allows verified user with explicit true permission', async () => {
  assert.deepEqual(await checkStaffPermission(request(), env, 'support.read', mock()), { ok: true, userId: 'user-123' });
});
