-- =============================================================================
-- v54 — 무료 사용자 개체 10마리 한도
-- -----------------------------------------------------------------------------
-- 무엇을 정했는가
--   무료   : 개체 10마리까지. 급여·체중·건강 기록과 알림은 전부 그대로 씁니다.
--   유료   : 개체 무제한 + 브리딩 관리·라인브리딩·공개 프로필·내보내기.
--
--   결제가 끊겨 20마리가 된 사람은 10마리만 '활성' 이 됩니다.
--     · 활성  : 수정·계획 지정·알림 모두 됩니다.
--     · 초과분: 보기와 삭제만 됩니다. 수정과 계획 지정은 막고, 이미 걸려 있던
--               계획의 알림도 멈춥니다. 기록은 지우지 않습니다 — 지워 버리면
--               다시 결제할 이유까지 같이 사라집니다.
--
--   활성 10마리는 기본이 '등록순 앞의 10마리' 이고, 사용자가 바꿀 수 있습니다.
--   오래 키운 사람일수록 처음 10마리는 이미 분양했거나 무지개다리를 건넌
--   경우가 많아서, 고정해 두면 정작 지금 돌보는 개체가 잠깁니다.
--
-- 왜 화면이 아니라 여기인가
--   지금 제한은 care-ui.js 의 조건문에만 있습니다. 유료를 열면서 그대로 두면
--   개발자도구를 연 사람은 그냥 넘어가고, 그런 방법은 커뮤니티에 금방 퍼집니다.
--   그래서 쓰기 경로 자체를 DB 에서 막습니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요.
-- =============================================================================

begin;

-- 1) 사용자가 활성으로 고정한 개체 ---------------------------------------------
-- 아무것도 고정하지 않으면(전부 false) 등록순 앞의 10마리가 활성입니다.
alter table public.animals add column if not exists free_pinned boolean not null default false;
create index if not exists animals_free_pinned_idx on public.animals(user_id, free_pinned);

-- 2) 한도 값 -------------------------------------------------------------------
-- 바꿀 일이 생기면 여기 한 곳만 고치면 됩니다.
create or replace function public.care_free_limit()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;

-- 3) 서버에서 판정하는 프리미엄 여부 --------------------------------------------
-- premium_status() 는 device 문자열을 받는 화면용이라, 여기서는 로그인 사용자
-- 기준으로만 봅니다.
create or replace function private.care_is_premium(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.user_entitlements e
     where e.user_id = p_user
       and e.entitlement_key = 'premium'
       and e.status = 'active'
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.ends_at is null or e.ends_at > now())
  );
$$;

-- 4) 활성 개체 목록 -------------------------------------------------------------
-- 고정한 것을 먼저 채우고, 남은 자리를 등록순으로 채웁니다.
create or replace function private.care_active_animal_ids(p_user uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case
    when p_user is null then '{}'::uuid[]
    when private.care_is_premium(p_user) then
      (select coalesce(array_agg(a.id), '{}'::uuid[]) from public.animals a where a.user_id = p_user)
    else (
      select coalesce(array_agg(x.id), '{}'::uuid[]) from (
        select a.id
          from public.animals a
         where a.user_id = p_user
         order by a.free_pinned desc, a.created_at asc, a.id asc
         limit public.care_free_limit()
      ) x
    )
  end;
$$;

-- 화면이 "이 개체가 활성인가" 를 물어볼 창구입니다.
create or replace function public.my_active_animal_ids()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(private.care_active_animal_ids((select auth.uid())));
$$;

create or replace function public.my_care_quota()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'premium', private.care_is_premium((select auth.uid())),
    'limit',   public.care_free_limit(),
    'used',    (select count(*) from public.animals a where a.user_id = (select auth.uid())),
    'active',  to_jsonb(private.care_active_animal_ids((select auth.uid())))
  );
$$;

-- 5) 개체 쓰기 제한 -------------------------------------------------------------
-- save_row 는 수정을 delete + insert 로 처리합니다. 그래서 INSERT 트리거만으로는
-- '새로 만드는 것' 과 '고치는 것' 이 구분되지 않습니다. save_row 가 기존 행을
-- 이미 읽어 두므로, 판단은 save_row 안에서 하는 편이 정확합니다.
create or replace function private.assert_care_animal_writable(p_user uuid, p_id uuid, p_is_new boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare used integer; lim integer;
begin
  if p_user is null then return; end if;                 -- 비로그인 기기 기록은 예전 방식 그대로
  if private.care_is_premium(p_user) then return; end if;

  lim := public.care_free_limit();

  if p_is_new then
    select count(*) into used from public.animals a where a.user_id = p_user;
    if used >= lim then
      raise exception 'CARE_FREE_LIMIT_REACHED' using errcode = '42501';
    end if;
    return;
  end if;

  if not (p_id = any(private.care_active_animal_ids(p_user))) then
    raise exception 'CARE_ANIMAL_INACTIVE' using errcode = '42501';
  end if;
end;
$$;

-- save_row 원본에 검사 네 줄만 더한 것입니다. 나머지 동작은 그대로입니다.
create or replace function public.save_row(p_device text, p_table text, p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare newid uuid; u uuid := auth.uid(); okey text; cur jsonb;
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;
  p_row := p_row - 'device' - 'user_id';
  if coalesce(p_row->>'id','') <> '' then
    if u is not null then
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.user_id = $2', p_table)
        into cur using (p_row->>'id')::uuid, u;
    else
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.device = $2 and t.user_id is null', p_table)
        into cur using (p_row->>'id')::uuid, p_device;
    end if;
    if cur is not null then p_row := cur || p_row; end if;
  end if;

  -- ▼ v54 : 무료 한도. cur 이 있으면 고치는 것, 없으면 새로 만드는 것입니다.
  if p_table = 'animals' then
    perform private.assert_care_animal_writable(
      u,
      nullif(p_row->>'id','')::uuid,
      cur is null
    );
  end if;
  -- ▲

  if u is not null then
    okey := 'u_' || u::text;
    p_row := p_row || jsonb_build_object('user_id', u::text, 'device', okey);
  else
    if coalesce(p_device,'') = '' or p_device like 'u\_%' then raise exception '로그인이 필요합니다'; end if;
    p_row := p_row || jsonb_build_object('device', p_device);
  end if;
  if coalesce(p_row->>'id','') = '' then
    p_row := p_row || jsonb_build_object('id', gen_random_uuid()::text);
  else
    if u is not null then
      execute format('delete from public.%I where id = $1 and user_id = $2', p_table)
        using (p_row->>'id')::uuid, u;
    else
      execute format('delete from public.%I where id = $1 and device = $2 and user_id is null', p_table)
        using (p_row->>'id')::uuid, p_device;
    end if;
  end if;
  if coalesce(p_row->>'created_at','') = '' then
    p_row := p_row || jsonb_build_object('created_at', now());
  end if;
  begin
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) returning id', p_table, p_table)
      into newid using p_row;
  exception when unique_violation then
    raise exception '내 기록이 아닙니다';
  end;
  return newid;
end;
$$;

-- 6) 계획 제한 -----------------------------------------------------------------
-- care_plans 는 표를 직접 고치므로 트리거가 맞습니다.
create or replace function public.care_plan_slot_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null or new.animal_id is null then return new; end if;
  if private.care_is_premium(owner) then return new; end if;
  if not (new.animal_id = any(private.care_active_animal_ids(owner))) then
    raise exception 'CARE_ANIMAL_INACTIVE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists care_plan_slot_guard on public.care_plans;
create trigger care_plan_slot_guard
  before insert or update on public.care_plans
  for each row execute function public.care_plan_slot_guard();

-- 7) 활성 자리 바꾸기 ----------------------------------------------------------
-- 지금 돌보는 개체가 초과분에 걸렸을 때 쓰는 창구입니다.
create or replace function public.set_animal_free_slot(p_id uuid, p_pinned boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); pinned integer; lim integer := public.care_free_limit();
begin
  if u is null then raise exception 'CARE_LOGIN_REQUIRED' using errcode = '42501'; end if;
  if not exists(select 1 from public.animals a where a.id = p_id and a.user_id = u) then
    raise exception 'CARE_ANIMAL_NOT_FOUND' using errcode = '42501';
  end if;

  if p_pinned then
    select count(*) into pinned from public.animals a
     where a.user_id = u and a.free_pinned and a.id <> p_id;
    if pinned >= lim then
      raise exception 'CARE_FREE_LIMIT_REACHED' using errcode = '42501';
    end if;
  end if;

  update public.animals set free_pinned = coalesce(p_pinned, false)
   where id = p_id and user_id = u;

  return public.my_care_quota();
end;
$$;

revoke all on function public.set_animal_free_slot(uuid, boolean) from public, anon;
revoke all on function public.my_active_animal_ids()               from public, anon;
revoke all on function public.my_care_quota()                      from public, anon;
grant execute on function public.set_animal_free_slot(uuid, boolean) to authenticated;
grant execute on function public.my_active_animal_ids()              to authenticated;
grant execute on function public.my_care_quota()                     to authenticated;

notify pgrst, 'reload schema';
commit;

-- =============================================================================
-- 되돌리기 (필요할 때만)
--   drop trigger if exists care_plan_slot_guard on public.care_plans;
--   그리고 supabase_setup.sql 의 save_row 를 다시 실행하면 검사 없이 돌아갑니다.
--   free_pinned 컬럼은 남겨 두어도 아무 일도 하지 않습니다.
-- =============================================================================
