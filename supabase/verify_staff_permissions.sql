-- ROTAPARK staff permission deployment verification.
-- Run in Supabase SQL editor AFTER applying the migration.
-- Read-only: no role or permission data is changed.
do $$
declare
  t text;
  fn text;
begin
  foreach t in array array[
    'rotapark_staff_role_permissions',
    'rotapark_staff_user_permissions',
    'rotapark_staff_permission_audit'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity
    ) then
      raise exception 'RLS not enabled on %',t;
    end if;
    if has_table_privilege('authenticated',format('public.%I',t),'SELECT')
       or has_table_privilege('authenticated',format('public.%I',t),'INSERT')
       or has_table_privilege('authenticated',format('public.%I',t),'UPDATE')
       or has_table_privilege('authenticated',format('public.%I',t),'DELETE') then
      raise exception 'Direct authenticated table privileges on %',t;
    end if;
  end loop;

  foreach fn in array array[
    'rotapark_founder_set_role_permission(text,text,boolean)',
    'rotapark_founder_get_role_permissions()',
    'rotapark_staff_has_permission(text)'
  ] loop
    if to_regprocedure('public.'||fn) is null then
      raise exception 'Missing permission RPC: %',fn;
    end if;
  end loop;

  if to_regprocedure('public.rotapark_founder_set_user_permission(uuid,text,boolean)') is not null then
    raise notice 'Existing per-user permission writer found: review its grants and role checks before rollout';
  end if;

  if exists(select 1 from public.rotapark_staff_role_permissions where enabled) then
    raise notice 'Some role permissions are enabled; confirm founder approval';
  end if;
  raise notice 'Staff permission schema checks passed. Still test authenticated RPC behavior using separate test accounts.';
end $$;
