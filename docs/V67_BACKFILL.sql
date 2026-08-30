-- =============================================================================
-- v67 뒤처리 — 이미 동의한 6명의 '판' 을 채웁니다
-- -----------------------------------------------------------------------------
-- ⚠️ v67 파일 맨 아래 주석의 UPDATE 는 쓰지 마세요.
--    그건 세 문서를 모두 v1 로 찍는데, v1 은 가입 오픈에 맞춰 새로 쓸 문구입니다.
--    아직 존재하지도 않는 문구에 동의한 것으로 만들어 버립니다.
--
--    지금 6명은 관리자 외에는 전부 테스터 계정이라 법적 위험은 없습니다. 그래도
--    v0 으로 적는 이유는, 그게 사실이기 때문입니다 — 판을 남기는 목적 자체가
--    '누가 어느 문구에 동의했는가' 인데, 모르는 것을 v1 이라고 채우면 v67 을
--    넣은 의미가 그 자리에서 사라집니다.
--
-- 가입을 열기 전에 한 가지 더
--   테스터 계정을 그대로 두면 admin_consent_stale() 이 계속 재동의 대상으로
--   잡고, 회원 수도 6명에서 시작합니다. 오픈 전에 정리해 두면 그 목록과 숫자가
--   실제 회원만 담습니다. 관리자 화면의 회원 삭제로 지우면 됩니다.
--
-- ⚠️ AI 학습 동의는 채우지 않습니다.
--    지금 약관의 AI 조항은 '인공지능 모델 학습' 이라고만 되어 있습니다. 앞으로
--    쓸 문구는 목적이 구체적으로 달라집니다 — 교배 예상 해칭 개체를 이미지로
--    보여 주는 기능, 그리고 내 사진이 다른 회원의 예시 이미지에 영향을 준다는
--    사실. 목적이 바뀌면 새 동의가 필요합니다. 옛 동의를 새 문구에 옮겨 붙이는
--    것은 동의를 받은 것이 아닙니다.
--
--    v0 으로 남겨 두면 admin_consent_stale() 이 이 6명을 재동의 대상으로
--    잡아 줍니다. 그게 정확한 상태입니다.
--
-- ✅ 이 파일은 rollback 하지 않습니다. 실제로 값을 채웁니다.
--    먼저 1부만 돌려 대상을 확인하고, 맞으면 2부를 도세요.
-- =============================================================================


-- ##############################################################################
-- 1부 — 누구를 채우는지 먼저 봅니다 (읽기 전용)
-- ##############################################################################

select p.email,
       p.agree_terms   as 약관, p.terms_version    as 약관판,
       p.agree_privacy as 처리방침, p.privacy_version as 처리방침판,
       p.agree_ai_train as AI학습, p.ai_train_version as AI판,
       p.consent_at::date as 동의일
  from public.profiles p
 where (p.agree_terms    and p.terms_version    is null)
    or (p.agree_privacy  and p.privacy_version  is null)
    or (p.agree_ai_train and p.ai_train_version is null)
 order by p.consent_at;


-- ##############################################################################
-- 2부 — 위 목록이 맞으면 실행
-- ##############################################################################

begin;

-- 1) '가입 오픈 이전 문구' 를 판으로 등록합니다.
insert into public.consent_versions (doc, version, effective, note) values
  ('terms',   'v0', '2020-01-01', '가입 오픈 이전 문구 — 소급 표기용'),
  ('privacy', 'v0', '2020-01-01', '가입 오픈 이전 문구 — 소급 표기용')
on conflict (doc, version) do nothing;

-- 2) 약관·처리방침만 v0 으로. AI 는 건드리지 않습니다.
/* profiles_guard 가 동의 칼럼 직접 수정을 막습니다(v14). 판 칸은 그 대상이
   아니지만, 트리거가 함께 볼 수도 있으므로 정당한 경로 표시를 남깁니다. */
select set_config('app.consent_write', '1', true);

update public.profiles
   set terms_version   = case when agree_terms   then 'v0' else null end,
       privacy_version = case when agree_privacy then 'v0' else null end
 where terms_version is null or privacy_version is null;

-- 3) 결과 확인
select 'v0 로 표기된 회원' as 검사, count(*)::text || '명' as 값
  from public.profiles where terms_version = 'v0'
union all
select 'AI 동의는 있는데 판이 없는 회원 (재동의 대상)',
       count(*)::text || '명'
  from public.profiles where agree_ai_train and ai_train_version is null
union all
select '판 없이 동의한 회원 (0 이어야 정상)',
       count(*)::text || '명'
  from public.profiles
 where (agree_terms and terms_version is null)
    or (agree_privacy and privacy_version is null);

commit;


-- =============================================================================
-- 이후
-- -----------------------------------------------------------------------------
-- · 새 약관 문구가 확정되면 consent_versions 의 v1 effective 를 그날로 맞추세요.
--   그 순간부터 admin_consent_stale() 이 v0 회원 전원을 재동의 대상으로 냅니다.
--
-- · AI 학습은 애초에 판이 없으므로, 새 문구가 뜨면 그 6명에게 처음부터 다시
--   묻는 것이 맞습니다. 동의하지 않아도 기존 기능은 그대로 쓸 수 있어야 합니다.
-- =============================================================================
