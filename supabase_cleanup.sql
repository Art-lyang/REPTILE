/* =============================================================================
   supabase_cleanup.sql — 검증용으로 넣은 시험 데이터 지우기
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다. 지울 게 없으면 0건이라고만 알려줍니다.

   왜 남았나 — supabase_v3.sql 을 적용한 뒤 '익명이 접속 기록을 지울 수 있던
   문제' 가 정말 막혔는지 확인하려고 브라우저에서 시험용 행을 넣고 지워봤습니다.
   삭제가 정상적으로 차단되는 것을 확인했는데, 그 바람에 넣어둔 행도 익명으로는
   못 지우게 됐습니다. 관리자 권한이 있는 이 창에서 정리하면 됩니다.

   지우는 것 — 아래 이름이 붙은 것만 지웁니다. 실제 방문 기록은 건드리지 않습니다.
     visits.device  : __probe_ins__, __probe2__, __colprobe__, dev_selftest
     combo_queries  : ckey = '__probe__'
     ui_texts       : key  = '__probe__'   (있을 경우)
   ============================================================================= */

do $cleanup$
declare
  n_visits int := 0;
  n_combo  int := 0;
  n_text   int := 0;
begin
  /* ── 지우기 전에 몇 건인지 먼저 세어 둡니다 ── */
  select count(*) into n_visits from public.visits
   where device like '\_\_probe%' escape '\'
      or device like '\_\_colprobe%' escape '\'
      or device = 'dev_selftest';

  select count(*) into n_combo from public.combo_queries
   where ckey like '\_\_probe%' escape '\';

  begin
    select count(*) into n_text from public.ui_texts
     where key like '\_\_probe%' escape '\';
  exception when undefined_table then n_text := 0;
  end;

  raise notice '지울 대상 — visits %건 · combo_queries %건 · ui_texts %건',
               n_visits, n_combo, n_text;

  /* ── 실제 삭제 ── */
  delete from public.visits
   where device like '\_\_probe%' escape '\'
      or device like '\_\_colprobe%' escape '\'
      or device = 'dev_selftest';

  delete from public.combo_queries
   where ckey like '\_\_probe%' escape '\';

  begin
    delete from public.ui_texts where key like '\_\_probe%' escape '\';
  exception when undefined_table then null;
  end;

  raise notice '✅ 정리 완료';
end $cleanup$;

/* ── 확인 — 0 이어야 정상 ─────────────────────────────────────────────── */
select 'visits'        as 표, count(*) as 남은_시험데이터
  from public.visits
 where device like '\_\_probe%' escape '\'
    or device like '\_\_colprobe%' escape '\'
    or device = 'dev_selftest'
union all
select 'combo_queries', count(*)
  from public.combo_queries
 where ckey like '\_\_probe%' escape '\';
