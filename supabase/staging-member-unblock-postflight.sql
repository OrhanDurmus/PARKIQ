-- ROTAPARK Staging-only post-migration verification. READ ONLY.
-- Run only after verifying this is the isolated Staging Supabase project.
with checks(name,passed) as (
 values
 ('blocked members RPC exists',to_regprocedure('public.rotapark_staff_blocked_members()') is not null),
 ('unblock RPC exists',to_regprocedure('public.rotapark_staff_unblock_member(text,text)') is not null),
 ('audit table exists',to_regclass('public.rotapark_member_unblock_audit') is not null),
 ('anon cannot execute list',not has_function_privilege('anon','public.rotapark_staff_blocked_members()','EXECUTE')),
 ('anon cannot execute unblock',not has_function_privilege('anon','public.rotapark_staff_unblock_member(text,text)','EXECUTE')),
 ('authenticated can execute list',has_function_privilege('authenticated','public.rotapark_staff_blocked_members()','EXECUTE')),
 ('authenticated can execute unblock',has_function_privilege('authenticated','public.rotapark_staff_unblock_member(text,text)','EXECUTE')),
 ('anon cannot read audit',not has_table_privilege('anon','public.rotapark_member_unblock_audit','SELECT')),
 ('authenticated cannot read audit',not has_table_privilege('authenticated','public.rotapark_member_unblock_audit','SELECT'))
)
select name,case when passed then 'PASS' else 'STOP' end as result from checks order by name;
-- If a referenced function/table does not exist, privilege checks may error:
-- treat any error as STOP and do not run real-account tests.
