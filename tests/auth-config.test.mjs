import assert from 'node:assert/strict';
import {test} from 'node:test';
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
  assert.deepEqual(await readConfig(key), {configured: false});
 }
});
