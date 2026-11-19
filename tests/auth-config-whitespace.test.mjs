import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/auth-config.js';
const get=async(env)=>(await onRequestGet({env})).json();
const valid='sb_publishable_test_12345';
test('normalizes Preview URL and publishable key whitespace',async()=>{
 assert.deepEqual(await get({SUPABASE_URL:'  https://example-project.supabase.co///  ',SUPABASE_ANON_KEY:'  '+valid+'  '}),{configured:true,url:'https://example-project.supabase.co',anonKey:valid});
});
test('rejects non-public key after normalization',async()=>{
 assert.deepEqual(await get({SUPABASE_URL:'https://example-project.supabase.co',SUPABASE_ANON_KEY:' sb_secret_test123 '}),{configured:false,issues:['invalid_public_key']});
});
test('rejects invalid host after normalization',async()=>{
 assert.deepEqual(await get({SUPABASE_URL:' https://example-project.supabase.co.evil.test/ ',SUPABASE_ANON_KEY:valid}),{configured:false,issues:['invalid_supabase_url']});
});
