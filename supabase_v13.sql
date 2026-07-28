/* =============================================================================
   supabase_v13.sql — 보관기간이 지난 기록 자동 삭제
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v8.sql 이 먼저 적용돼 있어야 합니다 (is_owner()).

   ---------------------------------------------------------------------------
   왜 필요한가
   ---------------------------------------------------------------------------
   개인정보처리방침에 이렇게 적어 두었습니다.

     접속 기록          수집일로부터 1년
     동의 기록          회원 탈퇴 후 5년

   그런데 지우는 장치가 없었습니다. consent_archive 에 purge_after 날짜를
   적어 두기만 하고, 그 날이 지나도 아무 일도 일어나지 않았습니다.

   약속한 기간보다 오래 갖고 있는 상태입니다. '적어만 두고 안 지우는' 것은
   보관기간을 안 지키는 것과 같습니다.

   ---------------------------------------------------------------------------
   무엇을 지우나
   ---------------------------------------------------------------------------
     visits           ts 가 1년보다 오래된 것
     combo_queries    ts 가 1년보다 오래된 것
     consent_archive  purge_after 날짜가 지난 것

   지우는 것은 개별 기록입니다. 통계가 통째로 사라지지 않게, 아래 6번에서
   날짜별 합계를 미리 요약해 두는 표를 함께 만듭니다. 원본이 지워져도
   '몇 년 몇 월에 몇 명이 왔는지' 는 남습니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regprocedure('public.is_owner()') is null then
    raise exception E'is_owner() 함수가 없습니다.\nsupabase_v8.sql 을 먼저 실행하세요. 이 파일은 아무것도 바꾸지 않았습니다.';
  end if;
end $guard$;


/* ── 1. 지우기 전에 요약을 남겨 둡니다 ───────────────────────────────────
   접속 기록을 1년 뒤에 지우면 '작년 이맘때 얼마나 왔었나' 를 영영 알 수
   없게 됩니다. 개인을 식별할 수 있는 device 는 빼고 숫자만 남깁니다.
   이 표는 개인정보가 아니라 통계라 보관기간 제한을 받지 않습니다. */
create table if not exists public.visit_monthly (
  ym        text not null,              -- '2026-07'
  service   text not null,
  client    text not null,              -- human | bot | ai
  country   text not null default '??', -- 비었으면 '??' 로 통일 (기본키에 넣기 위해)
  visits    int  not null default 0,
  devices   int  not null default 0,    -- 순 방문자 수 (기기 값 자체는 저장하지 않습니다)
  updated_at timestamptz default now(),
  primary key (ym, service, client, country)
);
alter table public.visit_monthly enable row level security;
drop policy if exists vm_owner on public.visit_monthly;
create policy vm_owner on public.visit_monthly
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());


/* ── 2. 요약 갱신 ────────────────────────────────────────────────────────
   최근 두 달을 다시 계산해 덮어씁니다. 이번 달은 아직 늘어나는 중이고,
   지난달도 월말 직후에 늦게 들어온 기록이 있을 수 있습니다. */
create or replace function public.roll_up_visits()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with src as (
    select to_char(ts, 'YYYY-MM')            as ym,
           coalesce(service, 'gecko')        as service,
           coalesce(client, 'human')         as client,
           coalesce(country, '??')           as country,
           count(*)                          as visits,
           count(distinct device)            as devices
      from public.visits
     where ts >= date_trunc('month', now()) - interval '1 month'
     group by 1, 2, 3, 4
  )
  insert into public.visit_monthly (ym, service, client, country, visits, devices, updated_at)
  select ym, service, client, country, visits, devices, now() from src
  on conflict (ym, service, client, country) do update
    set visits = excluded.visits,
        devices = excluded.devices,
        updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;


/* ── 3. 삭제 ─────────────────────────────────────────────────────────────
   요약을 먼저 갱신한 뒤에 지웁니다. 순서가 바뀌면 이번 달 숫자가
   요약에 들어가기 전에 사라질 수 있습니다. */
create or replace function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v int := 0; c int := 0; a int := 0;
begin
  perform public.roll_up_visits();

  delete from public.visits where ts < now() - interval '1 year';
  get diagnostics v = row_count;

  delete from public.combo_queries where ts < now() - interval '1 year';
  get diagnostics c = row_count;

  begin
    delete from public.consent_archive where purge_after < current_date;
    get diagnostics a = row_count;
  exception when undefined_table then a := 0;
  end;

  return jsonb_build_object('visits', v, 'combo_queries', c, 'consent_archive', a,
                            'at', now());
end $$;

revoke all on function public.purge_expired()   from public;
revoke all on function public.roll_up_visits()  from public;
grant execute on function public.purge_expired()  to authenticated;
grant execute on function public.roll_up_visits() to authenticated;


/* ── 4. 매일 자동 실행 ───────────────────────────────────────────────────
   pg_cron 이 켜져 있으면 매일 새벽 3시(UTC)에 돌립니다.
   꺼져 있으면 그 사실만 알려주고 넘어갑니다 — 확장 설치는 대시보드에서
   해야 하고, 여기서 실패하면 위에 만든 함수까지 취소되기 때문입니다. */
do $sched$
begin
  if to_regnamespace('cron') is null then
    raise notice '⚠ pg_cron 이 없습니다. 아래 5번을 읽고 켜 주세요. 함수는 정상적으로 만들어졌습니다.';
    return;
  end if;
  perform cron.unschedule('purge-expired')
    where exists (select 1 from cron.job where jobname = 'purge-expired');
  perform cron.schedule('purge-expired', '0 3 * * *', 'select public.purge_expired();');
  raise notice '✅ 매일 03:00 UTC (한국 낮 12시) 자동 삭제 예약';
exception when others then
  raise notice '⚠ 예약 실패: % — 5번을 읽어 주세요. 함수는 정상입니다.', sqlerrm;
end $sched$;


/* ── 5. pg_cron 이 없다고 나왔다면 ───────────────────────────────────────
   Supabase 대시보드 → Database → Extensions 에서 pg_cron 을 켠 뒤
   이 파일을 다시 실행하세요.

   켜기 싫으시면 아래 한 줄을 가끔(한 달에 한 번 정도) 직접 실행해도
   됩니다. 결과로 몇 건 지웠는지 알려줍니다.

     select public.purge_expired();
   ============================================================================ */


/* ── 6. 지금 한 번 돌려서 상태 확인 ─────────────────────────────────────
   처음 실행하면 대개 0건입니다. 서비스를 시작한 지 1년이 안 됐기
   때문입니다. 오류 없이 0 이 나오면 정상입니다. */
select public.purge_expired() as 삭제결과;

select '남은 기록' as 구분, 'visits' as 표, count(*) as 건수,
       min(ts)::date as 가장_오래된
  from public.visits
union all
select '남은 기록', 'combo_queries', count(*), min(ts)::date from public.combo_queries;

select '월별 요약' as 구분, ym as 월, service as 서비스, client as 종류,
       coalesce(country,'??') as 국가, visits as 접속, devices as 순방문
  from public.visit_monthly
 order by ym desc, visits desc
 limit 20;
