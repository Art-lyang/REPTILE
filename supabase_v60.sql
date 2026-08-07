-- =============================================================================
-- v60 — 사업자 인증 · 브리더 로고
-- -----------------------------------------------------------------------------
-- 왜
--   개체를 분양받는 쪽에서 상대가 등록된 업체인지 알 방법이 없습니다. 닉네임은
--   누구나 아무거나 지을 수 있어서 그것만으로는 구별이 안 됩니다.
--
-- 정한 것
--   · 프리미엄 계정만 신청할 수 있습니다.
--   · 신청서에 받는 것은 상호명과 사업자등록번호, 그리고 로고 주소입니다.
--   · 승인되면 공개 화면에서 브리더명 옆에 로고와 인증 표시가 붙습니다.
--   · 관리자가 승인·반려·해제할 수 있고, 신청 없이 직접 등록할 수도 있습니다.
--
-- 증빙 서류를 받지 않는 이유
--   사업자등록 상태는 국세청에서 번호만으로 조회할 수 있습니다. 그러니 등록증
--   사본을 받아 보관할 이유가 없습니다. 서류를 안 갖고 있으면 새어 나갈 일도
--   없습니다. 1인 운영에서는 이쪽이 안전합니다.
--
-- 로고 버킷을 공개로 두는 이유
--   개체 사진(animal-photos)은 비공개 버킷이라 볼 때마다 서명 주소를 받습니다.
--   로고는 반대로 '브리더명 옆에 보이라고' 올리는 것이고, QR 이미지로 내보낼
--   때도 그려야 합니다. 서명 주소는 한 시간이면 만료돼 저장한 이미지가 깨집니다.
--
-- 공개 화면에 새 함수를 쓰는 이유
--   public_animal / public_breeder_profile 을 고치려면 함수를 통째로 다시 써야
--   합니다. v54 에서 save_consent 를 다시 쓰다 47줄을 옮겨 적은 적이 있는데,
--   그건 매번 조마조마한 작업입니다. 작은 함수를 하나 더 두는 편이 낫습니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. v59 다음입니다.
-- =============================================================================

begin;

-- 1) 신청서 ---------------------------------------------------------------------
create table if not exists public.business_verifications (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  biz_name    text not null,
  biz_number  text not null,
  logo_url    text,
  note        text,                      -- 반려 사유나 관리자 메모
  applied_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references auth.users(id)
);
create index if not exists business_verifications_status_idx
  on public.business_verifications(status, applied_at desc);

alter table public.business_verifications enable row level security;
/* 표를 직접 열지 않습니다. 사업자등록번호가 들어 있어서, 승인된 브리더의
   '상호명과 로고' 만 내보내는 함수를 따로 둡니다. */
revoke all on public.business_verifications from anon, authenticated;

-- 2) 로고 버킷 -------------------------------------------------------------------
do $logo_bucket$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'breeder-logos',
    'breeder-logos',
    true,
    524288,                               -- 512KB. 로고에 그 이상은 필요 없습니다.
    /* SVG 는 뺐습니다. 스크립트를 품을 수 있는 형식이라, 남이 올린 것을 그대로
       내주는 자리에는 두지 않습니다. */
    array['image/png', 'image/jpeg', 'image/webp']
  )
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $logo_bucket$;

do $logo_policies$
begin
  drop policy if exists bl_read on storage.objects;
  create policy bl_read on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'breeder-logos');

  /* 자기 칸에만 올릴 수 있습니다. 경로 규칙은 개체 사진과 같은 모양입니다. */
  drop policy if exists bl_insert on storage.objects;
  create policy bl_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'breeder-logos'
      and starts_with(name, 'b/u_' || (select auth.uid())::text || '_')
    );

  drop policy if exists bl_update on storage.objects;
  create policy bl_update on storage.objects
    for update to authenticated
    using (bucket_id = 'breeder-logos' and owner_id = (select auth.uid()::text))
    with check (
      bucket_id = 'breeder-logos'
      and owner_id = (select auth.uid()::text)
      and starts_with(name, 'b/u_' || (select auth.uid())::text || '_')
    );

  drop policy if exists bl_delete on storage.objects;
  create policy bl_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'breeder-logos' and owner_id = (select auth.uid()::text));
end $logo_policies$;

-- 3) 값 다듬기 -------------------------------------------------------------------
/* 사업자등록번호는 사람마다 다르게 적습니다 — 123-45-67890, 1234567890,
   123 45 67890. 숫자만 남겨 두면 관리자가 대조하기 쉽고 중복도 잡힙니다. */
create or replace function private.biz_digits(p_value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '');
$$;

/* 로고 주소는 우리 버킷 것만 받습니다. 남의 서버 주소를 그대로 두면 그쪽에서
   이미지를 바꿔치기할 수 있고, 우리 화면에 무엇이 뜰지 우리가 모르게 됩니다. */
create or replace function private.is_our_logo(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_url, '') = ''
      or position('/breeder-logos/' in coalesce(p_url, '')) > 0;
$$;

-- 4) 신청하기 -------------------------------------------------------------------
create or replace function public.apply_business_verification(
  p_name text, p_number text, p_logo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor  uuid := (select auth.uid());
  name   text := nullif(btrim(coalesce(p_name, '')), '');
  digits text := private.biz_digits(p_number);
  cur    text;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  /* 프리미엄에게만 여는 기능입니다. 화면에서도 감추지만, 화면 조건문은
     개발자도구로 넘어갑니다. */
  if not private.care_is_premium(actor) then
    raise exception 'BIZ_PREMIUM_REQUIRED' using errcode = '42501';
  end if;
  if name is null then
    raise exception 'BIZ_NAME_REQUIRED' using errcode = '22023';
  end if;
  /* 사업자등록번호는 10자리입니다. 자릿수를 안 보면 오타가 그대로 들어와
     관리자가 조회했을 때 없는 번호가 나옵니다. */
  if digits is null or length(digits) <> 10 then
    raise exception 'BIZ_NUMBER_INVALID' using errcode = '22023';
  end if;
  if not private.is_our_logo(p_logo) then
    raise exception 'BIZ_LOGO_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.business_verifications b
     where b.biz_number = digits and b.user_id <> actor and b.status = 'approved'
  ) then
    raise exception 'BIZ_NUMBER_TAKEN' using errcode = '23505';
  end if;

  select b.status into cur from public.business_verifications b where b.user_id = actor;
  /* 이미 승인된 사람이 신청서를 다시 내면 승인이 풀립니다. 상호명이 바뀌면
     다시 확인해야 하니 그게 맞습니다. 로고만 바꿀 때는 set_my_breeder_logo
     를 쓰면 승인이 유지됩니다. */
  insert into public.business_verifications(user_id, status, biz_name, biz_number, logo_url, applied_at)
  values (actor, 'pending', name, digits, nullif(btrim(coalesce(p_logo, '')), ''), now())
  on conflict (user_id) do update
    set status = 'pending', biz_name = excluded.biz_name, biz_number = excluded.biz_number,
        logo_url = excluded.logo_url, note = null,
        applied_at = now(), decided_at = null, decided_by = null;

  return jsonb_build_object('status', 'pending', 'was', cur);
end;
$$;

-- 5) 승인된 사람이 로고만 바꾸기 -----------------------------------------------------
create or replace function public.set_my_breeder_logo(p_logo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.is_our_logo(p_logo) then
    raise exception 'BIZ_LOGO_INVALID' using errcode = '22023';
  end if;
  update public.business_verifications
     set logo_url = nullif(btrim(coalesce(p_logo, '')), '')
   where user_id = actor and status = 'approved';
  if not found then
    raise exception 'BIZ_NOT_APPROVED' using errcode = '42501';
  end if;
  return jsonb_build_object('logo_url', (
    select b.logo_url from public.business_verifications b where b.user_id = actor));
end;
$$;

-- 6) 본인 상태 -------------------------------------------------------------------
create or replace function public.my_business_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
             'status', b.status, 'biz_name', b.biz_name, 'biz_number', b.biz_number,
             'logo_url', b.logo_url, 'note', b.note,
             'applied_at', b.applied_at, 'decided_at', b.decided_at)
      from public.business_verifications b
     where b.user_id = (select auth.uid())
  ), jsonb_build_object('status', 'none'))
     || jsonb_build_object('premium', private.care_is_premium((select auth.uid())));
$$;

-- 7) 공개 화면이 보는 것 -----------------------------------------------------------
/* 공유 토큰이 입구입니다(public_nickname_history 와 같은 방식). 승인된 경우에만,
   그것도 상호명과 로고만 나갑니다 — 사업자등록번호는 절대 나가지 않습니다. */
create or replace function public.public_breeder_badge(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('biz_name', b.biz_name, 'logo_url', b.logo_url)
      from public.business_verifications b
     where b.status = 'approved'
       and b.user_id = (
             select a.user_id from public.animals a
              where a.share_token = p_token and a.is_public = true and a.public_breeder = true
           )
  ), '{}'::jsonb);
$$;

-- 8) 관리자 ---------------------------------------------------------------------
create or replace function public.admin_business_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce((
    select jsonb_agg(to_jsonb(x) order by x.applied_at desc) from (
      select b.user_id, b.status, b.biz_name, b.biz_number, b.logo_url, b.note,
             b.applied_at, b.decided_at, u.email, p.nickname
        from public.business_verifications b
        left join auth.users u on u.id = b.user_id
        left join public.profiles p on p.user_id = b.user_id
    ) x), '[]'::jsonb)
  else null end;
$$;

/* 승인·반려·해제를 한 함수로 처리합니다. 'none' 은 줄을 지우는 것입니다 —
   관리자가 잘못 넣은 것을 되돌릴 때 씁니다. */
create or replace function public.admin_decide_business(
  p_target uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or not public.is_owner_user(actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_status = 'none' then
    delete from public.business_verifications where user_id = p_target;
    if not found then
      raise exception 'BIZ_NOT_FOUND' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'none');
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'BIZ_STATUS_INVALID' using errcode = '22023';
  end if;
  update public.business_verifications
     set status = p_status, note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = now(), decided_by = actor
   where user_id = p_target;
  if not found then
    raise exception 'BIZ_NOT_FOUND' using errcode = '42501';
  end if;
  return jsonb_build_object('status', p_status);
end;
$$;

/* 관리자가 신청 없이 직접 등록합니다. 오프라인으로 확인한 업체를 넣을 때 씁니다.
   신청 경로와 달리 프리미엄 여부를 보지 않습니다 — 관리자가 사정을 알고
   넣는 것이라, 여기서 막으면 오히려 손이 묶입니다. */
create or replace function public.admin_upsert_business(
  p_target uuid, p_name text, p_number text,
  p_logo text default null, p_status text default 'approved')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor  uuid := (select auth.uid());
  name   text := nullif(btrim(coalesce(p_name, '')), '');
  digits text := private.biz_digits(p_number);
begin
  if actor is null or not public.is_owner_user(actor) then
    raise exception 'ADMIN_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if name is null then
    raise exception 'BIZ_NAME_REQUIRED' using errcode = '22023';
  end if;
  if digits is null or length(digits) <> 10 then
    raise exception 'BIZ_NUMBER_INVALID' using errcode = '22023';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'BIZ_STATUS_INVALID' using errcode = '22023';
  end if;
  if not private.is_our_logo(p_logo) then
    raise exception 'BIZ_LOGO_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target) then
    raise exception 'ADMIN_MEMBER_NOT_FOUND' using errcode = '42501';
  end if;
  insert into public.business_verifications(
    user_id, status, biz_name, biz_number, logo_url, decided_at, decided_by)
  values (p_target, p_status, name, digits,
          nullif(btrim(coalesce(p_logo, '')), ''), now(), actor)
  on conflict (user_id) do update
    set status = excluded.status, biz_name = excluded.biz_name,
        biz_number = excluded.biz_number, logo_url = excluded.logo_url,
        decided_at = now(), decided_by = actor;
  return jsonb_build_object('status', p_status);
end;
$$;

-- 9) 권한 ----------------------------------------------------------------------
revoke all on function public.apply_business_verification(text,text,text) from public, anon;
revoke all on function public.set_my_breeder_logo(text)                   from public, anon;
revoke all on function public.my_business_status()                        from public, anon;
revoke all on function public.admin_business_list()                       from public, anon;
revoke all on function public.admin_decide_business(uuid,text,text)       from public, anon;
revoke all on function public.admin_upsert_business(uuid,text,text,text,text) from public, anon;

grant execute on function public.apply_business_verification(text,text,text) to authenticated;
grant execute on function public.set_my_breeder_logo(text)                   to authenticated;
grant execute on function public.my_business_status()                        to authenticated;
grant execute on function public.admin_business_list()                       to authenticated;
grant execute on function public.admin_decide_business(uuid,text,text)       to authenticated;
grant execute on function public.admin_upsert_business(uuid,text,text,text,text) to authenticated;

-- 공개 배지는 익명도 봅니다. 그 자리가 바로 분양받는 사람이 보는 화면입니다.
revoke all on function public.public_breeder_badge(text) from public;
grant execute on function public.public_breeder_badge(text) to anon, authenticated;

commit;
