import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/auth-config.js',import.meta.url),'utf8');
const {onRequestGet}=await import('data:text/javascript,'+encodeURIComponent(source));
const get=async(env)=>(await onRequestGet({env})).json();
test('trims URL, trailing slashes and public key',async()=>{
 const result=await get({SUPABASE_URL:' https://example-project.supabase.co/// ',SUPABASE_ANON_KEY:' public-test-key '});
 assert.deepEqual(result,{configured:true,url:'https://example-project.supabase.co',anonKey:'public-test-key'});
});
test('rejects missing and placeholder public keys',async()=>{
 for(const key of ['', '  ', 'undefined', 'null', 'none', 'changeme', 'your_key', ' YOUR KEY ']){
  assert.deepEqual(await get({SUPABASE_URL:'https://example-project.supabase.co',SUPABASE_ANON_KEY:key}),{configured:false});
 }
});
test('rejects invalid or non-Supabase URLs',async()=>{
 for(const url of ['http://example-project.supabase.co','https://example.com','https://example-project.supabase.co.evil.test','']){
  assert.deepEqual(await get({SUPABASE_URL:url,SUPABASE_ANON_KEY:'public-test-key'}),{configured:false});
 }
});
