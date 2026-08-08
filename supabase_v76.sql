-- =============================================================================
-- v76 · 깔때기 — 계산기에서 가입까지, 가입에서 정착까지
-- -----------------------------------------------------------------------------
-- 지금 볼 수 있는 것은 '몇 명이 왔는가' 뿐입니다. 그런데 이 서비스의 값을
-- 정하는 숫자는 그게 아니라 이쪽입니다.
--
--   계산기에 온 사람 중 몇 명이 가입 안내를 봤고
--   그중 몇 명이 눌렀고
--   그중 몇 명이 실제로 가입했고
--   가입한 사람 중 몇 명이 개체를 등록했고
--   그중 몇 명이 일주일 넘게 케어 기록을 이어 썼는가
--
-- 앞의 셋은 화면이 알려 줘야 알 수 있고(funnel_events), 뒤의 셋은 이미 있는
-- 표에서 세면 됩니다(profiles·animals·care_records).
--
-- ⚠️ 날짜는 서울 기준입니다. visits.day 는 UTC 로 저장돼 있어서, 한국 아침에
--    들어온 접속이 전날로 잡힙니다(관리자 화면의 '오늘 접속' 이 탭마다 다르게
--    보이는 원인이기도 합니다). 새로 만드는 표까지 그 방식을 물려받을 이유가
--    없어 여기서는 Asia/Seoul 로 셉니다.
--
-- ⚠️ 기기 식별값만 남깁니다. 이메일도 IP 도 남기지 않습니다. 처리방침의
--    '자동 수집 — 이용 기록' 에 이미 들어 있는 범위이고(보관 1년), 여기서는
--    그보다 짧게 180일만 두고 지웁니다.
--
-- 선행: supabase_v75.sql
-- =============================================================================

begin;

-- 1) 화면이 알려 주는 것 ---------------------------------------------------------
create table if not exists public.funnel_events (
  id      bigint generated always as identity primary key,
  ts      timestamptz not null default now(),
  day     date not null default ((now() at time zone 'Asia/Seoul')::date),
  device  text not null,
  event   text not null,
  service text,

  /* 종류를 못박습니다. 열어 두면 아무 문자열이나 쌓이는 창구가 됩니다. */
  constraint funnel_events_event_ck check (event in
    ('nudge_shown', 'nudge_click', 'signup_click'))
);

create index if not exists funnel_events_day_idx on public.funnel_events (day, event);
create index if not exists funnel_events_dev_idx on public.funnel_events (device, event, day);

alter table public.funnel_events enable row level security;
/* 읽기 정책을 두지 않습니다 — 관리자 함수(security definer)로만 봅니다. */
revoke all on public.funnel_events from anon, authenticated;


-- 2) 기록하는 창구 -------------------------------------------------------------
/* log_visit(supabase_v28) 와 같은 방식입니다. 표에 직접 insert 하게 두면
   아무나 아무 값이나 넣습니다. */
create or replace function public.log_funnel(p_device text, p_event text, p_service text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_service text;
begin
  if p_device is null or p_device !~ '^dev_[A-Za-z0-9_-]{4,90}$' then return false; end if;
  if p_event not in ('nudge_shown', 'nudge_click', 'signup_click') then return false; end if;

  v_service := case when p_service in ('gecko','crested','fattail','ballpython','care','home')
                    then p_service else null end;

  /* 같은 기기의 같은 사건은 하루 한 번만 셉니다. 안내 자체가 하루 한 번이고,
     클릭을 여러 번 세면 '몇 명이 눌렀나' 가 '몇 번 눌렸나' 로 바뀝니다. */
  perform pg_advisory_xact_lock(hashtext('funnel|' || p_device || '|' || p_event));

  if exists (select 1 from public.funnel_events
              where device = p_device and event = p_event
                and day = ((now() at time zone 'Asia/Seoul')::date)) then
    return false;
  end if;

  insert into public.funnel_events (device, event, service)
  values (p_device, p_event, v_service);
  return true;
end $$;

revoke all on function public.log_funnel(text, text, text) from public;
grant execute on function public.log_funnel(text, text, text) to anon, authenticated;


-- 3) 깔때기 한 장 --------------------------------------------------------------
/* 각 칸은 '사람 수' 입니다. 방문은 기기 수, 가입 뒤는 회원 수라 단위가
   바뀌는데, 그 경계(가입)에서 한 번 끊어 읽으면 됩니다. 기기와 계정을
   이어 붙이지 않는 것은 일부러입니다 — 이으려면 방문 기록에 계정을
   적어야 하고, 그건 지금 안 모으는 것을 모으기 시작한다는 뜻입니다. */
create or replace function public.admin_funnel(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d int := greatest(1, least(coalesce(p_days, 30), 365));
        today date := ((now() at time zone 'Asia/Seoul')::date);
        since date := today - d;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  return jsonb_build_object(
    'days', d,
    'since', since,

    /* --- 화면 쪽 (기기 수) --- */
    /* visits.day 는 UTC 라 쓰지 않고 ts 를 서울 시각으로 바꿔 셉니다. */
    'visitors', (select count(distinct device) from public.visits
                  where (ts at time zone 'Asia/Seoul')::date > since
                    and service in ('gecko','crested','fattail','ballpython')),
    'nudge_shown', (select count(distinct device) from public.funnel_events
                     where day > since and event = 'nudge_shown'),
    'nudge_click', (select count(distinct device) from public.funnel_events
                     where day > since and event = 'nudge_click'),
    'signup_click', (select count(distinct device) from public.funnel_events
                      where day > since and event = 'signup_click'),

    /* --- 계정 쪽 (사람 수) --- */
    'signups', (select count(*) from public.profiles p
                 where (p.created_at at time zone 'Asia/Seoul')::date > since),
    'with_animal', (select count(*) from public.profiles p
                     where (p.created_at at time zone 'Asia/Seoul')::date > since
                       and exists (select 1 from public.animals a where a.user_id = p.user_id)),
    'care_started', (select count(*) from public.profiles p
                      where (p.created_at at time zone 'Asia/Seoul')::date > since
                        and exists (select 1 from public.care_records r where r.user_id = p.user_id)),
    /* 일주일 넘게 이어 썼다는 것 — 서로 다른 날에 3번 이상 적었고, 첫 기록과
       마지막 기록이 엿새 이상 벌어진 경우. 하루에 몰아 찍고 끝난 사람을
       '정착' 으로 세면 안 됩니다. */
    'care_kept_7d', (select count(*) from public.profiles p
                      where (p.created_at at time zone 'Asia/Seoul')::date > since
                        and (select count(distinct r.done_date) from public.care_records r
                              where r.user_id = p.user_id) >= 3
                        and (select max(r.done_date) - min(r.done_date) from public.care_records r
                              where r.user_id = p.user_id) >= 6),

    /* --- 날짜별 (그래프용) --- */
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', t.day, 'visitors', t.v, 'signups', t.s) order by t.day)
        from (
          select g.day::date as day,
                 (select count(distinct x.device) from public.visits x
                   where (x.ts at time zone 'Asia/Seoul')::date = g.day
                     and x.service in ('gecko','crested','fattail','ballpython')) as v,
                 (select count(*) from public.profiles p
                   where (p.created_at at time zone 'Asia/Seoul')::date = g.day) as s
            from generate_series(since + 1, today, interval '1 day') g(day)
        ) t), '[]'::jsonb));
end $$;

revoke all on function public.admin_funnel(int) from public, anon;
grant execute on function public.admin_funnel(int) to authenticated;


-- 4) 보관 기간 ----------------------------------------------------------------
/* purge_expired 가 이미 도는 자리에 얹습니다(supabase_v69에서 pg_cron 연결).
   따로 스케줄을 만들면 하나가 멈춰도 알아채지 못합니다. */
create or replace function public.purge_funnel_events()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.funnel_events where day < ((now() at time zone 'Asia/Seoul')::date) - 180;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.purge_funnel_events() from public, anon, authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, '표' as 검사,
       case when to_regclass('public.funnel_events') is null then '★ MISSING' else 'OK' end as 판정
union all
select 2, '기록 창구가 익명에게 열려 있는가',
       case when has_function_privilege('anon', 'public.log_funnel(text,text,text)', 'execute')
            then 'OK' else '★ grant 누락' end
union all
select 3, '표는 직접 못 건드리는가',
       case when has_table_privilege('anon', 'public.funnel_events', 'insert')
              or has_table_privilege('authenticated', 'public.funnel_events', 'insert')
            then '★ 직접 insert 가 열려 있습니다' else 'OK' end
union all
select 4, '깔때기 함수',
       case when to_regprocedure('public.admin_funnel(integer)') is null
            then '★ MISSING' else 'OK' end
union all
select 5, '지금 깔때기',
       (public.admin_funnel(30) - 'daily')::text
order by 순;

-- ⚠️ 5번이 ADMIN_ONLY 로 떨어지면 정상입니다 — SQL 편집기에는 관리자 JWT 가
--    없습니다. 화면(관리자 → 유입)에서 보세요.
