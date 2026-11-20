import assert from 'node:assert/strict';
import {test} from 'node:test';
import {onRequestPost} from '../functions/api/otp-preflight.js';

const staging = 'https://rotapark-staging.pages.dev';
const env = {
 SUPABASE_URL: 'https://fixture.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
 OTP_PREFLIGHT_DIAGNOSTICS: '1',
};

function preflight(email = ' Fixture@Example.invalid ', options = {}) {
 const request = new Request((options.origin ?? staging) + '/api/otp-preflight', {
  method: 'POST',
  body: JSON.stringify({email}),
 });
 return onRequestPost({request, env: options.env ?? env});
}

async function assertUnavailable(response) {
 assert.equal(response.status, 503);
 assert.equal(response.headers.get('Cache-Control'), 'no-store');
 assert.deepEqual(await response.json(), {ok: false, error: 'preflight_unavailable'});
}

function assertDiagnostic(log, reason, upstreamStatus = null) {
 assert.deepEqual(log.mock.calls.map(call => call.arguments), [
  ['otp-preflight unavailable', {reason, upstreamStatus}],
 ]);
}

for (const blocked of [false, true]) {
 test('returns blocked=' + blocked + ' for the RPC boolean', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(blocked));
  const response = await preflight();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, blocked});
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(url, env.SUPABASE_URL + '/rest/v1/rpc/rotapark_email_is_blocked');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, {
   apikey: env.SUPABASE_SERVICE_ROLE_KEY,
   Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
   'Content-Type': 'application/json',
  });
  assert.deepEqual(JSON.parse(init.body), {lookup_email: 'fixture@example.invalid'});
 });
}

for (const status of [401, 403, 404, 500, 502, 503]) {
 test('fails closed when RPC returns HTTP ' + status, async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private upstream details', {status}));
  const log = t.mock.method(console, 'warn', () => {});
  await assertUnavailable(await preflight());
  assertDiagnostic(log, 'rpc_http_error', status);
 });
}

for (const [body, reason] of [['"false"', 'rpc_invalid_boolean'], ['invalid JSON', 'rpc_invalid_json']]) {
 test('fails closed for ' + reason, async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(body));
  const log = t.mock.method(console, 'warn', () => {});
  await assertUnavailable(await preflight());
  assertDiagnostic(log, reason, 200);
 });
}

test('fails closed on connection failure', async t => {
 t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('private connection details'); });
 const log = t.mock.method(console, 'warn', () => {});
 await assertUnavailable(await preflight());
 assertDiagnostic(log, 'rpc_connection_error');
});

test('fails closed on timeout', async t => {
 const timeout = t.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort());
 t.mock.method(globalThis, 'fetch', async (_url, {signal}) => { signal.throwIfAborted(); });
 const log = t.mock.method(console, 'warn', () => {});
 await assertUnavailable(await preflight());
 assert.deepEqual(timeout.mock.calls[0].arguments, [6000]);
 assertDiagnostic(log, 'rpc_timeout');
});

test('rejects invalid email before calling Supabase', async t => {
 const fetch = t.mock.method(globalThis, 'fetch');
 const response = await preflight('bad-email');
 assert.equal(response.status, 400);
 assert.deepEqual(await response.json(), {ok: false, error: 'invalid_email'});
 assert.equal(fetch.mock.callCount(), 0);
});

test('diagnostics require the staging host and an explicit flag', async t => {
 t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 401}));
 const log = t.mock.method(console, 'warn', () => {});
 await assertUnavailable(await preflight(undefined, {origin: 'https://other.pages.dev'}));
 await assertUnavailable(await preflight(undefined, {env: {...env, OTP_PREFLIGHT_DIAGNOSTICS: undefined}}));
 assert.equal(log.mock.callCount(), 0);
 await assertUnavailable(await preflight(undefined, {origin: 'https://branch.rotapark-staging.pages.dev'}));
 assertDiagnostic(log, 'rpc_http_error', 401);
});

test('a blocked account stays denied when support ticket storage fails', async t => {
 t.mock.method(globalThis, 'fetch', async () => Response.json(true));
 const log = t.mock.method(console, 'warn', () => {});
 const storage = {async put() { throw new Error('private ticket details'); }};
 await assertUnavailable(await preflight(undefined, {env: {...env, ISPARK_SNAPSHOTS: storage}}));
 assertDiagnostic(log, 'support_ticket_error', 200);
});
