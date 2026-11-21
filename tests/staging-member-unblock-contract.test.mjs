import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261121150000_staging_member_unblock.sql',import.meta.url),'utf8');

test('unblock and listing require server-side permission and nonblocked actor',()=>{
  assert.equal((sql.match(/auth\.uid\(\) is null|actor is null/g)||[]).length,2);
  assert.equal((sql.match(/rotapark_member_blocked\(\) is distinct from false/g)||[]).length,2);
  assert.equal((sql.match(/rotapark_staff_has_permission\('users\.block'\) is distinct from true/g)||[]).length,2);
});
test('unblock guards staff/self and audits within a transaction',()=>{
  assert.match(sql,/target = actor/);
  assert.match(sql,/rotapark_staff_roles r where r\.user_id = target/);
  assert.match(sql,/insert into public\.rotapark_member_unblock_audit/);
  assert.match(sql,/^begin;/m);
  assert.match(sql,/^commit;/m);
  assert.match(sql,/delete from public\.rotapark_member_bans b where b\.user_id = target/);
});
test('list is minimal, capped and audit records are not publicly readable',()=>{
  assert.match(sql,/returns table\(user_id uuid, email text, reason text\)/);
  assert.match(sql,/order by u\.email limit 100/);
  assert.doesNotMatch(sql,/select\s+\*/i);
  assert.match(sql,/revoke all on public\.rotapark_member_unblock_audit from public, anon, authenticated/);
});
test('migration is additive and idempotent at the DDL level',()=>{
  assert.doesNotMatch(sql,/\bdrop\s+(?:table|function)\b/i);
  assert.match(sql,/create table if not exists public\.rotapark_member_unblock_audit/);
  assert.match(sql,/create or replace function public\.rotapark_staff_unblock_member/);
});
