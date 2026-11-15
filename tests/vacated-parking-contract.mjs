import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/community-parking.js',import.meta.url),'utf8');
const {onRequestPost,onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const entries=new Map(),queued=[];
const kv={
 async get(key,mode){const item=entries.get(key);return item===undefined?null:mode==='json'?JSON.parse(item.value):item.value;},
 async put(key,value,opts={}){entries.set(key,{value,opts});},
 async list({prefix}){return {keys:[...entries.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name}))};},
 async delete(key){entries.delete(key);}
};
const env={ISPARK_SNAPSHOTS:kv,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test',NEARBY_PUSH_QUEUE:{send:async message=>queued.push(message)}};
const previousFetch=globalThis.fetch;
globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?Response.json({id:'test-user',email:'test@example.com'}):Response.json(false);
try{
 const request=new Request('https://rotapark.example/api/community-parking',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({lat:40.9,lng:29.3,type:'vacated',note:'Buradan ayrıldım, park yeri boşaldı.',address:'',displayName:'',ownerToken:'a'.repeat(64)})});
 const before=Date.now();
 const response=await onRequestPost({request,env});
 assert.equal(response.status,201);
 const {point}=await response.json();
 assert.equal(point.type,'vacated');
 assert.ok(point.expiresAt-point.createdAt===300000,'vacated report should expire in five minutes');
 const stored=entries.get('community:street:'+point.id);
 assert.equal(stored.opts.expirationTtl,300,'KV TTL must be five minutes');
 assert.equal(queued.length,1,'nearby notification should be enqueued once');
 assert.equal(queued[0].reportId,point.id);
 assert.ok(point.createdAt>=before);
 const listed=await (await onRequestGet({env})).json();
 assert.equal(listed.points.length,1);
 assert.equal(listed.points[0].ownerId,undefined,'public response must hide owner ID');
 assert.equal(listed.points[0].ownerTokenHash,undefined,'public response must hide owner token hash');
 console.log('Vacated parking report contract checks passed');
}finally{globalThis.fetch=previousFetch;}
