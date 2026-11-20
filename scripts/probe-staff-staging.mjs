#!/usr/bin/env node
// Staging-only authorization probes. Never prints credentials or writes data.
// Usage: SUPABASE_STAGING_URL=... SUPABASE_STAGING_ANON_KEY=... \\
//   STAGING_FOUNDER_JWT=... STAGING_ADMIN_JWT=... \\
//   STAGING_MODERATOR_JWT=... STAGING_USER_JWT=... node scripts/probe-staff-staging.mjs
import assert from 'node:assert/strict';
const url=process.env.SUPABASE_STAGING_URL?.replace(/\/$/,'');
const key=process.env.SUPABASE_STAGING_ANON_KEY;
const tokens={founder:process.env.STAGING_FOUNDER_JWT,admin:process.env.STAGING_ADMIN_JWT,moderator:process.env.STAGING_MODERATOR_JWT,user:process.env.STAGING_USER_JWT};
if(!url||!key||Object.values(tokens).some(v=>!v)){console.error('Missing staging URL, anon key, or one of four test JWTs. No requests made.');process.exit(2)}
if(!/^https:\/\//.test(url)||/rotapark\.com\.tr/i.test(url)){console.error('Refusing non-HTTPS or application production domain.');process.exit(2)}
const projectRef=process.env.SUPABASE_STAGING_PROJECT_REF;
const parsedUrl=new URL(url);
if(!projectRef||!/^[a-z0-9]{20}$/.test(projectRef)||parsedUrl.hostname!==projectRef+'.supabase.co'||parsedUrl.pathname!=='/'){
 console.error('Staging URL must exactly match the explicitly supplied Supabase staging project ref. No requests made.');process.exit(2)
}
const testSubjects=new Set();
for(const [role,token] of Object.entries(tokens)){
 try{
  const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
  if(payload.iss!==url+'/auth/v1'||payload.role!=='authenticated'||!payload.sub||payload.exp*1000<=Date.now())throw Error('invalid token context');
  if(testSubjects.has(payload.sub))throw Error('duplicate test account');
  testSubjects.add(payload.sub);
 }catch{console.error(role+': invalid JWT context or duplicate staging account. No requests made.');process.exit(2)}
}
if(process.env.STAGING_TEST_CONFIRMED!=='yes'){console.error('Set STAGING_TEST_CONFIRMED=yes only after verifying this is a separate staging project. No requests made.');process.exit(2)}
const call=async(token,fn,args={})=>{
 const response=await fetch(url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 const raw=await response.text();let body;try{body=JSON.parse(raw)}catch{body=raw}
 return {status:response.status,body};
};
const tableRead=async(token,table)=>{const response=await fetch(url+'/rest/v1/'+table+'?select=*&limit=1',{headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});return response.status};
let failures=0;
for(const [role,token] of Object.entries(tokens)){
 const current=await call(token,'rotapark_my_role');
 if(current.status!==200||current.body!==role){console.error(role+': role mismatch / unavailable');failures++;continue}
 const permission=await call(token,'rotapark_staff_has_permission',{p_permission:'not.a.real.permission'});
 if(permission.status!==200||permission.body!==false){console.error(role+': unknown permission did not fail closed');failures++}
 const list=await call(token,'rotapark_founder_get_role_permissions');
 if(role==='founder'){
  if(list.status!==200||!Array.isArray(list.body)){console.error(role+': founder read failed');failures++}
 }else if(list.status>=200&&list.status<300){console.error(role+': unauthorized founder read succeeded');failures++}
 const allowed=await call(token,'rotapark_staff_has_permission',{p_permission:'support.read'});
 if(allowed.status!==200||typeof allowed.body!=='boolean'){console.error(role+': effective permission check failed');failures++}
 if(role==='user'&&allowed.body!==false){console.error('user: ordinary account unexpectedly received staff permission');failures++}
 if(role==='founder'&&allowed.body!==true){console.error('founder: known permission unexpectedly denied');failures++}
 for(const table of ['rotapark_staff_role_permissions','rotapark_staff_user_permissions','rotapark_staff_permission_audit']){
  const status=await tableRead(token,table);
  if(status>=200&&status<300){console.error(role+': direct table SELECT unexpectedly succeeded on '+table);failures++}
 }
 // Intentionally do not invoke any mutating RPC, even with an unauthorized token.
 console.log(role+': read-only checks completed');
}
assert.equal(failures,0,'Staging role permission probes failed');
console.log('Staging read-only authorization probes passed');
