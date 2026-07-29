/* =============================================================================
   supabase_v23.sql — 레오파드 라인브리딩 16종 추가
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ⚠️ supabase_v22.sql 을 먼저 실행하세요. (발디·카본·레드데빌)
      아직 안 하셨으면 v22 → v23 순서로 두 개를 돌리시면 됩니다.
      순서가 바뀌어도 결과는 같습니다만, sort 번호가 뒤섞입니다.

   ---------------------------------------------------------------------------
   출처
   ---------------------------------------------------------------------------
   브리더 '레게 태영이' 제공 (2026-07-29 카카오톡).

   확인받은 내용 그대로:
     "전부 라인. 얘들끼리 나오는 조합이나 뭐 뭐끼리 붙이면 만들어지고
      그런 건 없다."

   그래서 16종 전부 kind='poly' 이고, combos 표에는 아무것도 넣지 않습니다.
   확률 계산에 끼어들지 않습니다.

   ---------------------------------------------------------------------------
   ⚠️ 스모그 · 오렌지 스모그 — 알비노를 물고 있습니다
   ---------------------------------------------------------------------------
     스모그        = 트램퍼 알비노 포함
     오렌지 스모그 = 벨 알비노 포함

   이건 확률에 직접 영향을 줍니다. 붉은/어두운 발색 자체는 다인자라
   계산 대상이 아니지만, 딸려 있는 알비노는 열성 유전자라 계산 대상입니다.

   레드데빌과 똑같이 gecko-core.js 의 implies 로 처리했습니다.

       {id:'smog',       implies:{tremper:'het'}, ...}
       {id:'orangesmog', implies:{bell:'het'},    ...}

   morphs 표에는 implies 칼럼이 없습니다. applyMorphRows() 가 코드에서
   가져다 살려내므로 (line 과 같은 방식), 이 SQL 만 돌리고 코드가 예전
   것이면 확률이 조용히 틀립니다. 배포는 이미 끝났으니 그대로 두시면 됩니다.

   het(보인자)로 잡은 이유는 v22 헤더의 레드데빌 설명과 같습니다 —
   열성이라 라인 안에 겉으로 안 드러나는 보인자가 섞여 있고, 모든 개체에
   대해 확실히 말할 수 있는 선이 '최소 보인자' 입니다. 눈으로 봐서 알비노인
   개체는 계산기에서 해당 알비노를 '비주얼' 로 올리시면 됩니다.

   ⚠️ 트램퍼와 벨은 서로 다른 유전자입니다. 스모그 × 오렌지 스모그는
      알비노가 안 나옵니다 (더블 het 이 될 뿐). 계산기가 이미 안내합니다.

   ---------------------------------------------------------------------------
   약칭은 그대로 뒀습니다
   ---------------------------------------------------------------------------
   GT · GG · GCT.M · GCT.S · BMD 는 4개 언어 모두 약칭 그대로입니다.
   브리더 사이에서 쓰는 이름이라 억지로 풀어 쓰면 오히려 못 알아봅니다.
   정식 명칭 아시면 알려주세요 — 관리자 → 모프 탭에서 바로 고치셔도 됩니다.

   ---------------------------------------------------------------------------
   계열(line) 은 코드에 있습니다 — 확률과는 무관
   ---------------------------------------------------------------------------
   흑화 계열 : 차콜 · 블랙블러드 · 블랙펄 · 페퍼 · 아프간
   텐져린 계열: 크림슨 · 보르도 · 다크텐져린
   계열 없음 : GT · GG · GCT.M · GCT.S · BMD · 차콜카본다크만다린 ·
               스모그 · 오렌지 스모그

   계열은 두 형질을 섞었을 때 보여줄 이름만 정합니다 (멜라텐져린 등).
   확실하지 않은 것은 일부러 비워뒀습니다. 아시는 대로 알려주시면
   gecko-core.js 에서 line 만 채우겠습니다.

   ※ '볼드' 는 이미 '볼드 스트라이프(boldstripe)' 로 들어가 있어 뺐습니다.
      둘이 다른 형질이면 알려주세요. 따로 추가하겠습니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.morphs') is null then
    raise exception E'morphs 표가 없습니다.\nsupabase_setup.sql 을 먼저 실행하세요.';
  end if;
  if not exists (select 1 from public.morphs where id = 'reddevil') then
    raise notice 'v22 (발디·카본·레드데빌) 가 아직 안 들어갔습니다. v22 도 함께 실행하세요.';
  end if;
end $guard$;


/* ── 1. 16종 추가 ────────────────────────────────────────────────────────
   sort 는 맨 뒤에 붙입니다. 순서는 관리자 → 모프 탭의 ▲▼ 로 옮기세요.
   기존 행의 sort 를 안 건드리려는 것입니다.

   base 를 한 번만 계산해서 쓰는 이유 — 값마다 하위질의를 쓰면 같은
   스냅샷을 보므로 전부 같은 max 가 나옵니다. 여기서는 base+n 으로
   서로 다른 번호를 줍니다. */
with base as (select coalesce(max(sort), 0) as n from public.morphs)
insert into public.morphs (id, kind, family, ko, en, zh, ja, risk, color, sort, active)
select v.id, 'poly', 'poly', v.ko, v.en, v.zh, v.ja, false, v.color, base.n + v.ord, true
  from base, (values
    -- 흑화·다크 계열
    ('charcoal',   '차콜',       'Charcoal',     '木炭黑', 'チャコール',           '#3A3733',  1),
    ('blackblood', '블랙블러드', 'Black Blood',  '黑血',   'ブラックブラッド',     '#2A1A18',  2),
    ('blackpearl', '블랙펄',     'Black Pearl',  '黑珍珠', 'ブラックパール',       '#2E2C2E',  3),
    ('pepper',     '페퍼',       'Pepper',       '胡椒',   'ペッパー',             '#4A4640',  4),
    ('afghan',     '아프간',     'Afghan',       '阿富汗', 'アフガン',             '#6B5B47',  5),
    ('gt',         'GT',         'GT',           'GT',     'GT',                   '#5A544C',  6),
    ('gg',         'GG',         'GG',           'GG',     'GG',                   '#544E48',  7),
    ('gctm',       'GCT.M',      'GCT.M',        'GCT.M',  'GCT.M',                '#4E4842',  8),
    ('gcts',       'GCT.S',      'GCT.S',        'GCT.S',  'GCT.S',                '#48423C',  9),
    ('bmd',        'BMD',        'BMD',          'BMD',    'BMD',                  '#332F2A', 10),
    ('ccdm',       '차콜카본다크만다린', 'Charcoal Carbon Dark Mandarin',
                                 '木炭碳黑暗曼陀林', 'チャコールカーボンダークマンダリン',
                                                                                   '#6A4028', 11),
    -- 붉은 계열
    ('crimson',       '크림슨',     'Crimson',        '深红', 'クリムゾン',         '#B02B26', 12),
    ('bordeaux',      '보르도',     'Bordeaux',       '波尔多', 'ボルドー',         '#7B2233', 13),
    ('darktangerine', '다크텐져린', 'Dark Tangerine', '暗橘', 'ダークタンジェリン', '#C4652A', 14),
    -- 알비노를 물고 있는 라인 (implies 는 코드에 있습니다)
    ('smog',       '스모그',        'Smog',        '烟灰',   'スモッグ',           '#6E6862', 15),
    ('orangesmog', '오렌지 스모그', 'Orange Smog', '橙烟灰', 'オレンジスモッグ',   '#B2743C', 16)
  ) as v(id, ko, en, zh, ja, color, ord)
on conflict (id) do update set
  kind   = excluded.kind,
  family = excluded.family,
  ko     = excluded.ko,
  en     = excluded.en,
  zh     = excluded.zh,
  ja     = excluded.ja,
  /* 다시 실행해도 순서·켜짐 여부·색은 안 건드립니다.
     관리자에서 고쳐두셨을 수 있습니다. */
  updated_at = now();


/* ── 2. 확인 ─────────────────────────────────────────────────────────────
   16줄이 나오고 kind 가 전부 poly 여야 합니다. */
select '추가된 라인' as 항목, id, kind, ko, en, sort
  from public.morphs
 where id in ('charcoal','blackblood','blackpearl','pepper','afghan',
              'gt','gg','gctm','gcts','bmd','ccdm',
              'crimson','bordeaux','darktangerine','smog','orangesmog')
 order by sort;

/* v22 까지 다 돌렸으면 27 + 16 = 43 이 나와야 합니다.
   (기존 24 + v22 의 3 + v23 의 16) */
select '라인브리딩 총 개수' as 항목, count(*) as 개수
  from public.morphs where kind = 'poly' and active;

/* 유전자로 잘못 들어간 것 — 항상 0 이어야 합니다.
   0 이 아니면 확률 계산에 끼어듭니다. */
select '⚠️ 유전자로 잘못 들어감' as 항목, count(*) as 건수
  from public.morphs
 where id in ('charcoal','blackblood','blackpearl','pepper','afghan',
              'gt','gg','gctm','gcts','bmd','ccdm',
              'crimson','bordeaux','darktangerine','smog','orangesmog')
   and kind <> 'poly';

/* 알비노 유전자가 실제로 있는지 — 스모그·오렌지스모그의 implies 대상입니다.
   2 가 나와야 합니다. 아니면 계산기에서 연결이 안 걸립니다. */
select '알비노 유전자 확인' as 항목, count(*) as 개수
  from public.morphs where id in ('tremper', 'bell') and kind = 'rec';
