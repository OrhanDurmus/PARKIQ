begin;

create table public.rotapark_shield_state (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'normal' check (mode in ('normal', 'defense', 'emergency')),
  revision integer not null default 0,
  expires_at timestamptz
);
insert into public.rotapark_shield_state default values;

create table public.rotapark_shield_events (
  revision integer primary key,
  occurred_at timestamptz not null default now(),
  actor uuid not null,
  mode text not null,
  expires_at timestamptz
);

alter table public.rotapark_shield_state enable row level security;
alter table public.rotapark_shield_events enable row level security;
revoke all on public.rotapark_shield_state, public.rotapark_shield_events
  from public, anon, authenticated, service_role;

create function public.rotapark_shield_mode()
returns text language sql stable security definer set search_path = ''
as $$
  select case when expires_at > now() then mode else 'normal' end
  from public.rotapark_shield_state where singleton
$$;

create function public.rotapark_shield_assert_founder()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.rotapark_my_role() is distinct from 'founder'
    or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'Founder AAL2 required' using errcode = '42501';
  end if;
end
$$;

create function public.rotapark_shield_status()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.rotapark_shield_assert_founder();
  return jsonb_build_object(
    'mode', public.rotapark_shield_mode(),
    'revision', (select revision from public.rotapark_shield_state where singleton),
    'expiresAt', (select expires_at from public.rotapark_shield_state where singleton and expires_at > now()),
    'events', coalesce((
      select jsonb_agg(to_jsonb(event) order by revision desc)
      from (select revision, occurred_at, mode from public.rotapark_shield_events order by revision desc limit 20) event
    ), '[]'::jsonb)
  );
end
$$;

create function public.rotapark_shield_set_mode(p_mode text, p_revision integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  next_state public.rotapark_shield_state;
begin
  perform public.rotapark_shield_assert_founder();
  if p_mode is null or p_mode not in ('normal', 'defense', 'emergency') then
    raise exception 'Invalid SHIELD mode' using errcode = '22023';
  end if;

  update public.rotapark_shield_state
  set mode = p_mode, revision = revision + 1,
      expires_at = case p_mode
        when 'defense' then now() + interval '60 minutes'
        when 'emergency' then now() + interval '15 minutes'
        else null end
  where singleton and revision = p_revision
  returning * into next_state;

  if not found then
    raise exception 'SHIELD revision changed' using errcode = 'PT409';
  end if;

  insert into public.rotapark_shield_events(revision, actor, mode, expires_at)
  values (next_state.revision, auth.uid(), next_state.mode, next_state.expires_at);
  return public.rotapark_shield_status();
end
$$;

revoke all on function public.rotapark_shield_assert_founder(),
  public.rotapark_shield_mode(), public.rotapark_shield_status(),
  public.rotapark_shield_set_mode(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.rotapark_shield_mode() to anon, authenticated;
grant execute on function public.rotapark_shield_status(),
  public.rotapark_shield_set_mode(text, integer) to authenticated;

commit;
