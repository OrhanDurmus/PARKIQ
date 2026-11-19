import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/auth-config.js',import.meta.url),'utf8');
const {onRequestGet}=await import('data:text/javascript,'+encodeURIComponent(source));
const get=async(env)=>(await onRequestGet({env})).json();
const valid='sb_publishable_test_12345';
test('normalizes Preview URL and publishable key whitespace',async()=>{
 assert.deepEqual(await get({SUPABASE_URL:'  https://example-project.supabase.co///  ',SUPABASE_ANON_KEY:'  '+valid+'  '}),{configured:true,url:'https://example-project.supabase.co',anonKey:valid});
});
test('rejects non-public key after normalization',async()=>{
 assert.deepEqual(await get({SUPABASE_URL:'https://example-project.supabase.co',SUPABASE_ANON_KEY:' sb_secret_test123 '}),{configured:false});
});
test('rejects invalid host after normalization',async()=>{
 assert.deepEqual(await get({SUPABASE_URL:' https://example-project.supabase.co.evil.test/ ',SUPABASE_ANON_KEY:valid}),{configured:false});
});
