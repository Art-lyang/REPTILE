/* =============================================================================
   supabase_v3.sql — 방문자 종류(사람/수집기) 기록 + 서비스별 통계
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   이미 있는 것은 건드리지 않으므로 여러 번 실행해도 괜찮습니다.

   이걸 실행하기 전에도 사이트는 정상 동작합니다. assets/analytics.js 가
   컬럼이 없으면 그 값만 빼고 다시 넣도록 되어 있어서, 실행 전에는 종류 구분
   없이 기록되고 실행 후부터 구분이 쌓입니다.
   ============================================================================= */

/* ── A. visits 에 컬럼 추가 ────────────────────────────────────────────────
   client : 'human' | 'bot' | 'ai'
   ua     : User-Agent 원문 (판별이 틀렸을 때 되짚어보기 위함)
   service: 어느 도구인지. v2 에서 이미 넣었지만 없을 수도 있어 함께 둡니다. */
alter table public.visits add column if not exists client  text;
alter table public.visits add column if not exists ua      text;
alter table public.visits add column if not exists service text default 'gecko';

/* 값이 없는 예전 기록은 사람으로 봅니다. 수집기 구분이 없던 시절 데이터라
   지금 와서 다시 판별할 방법이 없습니다. */
update public.visits set client = 'human' where client is null;

/* 통계 화면이 매번 훑는 조건이라 인덱스를 둡니다. */
create index if not exists visits_service_day_idx on public.visits (service, day);
create index if not exists visits_client_idx      on public.visits (client);

/* ── B. combo_queries 에도 service ───────────────────────────────────────── */
alter table public.combo_queries add column if not exists service text default 'gecko';
create index if not exists combo_queries_service_idx on public.combo_queries (service);

/* ── C. 서비스별 인기 조합 ────────────────────────────────────────────────
   기존 top_combos 뷰는 서비스 구분이 없어서 레오파드와 크레스티드가 섞입니다.
   원본 뷰는 그대로 두고(다른 화면이 쓰고 있을 수 있음) 새 뷰를 추가합니다. */
create or replace view public.top_combos_by_service as
  select service, ckey, max(label) as label, count(*) as cnt
    from public.combo_queries
   group by service, ckey
   order by cnt desc;

/* ── D. 일자·서비스·종류별 접속 집계 ──────────────────────────────────────
   관리자 화면에서 이걸 한 번 읽어 그래프를 그립니다. 행 수천 개를 내려받아
   브라우저에서 세는 것보다 훨씬 가볍습니다. */
create or replace view public.visit_stats as
  select day,
         coalesce(service, 'gecko')  as service,
         coalesce(client,  'human')  as client,
         count(*)                    as cnt,
         count(distinct device)      as uniq
    from public.visits
   group by day, coalesce(service,'gecko'), coalesce(client,'human');

/* 뷰는 기본적으로 만든 사람 권한으로 도는데, 관리자만 읽어야 합니다.
   visits 자체가 RLS 로 막혀 있으면 security_invoker 로 그 정책을 그대로 탑니다. */
alter view public.top_combos_by_service set (security_invoker = on);
alter view public.visit_stats           set (security_invoker = on);

/* ── E. 통계 테이블 잠그기 ⚠️ ─────────────────────────────────────────────
   작업 중에 확인한 문제입니다. 브라우저에서 anon 키만 가지고
     await SB.from('visits').delete().eq('device', '...')
   를 실행했더니 그대로 지워졌습니다. 즉 사이트에 접속한 누구나 접속 기록을
   삭제할 수 있는 상태였습니다. 통계는 넣기만 하면 되고, 읽기·수정·삭제는
   관리자만 해야 합니다.

   아래는 기존 정책을 모두 걷어내고 필요한 것만 다시 답니다. */
-- 기존 정책 제거
do $drop_pol$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
     where schemaname='public' and tablename in ('visits','combo_queries')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $drop_pol$;

alter table public.visits        enable row level security;
alter table public.combo_queries enable row level security;

-- 누구나 '넣기'만 가능 (통계 수집)
create policy visits_insert_anyone on public.visits
  for insert to anon, authenticated with check (true);
create policy combo_insert_anyone on public.combo_queries
  for insert to anon, authenticated with check (true);

-- 읽기는 관리자만. is_admin() 은 supabase_v2.sql 에서 만든 함수입니다.
create policy visits_select_admin on public.visits
  for select to authenticated using (public.is_admin());
create policy combo_select_admin on public.combo_queries
  for select to authenticated using (public.is_admin());

-- 수정·삭제 정책은 만들지 않습니다. RLS 가 켜져 있으면 정책 없는 동작은 전부 거부입니다.

/* ── F. 확인 ──────────────────────────────────────────────────────────── */
do $check$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='visits' and column_name in ('client','ua','service');
  raise notice '%  visits 컬럼 3개(client/ua/service)', case when n=3 then '✅' else '❌ '||n||'개만' end;

  select count(*) into n from information_schema.views
   where table_schema='public' and table_name in ('top_combos_by_service','visit_stats');
  raise notice '%  뷰 2개(top_combos_by_service/visit_stats)', case when n=2 then '✅' else '❌ '||n||'개만' end;
end $check$;
