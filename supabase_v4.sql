/* =============================================================================
   supabase_v4.sql — 크레스티드 게코 모프를 관리자에서 고칠 수 있게 하기
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다. supabase_v3.sql 을 먼저 돌려 두세요
   (is_admin() 함수를 씁니다. 원래는 supabase_v2.sql 에서 만들어집니다).

   ── 왜 레오파드의 morphs 테이블을 같이 못 쓰나 ──────────────────────────────
   레오파드는 유전자 하나에 상태가 셋(없음/헷/슈퍼)뿐이라 한 행에 다 들어갑니다.
   크레스티드는 그렇지 않습니다.

     · 카푸치노와 세이블은 '같은 자리'의 서로 다른 돌연변이(3대립유전자)라
       유전형이 nn/Cn/Sn/CC/SS/CS 여섯 가지이고, 각각 이름이 따로입니다
       (카푸치노·세이블·슈퍼카푸치노·슈퍼세이블·루왁).
       → 유전형마다 한 행이 필요합니다. 그래서 cr_genos 를 따로 둡니다.
     · 슈퍼릴리화이트는 치사라 부모로 고를 수 없습니다. 레오파드에는 없는 개념입니다.
     · 라인브리딩 형질은 확률 계산 대상이 아니고 그룹(베이스/패턴/구조/컬러)으로
       묶여 표시만 됩니다.

   ── 안 넣는 것 ─────────────────────────────────────────────────────────────
   유전 구조 자체(대립유전자 목록, 계산 규칙)는 컬럼으로 두지 않았습니다.
   화면에서 고쳐 잘못 넣으면 확률이 조용히 틀리게 나오는데, 그건 사용자가
   알아차릴 수 없는 종류의 오류입니다. 구조를 바꿔야 하면 crested-core.js 를
   고치고 배포하세요. 여기서 고치는 것은 이름·색·사진·표시 순서·노출 여부입니다.
   ============================================================================= */

/* ── A. 유전자 ─────────────────────────────────────────────────────────────
   kind : 'bi'  = 대립유전자 2개 (대부분)
          'multi' = 같은 자리에 돌연변이가 여럿 (카푸치노·세이블)
   type : 'incdom' 불완전우성 · 'rec' 열성 · 'dom' 우성
   proof: 'established' 검증됨 · 'partial' 부분검증 · 'contested' 논쟁중 */
create table if not exists public.cr_genes (
  id            text primary key,
  kind          text not null default 'bi',
  type          text not null default 'incdom',
  core          boolean default true,      -- 기본 노출 여부(끄면 '추가 유전자'로)
  proof         text default 'partial',
  ord           int  default 0,            -- 화면 표기 순서
  ko text, en text, ja text, zh text,
  super_ko text, super_en text, super_ja text, super_zh text,
  het_ko  text, het_en  text, het_ja  text, het_zh  text,
  no_super          boolean default false, -- 달마시안처럼 슈퍼폼이 없는 우성
  super_non_viable  boolean default false, -- 슈퍼릴리화이트: 치사 → 부모 선택 불가
  approx            boolean default false, -- 확률이 근사치임
  warn_on_super     text,                  -- 슈퍼일 때 띄울 경고 코드 (W1·W2…)
  note          jsonb,                     -- {ko,en,ja,zh} 안내문 (HTML 허용)
  color         text,                      -- 칩 대표색 #RRGGBB
  image_url     text,                      -- 실물 사진
  active        boolean default true,
  updated_at    timestamptz default now()
);

/* ── B. 유전형별 이름 (kind='multi' 전용) ─────────────────────────────────
   카푸치노·세이블처럼 한 자리에 여러 돌연변이가 있는 유전자만 씁니다.
   geno 는 crested-core.js 의 표기와 반드시 같아야 합니다(nn·Cn·Sn·CC·SS·CS). */
create table if not exists public.cr_genos (
  gene_id  text not null references public.cr_genes(id) on delete cascade,
  geno     text not null,
  token    text,                 -- 결과 표시에 쓰는 이름표 (cappuccino·luwak…)
  ko text, en text, ja text, zh text,
  warn     text,                 -- 경고 코드
  health   boolean default false,-- 건강 주의 표시
  ord      int default 0,
  primary key (gene_id, geno)
);

/* ── C. 라인브리딩(다인자) 형질 ──────────────────────────────────────────── */
create table if not exists public.cr_traits (
  id         text primary key,
  grp        text not null default 'base',  -- base · pattern · struct · color
  ko text, en text, ja text, zh text,
  fake_super boolean default false,  -- '슈퍼하이포'처럼 이름만 슈퍼인 것
  color      text,
  image_url  text,
  ord        int default 0,
  active     boolean default true,
  updated_at timestamptz default now()
);

/* ── D. 콤보(디자이너 명칭) ──────────────────────────────────────────────
   tokens 예: {cappuccino,lilly} → '프라푸치노' */
create table if not exists public.cr_combos (
  id         uuid primary key default gen_random_uuid(),
  tokens     text[] not null default '{}',
  ko text, en text, ja text, zh text,
  proof      text default 'partial',
  warn       text,
  ord        int default 0,
  active     boolean default true,
  updated_at timestamptz default now()
);

/* ── E. 접근 권한 ─────────────────────────────────────────────────────────
   계산기가 읽어야 하므로 조회는 누구나. 고치는 것은 관리자만.
   is_admin() 은 supabase_v2.sql 에서 만든 함수입니다. */
do $pol$
declare t text; p record;
begin
  /* v3 과 같은 이유로 먼저 확인합니다. 없는 채로 진행하면 표에 RLS 만 켜지고
     쓰기 정책이 안 붙어서, 관리자도 값을 못 넣는 상태가 됩니다. */
  if to_regprocedure('public.is_admin()') is null then
    raise exception E'is_admin() 함수가 없습니다.\nsupabase_v2.sql → supabase_v3.sql 순서로 먼저 실행하세요.';
  end if;

  foreach t in array array['cr_genes','cr_genos','cr_traits','cr_combos'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies
              where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t||'_read_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t||'_write_admin', t);
  end loop;
end $pol$;

/* ── F. 확인 ─────────────────────────────────────────────────────────────
   표는 비어 있는 채로 만들어집니다. 관리자 화면의 '현재 앱 목록 가져오기' 를
   누르면 지금 crested-core.js 에 들어 있는 값이 그대로 채워집니다.
   표가 비어 있는 동안에는 계산기가 내장 데이터를 그대로 씁니다. */
do $check$
declare n int;
begin
  select count(*) into n from information_schema.tables
   where table_schema='public' and table_name in ('cr_genes','cr_genos','cr_traits','cr_combos');
  raise notice '%  크레스티드 표 4개', case when n=4 then '✅' else '❌ '||n||'개만' end;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename in ('cr_genes','cr_genos','cr_traits','cr_combos');
  raise notice '%  정책 8개(표당 읽기1+쓰기1)', case when n=8 then '✅' else '❌ '||n||'개' end;
end $check$;
