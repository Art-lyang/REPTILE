/* =============================================================================
   supabase_v6.sql — '로그인만 하면 남의 데이터가 보이던' 구멍 막기
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   무엇이 문제였나
     supabase_setup.sql 을 만들 때 아래처럼 정책을 깔았습니다.

       create policy morphs_admin on public.morphs
         for all to authenticated using (true) with check (true);

     주석에는 '로그인한 관리자만' 이라고 적었지만, 실제로 걸린 조건은
     to authenticated — 즉 '로그인한 사람 누구나' 입니다. 관리자인지는
     보지 않습니다. 사이트는 누구나 회원가입할 수 있으므로, 아무나 가입해서
     로그인하면 그 순간 아래가 전부 가능했습니다.

       animals / pairings / clutches  다른 회원의 사육 기록 전부 조회·수정·삭제
       access_codes                   발급 코드 전부 조회·수정 (체험판 무단 발급)
       morphs / combos                모프 데이터 변조·삭제 (계산 결과가 틀어짐)

     로그인하지 않은 사람과 검색엔진 크롤러는 원래부터 막혀 있었습니다.
     문제는 '가입만 하면' 통과된다는 점이었습니다.

   왜 v3·v5 에서 안 걸렸나
     v3 은 visits·combo_queries 를, v5 는 ui_texts·update_notes 를 잠갔습니다.
     위 여섯 개 표는 두 파일 어느 쪽에도 들어 있지 않아 setup.sql 시절
     정책이 그대로 살아 있었습니다.

   고친 뒤에도 화면이 그대로 도는 이유
     브리딩 화면(gecko/breeding.html)은 표를 직접 읽지 않고 my_rows·save_row·
     delete_row 를 부릅니다. 이 함수들은 전부 security definer 라 RLS 를
     통과합니다. 계산기도 morphs·combos 를 '읽기'만 하는데 읽기는 계속
     누구에게나 열어 둡니다. 관리자 페이지는 is_admin() 을 통과하므로
     쓰기도 그대로 됩니다.

   남는 한계 (이번 범위 밖)
     사육 기록의 주인은 로그인 계정이 아니라 device 문자열입니다. 남의
     device 값을 알아내면 RPC 로 접근할 수 있습니다. 계정 기준 소유권으로
     옮기는 것은 별도 작업입니다.
   ============================================================================= */

/* ── 0. 손대기 전에 지금 상태를 찍어 둡니다 ────────────────────────────── */
select '수정 전' as 시점, tablename as 표, policyname as 정책,
       roles::text as 대상, cmd as 동작, qual as 조건
  from pg_policies
 where schemaname = 'public'
   and tablename in ('morphs','combos','access_codes',
                     'animals','pairings','clutches')
 order by tablename, policyname;


do $v6$
declare
  t text;
begin
  /* ── 1. 안전장치 ──────────────────────────────────────────────────────
     is_admin() 이 없는 상태에서 정책을 지우면, 표는 RLS 가 켜진 채 정책이
     0개가 되어 관리자까지 잠깁니다. 손대기 전에 먼저 막습니다. */
  if to_regprocedure('public.is_admin()') is null then
    raise exception E'is_admin() 함수가 없습니다.\nsupabase_v2.sql → supabase_v3.sql 을 먼저 실행하세요. 이 파일은 아무것도 바꾸지 않았습니다.';
  end if;

  /* ── 2. 모프·콤보 : 읽기는 누구나, 쓰기는 관리자만 ──────────────────
     읽기를 열어 두는 것은 의도한 것입니다. 계산기가 이 데이터를 받아
     화면을 그립니다. 로그인 없이 쓰라고 만든 서비스입니다. */
  foreach t in array array['morphs','combos'] loop
    execute format('drop policy if exists %I_read  on public.%I', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select to anon, authenticated using (true)', t, t);
    execute format(
      'create policy %I_admin on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    raise notice '%  읽기=누구나 · 쓰기=관리자', t;
  end loop;

  /* ── 3. 사육 기록 : 표 직접 접근은 관리자만 ──────────────────────────
     일반 사용자는 my_rows / save_row / delete_row 로만 접근합니다.
     그 함수들이 device 로 본인 것만 골라 주므로 남의 기록은 안 보입니다. */
  foreach t in array array['animals','pairings','clutches'] loop
    execute format('drop policy if exists %I_own   on public.%I', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format(
      'create policy %I_admin on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    raise notice '%  직접 접근=관리자만 (일반 사용자는 RPC 경유)', t;
  end loop;

  /* ── 4. 발급 코드 : 관리자만 ─────────────────────────────────────────
     익명 사용자는 redeem_code() 로만 코드를 씁니다. 그 함수도
     security definer 라 정책과 무관하게 계속 동작합니다. */
  drop policy if exists codes_admin on public.access_codes;
  create policy codes_admin on public.access_codes
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());
  raise notice 'access_codes  관리자만';

  raise notice '✅ 완료 — 6개 표 잠금';
end $v6$;


/* ── 5. 확인 ───────────────────────────────────────────────────────────
   조건(qual)에 is_admin() 이 보여야 정상입니다. 아직 true 로 남은 줄이
   있으면 그 표는 안 잠긴 것입니다. 읽기(_read)만 true 인 것은 정상입니다. */
select '수정 후' as 시점, tablename as 표, policyname as 정책,
       cmd as 동작, qual as 조건,
       case
         when policyname like '%\_read' escape '\' then '정상 (공개 읽기)'
         when qual like '%is_admin%'               then '정상 (관리자 전용)'
         else '⚠ 확인 필요'
       end as 판정
  from pg_policies
 where schemaname = 'public'
   and tablename in ('morphs','combos','access_codes',
                     'animals','pairings','clutches')
 order by tablename, policyname;
