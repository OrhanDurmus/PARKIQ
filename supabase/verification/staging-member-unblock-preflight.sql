-- Run ONLY against a separately verified isolated Staging Supabase project.
-- Read-only preflight: abort on incompatible schema before applying unblock migration.
begin read only;
do $$
declare missing text;
begin
  select string_agg(format('%s.%s', req.rel, req.col), ', ')
    into missing
  from (values
    ('rotapark_member_bans','user_id'),
    ('rotapark_member_bans','reason'),
    ('rotapark_member_bans','blocked_by'),
    ('rotapark_staff_roles','user_id'),
    ('rotapark_staff_roles','role')
  ) as req(rel,col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=req.rel and c.column_name=req.col
  );
  if missing is not null then
    raise exception 'Staging unblock preflight: missing columns: %',missing;
  end if;
  if to_regprocedure('public.rotapark_member_blocked()') is null
    or to_regprocedure('public.rotapark_staff_has_permission(text)') is null then
    raise exception 'Staging unblock preflight: required permission functions absent';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'Staging unblock preflight: auth.users absent';
  end if;
end $$;
rollback;
