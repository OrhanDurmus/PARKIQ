import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/staff/parking-reports.js';
const env = { SUPABASE_URL:'https://test.supabase.co', SUPABASE_ANON_KEY:'sb_publishable_test_key' };
const req = (status='pending', token='test-token') => new Request('https://staging.example/api/staff/parking-reports?status='+status, { headers: token ? { Authorization:'Bearer '+token } : {} });
test('anonymous staff report request returns 401 before touching storage', async () => {
  const result = await onRequestGet({ request:req('pending',null), env:{ DB:{prepare(){throw Error('DB should not be accessed')}} } });
  assert.equal(result.status,401);
});
test('invalid configuration returns 503 without DB access', async () => {
  const result = await onRequestGet({ request:req(), env:{ DB:{prepare(){throw Error('DB should not be accessed')}} } });
  assert.equal(result.status,503);
});
test('granted permission reads at most 50 reports with bound status', async () => {
  const original=globalThis.fetch;
  let query='', bound='';
  globalThis.fetch=async url => String(url).endsWith('/auth/v1/user')?Response.json({id:'user-123'}):Response.json(true);
  try {
    const DB={prepare(sql){query=sql;return {bind(status){bound=status;return {async all(){return {results:[{id:1,status}]}}}}}}};
    const result=await onRequestGet({request:req('approved'),env:{...env,DB}});
    assert.equal(result.status,200);
    assert.equal(result.headers.get('Cache-Control'),'no-store');
    assert.equal(bound,'approved');
    assert.match(query,/LIMIT 50/);
    assert.equal((await result.json()).reports.length,1);
  } finally {globalThis.fetch=original}
});
test('denied permission never reads database', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).endsWith('/auth/v1/user')?Response.json({id:'user-123'}):Response.json(false);
  try {
    const result=await onRequestGet({request:req(),env:{...env,DB:{prepare(){throw Error('DB accessed')}}}});
    assert.equal(result.status,403);
  } finally {globalThis.fetch=original}
});
