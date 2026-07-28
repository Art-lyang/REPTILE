/* =============================================================================
   supabase_v10.sql — 레오파드 계산기 업데이트 노트 채우기
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다. 실행할 때마다 아래 내용으로 맞춰집니다.

   ※ supabase_v5.sql 이 먼저 적용돼 있어야 합니다 (update_notes 표).

   ---------------------------------------------------------------------------
   이 파일 말고 관리자 화면에서도 됩니다
   ---------------------------------------------------------------------------
   관리자 → 문구 탭에서 같은 내용을 고칠 수 있습니다. 거기서 한 번이라도
   저장하면 그쪽이 최신이 되니, 그 뒤에 이 파일을 다시 실행하면 화면에서
   고친 내용이 아래 것으로 되돌아갑니다. 앞으로는 화면 쪽을 쓰세요.

   ---------------------------------------------------------------------------
   kind 값
   ---------------------------------------------------------------------------
     done  '업데이트 됨'   에 나옵니다
     soon  '업데이트 예정' 에 나옵니다
   ord 는 목록에서의 순서입니다. 작은 것이 위로 갑니다.
   ============================================================================= */

do $notes$
declare n int;
begin
  if to_regclass('public.update_notes') is null then
    raise exception 'update_notes 표가 없습니다. supabase_v5.sql 을 먼저 실행하세요.';
  end if;

  /* 레오파드 것만 지우고 새로 넣습니다. 크레스티드·팻테일 노트는 건드리지
     않습니다. 한 줄씩 맞춰 고치는 것보다 통째로 교체하는 편이, 여러 번
     실행해도 같은 결과가 나와서 안전합니다. */
  delete from public.update_notes where service = 'gecko';
  get diagnostics n = row_count;
  raise notice '기존 레오파드 노트 %건 정리', n;
end $notes$;


/* ── 업데이트 됨 ─────────────────────────────────────────────────────────
   실제로 반영된 것만 적었습니다. 아직 안 된 것을 여기 적으면 문의가 늘어납니다. */
insert into public.update_notes (service, kind, ko, en, ja, zh, ord) values
('gecko','done',
 'V1.0 테스트버전 출시',
 'V1.0 test release',
 'V1.0 テスト版リリース',
 'V1.0 测试版发布', 0),

('gecko','done',
 '랩터 계열 추가 — 스노우 랩터 · 슈퍼 랩터 · 노바',
 'Added the RAPTOR family — Snow RAPTOR, Super RAPTOR and Nova',
 'RAPTOR系を追加 — スノーRAPTOR・スーパーRAPTOR・ノヴァ',
 '新增 RAPTOR 系列 — 雪花 RAPTOR、超级 RAPTOR、Nova', 1),

('gecko','done',
 '자이언트를 슈퍼자이언트로 바꾸고 열성으로 분류 이동',
 'Giant renamed Super Giant and moved to recessive',
 'ジャイアントをスーパージャイアントに改名し、劣性へ移動',
 '巨人改名为超级巨人，并归入隐性', 2),

('gecko','done',
 '라인브리딩 계열 정리 — 멜라니스틱과 텐져린이 섞이면 멜라텐져린으로 표시',
 'Line-bred traits resolved by line — Melanistic crossed with Tangerine now reads as Mela Tangerine',
 'ラインブリード形質を系統で判定 — メラニスティックとタンジェリンが交ざるとメラタンジェリンと表示',
 '线育性状按系统判定 — 黑化与橘化混合时显示为「黑化橘化」', 3),

('gecko','done',
 '스노우 안내 추가 — 한국에서는 맥스노우만 슈퍼폼이 나옵니다',
 'Added a note on Snow — in Korea only Mack Snow produces a super form',
 'スノーの案内を追加 — 韓国ではマックスノーのみスーパー体が出ます',
 '新增雪花说明 — 在韩国只有麦克雪花会出超级体', 4),

('gecko','done',
 '한국어 · 영어 · 일본어 · 중국어 주소 분리',
 'Separate addresses for Korean, English, Japanese and Chinese',
 '韓国語・英語・日本語・中国語のアドレスを分離',
 '韩语、英语、日语、中文分设独立网址', 5);


/* ── 업데이트 예정 ───────────────────────────────────────────────────────── */
insert into public.update_notes (service, kind, ko, en, ja, zh, ord) values
('gecko','soon',
 '라인브리딩 개체 추가 예정',
 'More line-bred traits on the way',
 'ラインブリード個体を追加予定',
 '计划新增线育个体', 0);


/* ── 확인 ─────────────────────────────────────────────────────────────── */
select case kind when 'done' then '업데이트 됨' when 'soon' then '업데이트 예정'
                 else kind end as 구분,
       ord as 순서, ko as 내용
  from public.update_notes
 where service = 'gecko'
 order by kind desc, ord;
