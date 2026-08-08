-- =============================================================================
-- v66 · 장부 표의 기본 권한 회수
-- -----------------------------------------------------------------------------
-- 무엇이 남아 있었나
--   Supabase 는 public 스키마에 새로 만든 표에 anon·authenticated·service_role
--   앞으로 기본 권한을 줍니다. v64·v65 는 필요한 것만 grant 했을 뿐, 그 기본
--   권한을 회수하지 않았습니다. docs/V65_CHECK.sql 6번이 그걸 잡았습니다.
--
--     delete 권한 → service_role, authenticated, postgres 에게 열려 있음
--
-- 지금 당장 새는가
--   authenticated 는 실제로는 못 지웁니다 — RLS 가 켜져 있고 delete 정책이
--   없어서 한 줄도 못 고릅니다. 문제는 service_role 입니다. RLS 를 우회하므로
--   표 권한만 남아 있으면 장부를 지울 수 있습니다.
--
--   '지울 수 있으면 추적 장부로서의 가치가 0' 이라는 것이 이 표들의 전제였고
--   (plans/transfer-docs-roadmap.md), RLS 하나에만 기대는 것은 그 전제를
--   한 겹으로만 지키는 것입니다. 권한도 함께 걷습니다.
--
-- 표마다 걷는 범위가 다릅니다
--   animal_transfers    쓰기가 전부 정의자 함수라 insert·update·delete 를 다 걷습니다.
--   animal_documents    delete 만 걷습니다. save_animal_document 가 security
--                       invoker 라(v64) 부르는 사람의 insert 권한이 필요합니다.
--                       그걸 같이 걷으면 서류를 올릴 수 없게 됩니다.
--   animal_legal_locks  트리거(정의자)만 씁니다. 셋 다 걷습니다.
--
-- ⚠️ 소유자(postgres)는 못 막습니다.
--    표 소유자는 언제든 스스로에게 다시 권한을 줄 수 있습니다. 이건 Postgres
--    구조상 그렇고, 대시보드에서 직접 지우는 것까지 막지는 못합니다.
--    확인 파일에서 postgres 가 남아 있는 것은 정상입니다.
--
-- 계정 삭제와 무관합니다
--   회원 삭제 경로는 public.animals 만 지웁니다. 이 세 표는 FK 가 없어 그대로
--   남고, 그래서 권한을 걷어도 탈퇴가 깨지지 않습니다.
--   (남는 서류를 어떻게 할지는 개인정보처리방침에서 따로 정해야 합니다.)
-- =============================================================================

do $guard$
begin
  if to_regclass('public.animal_transfers') is null then
    raise exception E'supabase_v65.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

-- 1) 양도 원장 — 쓰기가 전부 정의자 함수입니다 ---------------------------------------
revoke insert, update, delete on public.animal_transfers
  from anon, authenticated, service_role;

-- 읽기는 남깁니다. 당사자만 보이도록 RLS 정책이 걸러 줍니다(v65).
grant select on public.animal_transfers to authenticated;

-- 2) 서류 — delete 만 --------------------------------------------------------------
/* insert·update 는 남깁니다. save_animal_document 와 archive_animal_document 가
   security invoker 라 부르는 사람의 권한으로 돕니다(supabase_v64.sql).
   여기서 함께 걷으면 서류를 올리지도, 보관 처리하지도 못하게 됩니다. */
revoke delete on public.animal_documents from anon, authenticated, service_role;

-- 3) 강등 잠금 — 트리거만 씁니다 -------------------------------------------------------
revoke insert, update, delete on public.animal_legal_locks
  from anon, authenticated, service_role;

commit;


-- 확인 -----------------------------------------------------------------------
/* 표마다 걷는 범위가 다르므로 판정도 달라야 합니다. 처음 판은 anon·
   authenticated·service_role 중 하나라도 보이면 무조건 ★ 를 찍었는데, 그러면
   animal_documents 의 INSERT·UPDATE — 일부러 남긴 것 — 까지 빨간불이 됩니다.
   거짓 경보를 두면 ★ 를 무시하는 습관이 생깁니다. */
select table_name as 표, privilege_type as 권한,
       string_agg(grantee, ', ' order by grantee) as 가진_역할,
       case
         /* 서류의 쓰기는 남기는 것이 맞습니다 — save_animal_document 가
            security invoker 입니다(v64). */
         when table_name = 'animal_documents' and privilege_type in ('INSERT','UPDATE')
           then case when bool_or(grantee = 'anon')
                     then '★ anon 에게 열려 있습니다'
                     else 'OK — 일부러 남긴 권한' end
         when bool_or(grantee in ('anon','authenticated','service_role'))
           then '★ 아직 열려 있습니다'
         else 'OK'
       end as 판정
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('animal_transfers', 'animal_documents', 'animal_legal_locks')
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
 group by table_name, privilege_type
 order by table_name, privilege_type;

-- 서류 올리기가 여전히 되는지도 함께 보세요 — 2번에서 insert 를 남긴 이유입니다.
-- (개체 화면 → 법적 지위와 서류 → 서류 등록)
