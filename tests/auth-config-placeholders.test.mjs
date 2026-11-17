import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/auth-config.js';

const url='https://sample-project.supabase.co';
for(const key of ['undefined','null','none','changeme','YOUR_KEY','  undefined  ']){
 test('rejects placeholder anon key: '+key,async()=>{
  const response=await onRequestGet({env:{SUPABASE_URL:url,SUPABASE_ANON_KEY:key}});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{configured:false});
 });
}
test('preserves valid public anon key',async()=>{
 const response=await onRequestGet({env:{SUPABASE_URL:url,SUPABASE_ANON_KEY:'eyJhbGciOiJIUzI1NiJ9.example'}});
 const body=await response.json();
 assert.equal(body.configured,true);
 assert.equal(body.url,url);
});
