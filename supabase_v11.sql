/* =============================================================================
   supabase_v11.sql — 어디서 들어왔는지 기록하기 (유입 경로 · 국가)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v8.sql 이 먼저 적용돼 있어야 합니다 (is_owner()).

   ---------------------------------------------------------------------------
   무엇을 남기고 무엇을 안 남기나
   ---------------------------------------------------------------------------
     ref_kind   search(검색) · sns · site(다른 사이트) · direct(직접) · internal
     ref_host   들어온 곳의 호스트만. 예: www.google.com
     ref_name   화면에 보여줄 이름. 예: 구글 · 인스타그램
     country    2글자 국가 코드. 예: KR

   주소 전체(경로·검색어 포함)는 남기지 않습니다. 검색 결과에서 들어오면
   전체 주소에 방문자가 뭘 검색했는지가 담기는데, 그걸 우리가 들고 있을
   이유가 없습니다. 호스트만으로 '구글에서 왔다'는 충분히 알 수 있습니다.

   국가는 Cloudflare 의 /cdn-cgi/trace 에서 가져옵니다. 같은 응답에 IP 도
   들어 있지만 국가만 꺼내 씁니다. IP 는 개인정보라 저장하지 않습니다.

   ---------------------------------------------------------------------------
   숫자를 볼 때 알아야 할 것
   ---------------------------------------------------------------------------
   '직접'은 항상 실제보다 많이 잡힙니다. 카카오톡·인스타 같은 앱 안에서 열면
   브라우저가 referrer 를 안 넘기고, https 에서 http 로 갈 때도 안 넘깁니다.
   그런 방문이 전부 '직접'으로 떨어집니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regprocedure('public.is_owner()') is null then
    raise exception E'is_owner() 함수가 없습니다.\nsupabase_v8.sql 을 먼저 실행하세요. 이 파일은 아무것도 바꾸지 않았습니다.';
  end if;
end $guard$;


/* ── 1. 칼럼 추가 ────────────────────────────────────────────────────────
   전부 nullable 입니다. 이 SQL 을 넣기 전에 쌓인 기록과, 국가 조회가 실패한
   방문은 비어 있게 됩니다. 화면에서 '알 수 없음'으로 묶어 보여줍니다. */
alter table public.visits add column if not exists ref_kind text;
alter table public.visits add column if not exists ref_host text;
alter table public.visits add column if not exists ref_name text;
alter table public.visits add column if not exists country  text;

create index if not exists visits_ref_idx     on public.visits (ref_kind, ts desc);
create index if not exists visits_country_idx on public.visits (country, ts desc);


/* ── 2. 집계 뷰 ──────────────────────────────────────────────────────────
   security_invoker = 조회하는 사람 권한으로 실행됩니다. 즉 visits 에 걸린
   정책(최고관리자만 조회)이 그대로 적용됩니다. 뷰를 만들었다고 해서 아무나
   볼 수 있게 되지 않습니다.

   internal(사이트 내부 이동)은 유입이 아니므로 뺍니다. 이걸 세면 계산기끼리
   오간 것이 전부 유입으로 잡혀 숫자가 의미를 잃습니다.
   client='human' 만 셉니다. 수집기는 유입 경로를 논할 대상이 아닙니다. */
create or replace view public.visit_sources
  with (security_invoker = true) as
  select
    coalesce(service, 'gecko')            as service,
    coalesce(ref_kind, 'unknown')         as ref_kind,
    coalesce(ref_name, ref_host, '알 수 없음') as ref_name,
    ref_host,
    ts,
    device
  from public.visits
  where coalesce(client, 'human') = 'human'
    and coalesce(ref_kind, '') <> 'internal';

create or replace view public.visit_countries
  with (security_invoker = true) as
  select
    coalesce(service, 'gecko')  as service,
    coalesce(country, '??')     as country,
    ts,
    device
  from public.visits
  where coalesce(client, 'human') = 'human';


/* ── 3. 확인 ─────────────────────────────────────────────────────────────
   지금까지 쌓인 기록에는 새 칼럼이 비어 있는 게 정상입니다.
   이 SQL 을 넣고 사이트를 배포한 뒤부터 채워집니다. */
select '유입 경로' as 구분,
       coalesce(ref_kind, '(아직 없음)') as 종류,
       count(*) as 건수
  from public.visits
 group by 1, 2
 order by 3 desc
 limit 20;

select '국가' as 구분,
       coalesce(country, '(아직 없음)') as 코드,
       count(*) as 건수
  from public.visits
 group by 1, 2
 order by 3 desc
 limit 20;
