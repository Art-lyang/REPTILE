-- =============================================================================
-- v62 — 브리더 프로필 이미지 (회원 누구나)
-- -----------------------------------------------------------------------------
-- 왜
--   v60 에서 로고를 만들 때 '사업자 인증을 받은 곳만' 으로 묶었습니다. 그러다
--   보니 개인 브리더는 자기 표시를 가질 방법이 없었습니다. 로고를 누구나
--   쓰게 열되, 인증 표시(파란 체크)는 승인된 곳에만 남깁니다.
--
--   둘을 섞지 않는 것이 중요합니다. 이미지는 '나를 알아보게 하는 것' 이고,
--   인증 표시는 '우리가 확인했다는 것' 입니다. 이미지를 올렸다고 확인된 것이
--   되면, 인증 표시가 아무 뜻도 없어집니다.
--
-- 버킷을 새로 만들지 않는 이유
--   breeder-logos 를 그대로 씁니다. 같은 성격(공개·작은 이미지·같은 경로 규칙)
--   이라 정책을 두 벌 두면 한쪽만 고치게 됩니다. 이름이 '로고' 인 것은 조금
--   어긋나지만, 버킷 이름을 바꾸면 이미 올라간 파일 주소가 전부 깨집니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. v61 다음입니다.
-- =============================================================================

begin;

-- 1) 칸 -----------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text;

/* 남의 서버 주소를 그대로 두면 그쪽에서 이미지를 바꿔치기할 수 있고, 우리
   화면에 무엇이 뜰지 우리가 모르게 됩니다.

   RPC 안에서만 검사하지 않고 제약으로 거는 이유가 있습니다 — profiles 는
   본인이 직접 고칠 수 있어서(profiles_self_write), PostgREST 로 avatar_url 에
   아무 주소나 넣을 수 있습니다. 표에 걸어야 그 길도 막힙니다. */
do $avatar_check$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_ours'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_ours check (private.is_our_logo(avatar_url));
  end if;
end $avatar_check$;

-- 2) 본인이 바꾸기 --------------------------------------------------------------
create or replace function public.set_my_avatar(p_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.is_our_logo(p_url) then
    raise exception 'AVATAR_INVALID' using errcode = '22023';
  end if;
  /* 동의만 하고 정보를 안 적은 회원은 profiles 줄이 없습니다. update 만 하면
     아무 일도 일어나지 않고 본인은 저장된 줄 압니다(v58 에서 겪은 것과 같음). */
  insert into public.profiles(user_id, avatar_url)
  values (actor, nullif(btrim(coalesce(p_url, '')), ''))
  on conflict (user_id) do update set avatar_url = excluded.avatar_url;
  return jsonb_build_object('avatar_url', (
    select p.avatar_url from public.profiles p where p.user_id = actor));
end;
$$;

-- 3) 본인 상태에 포함 -----------------------------------------------------------
/* 계정 화면이 지금 무엇이 걸려 있는지 알아야 미리보기를 그립니다. */
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
     || jsonb_build_object(
          'premium', private.care_is_premium((select auth.uid())),
          'avatar_url', (select p.avatar_url from public.profiles p
                          where p.user_id = (select auth.uid())));
$$;

-- 4) 공개 화면이 보는 것 -----------------------------------------------------------
/* 하나로 합칩니다. 화면이 '인증이면 로고, 아니면 프로필 이미지' 를 스스로
   고르게 하면 그 규칙이 세 화면에 흩어집니다.

   image 는 보여 줄 그림 하나입니다 — 승인된 곳은 로고, 아니면 프로필 이미지.
   verified 는 파란 표시를 붙일지입니다. 둘은 따로 움직입니다:
     · 로고만 있고 미승인  → image 있음, verified 거짓
     · 승인됐는데 로고 없음 → image 없음(또는 프로필 이미지), verified 참 */
create or replace function public.public_breeder_badge(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with owner as (
    select a.user_id
      from public.animals a
     where a.share_token = p_token and a.is_public = true and a.public_breeder = true
  ), biz as (
    select b.biz_name, b.logo_url
      from public.business_verifications b
      join owner o on o.user_id = b.user_id
     where b.status = 'approved'
  )
  select case when not exists (select 1 from owner) then '{}'::jsonb
    else jsonb_build_object(
      'verified', exists (select 1 from biz),
      'biz_name', (select biz_name from biz),
      'image', coalesce(
        (select logo_url from biz),
        (select p.avatar_url from public.profiles p join owner o on o.user_id = p.user_id)),
      /* 옛 화면이 아직 logo_url 을 볼 수 있습니다. 배포가 도는 동안 로고가
         사라지지 않게 같은 값을 한 번 더 담아 둡니다. */
      'logo_url', (select logo_url from biz))
  end;
$$;

-- 5) 권한 ----------------------------------------------------------------------
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

commit;
