import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPatch } from '../functions/api/staff/parking-reports.js';
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
    const DB={prepare(sql){query=sql;return {bind(status){bound=status;return {async all(){return {results:[{id:1,status:'approved'}]}}}}}}};
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

const patchReq=(body,token='test-token')=>new Request('https://staging.example/api/staff/parking-reports',{
 method:'PATCH',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)
});
test('anonymous moderation fails before DB access',async()=>{
 const response=await onRequestPatch({request:patchReq({id:1,status:'approved'},null),env:{DB:{prepare(){throw Error('accessed')}}}});
 assert.equal(response.status,401);
});
test('read-only permission cannot approve reports',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>String(url).endsWith('/auth/v1/user')?Response.json({id:'user-123'}):Response.json(JSON.parse(options.body).p_permission==='parking_reports.read');
 try {
  const response=await onRequestPatch({request:patchReq({id:1,status:'approved'}),env:{...env,DB:{prepare(){throw Error('accessed')}}}});
  assert.equal(response.status,403);
 }finally{globalThis.fetch=original}
});
test('moderator decision and audit are submitted in a single D1 batch',async()=>{
 const original=globalThis.fetch;const statements=[];let batched=[];
 globalThis.fetch=async(url)=>String(url).endsWith('/auth/v1/user')?Response.json({id:'user-123'}):Response.json(true);
 try {
  const DB={prepare(sql){return {bind(...args){const stmt={sql,args};statements.push(stmt);return stmt}}},async batch(items){batched=items;return [{meta:{changes:1}},{meta:{changes:1}}]}};
  const response=await onRequestPatch({request:patchReq({id:7,status:'approved'}),env:{...env,DB}});
  assert.equal(response.status,200);assert.equal(batched.length,2);
  assert.match(statements[0].sql,/status='pending'/);
  assert.deepEqual(statements[0].args,['approved',7]);
  assert.match(statements[1].sql,/parking_report_review_audit/);
  assert.deepEqual(statements[1].args,[7,'user-123','approved']);
 }finally{globalThis.fetch=original}
});
test('invalid moderation input does not write to DB',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>String(url).endsWith('/auth/v1/user')?Response.json({id:'user-123'}):Response.json(true);
 try {
  for(const payload of [{id:0,status:'approved'},{id:1,status:'archived'},{id:'1',status:'rejected'}]){
   const response=await onRequestPatch({request:patchReq(payload),env:{...env,DB:{prepare(){throw Error('accessed')}}}});
   assert.equal(response.status,400);
  }
 }finally{globalThis.fetch=original}
});
test('previously reviewed report cannot be approved twice',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>String(url).endsWith('/auth/v1/user')?Response.json({id:'user-123'}):Response.json(true);
 try{
  const DB={prepare(sql){return {bind(...args){return {sql,args}}}},async batch(){return [{meta:{changes:0}},{meta:{changes:0}}]}};
  const response=await onRequestPatch({request:patchReq({id:7,status:'rejected'}),env:{...env,DB}});
  assert.equal(response.status,404);
 }finally{globalThis.fetch=original}
});
test('moderation fails closed when atomic audit batch is unavailable',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>String(url).endsWith('/auth/v1/user')?Response.json({id:'user-123'}):Response.json(true);
 try{
  const response=await onRequestPatch({request:patchReq({id:7,status:'approved'}),env:{...env,DB:{prepare(){throw Error('should not write')}}}});
  assert.equal(response.status,503);
 }finally{globalThis.fetch=original}
});
