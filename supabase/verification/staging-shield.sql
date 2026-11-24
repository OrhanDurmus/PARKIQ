-- Read-only. Run in the isolated Supabase staging SQL editor.
select relname, relrowsecurity
from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where nspname = 'public' and relname in ('rotapark_shield_state', 'rotapark_shield_events');

select grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name in ('rotapark_shield_state', 'rotapark_shield_events')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');

select role_name, function_name, has_function_privilege(role_name, function_name, 'EXECUTE') as can_execute
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
cross join (values ('public.rotapark_shield_mode()'), ('public.rotapark_shield_assert_founder()'),
                   ('public.rotapark_shield_status()'), ('public.rotapark_shield_set_mode(text,integer)'))
  as functions(function_name);

select f.proname, f.prosecdef, f.proconfig, f.proacl
from pg_proc f join pg_namespace n on n.oid = f.pronamespace
where n.nspname = 'public' and f.proname like 'rotapark_shield_%'
order by f.proname;
