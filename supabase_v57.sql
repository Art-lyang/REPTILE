-- =============================================================================
-- v57 — 익명 사용자에게 열려 있던 쓰기 권한 회수
-- -----------------------------------------------------------------------------
-- 무엇이 잘못돼 있었나
--   public 스키마의 표들에 anon(로그인하지 않은 익명 역할)이
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   를 전부 갖고 있었습니다. 계산기가 모프·문구 표를 로그인 없이 읽어야 해서
--   SELECT 는 필요하지만, 나머지는 있을 이유가 없습니다.
--
--   지금 당장 뚫려 있다는 뜻은 아닙니다. INSERT 는 RLS 정책이 막는 것을
--   확인했습니다("new row violates row-level security policy"). 다만 이건
--   권한이 아니라 정책 하나에만 기대고 있는 상태입니다. 정책을 하나라도
--   잘못 만들거나, 나중에 편의를 위해 using(true) 를 넣는 순간 곧바로
--   열립니다.
--
--   TRUNCATE 는 특히 위험합니다. PostgreSQL 에서 RLS 정책은 SELECT·INSERT·
--   UPDATE·DELETE 에만 적용되고 TRUNCATE 에는 적용되지 않습니다. 즉 정책이
--   아무리 잘 짜여 있어도 TRUNCATE 권한을 가진 역할은 표를 통째로 비울 수
--   있습니다. (PostgREST 가 TRUNCATE 를 노출하지 않아 anon 키만으로는 부르기
--   어렵지만, 권한으로 막는 편이 맞습니다)
--
-- 이 변경으로 깨지는 것이 있나
--   없습니다. 화면이 표를 직접 고치는 것은 전부 로그인한 관리자(authenticated)
--   이고, 로그인하지 않은 사람의 기록(기기 기반)은 save_row·delete_row 같은
--   security definer 함수를 지나갑니다. 그 함수들은 호출 권한만 있으면 되고
--   표 권한은 필요하지 않습니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- =============================================================================

begin;

-- 1) public 스키마의 모든 표에서 anon 의 쓰기 권한을 회수합니다.
--    SELECT 는 건드리지 않습니다 — 계산기가 로그인 없이 읽어야 합니다.
--    표를 하나씩 적지 않는 이유: 지금 8개만 보고 고치면, 나중에 만든 표가
--    같은 상태로 또 열립니다.
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon',
      r.relname);
  end loop;
end $$;

-- 2) 앞으로 만들 표에도 같은 규칙이 적용되게 합니다.
--    이걸 빼면 표를 새로 만들 때마다 사람이 기억해서 회수해야 합니다.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;

commit;

-- =============================================================================
-- 확인 — 아래를 실행했을 때 결과가 비어 있어야 정상입니다.
-- (SELECT 만 남았는지 보는 것이라, 한 줄도 안 나오면 성공입니다)
--
-- PUBLIC 도 함께 봅니다. PUBLIC 에 준 권한은 모든 역할에 적용되므로,
-- anon 에서만 회수하고 PUBLIC 에 남아 있으면 익명 사용자가 그대로 씁니다.
-- -----------------------------------------------------------------------------
-- select table_name, grantee,
--        string_agg(privilege_type, ', ' order by privilege_type) as 남은_쓰기권한
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and grantee in ('anon', 'PUBLIC')
--    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
--  group by table_name, grantee
--  order by grantee, table_name;
--
-- 되돌리기 (필요할 때만)
--   특정 표만 다시 열려면:
--     grant insert, update, delete on public.표이름 to anon;
--   전부 되돌릴 일은 없어야 합니다 — 익명 사용자가 표를 직접 고칠 이유가
--   없기 때문입니다. 로그인하지 않은 기록은 save_row 함수가 처리합니다.
-- =============================================================================
