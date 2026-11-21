import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequest} from '../functions/api/staff/tasks.js';

const id='12345678-1234-4321-abcd-123456789abc';
function fixture(t,grants) {
  const sqlite=new DatabaseSync(':memory:');
  t.after(()=>sqlite.close());
  for (const path of ['schema.sql','migrations/staging-staff-support.sql']) sqlite.exec(readFileSync(path,'utf8'));
  const DB={
    prepare(sql){const stmt=sqlite.prepare(sql);return {bind(...args){return {
      run:()=>({meta:stmt.run(...args)}),all:()=>({results:stmt.all(...args)})
    }}}},
    batch(statements){sqlite.exec('BEGIN');try {
      const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;
    } catch(e){sqlite.exec('ROLLBACK');throw e}}
  };
  const kv=new Map();
  const env={DB,SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',
    ISPARK_SNAPSHOTS:{get:k=>kv.get(k)?JSON.parse(kv.get(k)):null,put:(k,v)=>kv.set(k,v)}};
  t.mock.method(globalThis,'fetch',async(url,opts)=>Response.json(String(url).endsWith('/auth/v1/user')
    ? {id:'test-user'} : grants.has(JSON.parse(opts.body).p_permission)));
  function request(task,body,auth=true) {
    return onRequest({env,request:new Request('https://local.test/api/staff/tasks?task='+task,{
      method:body?'POST':'GET',headers:auth?{Authorization:'Bearer test'}:{},body:body?JSON.stringify(body):undefined
    })});
  }
  return {sqlite,request,kv};
}
for (const [source,table] of [['contact','contact_support_requests'],['appeal','blocked_account_appeals']]) {
  test(source+' reply requires both grants and atomically moves a ticket into the archive',async t=>{
    const grants=new Set(['support.read']);
    const {sqlite,request}=fixture(t,grants);
    sqlite.prepare(`INSERT INTO ${table}(id,email,message,created_at${source==='contact'?',topic':''}) VALUES(?,?,?,1${source==='contact'?",'Genel destek'":''})`).run(id,'private@example.test','test message');
    const task='support&source='+source, body={id,message:'Yanıt'};
    const list=await (await request(task)).json();
    assert.equal(list.items.length,1);assert.equal(list.items[0].email,undefined);
    assert.equal((await request(task,body)).status,403);
    grants.clear();grants.add('support.reply');
    assert.equal((await request(task,body)).status,403);
    grants.add('support.read');
    assert.equal((await request(task,body)).status,200);
    assert.equal((await request(task,{...body,message:'Second answer'})).status,409);
    assert.equal((await (await request(task)).json()).items.length,0);
    assert.equal((await (await request(task+'&archive=1')).json()).items[0].answer,body.message);
  });
}
test('approved car park updates retain a newer edit and exclude pending applications',async t=>{
  const {sqlite,request}=fixture(t,new Set(['parking_records.edit']));
  sqlite.exec("INSERT INTO business_applications(name,district,status) VALUES('Old','district','approved'),('Pending','district','pending')");
  const {items}=await (await request('parking')).json();
  assert.equal(items.length,1);
  const edit={id:1,previousName:'Old',previousDistrict:'district',name:'New',district:'New address'};
  assert.equal((await request('parking',edit)).status,200);
  assert.equal((await request('parking',{...edit,name:'Stale'})).status,409);
  assert.equal((await request('parking',{...edit,id:2,previousName:'Pending'})).status,409);
  assert.equal((await (await request('parking')).json()).items[0].name,'New');
});
test('announcements use the same current and history records as the app',async t=>{
  const grants=new Set(),{request,kv}=fixture(t,grants);
  const draft={message:'Staging test',type:'info',durationHours:1};
  assert.equal((await request('announce',draft,false)).status,401);
  assert.equal((await request('announce',draft)).status,403);
  grants.add('announcements.publish');
  assert.equal((await request('announce',{...draft,durationHours:0})).status,400);
  assert.equal(kv.size,0);
  assert.equal((await request('announce',draft)).status,200);
  const item=JSON.parse(kv.get('admin:flash:current'));
  assert.equal(item.message,draft.message);
  assert.ok(kv.has('admin:flash:history:'+item.id));
});
