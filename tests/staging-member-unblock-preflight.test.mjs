import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/staging-member-unblock-preflight.sql',import.meta.url),'utf8');
test('preflight is read-only and checks essential schema',()=>{
  assert.match(sql,/to_regclass\('public\.rotapark_member_bans'\)/);
  assert.match(sql,/to_regclass\('public\.rotapark_staff_roles'\)/);
  assert.match(sql,/to_regprocedure\('public\.rotapark_member_blocked\(\)'\)/);
  assert.match(sql,/to_regprocedure\('public\.rotapark_staff_has_permission\(text\)'\)/);
  assert.match(sql,/information_schema\.columns/);
  assert.match(sql,/case when present then 'PASS' else 'STOP' end/);
  assert.doesNotMatch(sql,/\b(?:insert|update|delete|alter|drop|create|truncate|grant|revoke)\s+(?:into\s+|table\s+|function\s+|on\s+)?(?:public\.|auth\.)/i);
});

const strictPreflight=readFileSync(new URL('../supabase/verification/staging-member-unblock-preflight.sql',import.meta.url),'utf8');
test('strict staging preflight uses matched PL/pgSQL dollar delimiters and rolls back',()=>{
  assert.match(strictPreflight,/\bdo \$\$/i);
  assert.match(strictPreflight,/\bend \$\$;/i);
  assert.doesNotMatch(strictPreflight,/\bend \$;/i);
  assert.match(strictPreflight,/^begin read only;/m);
  assert.match(strictPreflight,/^rollback;/m);
});
