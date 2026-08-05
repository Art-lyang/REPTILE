begin;

do $guard$
begin
  if to_regclass('public.user_entitlements') is null
     or to_regclass('private.admin_member_actions') is null
     or to_regprocedure('private.assert_admin_member_target(uuid,uuid)') is null then
    raise exception 'v52 requires the v50 member management schema';
  end if;
end
$guard$;

drop function if exists public.admin_set_member_tier_service(uuid,uuid,text,text);
drop function if exists private.set_admin_member_tier(uuid,uuid,text,text);

create or replace function private.set_admin_member_tier(
  p_actor uuid,
  p_target uuid,
  p_tier text,
  p_reason text,
  p_grant_type text,
  p_duration_days integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_row record;
  grant_started timestamptz := now();
  grant_ends timestamptz;
  entitlement_kind text;
  action_details jsonb;
begin
  select * into target_row
    from private.assert_admin_member_target(p_actor, p_target);

  if p_tier not in ('general','premium')
     or char_length(btrim(coalesce(p_reason,''))) not between 2 and 500 then
    raise exception 'ADMIN_MEMBER_TIER_INVALID' using errcode = '22023';
  end if;

  if p_tier = 'premium' then
    if p_grant_type not in ('trial','timed','permanent') then
      raise exception 'ADMIN_MEMBER_GRANT_TYPE_INVALID' using errcode = '22023';
    end if;
    if p_grant_type = 'permanent' then
      if p_duration_days is not null then
        raise exception 'ADMIN_MEMBER_DURATION_INVALID' using errcode = '22023';
      end if;
      grant_ends := null;
    else
      if p_duration_days is null or p_duration_days not between 1 and 3650 then
        raise exception 'ADMIN_MEMBER_DURATION_INVALID' using errcode = '22023';
      end if;
      grant_ends := grant_started + make_interval(days => p_duration_days);
    end if;

    entitlement_kind := case when p_grant_type = 'trial' then 'trial' else 'premium' end;
    action_details := jsonb_strip_nulls(jsonb_build_object(
      'tier', p_tier,
      'grant_type', p_grant_type,
      'duration_days', p_duration_days,
      'starts_at', grant_started,
      'ends_at', grant_ends
    ));

    insert into public.user_entitlements(
      user_id, entitlement_key, source_type, source_id, status,
      starts_at, ends_at, revoked_at, metadata
    ) values (
      p_target, 'premium', 'admin', 'manual:' || p_target::text, 'active',
      grant_started, grant_ends, null,
      jsonb_strip_nulls(jsonb_build_object(
        'granted_by', p_actor,
        'kind', entitlement_kind,
        'grant_type', p_grant_type,
        'duration_days', p_duration_days
      ))
    )
    on conflict (source_type, source_id, entitlement_key) do update set
      status = 'active',
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      revoked_at = null,
      metadata = excluded.metadata,
      updated_at = now();
  else
    action_details := jsonb_build_object('tier', p_tier);
    update public.user_entitlements set
      status = 'revoked', revoked_at = now(), updated_at = now(),
      metadata = metadata || jsonb_build_object('revoked_by', p_actor)
     where user_id = p_target
       and entitlement_key = 'premium'
       and source_type = 'admin'
       and source_id = 'manual:' || p_target::text
       and status = 'active';
  end if;

  perform private.record_admin_member_action(
    p_actor, p_target, 'set_tier', p_reason, 'success', action_details
  );
  return action_details || jsonb_build_object('ok', true, 'email', target_row.email);
end;
$$;
revoke all on function private.set_admin_member_tier(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function private.set_admin_member_tier(uuid,uuid,text,text,text,integer)
  to service_role;

create or replace function public.admin_set_member_tier_service(
  p_actor uuid,
  p_target uuid,
  p_tier text,
  p_reason text,
  p_grant_type text,
  p_duration_days integer
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_admin_member_tier(
    p_actor, p_target, p_tier, p_reason, p_grant_type, p_duration_days
  );
$$;
revoke all on function public.admin_set_member_tier_service(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_member_tier_service(uuid,uuid,text,text,text,integer)
  to service_role;

create or replace function private.admin_list_members(p_actor uuid)
returns table(
  user_id uuid,
  email text,
  name text,
  nickname text,
  phone text,
  providers text[],
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  account_status text,
  tier text,
  premium_until timestamptz,
  premium_source text,
  is_admin boolean,
  admin_role text,
  agree_mkt_email boolean,
  agree_mkt_sms boolean,
  agree_third boolean,
  consent_at timestamptz,
  mkt_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner_user(p_actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    coalesce(p.email, u.email)::text,
    p.name::text,
    p.nickname::text,
    p.phone::text,
    coalesce((
      select array_agg(distinct i.provider::text order by i.provider::text)
        from auth.identities i where i.user_id = u.id
    ), '{}'::text[]),
    coalesce(p.created_at, u.created_at),
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    case
      when u.deleted_at is not null then 'deleted'
      when u.banned_until is not null and u.banned_until > now() then 'restricted'
      else 'active'
    end::text,
    case when premium.entitlement_key is null then 'general' else 'premium' end::text,
    premium.ends_at,
    case
      when premium.source_type = 'admin'
        then ('admin_' || coalesce(premium.metadata->>'grant_type', 'legacy'))::text
      else premium.source_type::text
    end,
    (admin_row.email is not null),
    admin_row.role::text,
    coalesce(p.agree_mkt_email, false),
    coalesce(p.agree_mkt_sms, false),
    coalesce(p.agree_third, false),
    p.consent_at,
    p.mkt_at
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.admins admin_row on lower(admin_row.email) = lower(u.email)
  left join lateral (
    select e.entitlement_key, e.ends_at, e.source_type, e.metadata
      from public.user_entitlements e
     where e.user_id = u.id
       and e.entitlement_key = 'premium'
       and e.status = 'active'
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.ends_at is null or e.ends_at > now())
     order by (e.ends_at is null) desc, e.ends_at desc
     limit 1
  ) premium on true
  where u.deleted_at is null
  order by coalesce(p.created_at, u.created_at) desc;
end;
$$;
revoke all on function private.admin_list_members(uuid) from public, anon;
grant execute on function private.admin_list_members(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

