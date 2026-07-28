/* =============================================================================
   supabase_v5.sql — 업데이트 노트와 안내 문구를 관리자에서 고칠 수 있게 하기
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다. v3 을 먼저 돌려 두어야 합니다(is_admin() 사용).

   지금까지 모프·콤보는 관리자에서 고칠 수 있었지만, 문구는 코드에 박혀 있어
   한 줄 고치는 데도 배포가 필요했습니다. 이 두 표가 그걸 없앱니다.

   표가 비어 있으면 계산기는 코드에 있는 기본 문구를 그대로 씁니다.
   즉 이 파일을 실행하기 전에도, 실행 후 아무것도 안 넣어도 화면은 그대로입니다.
   ============================================================================= */

/* ── A. 업데이트 노트 ──────────────────────────────────────────────────────
   kind : 'done' 업데이트 됨 · 'soon' 업데이트 예정
   한 줄이 목록의 한 항목입니다. <b> 같은 간단한 태그를 써도 됩니다. */
create table if not exists public.update_notes (
  id         uuid primary key default gen_random_uuid(),
  service    text not null,                    -- 'gecko' | 'crested'
  kind       text not null default 'done',
  ko text, en text, ja text, zh text,
  ord        int default 0,
  active     boolean default true,
  updated_at timestamptz default now()
);
create index if not exists update_notes_svc_idx on public.update_notes (service, kind, ord);

/* ── B. 안내 문구 ─────────────────────────────────────────────────────────
   key 는 코드의 번역 사전 키와 같아야 합니다(comboNote, polyDesc, note …).
   없는 키를 넣어도 무시되고, 있는 키만 덮어씁니다.
   label 은 관리자 화면에 보여줄 사람 말 설명입니다. */
create table if not exists public.ui_texts (
  service    text not null,
  key        text not null,
  ko text, en text, ja text, zh text,
  label      text,
  ord        int default 0,
  updated_at timestamptz default now(),
  primary key (service, key)
);

/* ── C. 접근 권한 ─────────────────────────────────────────────────────────
   계산기가 읽어야 하므로 조회는 누구나. 고치는 것은 관리자만. */
do $pol$
declare t text; p record;
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception E'is_admin() 함수가 없습니다.\nsupabase_v2.sql → supabase_v3.sql 순서로 먼저 실행하세요.';
  end if;

  foreach t in array array['update_notes','ui_texts'] loop
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

/* ── D. 확인 ─────────────────────────────────────────────────────────────
   표는 비어 있는 채로 만들어집니다. 관리자 '문구' 탭의
   '현재 앱 문구 가져오기' 를 눌러야 지금 코드에 있는 값이 채워집니다. */
do $check$
declare n int;
begin
  select count(*) into n from information_schema.tables
   where table_schema='public' and table_name in ('update_notes','ui_texts');
  raise notice '%  문구 표 2개', case when n=2 then '✅' else '❌ '||n||'개만' end;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename in ('update_notes','ui_texts');
  raise notice '%  정책 4개(표당 읽기1+쓰기1)', case when n=4 then '✅' else '❌ '||n||'개' end;
end $check$;
