-- Staging only: verify isolated Supabase and existing ban/role schema before applying.
begin;
create table if not exists public.rotapark_member_unblock_audit (
 id bigint generated always as identity primary key,
 user_id uuid not null,
 unblocked_by uuid not null,
 original_reason text not null,
 unblock_reason text not null,
 unblocked_at timestamptz not null default now()
);
revoke all on public.rotapark_member_unblock_audit from public, anon, authenticated;

create or replace function public.rotapark_staff_blocked_members()
returns table(user_id uuid, email text, reason text)
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or public.rotapark_member_blocked() is distinct from false
   or public.rotapark_staff_has_permission('users.block') is distinct from true then
   raise exception 'permission_denied' using errcode = '42501';
 end if;
 return query select b.user_id, u.email::text, b.reason::text
   from public.rotapark_member_bans b join auth.users u on u.id = b.user_id
   order by u.email limit 100;
end; $$;
revoke all on function public.rotapark_staff_blocked_members() from public, anon;
grant execute on function public.rotapark_staff_blocked_members() to authenticated;

create or replace function public.rotapark_staff_unblock_member(p_email text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid; previous_reason text;
begin
 if actor is null or public.rotapark_member_blocked() is distinct from false
   or public.rotapark_staff_has_permission('users.block') is distinct from true then
   raise exception 'permission_denied' using errcode = '42501';
 end if;
 if p_email is null or length(trim(p_email)) < 3 or p_reason is null
   or length(trim(p_reason)) not between 3 and 300 then
   raise exception 'invalid_input' using errcode = '22023';
 end if;
 lock table public.rotapark_staff_roles in share row exclusive mode;
 select u.id into target from auth.users u where lower(u.email) = lower(trim(p_email));
 if target is null or target = actor or exists (
   select 1 from public.rotapark_staff_roles r where r.user_id = target
 ) then
   raise exception 'invalid_target' using errcode = '22023';
 end if;
 delete from public.rotapark_member_bans b where b.user_id = target
   returning b.reason into previous_reason;
 if not found then raise exception 'not_blocked' using errcode = '22023'; end if;
 insert into public.rotapark_member_unblock_audit
   (user_id,unblocked_by,original_reason,unblock_reason)
 values (target,actor,previous_reason,trim(p_reason));
end; $$;
revoke all on function public.rotapark_staff_unblock_member(text,text) from public, anon;
grant execute on function public.rotapark_staff_unblock_member(text,text) to authenticated;
commit;
