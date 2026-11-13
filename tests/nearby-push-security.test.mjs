import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const dataURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const authURL=dataURL(source('../functions/lib/push-auth.js'));
const api=await import(dataURL(source('../functions/api/nearby-push.js').replace("'../lib/push-auth.js'",JSON.stringify(authURL))));
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const originalFetch=globalThis.fetch;
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(source('../migrations/nearby_push.sql'));sqlite.exec(source('../migrations/0007_nearby_push_security.sql'));
 const env={
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test-only',WEB_PUSH_PUBLIC_KEY:'x'.repeat(87),
  DB:{prepare(sql){return {bind(...args){
   const stmt=sqlite.prepare(sql);
   return {first:async()=>stmt.get(...args)||null,run:async()=>({meta:{changes:stmt.run(...args).changes}})};
  }}}}
 };
 globalThis.fetch=async(url,options)=>{
  const token=options.headers.Authorization.slice(7);
  if(url.endsWith('/auth/v1/user'))return Response.json({id:token==='bob'?bob:alice},{status:token==='bad'?401:token==='outage'?503:200});
  assert.ok(url.endsWith('/rpc/rotapark_member_blocked'));
  return Response.json(token==='ban-error'?'invalid':token==='blocked');
 };
 const payload=(n=0)=>({subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/device'+n,keys:{p256dh:'p'.repeat(87),auth:'a'.repeat(22)}},latitude:41,longitude:29,consent:true});
 const call=async(method,body,token='alice',headers={})=>{
  const request=new Request('https://test.example/api/nearby-push',{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  const response=await api[method==='POST'?'onRequestPost':'onRequestDelete']({request,env});return {status:response.status,body:await response.json()};
 };
 return {env,sqlite,payload,call,close(){sqlite.close();globalThis.fetch=originalFetch}};
}
for(const method of ['POST','DELETE']){
 test(method+' rejects missing/invalid JWT, banned accounts and unavailable ban check',async()=>{const s=setup();try{
  for(const [token,status] of [[null,401],['bad',401],['blocked',403],['ban-error',503],['outage',503]])assert.equal((await s.call(method,s.payload(),token)).status,status);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM nearby_push_subscriptions').get().n,0);
 }finally{s.close()}});
}
test('identity comes from verified JWT and another user cannot update/delete',async()=>{const s=setup();try{
 const body={...s.payload(),user_id:bob};assert.equal((await s.call('POST',body)).status,200);
 assert.equal(s.sqlite.prepare('SELECT user_id FROM nearby_push_subscriptions').get().user_id,alice);
 assert.equal((await s.call('POST',{...body,latitude:40},'bob')).status,409);
 assert.equal((await s.call('DELETE',{endpoint:body.subscription.endpoint,...body.subscription.keys},'bob')).status,403);
 assert.equal(s.sqlite.prepare('SELECT latitude FROM nearby_push_subscriptions').get().latitude,41);
 assert.equal((await s.call('DELETE',{endpoint:body.subscription.endpoint})).status,200);
 assert.equal((await s.call('DELETE',{endpoint:body.subscription.endpoint})).status,200);
 }finally{s.close()}});
test('explicit boolean consent, bounded bytes, JSON and endpoint checks',async()=>{const s=setup();try{
 for(const consent of [undefined,false,'true'])assert.equal((await s.call('POST',{...s.payload(),consent})).status,400);
 assert.equal((await s.call('POST','x'.repeat(4097))).status,413);
 assert.equal((await s.call('DELETE','x'.repeat(4097))).status,413);
 assert.equal((await s.call('POST','{')).status,400);
 assert.equal((await s.call('POST',s.payload(),'alice',{Origin:'https://evil.example'})).status,403);
 const b=s.payload();b.subscription.endpoint='https://fcm.googleapis.com.evil.example/x';assert.equal((await s.call('POST',b)).status,400);
 }finally{s.close()}});
test('atomic five-device quota allows owner refresh and frees a slot after delete',async()=>{const s=setup();try{
 const results=await Promise.all(Array.from({length:6},(_,i)=>s.call('POST',s.payload(i))));
 assert.equal(results.filter(x=>x.status===200).length,5);assert.equal(results.filter(x=>x.status===409).length,1);
 assert.equal((await s.call('POST',s.payload(0))).status,200);
 assert.equal((await s.call('DELETE',{endpoint:s.payload(0).subscription.endpoint})).status,200);
 assert.equal((await s.call('POST',s.payload(6))).status,200);
 }finally{s.close()}});
test('twentieth attempt allowed, next denied; next hour resets atomically',async()=>{const s=setup();try{
 for(let i=0;i<20;i++)assert.equal((await s.call('POST',s.payload())).status,200);
 assert.equal((await s.call('DELETE',{endpoint:s.payload().subscription.endpoint})).status,429);
 s.sqlite.exec('UPDATE nearby_push_rate_limits SET bucket=bucket-1');
 assert.equal((await s.call('POST',s.payload())).status,200);
 }finally{s.close()}});
test('legacy claims require both browser-held keys and cannot be reassigned',async()=>{const s=setup();try{
 const b=s.payload();const id=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.subscription.endpoint))).toString('hex');
 s.sqlite.prepare('INSERT INTO nearby_push_subscriptions(endpoint_hash,endpoint,p256dh,auth,latitude,longitude) VALUES(?,?,?,?,?,?)').run(id,b.subscription.endpoint,b.subscription.keys.p256dh,b.subscription.keys.auth,41,29);
 assert.equal((await s.call('POST',{...b,subscription:{...b.subscription,keys:{...b.subscription.keys,auth:'z'.repeat(22)}}})).status,409);
 assert.equal((await s.call('DELETE',{endpoint:b.subscription.endpoint,auth:b.subscription.keys.auth})).status,403);
 assert.equal((await s.call('POST',b)).status,200);
 assert.equal((await s.call('POST',b,'bob')).status,409);
 assert.equal(s.sqlite.prepare('SELECT user_id,consented_at FROM nearby_push_subscriptions').get().user_id,alice);
 }finally{s.close()}});

test('legacy delete accepts original keys only; claimed rows require their owner',async()=>{const s=setup();try{
 const b=s.payload();const id=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.subscription.endpoint))).toString('hex');
 s.sqlite.prepare('INSERT INTO nearby_push_subscriptions(endpoint_hash,endpoint,p256dh,auth,latitude,longitude) VALUES(?,?,?,?,?,?)').run(id,b.subscription.endpoint,b.subscription.keys.p256dh,b.subscription.keys.auth,41,29);
 assert.equal((await s.call('DELETE',{endpoint:b.subscription.endpoint,...b.subscription.keys})).status,200);
 assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM nearby_push_subscriptions').get().n,0);
 }finally{s.close()}});

test('client requires explicit consent and JWT before subscription writes',async()=>{
 const client=await import(dataURL(source('../src/nearby-push-opt-in.js')));
 const previous={window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),Notification:globalThis.Notification,PushManager:globalThis.PushManager,isSecureContext:globalThis.isSecureContext};
 try{
  globalThis.window={rotaparkAuthToken:async()=>null,PushManager:{},Notification:{}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{}}});globalThis.isSecureContext=true;globalThis.Notification={permission:'granted'};
  await assert.rejects(client.enableNearbyParkingPush({latitude:41,longitude:29}),/consent_required/);
  await assert.rejects(client.enableNearbyParkingPush({latitude:41,longitude:29,consent:true}),/login_required/);
 }finally{
  globalThis.window=previous.window;globalThis.Notification=previous.Notification;globalThis.PushManager=previous.PushManager;globalThis.isSecureContext=previous.isSecureContext;
  Object.defineProperty(globalThis,'navigator',previous.navigator);
 }
});
test('client revokes browser subscription even when authentication prevents server cleanup',async()=>{
 const client=await import(dataURL(source('../src/nearby-push-opt-in.js')));let unsubscribed=0;
 const previousWindow=globalThis.window,previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try{
  globalThis.window={rotaparkAuthToken:async()=>null};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{getRegistration:async()=>({pushManager:{getSubscription:async()=>({unsubscribe:async()=>{unsubscribed++;return true}})}})}}});
  await assert.rejects(client.disableNearbyParkingPush(),/local_disabled_cleanup_pending/);assert.equal(unsubscribed,1);
 }finally{globalThis.window=previousWindow;Object.defineProperty(globalThis,'navigator',previousNavigator)}
});

test('delivery recipient query never includes unclaimed legacy rows',async()=>{
 const recipients=await import(dataURL(source('../functions/lib/nearby-push-recipients.js')));
 const s=setup();try{
  s.sqlite.prepare('INSERT INTO nearby_push_subscriptions(endpoint_hash,endpoint,p256dh,auth,latitude,longitude) VALUES(?,?,?,?,?,?)').run('a'.repeat(64),'https://fcm.googleapis.com/legacy','p','a',41,29);
  await s.call('POST',s.payload());
  const db={prepare(sql){return {bind(...args){return {all:async()=>({results:s.sqlite.prepare(sql).all(...args)})}}}}};
  const rows=await recipients.findNearbyPushRecipients(db,{latitude:41,longitude:29,reportId:'r1'});
  assert.equal(rows.length,1);assert.notEqual(rows[0].endpoint_hash,'a'.repeat(64));
 }finally{s.close()}
});

test('client sends verified session header and consent, and removes newly created orphan on failure',async()=>{
 const client=await import(dataURL(source('../src/nearby-push-opt-in.js')));
 const previous={window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),Notification:globalThis.Notification,isSecureContext:globalThis.isSecureContext,fetch:globalThis.fetch};
 let unsubscribed=0,writes=0,fail=false;
 const subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:'p'.repeat(87),auth:'a'.repeat(22)}}),unsubscribe:async()=>{unsubscribed++;return true}};
 try{
  globalThis.window={rotaparkAuthToken:async()=>'test-session',PushManager:{},Notification:{}};
  globalThis.Notification={permission:'granted'};globalThis.isSecureContext=true;
  const ready={pushManager:{getSubscription:async()=>null,subscribe:async()=>subscription}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async()=>({}),ready:Promise.resolve(ready)}}});
  globalThis.fetch=async(url,options)=>{
   if(options.method!=='POST')return Response.json({publicKey:'BA'});
   writes++;assert.equal(options.headers.Authorization,'Bearer test-session');assert.equal(JSON.parse(options.body).consent,true);
   assert.equal(JSON.parse(options.body).user_id,undefined);
   return Response.json(fail?{error:'account_blocked'}:{ok:true},{status:fail?403:200});
  };
  assert.deepEqual(await client.enableNearbyParkingPush({latitude:41,longitude:29,consent:true}),{enabled:true});
  fail=true;await assert.rejects(client.enableNearbyParkingPush({latitude:41,longitude:29,consent:true}),/account_blocked/);
  assert.equal(writes,2);assert.equal(unsubscribed,1);
 }finally{
  globalThis.window=previous.window;globalThis.Notification=previous.Notification;globalThis.isSecureContext=previous.isSecureContext;globalThis.fetch=previous.fetch;Object.defineProperty(globalThis,'navigator',previous.navigator);
 }
});
