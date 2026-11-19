import assert from 'node:assert/strict';
import {test} from 'node:test';
import {onRequestGet as getMemberAccess} from '../functions/api/member-access.js';
import {onRequestPost as postOtpPreflight} from '../functions/api/otp-preflight.js';
import {onRequestGet} from '../functions/api/auth-config.js';

const jwt = role => ['header', Buffer.from(JSON.stringify({role})).toString('base64url'), 'signature'].join('.');
const readConfig = async key => {
 const env = {SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: key};
 const response = await onRequestGet({env});
 assert.equal(response.headers.get('Cache-Control'), 'no-store');
 return response.json();
};

test('auth configuration exposes supported public Supabase key formats', async () => {
 for (const key of [jwt('anon'), 'sb_publishable_fixture']) {
  assert.deepEqual(await readConfig(key), {configured: true, url: 'https://fixture.supabase.co', anonKey: key});
 }
});

test('auth configuration does not expose privileged or unknown key formats', async () => {
 for (const key of [jwt('service_role'), 'sb_secret_fixture', 'not-a-public-key', 'x.x.x', undefined]) {
  assert.deepEqual(await readConfig(key), {configured: false, issues: [key === undefined ? 'missing_public_key' : 'invalid_public_key']});
 }
});

test('missing bindings are reported independently without using the server key', async () => {
 const response = await onRequestGet({env: {
  SUPABASE_URL: ' https://fixture.supabase.co/rest/v1/ ',
  SUPABASE_ANON_KEY: '   ',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture',
 }});
 assert.deepEqual(await response.json(), {
  configured: false,
  issues: ['invalid_supabase_url', 'missing_public_key'],
 });
 const missing = await onRequestGet({env: {SUPABASE_ANON_KEY: 'sb_publishable_fixture'}});
 assert.deepEqual(await missing.json(), {configured: false, issues: ['missing_supabase_url']});
});

test('session and OTP checks use normalized Preview bindings', async t => {
 const env = {
  SUPABASE_URL: ' https://fixture.supabase.co/ ',
  SUPABASE_ANON_KEY: ' sb_publishable_fixture ',
  SUPABASE_SERVICE_ROLE_KEY: ' sb_secret_fixture ',
 };
 const fetch = t.mock.method(globalThis, 'fetch', async url => {
  return Response.json(url.endsWith('/user') ? {id: 'preview-user'} : false);
 });
 const member = await getMemberAccess({env, request: new Request('https://preview.invalid', {
  headers: {Authorization: 'Bearer fixture-token'},
 })});
 assert.equal((await member.json()).ok, true);
 const otp = await postOtpPreflight({env, request: new Request('https://preview.invalid', {
  method: 'POST', body: JSON.stringify({email: 'preview@example.test'}),
 })});
 assert.deepEqual(await otp.json(), {ok: true, blocked: false});
 assert.deepEqual(fetch.mock.calls.map(({arguments: [url, options]}) => [url, options.headers.apikey]), [
  ['https://fixture.supabase.co/auth/v1/user', 'sb_publishable_fixture'],
  ['https://fixture.supabase.co/rest/v1/rpc/rotapark_member_blocked', 'sb_publishable_fixture'],
  ['https://fixture.supabase.co/rest/v1/rpc/rotapark_email_is_blocked', 'sb_secret_fixture'],
 ]);
});
