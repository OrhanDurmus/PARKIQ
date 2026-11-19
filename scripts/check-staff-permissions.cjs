#!/usr/bin/env node
// Static fail-closed checks. Does not replace a Supabase integration test.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const sql = fs.readFileSync('supabase/migrations/20261119030000_staff_permissions.sql','utf8');
const staff = fs.readFileSync('staff/index.html','utf8');
const permissions = fs.readFileSync('staff/permissions/index.html','utf8');
const home = fs.readFileSync('index.html','utf8');
assert.equal((sql.match(/\$\$/g)||[]).length,6,'SQL function bodies must be dollar-quoted');
for (const table of ['rotapark_staff_role_permissions','rotapark_staff_user_permissions','rotapark_staff_permission_audit']) {
 assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security;'));
 assert.match(sql,new RegExp('revoke all on public\\.'+table+' from public, anon, authenticated;'));
}
assert.match(sql,/public\.rotapark_my_role\(\) is distinct from 'founder'/);
assert.match(sql,/if v_role not in \('admin','moderator'\) then return false;/);
assert.match(sql,/enabled boolean not null default false/);
assert.doesNotMatch(sql,/grant execute on function public\.rotapark_founder_set_user_permission/);
assert.match(home,/id="rotaparkStaffCenterLink"[^>]*hidden/);
assert.match(home,/\['founder','admin','moderator'\]\.includes\(role\)/);
assert.match(staff,/rotapark_my_role/);
assert.match(permissions,/role!=='founder'/);
console.log('Staff permissions static security checks passed');
