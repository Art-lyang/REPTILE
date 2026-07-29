/* =============================================================================
   supabase_v22.sql — 레오파드 모프 3종 추가 (발디 · 카본 · 레드데빌)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다 (id 가 같으면 덮어씁니다).

   ---------------------------------------------------------------------------
   왜 SQL 이 필요한가 — 코드만 고치면 화면에 안 나옵니다
   ---------------------------------------------------------------------------
   gecko-app.js 의 applyMorphRows() 는 morphs 표에 행이 있으면 내장 목록을
   **통째로 갈아치웁니다.**

       if(poly.length){ POLY.length=0; poly.forEach(p=>POLY.push(p)); }

   지금 이 DB 에는 36행(유전자 12 · 라인브리딩 24)이 이미 들어 있습니다.
   그래서 gecko-core.js 에만 추가하면 DB 목록이 이겨서 새 모프가 안 보입니다.
   코드와 DB 양쪽에 넣어야 합니다.

   ---------------------------------------------------------------------------
   그럼 코드는 왜 같이 고치나
   ---------------------------------------------------------------------------
   morphs 표에는 계열(line) 칼럼이 없습니다. applyMorphRows 는 계열을 코드에서
   가져옵니다.

       const builtinLine={}; POLY.forEach(p=>{ if(p.line) builtinLine[p.id]=p.line; });

   카본을 '흑화 계열', 레드데빌을 '텐져린 계열' 로 묶으려면 그 정보가 코드에
   있어야 합니다. DB 에만 넣으면 계열 없는 낱개 형질이 됩니다.

   ---------------------------------------------------------------------------
   셋 다 라인브리딩입니다 — 확률 계산에 들어가지 않습니다
   ---------------------------------------------------------------------------
     발디      머리에 반점이 없는 개체를 골라 고정한 라인 (다인자)
     카본      검은 발색 라인. 블랙나이트·차콜·블랙펄과 같은 부류
     레드데빌  붉은 발색 라인

   kind='poly' 로 넣습니다. 만약 이 중 하나라도 단일 유전자(열성·우성·
   불완전우성)로 밝혀지면 kind 를 바꾸고 gecko-core.js 의 GENES 로 옮겨야
   합니다. 그때는 확률이 달라지므로 반드시 검증하고 옮기세요.

   ⚠️ 레드데빌의 계열은 공개 자료에서 확인하지 못했습니다. 붉은 발색
      라인이라 텐져린 계열로 넣었습니다. 다르면 gecko-core.js 의
      reddevil 항목에서 line 만 바꾸면 됩니다. 계열이 틀려도 확률에는
      영향이 없고, 두 형질을 섞었을 때 보여줄 이름만 달라집니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.morphs') is null then
    raise exception E'morphs 표가 없습니다.\nsupabase_setup.sql 을 먼저 실행하세요.';
  end if;
  /* 표가 비어 있으면 이 SQL 이 필요 없습니다 — 코드 내장 목록이 그대로
     쓰이기 때문입니다. 그래도 넣어두면 나중에 관리자에서 이름·색을
     고칠 수 있으므로 막지는 않고 알려만 줍니다. */
  if not exists (select 1 from public.morphs) then
    raise notice 'morphs 표가 비어 있습니다. 지금은 코드 내장 목록이 쓰이므로 이 SQL 없이도 새 모프가 보입니다.';
  end if;
end $guard$;


/* ── 1. 세 모프 추가 ─────────────────────────────────────────────────────
   sort 는 맨 뒤에 붙입니다. 순서는 관리자 → 모프 탭의 ▲▼ 로 옮기세요.
   기존 행의 sort 를 건드리지 않으려는 것입니다 — 손으로 정렬해 두셨다면
   그게 흐트러집니다.

   color 는 목록·결과 화면의 점 색입니다. 비슷한 형질의 기존 색을 참고해
   골랐습니다 (카본은 블랙나이트 #332F2A 계열, 레드데빌은 레드 #C7502A 계열).

   family 는 poly 행에서는 쓰이지 않지만, 기존 행이 모두 'poly' 라 맞춥니다. */
insert into public.morphs (id, kind, family, ko, en, zh, ja, risk, color, sort, active)
values
  ('baldy',    'poly', 'poly', '발디',     'Baldy',     '无斑头', 'ボールディ',  false, '#D9C7A6',
     (select coalesce(max(sort), 0) + 1 from public.morphs), true),
  ('carbon',   'poly', 'poly', '카본',     'Carbon',    '碳黑',   'カーボン',    false, '#2B2825',
     (select coalesce(max(sort), 0) + 2 from public.morphs), true),
  ('reddevil', 'poly', 'poly', '레드데빌', 'Red Devil', '红魔',   'レッドデビル', false, '#B3372A',
     (select coalesce(max(sort), 0) + 3 from public.morphs), true)
on conflict (id) do update set
  kind   = excluded.kind,
  family = excluded.family,
  ko     = excluded.ko,
  en     = excluded.en,
  zh     = excluded.zh,
  ja     = excluded.ja,
  /* 다시 실행해도 순서와 켜짐 여부는 건드리지 않습니다.
     관리자에서 옮겨두셨을 수 있습니다. */
  updated_at = now();


/* ── 2. 확인 ─────────────────────────────────────────────────────────────
   세 줄이 나오고 kind 가 모두 poly 여야 합니다.
   kind 가 poly 가 아니면 확률 계산에 끼어듭니다. */
select '추가된 모프' as 항목, id, kind, ko, en, sort, active
  from public.morphs
 where id in ('baldy', 'carbon', 'reddevil')
 order by sort;

select '라인브리딩 총 개수' as 항목, count(*) as 개수
  from public.morphs where kind = 'poly' and active;

/* 유전자로 잘못 들어간 것이 없는지 — 항상 0 이어야 합니다 */
select '⚠️ 유전자로 잘못 들어감' as 항목, count(*) as 건수
  from public.morphs
 where id in ('baldy', 'carbon', 'reddevil') and kind <> 'poly';
