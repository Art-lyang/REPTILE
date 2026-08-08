-- =============================================================================
-- 크레스티드 게코 · 설악 표기 수정 + 하단 안내문 보강
-- -----------------------------------------------------------------------------
-- Supabase SQL Editor 에 그대로 붙여넣고 실행하시면 됩니다. 배포는 필요 없습니다 —
-- 이 표들이 계산기 화면의 문구를 덮어쓰기 때문에, 값을 바꾸면 바로 반영됩니다.
--
-- ⚠️ 왜 코드를 고쳐도 소락이 그대로였는가
--    crested-core.js 에서는 진작에 설악으로 고쳤지만, cr_combos 표에 관리자
--    콤보 관리로 저장해 둔 행이 코드보다 우선합니다. 그래서 배포를 아무리 해도
--    화면은 계속 소락이었습니다. 고칠 곳은 코드가 아니라 이 표입니다.
--
--    en/ja/zh 는 손대지 않습니다. Sorak · ソラク 는 설악의 통상 표기라 맞습니다
--    (설악산 = Mount Sorak = ソラクサン). 틀렸던 것은 한국어 한 칸뿐입니다.
-- =============================================================================


-- 1. 설악 -------------------------------------------------------------------
update public.cr_combos
   set ko = '설악',
       updated_at = now()
 where ko = '소락';

-- 확인 — 한 줄이 나오고 ko 가 설악이면 됩니다.
select tokens, ko, en, ja, zh, proof, warn
  from public.cr_combos
 where 'super_cappuccino' = any(tokens) and 'lilly' = any(tokens);


-- 2. 하단 안내문 -------------------------------------------------------------
-- 지금 글에 있던 것은 그대로 두고(같은 자리 · 슈퍼릴리 치사 · '슈퍼'의 두 가지 뜻
-- · 크레 유전학이 덜 정리되었다는 안내), 빠져 있던 것을 더했습니다.
--
--   · 다루는 유전자를 5개 → 9개로. 엠티백·달마시안·파이드·하이포가 빠져 있었습니다.
--   · 슈퍼카푸치노 표본 조사 수치. 지금은 그 조합을 실제로 골라야만 보입니다.
--   · 형질별 검증 수준(확립 / 부분 검증 / 미확정).
--   · 초초·아잔틱의 창시 개체군이 작다는 근친 안내.
--
-- 뺀 것이 하나 있습니다 — '첨부해 주신 엑셀' 문장입니다. 만들 때 주고받던 말이라,
-- 처음 온 사람에게는 무슨 엑셀인지 알 수 없는 문장이었습니다.

update public.ui_texts
   set ko = $ko$<b>이 계산기가 다루는 것</b> — 릴리화이트, 카푸치노·세이블(같은 자리), 팬텀, 초초, 아잔틱, 엠티백, 달마시안, 파이드, 하이포를 멘델 유전으로 계산합니다.<br><br><b>카푸치노와 세이블은 같은 자리의 서로 다른 돌연변이</b>라서, 한 개체가 둘 다 슈퍼일 수 없고 카푸치노 1개 + 세이블 1개는 <b>루왁</b>이 됩니다. 한쪽이 다른 쪽을 덮지 않습니다.<br><br><b>슈퍼폼 주의</b> — <b>슈퍼릴리화이트는 치사 유전</b>이라 성체가 존재하지 않으므로 부모 선택지에서 제외했습니다. 새끼 결과에만 비생존으로 표시됩니다. 슈퍼카푸치노는 약 100마리 표본 조사에서 콧구멍 이상 11%, 안구 이상 3% 미만이 보고됐습니다. 위험 조합은 결과 상단에 경고로 표시됩니다.<br><br><b>검증 수준이 형질마다 다릅니다</b> — 릴리화이트·카푸치노·세이블·아잔틱은 확립된 유전이지만, 엠티백·달마시안·파이드는 부분 검증이고 팬텀·초초·하이포는 아직 미확정입니다. 미확정 형질이 섞인 결과는 참고용 근사치로 봐 주세요.<br><br><b>열성 형질의 근친</b> — 초초와 아잔틱은 창시 개체군이 매우 작습니다. 비주얼을 얻으려 반복 근친 교배를 하면 번식력 저하 같은 근친 약세가 나타날 수 있습니다.<br><br><b>‘슈퍼’라는 말의 두 가지 뜻</b> — 슈퍼카푸치노·슈퍼세이블·슈퍼릴리화이트와 <b>유전 모프의 슈퍼하이포</b>는 실제 동형접합(유전자 2개)입니다. 반면 라인브리딩 형질의 슈퍼달마시안·슈퍼스트라이프·슈퍼하이포는 <b>표현이 강하다</b>는 뜻일 뿐 동형접합이 아닙니다.<br><br><b>꼭 알아두실 점</b> — 크레스티드 게코의 유전학은 레오파드 게코만큼 정리되어 있지 않습니다. 단일 유전자로 확실히 증명된 형질은 소수이며, 대부분의 모프 이름은 학술 논문이 아니라 브리더들의 사육 기록과 합의에 기반합니다. 이 계산기의 확률은 참고용이며, 실제 부화 개체의 외형은 여러 형질의 상호작용과 성장에 따른 색 변화로 달라질 수 있습니다. 중요한 교배 결정은 계통 정보를 가진 브리더와 상의하십시오.$ko$,

       en = $en$<b>What this calculator covers</b> — Lilly White, Cappuccino/Sable (one shared locus), Phantom, ChoCho, Axanthic, Empty Back, Dalmatian, Pied and Hypo, calculated by Mendelian inheritance.<br><br><b>Cappuccino and Sable are different mutations at the same locus</b>, so no animal can be super for both, and one Cappuccino allele plus one Sable allele makes a <b>Luwak</b>. Neither one masks the other.<br><br><b>Super forms deserve care</b> — <b>Super Lilly White is lethal</b>, so no adult exists and it is excluded from the parent options; it appears only in the offspring results, marked non-viable. For Super Cappuccino, a survey of about 100 animals reported nostril abnormalities in 11% and eye abnormalities in under 3%. Risky pairings are flagged above the results.<br><br><b>Not every trait is equally proven</b> — Lilly White, Cappuccino/Sable and Axanthic are established. Empty Back, Dalmatian and Pied are partly proven, and Phantom, ChoCho and Hypo are still unconfirmed. Treat any result involving an unconfirmed trait as an approximation.<br><br><b>Recessives and inbreeding</b> — ChoCho and Axanthic come from very small founder populations. Repeated close pairings to reach visuals can bring inbreeding depression, such as reduced fertility.<br><br><b>Two meanings of “super”</b> — Super Cappuccino, Super Sable, Super Lilly White and <b>the genetic Super Hypo</b> are genuine homozygotes. Super Dalmatian, Super Stripe and the line-bred Super Hypo merely mean <b>strongly expressed</b> and are not homozygous.<br><br><b>Please read</b> — Crested gecko genetics is far less settled than leopard gecko genetics. Only a handful of traits are firmly proven to be single-gene, and most morph names come from breeder records and community consensus rather than published studies. The probabilities here are for reference only; a real hatchling’s appearance can differ because traits interact and because colour changes as the animal grows. Consult a breeder who knows the lineage before making an important pairing decision.$en$,

       ja = $ja$<b>この計算機が扱う形質</b> — リリーホワイト、カプチーノ／セーブル（同一座）、ファントム、チョチョ、アザンティック、エンプティバック、ダルメシアン、パイド、ハイポをメンデル遺伝で計算します。<br><br><b>カプチーノとセーブルは同じ座の別の変異</b>であるため、1個体が両方のスーパーになることはなく、カプチーノ1つ＋セーブル1つで<b>ルアク</b>になります。どちらか一方が他方を隠すことはありません。<br><br><b>スーパー体には注意が必要です</b> — <b>スーパーリリーホワイトは致死遺伝</b>で成体が存在しないため、親の選択肢から除外しています。仔の結果にのみ生存困難として表示されます。スーパーカプチーノについては、約100個体の調査で鼻孔の異常が11%、眼の異常が3%未満と報告されています。危険な組み合わせは結果の上部に警告として表示されます。<br><br><b>形質ごとに検証の度合いが違います</b> — リリーホワイト・カプチーノ・セーブル・アザンティックは確立された遺伝ですが、エンプティバック・ダルメシアン・パイドは一部検証、ファントム・チョチョ・ハイポはまだ未確定です。未確定の形質を含む結果は参考値としてご覧ください。<br><br><b>劣性形質と近親交配</b> — チョチョとアザンティックは創始個体群が非常に小さい形質です。ビジュアルを得るために近親交配を繰り返すと、繁殖力の低下など近交弱勢が現れることがあります。<br><br><b>「スーパー」の2つの意味</b> — スーパーカプチーノ・スーパーセーブル・スーパーリリーホワイトと<b>遺伝モルフのスーパーハイポ</b>は本当のホモ（遺伝子2つ）です。一方、ラインブリード形質のスーパーダルメシアン・スーパーストライプ・スーパーハイポは<b>発現が強い</b>という意味に過ぎず、ホモではありません。<br><br><b>ご留意ください</b> — クレステッドゲッコーの遺伝学は、レオパードゲッコーほど整理されていません。単一遺伝子であると確実に証明されている形質はごく少数で、モルフ名の多くは学術論文ではなくブリーダーの飼育記録と合意に基づいています。この計算機の確率はあくまで参考であり、実際に孵化した個体の外見は、形質同士の相互作用や成長に伴う色変化によって異なる場合があります。重要な交配の判断は、血統を把握しているブリーダーにご相談ください。$ja$,

       zh = $zh$<b>本计算器涵盖的性状</b> — 莉莉白、卡布奇诺／黑貂（同一基因座）、幻影、初初、无黄化、空背、达尔马提亚、花斑、低黑，按孟德尔遗传计算。<br><br><b>卡布奇诺与黑貂是同一基因座上的不同突变</b>，因此没有个体能同时是两者的超级形态；一个卡布奇诺等位基因加一个黑貂等位基因即为 <b>Luwak</b>。两者互不遮盖。<br><br><b>超级型需要谨慎</b> — <b>超级莉莉白为致死遗传</b>，不存在成体，因此已从亲本选项中移除；它只会出现在后代结果中并标注为不存活。超级卡布奇诺方面，在约 100 只个体的调查中，11% 出现鼻孔异常，不到 3% 出现眼部异常。有风险的组合会在结果上方以警告显示。<br><br><b>各性状的验证程度不同</b> — 莉莉白、卡布奇诺·黑貂与无黄化属于已确立的遗传；空背、达尔马提亚与花斑为部分验证；幻影、初初与低黑仍待确认。含有待确认性状的结果，请视为参考近似值。<br><br><b>隐性性状与近亲繁殖</b> — 初初与无黄化的创始种群非常小。为获得显性表现而反复近亲配对，可能出现繁殖力下降等近交衰退现象。<br><br><b>“超级”的两种含义</b> — 超级卡布奇诺、超级黑貂、超级莉莉白与<b>遗传品系的超级低黑</b>是真正的纯合个体。而人工选育的超级大麦町、超级直纹、超级低黑只表示<b>表现强烈</b>，并非纯合。<br><br><b>请务必了解</b> — 睫角守宫的遗传学远不如豹纹守宫成熟。目前被确证为单基因的性状只有少数几个，大多数品系名称来自繁育者的饲养记录与社群共识，而非已发表的研究。本计算器给出的概率仅供参考；由于性状之间会相互影响，且体色会随成长变化，实际孵化个体的外观可能与预测不同。做重要配对决定前，请咨询了解血统的繁育者。$zh$,

       updated_at = now()
 where service = 'crested' and key = 'note';


-- 3. 마무리 확인 --------------------------------------------------------------
-- 소락이 어디에도 남아 있지 않아야 합니다. 0 이 나오면 끝입니다.
select
  (select count(*) from public.cr_combos    where ko like '%소락%') as combos_sorak,
  (select count(*) from public.ui_texts     where service='crested'
                                              and (ko||en||ja||zh) like '%소락%') as texts_sorak,
  (select count(*) from public.update_notes where service='crested'
                                              and (ko||en||ja||zh) like '%소락%') as notes_sorak;

-- 참고 — 업데이트 노트는 이미 되어 있습니다. ord=2 행에 콤보 탭 안내와
--        '파이드는 불완전우성으로 옮겼습니다' 가 들어가 있고, 거기 적힌 이름도
--        이미 설악입니다. 따로 하실 것이 없습니다.
