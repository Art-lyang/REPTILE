-- =============================================================================
-- pg_cron 을 켠 뒤 — 예약 등록과 밀린 것 정리
-- -----------------------------------------------------------------------------
-- supabase_v13.sql 이 purge_expired 를 만들면서 매일 03:00 UTC 예약도 걸게 되어
-- 있었는데, 그때 pg_cron 이 꺼져 있어서 그 부분만 건너뛰었습니다. 함수는
-- 정상이고 예약만 없습니다.
--
-- 즉 지금까지 자동 삭제가 한 번도 돌지 않았습니다. 개인정보처리방침에 '얼마 뒤
-- 파기' 라고 적어 두고 실제로는 안 지운 상태입니다. 가입을 열기 전에 맞춰야
-- 합니다.
--
-- 그대로 실행하세요. 고칠 것 없습니다.
-- =============================================================================


-- 1) 지금 밀려 있는 양 ------------------------------------------------------------
select '지난 방문 기록'   as 항목, count(*)::text as 건수 from public.visits        where ts < now() - interval '1 year'
union all
select '지난 계산 기록',        count(*)::text from public.combo_queries where ts < now() - interval '1 year'
union all
select '기한 지난 탈퇴 동의',   count(*)::text from public.consent_archive where purge_after < current_date;


-- 2) 예약 등록 -------------------------------------------------------------------
/* v13 과 같은 내용입니다. 이미 있으면 지우고 다시 겁니다. */
do $sched$
begin
  if to_regnamespace('cron') is null then
    raise exception 'pg_cron 이 아직 안 보입니다. 대시보드에서 켠 뒤 잠시 기다렸다 다시 실행하세요.';
  end if;
  perform cron.unschedule('purge-expired')
    where exists (select 1 from cron.job where jobname = 'purge-expired');
  perform cron.schedule('purge-expired', '0 3 * * *', 'select public.purge_expired();');
  raise notice '✅ 매일 03:00 UTC (한국 낮 12시) 예약 완료';
end $sched$;


-- 3) 예약이 실제로 걸렸는지 ---------------------------------------------------------
select jobname as 이름, schedule as 주기, active as 켜짐, command as 실행문
  from cron.job
 where jobname = 'purge-expired';


-- 4) 밀린 것 한 번 비우기 ----------------------------------------------------------
/* 예약은 내일 새벽부터 돕니다. 그동안 쌓인 것은 지금 한 번 비웁니다.
   몇 건을 지웠는지 돌려줍니다. */
select public.purge_expired();


-- 5) 비워졌는지 확인 --------------------------------------------------------------
-- 세 줄 모두 0 이어야 합니다.
select '지난 방문 기록'   as 항목, count(*)::text as 남은건수 from public.visits        where ts < now() - interval '1 year'
union all
select '지난 계산 기록',        count(*)::text from public.combo_queries where ts < now() - interval '1 year'
union all
select '기한 지난 탈퇴 동의',   count(*)::text from public.consent_archive where purge_after < current_date;


-- =============================================================================
-- 다음에 확인할 것
-- -----------------------------------------------------------------------------
-- 하루 이틀 뒤에 이걸로 실제로 돌았는지 봅니다. 예약만 걸어 두고 도는지 확인
-- 안 하면, 안 도는 것을 모르는 채로 약관에 '자동 삭제' 를 적게 됩니다.
--
--   select jobid, runid, status, return_message, start_time
--     from cron.job_run_details
--    where command like '%purge_expired%'
--    order by start_time desc limit 5;
--
-- status 가 'succeeded' 여야 합니다.
-- =============================================================================
