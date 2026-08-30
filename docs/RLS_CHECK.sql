-- =============================================================================
-- RLS 점검 — Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- -----------------------------------------------------------------------------
-- 읽기만 합니다. 아무것도 바꾸지 않습니다.
--
-- 왜 필요한가 —
--   저장소의 supabase_*.sql 에는 ui_texts·update_notes·cr_* 의 RLS 선언과
--   정책이 없는데, 운영 DB 에서는 RLS 가 켜져 있습니다(INSERT 가 정책 위반으로
--   거부됨). 즉 마이그레이션 파일만 봐서는 운영 상태를 알 수 없습니다.
--
--   그리고 바깥에서 anon 키로 UPDATE·DELETE 를 시험하면, 정책이 막아서 0건인
--   경우와 정책이 허용해서 0건인 경우가 똑같이 성공(204)으로 보입니다.
--   구분하려면 실제 행을 건드려야 해서, 여기서 직접 보는 편이 안전합니다.
-- =============================================================================

-- 1) 테이블별 RLS 활성화 여부와 정책 개수
--    rls_enabled = false 인데 anon 에게 권한이 있으면 그 테이블은 무방비입니다.
select
  c.relname                                    as table_name,
  c.relrowsecurity                             as rls_enabled,
  c.relforcerowsecurity                        as rls_forced,
  count(p.polname)                             as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relrowsecurity, c.relname;

-- 2) anon / authenticated 에게 실제로 부여된 테이블 권한
--    anon 에 UPDATE·DELETE·INSERT 가 있으면 그 자체로 위험합니다.
--    (RLS 가 켜져 있어도, 정책이 넓으면 그대로 통과합니다)
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
having string_agg(privilege_type, ',') ~ '(INSERT|UPDATE|DELETE)'
order by grantee, table_name;

-- 3) 명령별 정책 목록 — 어떤 역할에게 무엇이 열려 있는지
--    cmd: r=SELECT  a=INSERT  w=UPDATE  d=DELETE  *=ALL
select
  c.relname as table_name,
  p.polname as policy,
  case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                when 'w' then 'update' when 'd' then 'delete'
                else 'all' end as command,
  coalesce(
    (select string_agg(r.rolname, ',') from pg_roles r where r.oid = any(p.polroles)),
    'PUBLIC(모든 역할)'
  ) as roles,
  pg_get_expr(p.polqual, p.polrelid)      as using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ui_texts','update_notes','morphs','combos',
                    'cr_genes','cr_genos','cr_traits','cr_combos',
                    'clutches','pairings','animals','profiles','admins')
order by c.relname, p.polname;

-- 4) 위 1~3 을 종합해 특히 확인할 것
--    ui_texts / update_notes / morphs / cr_* 에 대해
--      · anon 에게 UPDATE 나 DELETE 권한이 있는가 (2번 결과)
--      · 그 명령을 막는 정책이 있는가 (3번 결과)
--    둘 다 열려 있으면 누구나 사이트 문구와 모프 데이터를 지우거나 고칠 수 있습니다.
--
--    막는 방법 (해당될 때만):
--      revoke insert, update, delete on public.ui_texts     from anon;
--      revoke insert, update, delete on public.update_notes from anon;
--      revoke insert, update, delete on public.morphs       from anon;
--      revoke insert, update, delete on public.combos       from anon;
--      revoke insert, update, delete on public.cr_genes, public.cr_genos,
--                                        public.cr_traits, public.cr_combos from anon;
--    읽기(select)는 계산기가 로그인 없이 써야 하므로 그대로 둡니다.
