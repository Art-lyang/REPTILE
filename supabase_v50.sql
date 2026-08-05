begin;

do $guard$
begin
  if to_regclass('public.user_entitlements') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.admins') is null then
    raise exception 'v50 requires the v49 schema';
  end if;
end
$guard$;

/* 관리자 작업 기록은 Data API가 노출하는 public 스키마 밖에 둡니다. */
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create table if not exists private.admin_member_actions (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in (
    'restrict', 'restore', 'set_tier', 'delete_prepare', 'delete', 'delete_failed'
  )),
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  status text not null default 'success' check (status in ('success', 'failed')),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
  created_at timestamptz not null default now()
);
create index if not exists admin_member_actions_target_idx
  on private.admin_member_actions(target_user_id, created_at desc);
create index if not exists admin_member_actions_actor_idx
  on private.admin_member_actions(actor_user_id, created_at desc);
revoke all on table private.admin_member_actions from public, anon, authenticated;

/* JWT 이메일이 아니라 확인된 auth 사용자 ID로 최고관리자를 판정합니다. */
create or replace function public.is_owner_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
      from auth.users u
      join public.admins a on lower(a.email) = lower(u.email)
     where u.id = p_user_id and a.role = 'owner' and u.deleted_at is null
  );
$$;
revoke all on function public.is_owner_user(uuid) from public, anon, authenticated;
grant execute on function public.is_owner_user(uuid) to service_role;

create or replace function private.assert_admin_member_target(
  p_actor uuid,
  p_target uuid
)
returns table(user_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner_user(p_actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_actor = p_target then
    raise exception 'ADMIN_MEMBER_SELF_ACTION_FORBIDDEN' using errcode = '22023';
  end if;
  if exists(
    select 1 from auth.users u
    join public.admins a on lower(a.email) = lower(u.email)
    where u.id = p_target
  ) then
    raise exception 'ADMIN_MEMBER_ADMIN_ACTION_FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text from auth.users u
     where u.id = p_target and u.deleted_at is null;
  if not found then
    raise exception 'ADMIN_MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function private.assert_admin_member_target(uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.assert_admin_member_target(uuid,uuid)
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
    premium.source_type::text,
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
    select e.entitlement_key, e.ends_at, e.source_type
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

create or replace function public.admin_list_members()
returns table(
  user_id uuid, email text, name text, nickname text, phone text,
  providers text[], created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, banned_until timestamptz, account_status text,
  tier text, premium_until timestamptz, premium_source text,
  is_admin boolean, admin_role text,
  agree_mkt_email boolean, agree_mkt_sms boolean, agree_third boolean,
  consent_at timestamptz, mkt_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from private.admin_list_members((select auth.uid()));
$$;
revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

create or replace function private.record_admin_member_action(
  p_actor uuid,
  p_target uuid,
  p_action text,
  p_reason text,
  p_status text default 'success',
  p_details jsonb default '{}'::jsonb
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare action_id bigint;
begin
  if not public.is_owner_user(p_actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_action not in ('restrict','restore','set_tier','delete_prepare','delete','delete_failed')
     or p_status not in ('success','failed')
     or char_length(btrim(coalesce(p_reason,''))) not between 2 and 500
     or jsonb_typeof(coalesce(p_details,'{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_details,'{}'::jsonb)::text) > 4096 then
    raise exception 'ADMIN_MEMBER_ACTION_INVALID' using errcode = '22023';
  end if;
  insert into private.admin_member_actions(
    actor_user_id, target_user_id, action, reason, status, details
  ) values (
    p_actor, p_target, p_action, btrim(p_reason), p_status, coalesce(p_details,'{}'::jsonb)
  ) returning id into action_id;
  return action_id;
end;
$$;
revoke all on function private.record_admin_member_action(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function private.record_admin_member_action(uuid,uuid,text,text,text,jsonb)
  to service_role;

create or replace function private.set_admin_member_tier(
  p_actor uuid,
  p_target uuid,
  p_tier text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_row record;
begin
  select * into target_row
    from private.assert_admin_member_target(p_actor, p_target);
  if p_tier not in ('general','premium')
     or char_length(btrim(coalesce(p_reason,''))) not between 2 and 500 then
    raise exception 'ADMIN_MEMBER_TIER_INVALID' using errcode = '22023';
  end if;

  if p_tier = 'premium' then
    insert into public.user_entitlements(
      user_id, entitlement_key, source_type, source_id, status,
      starts_at, ends_at, revoked_at, metadata
    ) values (
      p_target, 'premium', 'admin', 'manual:' || p_target::text, 'active',
      now(), null, null, jsonb_build_object('granted_by', p_actor)
    )
    on conflict (source_type, source_id, entitlement_key) do update set
      status = 'active', starts_at = now(), ends_at = null, revoked_at = null,
      metadata = jsonb_build_object('granted_by', p_actor), updated_at = now();
  else
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
    p_actor, p_target, 'set_tier', p_reason, 'success', jsonb_build_object('tier', p_tier)
  );
  return jsonb_build_object('ok', true, 'tier', p_tier, 'email', target_row.email);
end;
$$;
revoke all on function private.set_admin_member_tier(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function private.set_admin_member_tier(uuid,uuid,text,text)
  to service_role;

/* Auth 사용자는 Worker의 Admin API가 마지막에 삭제합니다. 이 함수는 소유 데이터만 정리합니다. */
create or replace function private.admin_prepare_member_deletion(
  p_actor uuid,
  p_target uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_row record;
  profile_row public.profiles;
  dev text := 'u_' || p_target::text;
  n_photo integer := 0;
  n_legacy_photo integer := 0;
begin
  select * into target_row
    from private.assert_admin_member_target(p_actor, p_target);
  if char_length(btrim(coalesce(p_reason,''))) not between 2 and 500 then
    raise exception 'ADMIN_MEMBER_REASON_INVALID' using errcode = '22023';
  end if;

  select * into profile_row from public.profiles where user_id = p_target;
  if found then
    insert into public.consent_archive(
      user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
      agree_mkt_email, agree_mkt_sms, consent_at, purge_after
    ) values (
      md5(p_target::text || '|reptile-withdrawn'), profile_row.agree_terms,
      profile_row.agree_privacy, profile_row.agree_age14, profile_row.agree_third,
      profile_row.agree_mkt_email, profile_row.agree_mkt_sms,
      profile_row.consent_at, (now() + interval '5 years')::date
    );
  end if;

  delete from storage.objects where bucket_id = 'animal-photos'
    and name like 'a/u\_' || p_target::text || '\_%';
  get diagnostics n_photo = row_count;
  delete from storage.objects where bucket_id = 'morph-images'
    and name like 'a/u\_' || p_target::text || '\_%';
  get diagnostics n_legacy_photo = row_count;
  n_photo := n_photo + n_legacy_photo;

  /* 순환 참조(메이팅 그룹→개체→클러치→페어링)를 먼저 끊고 삭제합니다. */
  update public.animals set clutch_id = null, breeding_project_id = null,
    breeding_project_step = null
    where user_id = p_target or device = dev;
  delete from public.mating_events where user_id = p_target;
  delete from public.care_records where user_id = p_target;
  delete from public.care_plans where user_id = p_target;
  delete from public.clutches where user_id = p_target or device = dev;
  delete from public.pairings where user_id = p_target or device = dev;
  delete from public.mating_groups where user_id = p_target;
  delete from public.animals where user_id = p_target or device = dev;
  delete from public.feed_items where user_id = p_target;
  delete from public.breeding_projects where user_id = p_target;
  update public.access_codes set revoked = true where redeemed_by = dev;
  delete from public.profiles where user_id = p_target;

  perform private.record_admin_member_action(
    p_actor, p_target, 'delete_prepare', p_reason, 'success',
    jsonb_build_object('photos_deleted', n_photo)
  );
  return jsonb_build_object(
    'ok', true, 'email', target_row.email, 'photos_deleted', n_photo
  );
end;
$$;
revoke all on function private.admin_prepare_member_deletion(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function private.admin_prepare_member_deletion(uuid,uuid,text)
  to service_role;

/* PostgREST는 public RPC만 노출하므로, service_role 전용 얇은 진입점만 둡니다. */
create or replace function public.admin_assert_member_target_service(
  p_actor uuid, p_target uuid
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(target_row)
    from private.assert_admin_member_target(p_actor, p_target) target_row;
$$;

create or replace function public.admin_set_member_tier_service(
  p_actor uuid, p_target uuid, p_tier text, p_reason text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_admin_member_tier(p_actor, p_target, p_tier, p_reason);
$$;

create or replace function public.admin_prepare_member_deletion_service(
  p_actor uuid, p_target uuid, p_reason text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_prepare_member_deletion(p_actor, p_target, p_reason);
$$;

create or replace function public.admin_record_member_action_service(
  p_actor uuid, p_target uuid, p_action text, p_reason text,
  p_status text default 'success', p_details jsonb default '{}'::jsonb
)
returns bigint language sql security invoker set search_path = '' as $$
  select private.record_admin_member_action(
    p_actor, p_target, p_action, p_reason, p_status, p_details
  );
$$;

revoke all on function public.admin_assert_member_target_service(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.admin_set_member_tier_service(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.admin_prepare_member_deletion_service(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.admin_record_member_action_service(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_assert_member_target_service(uuid,uuid)
  to service_role;
grant execute on function public.admin_set_member_tier_service(uuid,uuid,text,text)
  to service_role;
grant execute on function public.admin_prepare_member_deletion_service(uuid,uuid,text)
  to service_role;
grant execute on function public.admin_record_member_action_service(uuid,uuid,text,text,text,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
