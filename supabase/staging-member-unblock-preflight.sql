-- Read-only preflight for the isolated ROTAPARK Staging Supabase project.
-- Confirm the project URL is NOT Production before running this query.
-- This script performs no writes and does not install the migration.
with requirements(kind, object_name, present) as (
  values
  ('table','public.rotapark_member_bans',to_regclass('public.rotapark_member_bans') is not null),
  ('table','public.rotapark_staff_roles',to_regclass('public.rotapark_staff_roles') is not null),
  ('function','public.rotapark_member_blocked()',to_regprocedure('public.rotapark_member_blocked()') is not null),
  ('function','public.rotapark_staff_has_permission(text)',to_regprocedure('public.rotapark_staff_has_permission(text)') is not null),
  ('column','public.rotapark_member_bans.user_id',exists(select 1 from information_schema.columns where table_schema='public' and table_name='rotapark_member_bans' and column_name='user_id' and udt_name='uuid')),
  ('column','public.rotapark_member_bans.reason',exists(select 1 from information_schema.columns where table_schema='public' and table_name='rotapark_member_bans' and column_name='reason' and data_type in ('text','character varying'))),
  ('column','public.rotapark_staff_roles.user_id',exists(select 1 from information_schema.columns where table_schema='public' and table_name='rotapark_staff_roles' and column_name='user_id' and udt_name='uuid')),
  ('column','auth.users.id',exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='id' and udt_name='uuid')),
  ('column','auth.users.email',exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email'))
)
select kind,object_name,case when present then 'PASS' else 'STOP' end as result
from requirements order by kind,object_name;
-- All rows must be PASS before applying the Staging-only migration.
