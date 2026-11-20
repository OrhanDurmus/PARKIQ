#!/usr/bin/env node
// Static fail-closed checks. Does not replace a Supabase integration test.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const sql = fs.readFileSync('supabase/migrations/20261119030000_staff_permissions.sql','utf8');
const staff = fs.readFileSync('staff/index.html','utf8');
const permissions = fs.readFileSync('staff/permissions/index.html','utf8');
for(const [page,source] of [['staff',staff],['founder permissions',permissions]]){
 assert.match(source,/\.auth\.getUser\(\)/,'Auth server must verify user on '+page);
 assert.match(source,/user\.id!==session\.user\.id/,'Verified user must match session on '+page);
}

const home = fs.readFileSync('index.html','utf8');
const verify = fs.readFileSync('supabase/verify_staff_permissions.sql','utf8');
const probe = fs.readFileSync('scripts/probe-staff-staging.mjs','utf8');
assert.equal((sql.match(/\$\$/g)||[]).length,6,'SQL function bodies must be dollar-quoted');
for (const table of ['rotapark_staff_role_permissions','rotapark_staff_user_permissions','rotapark_staff_permission_audit']) {
 assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security;'));
 assert.match(sql,new RegExp('revoke all on public\\.'+table+' from public, anon, authenticated;'));
}
assert.match(sql,/public\.rotapark_my_role\(\) is distinct from 'founder'/);
// Authorization must be checked inside every privileged RPC, not only in the UI.
for(const rpc of ['rotapark_founder_set_role_permission','rotapark_founder_get_role_permissions']){
 const body=sql.split('create or replace function public.'+rpc+'(')[1]?.split('end; $;')[0];
 assert.ok(body,'Missing founder RPC '+rpc);
 assert.match(body,/auth\.uid\(\) is null or public\.rotapark_my_role\(\) is distinct from 'founder'/,'Founder RPC must check current server role: '+rpc);
}
assert.match(sql,/insert into public\.rotapark_staff_permission_audit\(/,'Permission changes must be audited');
assert.match(sql,/revoke all on function public\.rotapark_founder_set_role_permission\(text,text,boolean\) from public,anon;/);
assert.match(sql,/revoke all on function public\.rotapark_founder_get_role_permissions\(\) from public,anon;/);
assert.match(sql,/revoke all on function public\.rotapark_staff_has_permission\(text\) from public,anon;/);
assert.doesNotMatch(sql,/grant (?:select|insert|update|delete|all) on public\.rotapark_staff_/i,'Permission tables must never grant direct client access');

assert.match(sql,/if v_role not in \('admin','moderator'\) then return false;/);
assert.match(sql,/enabled boolean not null default false/);
assert.match(sql,/p_permission not in \(/,'Unknown permission keys must be rejected');
assert.match(sql,/if v_role = 'founder' then return true;/);
assert.doesNotMatch(sql,/grant execute on function public\.rotapark_founder_set_user_permission/);
assert.match(home,/id="rotaparkStaffCenterLink"[^>]*hidden/);
assert.match(home,/\['founder','admin','moderator'\]\.includes\(role\)/);
assert.match(staff,/rotapark_my_role/);
assert.match(staff,/getElementById\('rolesLink'\)\.hidden=role!=='founder'/,'Founder-only Access routes must not be offered to admins');
assert.match(permissions,/role!=='founder'/);
assert.match(permissions,/let saving=false/,'Permission changes must be serialized');
assert.match(permissions,/lockControls\(true\)/,'Permission controls must lock during saves');
assert.match(permissions,/input\.disabled=saving/,'Re-rendered toggles must stay locked during saves');
assert.match(permissions,/await reload\(\)/,'Permission state must be refreshed from server');
assert.match(permissions,/\$\('panel'\)\.hidden=true/,'Permission panel must close on uncertain save state');
assert.match(verify,/has_function_privilege\('anon'/);
assert.match(verify,/has_function_privilege\('authenticated'/);
assert.match(verify,/p\.prosecdef/);
assert.match(verify,/public\.rotapark_my_role\(\)/);
assert.match(probe,/const testSubjects=new Set\(\)/,'Staging probe must track distinct account IDs');
assert.match(probe,/testSubjects\.has\(payload\.sub\)/,'Staging probe must reject duplicate users');
assert.match(probe,/STAGING_TEST_CONFIRMED.*'yes'/,'Staging probe must require explicit project confirmation');
assert.ok(probe.includes("parsedUrl.hostname!==projectRef+'.supabase.co'"),'Staging probe must bind the URL to a project reference');
assert.match(probe,/role==='user'&&allowed\.body!==false/,'Ordinary user must have no staff permission');
assert.match(probe,/role==='founder'&&allowed\.body!==true/,'Founder must have a recognized permission');
console.log('Staff permissions static security checks passed');
