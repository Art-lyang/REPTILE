/* =============================================================================
   supabase_v24.sql — 탈퇴할 때 실제로 다 지워지게 (사진 파일 · 먹이 품목)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ---------------------------------------------------------------------------
   왜 필요한가 — 지금은 방침에 적힌 말이 사실이 아닙니다
   ---------------------------------------------------------------------------
   개인정보처리방침의 파기 표에 이렇게 적혀 있습니다.

     "등록한 개체·페어링·클러치 정보 및 사진 … 탈퇴 즉시 복구 불가능하게 삭제"

   그런데 delete_my_account() 는 데이터베이스의 행만 지웁니다.

     · 사진 파일  — Storage 의 morph-images 버킷에 그대로 남습니다.
                    이 버킷은 public 이고 읽기 정책이 '누구나' 입니다.
                    즉 주소를 아는 사람은 탈퇴 뒤에도 계속 볼 수 있습니다.
     · feed_items — 먹이·간식 품목(상품명, 브랜드, 메모, 구매 주소)은
                    user_id 로 묶여 있는데 삭제 대상에 빠져 있었습니다.
                    auth.users 가 지워지면 주인 없는 행으로 남습니다.

   방침 문구를 실제에 맞춰 낮추는 방법도 있지만, 지우는 쪽이 맞습니다.
   그래서 코드를 고칩니다.

   ---------------------------------------------------------------------------
   사진 파일을 어떻게 찾아 지우나
   ---------------------------------------------------------------------------
   care/care-app.js 이 이렇게 올립니다.

       const path = 'a/' + ('u_' + USER.id).replace(/[^\w-]/g, '')
                    + '_' + Date.now() + '_' + rand + '.jpg';

   즉 개체 사진은 전부  a/u_<사용자 uuid>_...  입니다. 이 접두사로 지웁니다.
   관리자가 올리는 모프 이미지는 m/ 로 시작하므로 걸리지 않습니다.

   ⚠️ 접두사 규칙이 바뀌면 이 함수도 같이 고쳐야 합니다. 안 고치면 조용히
      아무것도 안 지우고, 방침은 다시 사실과 어긋납니다.

   ---------------------------------------------------------------------------
   실패하면 일부러 시끄럽게 터뜨립니다
   ---------------------------------------------------------------------------
   storage.objects 삭제 권한이 없으면 예외를 잡아 넘기고 싶어지지만,
   그러면 "지웠다" 고 답해놓고 사진은 남습니다. 개인정보에서 이건 조용한
   실패가 제일 나쁩니다. 그래서 감싸지 않습니다 — 실패하면 탈퇴 전체가
   롤백되고 오류가 보입니다. 그때 권한을 고치고 다시 하세요.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception E'animals 표가 없습니다.\nsupabase_setup.sql 을 먼저 실행하세요.';
  end if;
  if to_regclass('public.feed_items') is null then
    raise exception E'feed_items 표가 없습니다.\nsupabase_v20.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 탈퇴 함수 교체 ───────────────────────────────────────────────────
   기존 동작(동의 기록 익명 보존 · 개체/페어링/클러치 삭제 · 코드 회수 ·
   프로필 삭제 · 인증 계정 삭제)은 그대로 두고, 빠져 있던 두 가지를
   추가합니다. care_plans·care_records·weight_logs 는 animals 에
   on delete cascade 로 걸려 있어 따로 지우지 않아도 같이 사라집니다. */
create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        dev text;
        p   public.profiles;
        n_photo int := 0;
        n_feed  int := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  dev := 'u_' || uid::text;

  -- 1) 동의 기록을 익명화해 보존 (법정 5년)
  select * into p from public.profiles where user_id = uid;
  if found then
    insert into public.consent_archive
      (user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
       agree_mkt_email, agree_mkt_sms, consent_at, purge_after)
    values
      (md5(uid::text || '|reptile-withdrawn'),
       p.agree_terms, p.agree_privacy, p.agree_age14, p.agree_third,
       p.agree_mkt_email, p.agree_mkt_sms, p.consent_at,
       (now() + interval '5 years')::date);
  end if;

  /* 2) 사진 파일 — 데이터베이스 행보다 먼저 지웁니다.
        행을 먼저 지우면 어떤 파일이 이 사람 것인지 알 수 없게 되지는
        않지만(경로에 uuid 가 들어 있음), 순서를 이렇게 두면 파일 삭제가
        실패했을 때 아무것도 지워지지 않은 채로 멈춥니다. */
  delete from storage.objects
   where bucket_id = 'morph-images'
     and name like 'a/u\_' || uid::text || '\_%';
  get diagnostics n_photo = row_count;

  -- 3) 사용자 데이터 삭제
  delete from public.clutches where device = dev;
  delete from public.pairings where device = dev;
  delete from public.animals  where device = dev;   -- care_* 는 cascade 로 따라감

  delete from public.feed_items where user_id = uid;
  get diagnostics n_feed = row_count;

  -- 4) 프리미엄 코드 연결 해제 (코드 자체는 재사용 불가로 남김)
  update public.access_codes set revoked = true where redeemed_by = dev;

  -- 5) 프로필(신원정보) 삭제
  delete from public.profiles where user_id = uid;

  -- 6) 인증 계정 삭제
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true, 'photos_deleted', n_photo,
                            'feed_items_deleted', n_feed);
end $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;


/* ── 2. 확인 ─────────────────────────────────────────────────────────────
   함수가 두 가지를 실제로 지우는지 본문에서 확인합니다.
   둘 다 true 여야 합니다. */
select '사진 파일 삭제 포함' as 항목,
       (prosrc like '%storage.objects%') as 결과
  from pg_proc where proname = 'delete_my_account'
union all
select '먹이 품목 삭제 포함',
       (prosrc like '%feed_items%')
  from pg_proc where proname = 'delete_my_account';

/* 남아 있는 주인 없는 먹이 품목 — 이번 수정 전에 탈퇴한 사람이 있었다면
   0 이 아닐 수 있습니다. 0 이 아니면 아래 주석의 정리 구문을 쓰세요. */
select '주인 없는 먹이 품목' as 항목, count(*) as 건수
  from public.feed_items f
 where not exists (select 1 from auth.users u where u.id = f.user_id);

/* 정리가 필요하면 이 줄의 주석을 풀고 실행하세요.
   지금은 가입을 막아둔 상태라 보통 0 입니다.
delete from public.feed_items f
 where not exists (select 1 from auth.users u where u.id = f.user_id);
*/

/* 주인 없는 개체 사진 — 마찬가지로 이전 탈퇴자의 잔여 파일입니다.
   경로에서 uuid 를 뽑아 auth.users 에 없는 것을 셉니다. */
select '주인 없는 개체 사진' as 항목, count(*) as 건수
  from storage.objects o
 where o.bucket_id = 'morph-images'
   and o.name like 'a/u\_%'
   and not exists (
     select 1 from auth.users u
      where o.name like 'a/u\_' || u.id::text || '\_%');
