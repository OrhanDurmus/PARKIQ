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
