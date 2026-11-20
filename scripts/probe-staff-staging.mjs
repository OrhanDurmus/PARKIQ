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
const denied=r=>r.status===401||r.status===403||(r.status===400&&r.body&&typeof r.body==='object'&&r.body.code==='42501');
const tableRead=async(token,table)=>{const response=await fetch(url+'/rest/v1/'+table+'?select=*&limit=1',{headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});const raw=await response.text();let body;try{body=JSON.parse(raw)}catch{body=raw}return {status:response.status,body}};
// Anonymous checks must use only the public staging anon key, never an authenticated JWT.
const anonymousCall=async(fn,args={})=>{
 const response=await fetch(url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 const raw=await response.text();let body;try{body=JSON.parse(raw)}catch{body=raw}
 return {status:response.status,body};
};
let failures=0;
for(const fn of ['rotapark_founder_get_role_permissions','rotapark_founder_get_permission_audit']){
 const result=await anonymousCall(fn);
 if(!denied(result)){console.error('anonymous: protected RPC did not return authorization denial: '+fn);failures++}
}
for(const table of ['rotapark_staff_role_permissions','rotapark_staff_user_permissions','rotapark_staff_permission_audit']){
 const result=await tableRead(key,table);
 if(!denied(result)){console.error('anonymous: direct table SELECT did not return authorization denial on '+table);failures++}
}
const anonymousPermission=await anonymousCall('rotapark_staff_has_permission',{p_permission:'support.read'});
if(!(denied(anonymousPermission)||(anonymousPermission.status===200&&anonymousPermission.body===false))){console.error('anonymous: effective permission check was not denied or false');failures++}
for(const [role,token] of Object.entries(tokens)){
 const current=await call(token,'rotapark_my_role');
 if(current.status!==200||current.body!==role){console.error(role+': role mismatch / unavailable');failures++;continue}
 const permission=await call(token,'rotapark_staff_has_permission',{p_permission:'not.a.real.permission'});
 if(permission.status!==200||permission.body!==false){console.error(role+': unknown permission did not fail closed');failures++}
 const list=await call(token,'rotapark_founder_get_role_permissions');
 if(role==='founder'){
  if(list.status!==200||!Array.isArray(list.body)){console.error(role+': founder read failed');failures++}
 }else if(!denied(list)){console.error(role+': founder read did not return an authorization denial');failures++}
 const audit=await call(token,'rotapark_founder_get_permission_audit',{p_limit:30});
 if(role==='founder'){
  if(audit.status!==200||!Array.isArray(audit.body)){console.error(role+': founder audit read failed');failures++}
 }else if(!denied(audit)){console.error(role+': audit history did not return an authorization denial');failures++}
 const invalidAudit=await call(token,'rotapark_founder_get_permission_audit',{p_limit:101});
 if(role==='founder'){
  if(!(invalidAudit.status===400&&invalidAudit.body?.code==='22023')){console.error(role+': oversized audit query must return invalid_limit');failures++}
 }else if(!denied(invalidAudit)){console.error(role+': oversized audit query bypassed founder authorization');failures++}
 const allowed=await call(token,'rotapark_staff_has_permission',{p_permission:'support.read'});
 if(allowed.status!==200||typeof allowed.body!=='boolean'){console.error(role+': effective permission check failed');failures++}
 if(role==='user'&&allowed.body!==false){console.error('user: ordinary account unexpectedly received staff permission');failures++}
 if(role==='founder'&&allowed.body!==true){console.error('founder: known permission unexpectedly denied');failures++}
 for(const table of ['rotapark_staff_role_permissions','rotapark_staff_user_permissions','rotapark_staff_permission_audit']){
  const result=await tableRead(token,table);
  if(!denied(result)){console.error(role+': direct table SELECT did not return an authorization denial on '+table);failures++}
 }
 // Intentionally do not invoke any mutating RPC, even with an unauthorized token.
 console.log(role+': read-only checks completed');
}
assert.equal(failures,0,'Staging role permission probes failed');
console.log('Staging read-only authorization probes passed');
