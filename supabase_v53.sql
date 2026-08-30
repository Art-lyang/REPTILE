-- =============================================================================
-- v53 — 보안 이벤트 기록 + 관리자 감사 로그 조회
-- -----------------------------------------------------------------------------
-- 왜 만드는가
--   Worker 는 이미 관리자 API 를 찔러보는 요청(/api/admin/* 404)과 아직 열지
--   않은 결제 경로 접근(/api/billing/* 503)을 보고 있지만 그냥 버립니다.
--   그래서 "누가 우리 시스템을 노렸는가" 를 나중에 확인할 방법이 없습니다.
--   Cloudflare 무료 플랜은 막은 위협의 '개수' 만 주고 상세는 주지 않으므로,
--   실제로 쓸 만한 기록은 우리가 남기는 수밖에 없습니다.
--
-- 안전장치
--   기록 자체가 공격 표면이 되면 안 됩니다. 누군가 초당 수천 번 찌르면 그만큼
--   행이 쌓여 저장소가 불어납니다. 그래서 같은 (종류, IP) 는 1분에 한 줄만
--   남기고, 90일이 지난 기록은 지우는 함수를 함께 둡니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요.
--   이 파일은 build.sh 가 배포에서 제외하므로 사이트로 나가지 않습니다.
-- =============================================================================

begin;

-- 1) 기록 표 ------------------------------------------------------------------
create table if not exists public.security_events (
  id         bigint generated always as identity primary key,
  ts         timestamptz not null default now(),
  kind       text not null check (kind in (
               'admin_probe',      -- 없는 관리자 경로를 찔러봄
               'admin_auth_fail',  -- 관리자 API 인증 실패
               'billing_probe',    -- 아직 닫아 둔 결제 경로 접근
               'other')),
  method     text,
  path       text,
  ip         text,
  country    text,
  ua         text,
  detail     jsonb not null default '{}'::jsonb
               check (jsonb_typeof(detail) = 'object'
                      and octet_length(detail::text) <= 2048)
);

create index if not exists security_events_ts_idx   on public.security_events(ts desc);
create index if not exists security_events_kind_idx on public.security_events(kind, ts desc);

-- RLS: 아무도 직접 읽고 쓸 수 없습니다.
-- 쓰기는 Worker 가 서비스 키로(정책을 우회) 하고, 읽기는 아래 관리자 함수로만 합니다.
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;

-- 2) 기록 함수 ----------------------------------------------------------------
-- Worker 가 서비스 키로 호출합니다. 같은 (종류, IP) 가 1분 안에 이미 있으면
-- 새로 쓰지 않습니다 — 한 명이 계속 두드려도 분당 한 줄로 묶입니다.
create or replace function private.record_security_event(
  p_kind    text,
  p_method  text default null,
  p_path    text default null,
  p_ip      text default null,
  p_country text default null,
  p_ua      text default null,
  p_detail  jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare recent boolean;
begin
  if p_kind is null or p_kind = '' then return false; end if;

  select exists(
    select 1 from public.security_events e
     where e.kind = p_kind
       and coalesce(e.ip,'') = coalesce(p_ip,'')
       and e.ts > now() - interval '1 minute'
  ) into recent;
  if recent then return false; end if;

  insert into public.security_events(kind, method, path, ip, country, ua, detail)
  values (p_kind, left(p_method, 10), left(p_path, 300), left(p_ip, 60),
          left(p_country, 8), left(p_ua, 300),
          coalesce(p_detail, '{}'::jsonb));
  return true;
exception when others then
  -- 기록이 실패해도 요청 처리를 막지 않습니다.
  return false;
end;
$$;

-- 서비스 키 전용. 브라우저에서 부를 수 있으면 아무나 기록을 채워 넣습니다.
revoke all on function private.record_security_event(text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.record_security_event(text,text,text,text,text,text,jsonb) to service_role;

-- 3) 관리자 조회 : 최근 시도 목록 ----------------------------------------------
create or replace function public.admin_security_events(
  p_days  integer default 7,
  p_limit integer default 200
) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce(
    (select jsonb_agg(to_jsonb(x) order by x.ts desc)
       from (
         select e.ts, e.kind, e.method, e.path, e.ip, e.country, e.ua
           from public.security_events e
          where e.ts > now() - make_interval(days => greatest(1, least(90, p_days)))
          order by e.ts desc
          limit greatest(1, least(1000, p_limit))
       ) x), '[]'::jsonb)
  else null end;
$$;

-- 4) 관리자 조회 : 일별·종류별 집계 --------------------------------------------
create or replace function public.admin_security_summary(p_days integer default 14)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce(
    (select jsonb_agg(to_jsonb(x) order by x.day)
       from (
         select (e.ts at time zone 'Asia/Seoul')::date as day,
                e.kind,
                count(*) as n
           from public.security_events e
          where e.ts > now() - make_interval(days => greatest(1, least(90, p_days)))
          group by 1, 2
       ) x), '[]'::jsonb)
  else null end;
$$;

-- 5) 관리자 조회 : 관리자 조치 감사 로그 ----------------------------------------
-- private.admin_member_actions 는 이미 쌓이고 있는데 볼 방법이 없었습니다.
-- 누가(actor) 누구를(target) 어떻게 바꿨는지 이메일과 함께 돌려줍니다.
create or replace function public.admin_audit_log(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce(
    (select jsonb_agg(to_jsonb(x) order by x.created_at desc)
       from (
         select a.created_at, a.action, a.status, a.reason, a.details,
                actor.email  as actor_email,
                target.email as target_email
           from private.admin_member_actions a
           left join auth.users actor  on actor.id  = a.actor_user_id
           left join auth.users target on target.id = a.target_user_id
          order by a.created_at desc
          limit greatest(1, least(500, p_limit))
       ) x), '[]'::jsonb)
  else null end;
$$;

revoke all on function public.admin_security_events(integer,integer) from public, anon;
revoke all on function public.admin_security_summary(integer)        from public, anon;
revoke all on function public.admin_audit_log(integer)               from public, anon;
grant execute on function public.admin_security_events(integer,integer) to authenticated;
grant execute on function public.admin_security_summary(integer)        to authenticated;
grant execute on function public.admin_audit_log(integer)               to authenticated;

-- 6) 오래된 기록 정리 ----------------------------------------------------------
-- 90일이면 추세를 보기에 충분하고, 그 이상은 저장소만 먹습니다.
-- Supabase 대시보드의 Cron(pg_cron)에 하루 한 번 걸어 두면 좋습니다.
--   select cron.schedule('purge-security-events','0 4 * * *',
--                        $$select private.purge_security_events()$$);
create or replace function private.purge_security_events()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.security_events where ts < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.purge_security_events() from public, anon, authenticated;
grant execute on function private.purge_security_events() to service_role;

notify pgrst, 'reload schema';
commit;
