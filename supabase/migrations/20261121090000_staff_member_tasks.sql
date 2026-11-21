begin;
-- Only ordinary accounts are eligible for these delegated tasks. Existing founder
-- workflows and the staff-role audit trigger retain their original contracts.
create or replace function public.rotapark_staff_member_task(p_task text, p_email text, p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
declare target uuid; actor uuid := auth.uid(); permission text;
begin
  permission := case p_task when 'block' then 'users.block'
    when 'appoint' then 'staff.moderators.manage' when 'remove' then 'staff.moderators.manage' end;
  if actor is null or permission is null or public.rotapark_staff_has_permission(permission) is not true
    or (p_task in ('appoint','remove') and coalesce(public.rotapark_my_role(),'') not in ('founder','admin'))
    or public.rotapark_member_blocked() is distinct from false then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  -- Serialize the target-role check even for accounts without a staff row.
  lock table public.rotapark_staff_roles in share row exclusive mode;
  select id into target from auth.users where lower(email)=lower(trim(p_email));
  if target is null or target=actor then raise exception 'invalid_target' using errcode='22023'; end if;
  if p_task='remove' then
    delete from public.rotapark_staff_roles where user_id=target and role='moderator';
    if not found then raise exception 'invalid_target' using errcode='22023'; end if;
    return;
  end if;
  if exists(select 1 from public.rotapark_staff_roles where user_id=target)
     or exists(select 1 from public.rotapark_member_bans where user_id=target) then
    raise exception 'invalid_target' using errcode='22023';
  end if;
  if p_task='block' then
    if coalesce(length(trim(p_reason)),0) not between 1 and 300 then
      raise exception 'invalid_reason' using errcode='22023';
    end if;
    insert into public.rotapark_member_bans(user_id,blocked_by,reason) values(target,actor,trim(p_reason));
  else
    insert into public.rotapark_staff_roles(user_id,role,assigned_by) values(target,'moderator',actor);
  end if;
end; $$;
revoke all on function public.rotapark_staff_member_task(text,text,text) from public,anon;
grant execute on function public.rotapark_staff_member_task(text,text,text) to authenticated;
commit;
