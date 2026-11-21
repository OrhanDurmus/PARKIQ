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
  -- A duplicate ban would make DELETE ... RETURNING ambiguous in the unblock RPC.
  if exists (
    select 1 from public.rotapark_member_bans
    group by user_id having count(*) > 1
  ) then
    raise exception 'Staging unblock preflight: duplicate member ban rows';
  end if;
  -- IF NOT EXISTS does not repair an older, incompatible audit table.
  if to_regclass('public.rotapark_member_unblock_audit') is not null and exists (
    select 1 from (values
      ('user_id'), ('unblocked_by'), ('original_reason'),
      ('unblock_reason'), ('unblocked_at')
    ) as req(col)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public'
        and c.table_name='rotapark_member_unblock_audit'
        and c.column_name=req.col
    )
  ) then
    raise exception 'Staging unblock preflight: incompatible audit table';
  end if;
end $;
rollback;
