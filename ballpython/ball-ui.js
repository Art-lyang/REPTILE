/* ball-ui.js — 볼파이톤 계산기 화면 로직
   fattail-ui.js 와 같은 구조입니다. 레이아웃을 고칠 일이 있으면 함께 보세요.

   [ 펫테일 화면과 달라진 두 가지 ]
   ① 부모 카드마다 <b>검색창</b>이 있습니다. 볼파이톤은 다루는 유전자가 60개가
      넘어서 칩을 눈으로 훑는 것이 사실상 불가능합니다. 검색은 한국어·영어·
      일본어·중국어 이름과 별칭을 모두 봅니다('yb' 로도 '옐로우벨리'가 걸립니다).
      검색 중에도 <b>이미 고른 칩은 항상 남습니다</b> — 검색어에 안 걸린다고
      선택이 화면에서 사라지면 되돌릴 방법이 없습니다.
      [추가 유전자] 가 꺼져 있어도 검색으로는 찾힙니다.
   ② 불완전우성도 칩 하나 + 서브 세그먼트(1카피 / 슈퍼)로 고릅니다. 펫테일처럼
      '○○'·'슈퍼 ○○' 를 각각 칩으로 두면 이 종에서는 칩이 두 배가 됩니다.        */

/* ================= 다국어 사전 ================= */
const I18N = {
  ko:{
    htmlLang:'ko',
    title:'볼파이톤 모프 계산기',
    sub:'부모의 유전 형질을 선택해 새끼 모프 확률을 계산하세요',
    langLabel:'언어', parentA:'부모 A', parentB:'부모 B',
    navStudio:'스튜디오', navGallery:'다른 집사들의 개체 구경하기', navMail:'문의하기',
    parentRole:'유전 형질 선택', helpBtn:'선택 도움말',
    searchPh:'모프 검색 (예: 파스텔, pied, yb)', searchClear:'검색 지우기',
    searchNone:'검색 결과가 없습니다. 다른 이름이나 영문 철자로 찾아보세요.',
    searchCount:function(n){return n+'개 표시 중';},
    selectedLabel:'선택된 형질', selNone:'아직 고르지 않았어요',
    reset:'초기화', calc:'모프 계산하기',
    modeVisual:'표현형 기준', modeGeno:'유전형 기준',
    partialToggle:'가능성 헷 (66·33%)', extraToggle:'추가 유전자', polyToggle:'라인브리딩 형질',
    optInfo:'표시 옵션 설명',
    optNote:'<b>표현형 기준</b> — 눈으로 보이는 모프만 행으로 묶고, 헷(보인자)은 오른쪽 칸에 따로 표기합니다.'
      +'<br><b>유전형 기준</b> — 헷도 하나의 결과로 세어 펼칩니다.'
      +'<br><b>가능성 헷</b> — 66%·33% 처럼 확률적인 보인자를 표에 표시합니다. 볼파이톤은 <b>50%·66% 헷 표기를 분양에서 그대로 쓰는 종</b>이라 이 옵션이 처음부터 켜져 있습니다.'
      +'<br><b>추가 유전자</b> — 아잔틱 TSK·몬순처럼 덜 쓰이거나 유전 방식이 덜 정리된 형질을 부모 카드에 함께 표시합니다. <b>꺼져 있어도 검색하면 나옵니다.</b>'
      +'<br><b>라인브리딩 형질</b> — 리듀스드 패턴·하이 골드처럼 선발 교배로 만드는 성향을 부모 카드에 표시합니다(확률 계산 대상 아님).',
    updBtn:'업데이트 노트', contact:'문의하기',
    mailNote:'정보 수정 요청 · 업데이트 건의는 <b>문의하기</b>로 보내주세요',
    emptyStart:'부모의 형질을 선택하고 <b>모프 계산하기</b>를 눌러주세요.',
    emptyNone:'선택된 형질이 없어요.<br>부모의 유전 형질을 하나 이상 골라주세요.',
    resultsH:'새끼 모프 확률',
    summaryVisual:function(n){return '총 '+n+'가지 표현형 · 확률 내림차순';},
    summaryGeno:function(n){return '총 '+n+'가지 유전형 · 확률 내림차순';},
    normal:'노멀', comboTag:'콤보', deadTag:'비생존', healthTag:'건강주의',
    colProb:'확률', colVisual:'비주얼 (발현)', colMorph:'모프 (헷 포함)', colHet:'HET (보인자)', hetNone:'–',
    secGene:'유전 모프 (확률 계산)',
    visualLbl:'비주얼', hetLbl:'헷', copy1:'1카피', copy2:'2카피', superLbl:'슈퍼',
    partnerLbl:'두 번째 유전자', wildLbl:'야생형', nowLbl:'현재',
    warnH:'주의가 필요한 유전 조합 · 건강 이슈',
    viveNote:function(p){return '이 조합에는 <b>부화·생존이 어려운 결과</b>가 '+p+'% 포함되어 있습니다.';},
    viveOn:'생존 개체 기준으로 보기', viveOff:'전체(이론값)로 보기',
    viveBadge:'생존 개체 기준 — 비생존 결과를 제외하고 다시 나눈 확률입니다',
    showAll:function(n){return '전체 '+n+'가지 모두 보기';},
    crossTag:'크로스', crossNote:'',
    polyH:'라인브리딩 형질 (확률 계산 불가)',
    polyDesc:'폴리제닉(다인자) 형질이라 정확한 확률을 낼 수 없습니다. 아래 형질은 부모가 지녀 새끼에 나타날 수 있으며 발현 정도는 개체마다 다릅니다. ‘(양쪽)’은 부모 둘 다 지닌 형질로 더 강하게 발현될 가능성이 있습니다.',
    polyBoth:'양쪽',
    proof:{ established:'', partial:'부분검증', contested:'미확정' },
    fakeSuperNote:'라인브리딩 형질은 유전자가 아니라 <b>선발 교배로 강화한 표현</b>입니다 — 확률로 계산할 수 없고, 부모보다 옅거나 진하게 나올 수 있습니다.',
    note:'<b>이 계산기가 다루는 것</b> — 파스텔·엔치·파이어 같은 불완전우성, 알비노·파이볼드·클라운 같은 열성, 핀스트라이프·스파이더 같은 우성을 멘델 유전으로 계산합니다. '
      +'<b>같은 자리(대립유전자)로 묶은 것</b> — ① BEL 복합(모하비·레서·버터·루소·스페셜·팬텀·미스틱), ② 옐로우벨리 복합(YB·아스팔트·그래블·스펙터), '
      +'③ 시나몬·블랙파스텔, ④ 알비노·울트라멜, ⑤ 캔디·토피. 이 자리들은 대립유전자를 각각 독립 유전자로 두는 계산기와 결과가 다릅니다.'
      +'<br><br><b>동형이 확인되지 않은 유전자</b> — 스파이더 · 챔페인 · 워마는 2카피(동형) 개체가 살아서 부화한 사례가 없습니다. 부모 선택지에서 2카피를 뺐고, '
      +'새끼 결과에만 <b>비생존</b>으로 표시됩니다. ‘생존 개체 기준으로 보기’를 누르면 비생존을 빼고 다시 나눈 확률을 볼 수 있습니다.'
      +'<br><br><b>유전병 · 불임 이슈를 함께 표시합니다</b> — 볼파이톤은 모프에 따라 건강 문제가 알려져 있습니다. '
      +'<b>스파이더</b>는 가진 개체 전부가 정도 차이만 있을 뿐 워블(머리 흔들림)을 보이고, <b>챔페인·워마·히든진 워마</b>도 워블·덕빌 보고가 있으며 <b>둘 이상 겹치면 증상이 더해집니다.</b> '
      +'특히 <b>챔페인 + 스파이더</b> 조합은 부화 직후 폐사 보고가 반복됩니다. <b>데저트 암컷은 사실상 불임</b>으로 보고되어 이 유전자는 수컷으로만 잇는 것이 일반적이고, '
      +'<b>슈퍼 시나몬·슈퍼 블랙파스텔</b>은 덕빌·킹크·부화 실패가 많으며, <b>캐러멜 알비노</b>는 초기 계통의 킹크 보고가 있습니다. '
      +'해당 조합이 결과에 나오면 <b>건강주의</b> 딱지와 함께 설명이 뜹니다.'
      +'<br><br><b>바나나(코랄글로우)</b>는 성염색체와 연관되어 있어 계통에 따라 새끼의 성비와 발현이 크게 치우칩니다. 이 계산기는 성별을 계산하지 않습니다.'
      +'<br><br><b>꼭 알아두실 점</b> — 볼파이톤의 모프 이름은 대부분 학술 논문이 아니라 브리더들의 사육 기록과 합의에 기반합니다. 확률은 참고용이며, '
      +'실제 부화 개체의 외형은 여러 형질의 상호작용과 성장에 따른 색 변화로 달라질 수 있습니다. 중요한 교배 결정은 계통 정보를 가진 브리더와 상의하십시오.',
    terms:'이용약관', privacy:'개인정보처리방침',
    seoIntroH:'볼파이톤 모프 계산기',
    seoIntro:'볼파이톤 부모의 형질을 고르면 새끼 모프와 확률을 계산합니다. 파스텔·모하비·파이볼드·클라운·알비노 등 60가지가 넘는 유전자를 검색으로 찾아 고를 수 있고, 스파이더 워블·데저트 암컷 불임·슈퍼 시나몬 기형 같은 유전 건강 이슈를 함께 알려줍니다. 회원가입 없이 무료입니다.',
    footer:'확률은 멘델 유전 법칙에 따른 이론값입니다 · 라인브리딩(폴리제닉) 형질은 확률 계산 대상이 아닙니다',
    updH:'업데이트 노트', updDone:'업데이트 됨', updSoon:'업데이트 예정',
    updTitle:'업데이트 노트', modalMail:'문의 · 건의:', btnToday:'오늘 하루 안 보기', btnClose:'닫기',
    updDoneList:[
      'V1.0 테스트버전 출시',
      '부모 카드별 모프 검색 추가 (한·영·일·중 이름과 별칭 지원)',
      'BEL·옐로우벨리·시나몬·알비노·캔디를 대립유전자 자리로 계산',
      '스파이더 워블, 데저트 암컷 불임 등 유전 건강 이슈 경고 추가',
      '콤보 명칭 추가 — 범블비·파이어플라이·퓨터·판다 파이드·캔디노 등. 다른 유전자가 더 얹혀도 ‘엔치 범블비’처럼 이름이 이어집니다'
    ],
    updSoonList:[
      '모프별 사진·설명 추가 예정',
      '뱀부·대디 등 BEL 복합 대립유전자 추가 검토'
    ],
    updMail:'문의 · 건의: ', today:'오늘 하루 안 보기', mclose:'닫기',
    mailSubject:'볼파이톤 모프 계산기 - 정보수정/업데이트 건의',
  },
  en:{
    htmlLang:'en',
    title:'Ball Python Morph Calculator',
    sub:'Pick each parent’s genetics to see the probability of each offspring morph',
    langLabel:'Language', parentA:'Parent A', parentB:'Parent B',
    navStudio:'Studio', navGallery:'See other keepers’ animals', navMail:'Contact',
    parentRole:'Choose genetic traits', helpBtn:'Help',
    searchPh:'Search morphs (e.g. pastel, pied, yb)', searchClear:'Clear search',
    searchNone:'No matches. Try another spelling or the English name.',
    searchCount:function(n){return n+' shown';},
    selectedLabel:'Selected', selNone:'Nothing selected yet',
    reset:'Reset', calc:'Calculate Morphs',
    modeVisual:'By phenotype', modeGeno:'By genotype',
    partialToggle:'Possible hets (66·33%)', extraToggle:'Extra genes', polyToggle:'Line-bred traits',
    optInfo:'About these options',
    optNote:'<b>By phenotype</b> — groups rows by what you can actually see; het carriers are listed separately on the right.'
      +'<br><b>By genotype</b> — counts hets as outcomes of their own.'
      +'<br><b>Possible hets</b> — shows probabilistic carriers such as 66% and 33%. Ball pythons are <b>routinely advertised as 50% / 66% het</b>, so this option is on by default.'
      +'<br><b>Extra genes</b> — adds less common or less settled traits (Axanthic TSK, Monsoon…) to the parent cards. <b>Search finds them even when this is off.</b>'
      +'<br><b>Line-bred traits</b> — shows selectively bred tendencies (Reduced pattern, High gold…) for reference only.',
    updBtn:'Update notes', contact:'Contact',
    mailNote:'Corrections and feature requests are welcome via <b>Contact</b>',
    emptyStart:'Set the parents’ traits and tap <b>Calculate Morphs</b>.',
    emptyNone:'No traits selected.<br>Choose at least one genetic trait on a parent.',
    resultsH:'Offspring Morph Probabilities',
    summaryVisual:function(n){return n+' phenotype'+(n===1?'':'s')+' · sorted by probability';},
    summaryGeno:function(n){return n+' genotype'+(n===1?'':'s')+' · sorted by probability';},
    normal:'Normal', comboTag:'COMBO', deadTag:'NON-VIABLE', healthTag:'HEALTH',
    colProb:'Prob.', colVisual:'Visual (expressed)', colMorph:'Morph (incl. het)', colHet:'Het (carrier)', hetNone:'–',
    secGene:'Genetic morphs (calculated)',
    visualLbl:'Visual', hetLbl:'het', copy1:'1 copy', copy2:'2 copies', superLbl:'Super',
    partnerLbl:'Second allele', wildLbl:'Wild type', nowLbl:'Now',
    warnH:'Genetics and health issues that need caution',
    viveNote:function(p){return 'This pairing includes <b>'+p+'% outcomes that do not survive</b>.';},
    viveOn:'Show live-hatchling odds', viveOff:'Show full theoretical odds',
    viveBadge:'Live-hatchling odds — non-viable outcomes removed and the rest renormalised',
    showAll:function(n){return 'Show all '+n+' outcomes';},
    crossTag:'cross', crossNote:'',
    polyH:'Line-bred traits (not probability-based)',
    polyDesc:'These are polygenic traits, so exact probabilities can’t be calculated. The traits below are carried by a parent and may appear in offspring to varying degrees. “(both)” means both parents carry it, so it may express more strongly.',
    polyBoth:'both',
    proof:{ established:'', partial:'partly proven', contested:'unconfirmed' },
    fakeSuperNote:'Line-bred traits are not genes but <b>expression built up by selective breeding</b> — they can’t be calculated, and offspring may show them more or less strongly than the parents.',
    note:'<b>What this calculator covers</b> — incomplete dominants such as Pastel, Enchi and Fire; recessives such as Albino, Piebald and Clown; dominants such as Pinstripe and Spider, all by Mendelian inheritance. '
      +'<b>Treated as one locus (alleles):</b> ① the BEL complex (Mojave, Lesser, Butter, Russo, Special, Phantom, Mystic), ② the Yellow Belly complex (YB, Asphalt, Gravel, Specter), '
      +'③ Cinnamon and Black Pastel, ④ Albino and Ultramel, ⑤ Candy and Toffee. Calculators that model these as independent genes will give different numbers.'
      +'<br><br><b>Genes with no confirmed homozygote</b> — no living Super Spider, Super Champagne or Super Woma has ever been confirmed. Two copies were removed from the parent options, and the '
      +'outcome appears only in the offspring results marked <b>non-viable</b>. “Show live-hatchling odds” removes them and renormalises the rest.'
      +'<br><br><b>Health and fertility issues are flagged too</b> — several ball python morphs carry known problems. '
      +'<b>Spider</b> produces wobble in every animal that carries it, <b>Champagne, Woma and Hidden Gene Woma</b> also have wobble and duckbilling reports, and <b>stacking two or more compounds the symptoms.</b> '
      +'The <b>Champagne + Spider</b> combination in particular is repeatedly reported to die soon after hatching. <b>Desert females are reported as effectively infertile</b>, so that gene is normally carried on through males only; '
      +'<b>Super Cinnamon / Super Black Pastel</b> show duckbilling, kinking and failed hatches more often; and <b>Caramel Albino</b> has kinking reports in the early lines. '
      +'Whenever a pairing can produce these, the results show a <b>HEALTH</b> tag with an explanation.'
      +'<br><br><b>Banana (Coral Glow)</b> is sex-linked, so the sex ratio and which hatchlings show it skew heavily by line. This calculator does not model sex.'
      +'<br><br><b>Please read</b> — most ball python morph names come from breeder records and community consensus rather than published studies. The probabilities here are for reference only; a real hatchling’s '
      +'appearance can differ because traits interact and because colour changes as the animal grows. Consult a breeder who knows the lineage before making an important pairing decision.',
    terms:'Terms', privacy:'Privacy',
    seoIntroH:'Ball Python Morph Calculator',
    seoIntro:'Pick each parent’s traits to see offspring morphs and odds for ball pythons. Search across 60+ genes — Pastel, Mojave, Piebald, Clown, Albino and more — and see genetic health issues such as Spider wobble, Desert female infertility and Super Cinnamon defects alongside the odds. Free, no sign-up.',
    footer:'Probabilities are theoretical values from Mendelian inheritance · line-bred (polygenic) traits are not probability-based',
    updH:'Update notes', updDone:'Shipped', updSoon:'Coming next',
    updTitle:'Update notes', modalMail:'Questions or ideas:', btnToday:'Hide for today', btnClose:'Close',
    updDoneList:[
      'V1.0 test release',
      'Per-parent morph search (Korean, English, Japanese, Chinese names and aliases)',
      'BEL, Yellow Belly, Cinnamon, Albino and Candy calculated as allelic loci',
      'Health warnings for Spider wobble, Desert female infertility and more',
      'Combo names added — Bumblebee, Firefly, Pewter, Panda Pied, Candino and more. Extra genes keep the name, as in “Enchi Bumblebee”'
    ],
    updSoonList:[
      'Photos and descriptions per morph',
      'Reviewing more BEL-complex alleles (Bamboo, Daddy…)'
    ],
    updMail:'Contact: ', today:'Don’t show today', mclose:'Close',
    mailSubject:'Ball Python Morph Calculator - correction / feature request',
  },
  ja:{
    htmlLang:'ja',
    title:'ボールパイソン モルフ計算機',
    sub:'両親の遺伝形質を選ぶと、仔のモルフ確率を計算します',
    langLabel:'言語', parentA:'親 A', parentB:'親 B',
    navStudio:'スタジオ', navGallery:'ほかの飼い主の個体を見る', navMail:'お問い合わせ',
    parentRole:'遺伝形質を選択', helpBtn:'ヘルプ',
    searchPh:'モルフ検索（例：パステル, pied, yb）', searchClear:'検索をクリア',
    searchNone:'該当するモルフがありません。別の表記や英語名でお試しください。',
    searchCount:function(n){return n+'件表示中';},
    selectedLabel:'選択した形質', selNone:'まだ選んでいません',
    reset:'リセット', calc:'モルフを計算',
    modeVisual:'表現型で表示', modeGeno:'遺伝型で表示',
    partialToggle:'可能性 het（66・33%）', extraToggle:'追加遺伝子', polyToggle:'ラインブリード形質',
    optInfo:'表示オプションの説明',
    optNote:'<b>表現型で表示</b> — 見た目で分かるモルフだけを行にまとめ、ヘテロ（保因）は右の列に別記します。'
      +'<br><b>遺伝型で表示</b> — ヘテロも1つの結果として数えて展開します。'
      +'<br><b>可能性 het</b> — 66%・33% などの確率的な保因を表に表示します。ボールパイソンは<b>50%・66% ヘテロ表記を分譲でそのまま使う種</b>のため、この項目は最初からオンです。'
      +'<br><b>追加遺伝子</b> — アザンティック TSK・モンスーンなど、使用頻度が低い、あるいは遺伝様式が整理しきれていない形質を親カードに表示します。<b>オフでも検索すれば出てきます。</b>'
      +'<br><b>ラインブリード形質</b> — リデュースドパターン・ハイゴールドなど選抜交配で作る傾向を親カードに表示します（確率計算の対象外）。',
    updBtn:'アップデート情報', contact:'お問い合わせ',
    mailNote:'情報の修正・ご要望は<b>お問い合わせ</b>からお送りください',
    emptyStart:'両親の形質を選んで<b>モルフを計算</b>を押してください。',
    emptyNone:'選択された形質がありません。<br>いずれかの親に遺伝形質を1つ以上選んでください。',
    resultsH:'仔のモルフ確率',
    summaryVisual:function(n){return '全 '+n+' 通りの表現型 · 確率の高い順';},
    summaryGeno:function(n){return '全 '+n+' 通りの遺伝型 · 確率の高い順';},
    normal:'ノーマル', comboTag:'コンボ', deadTag:'生存困難', healthTag:'健康注意',
    colProb:'確率', colVisual:'ビジュアル（発現）', colMorph:'モルフ（het 含む）', colHet:'Het（保因）', hetNone:'–',
    secGene:'遺伝モルフ（確率計算）',
    visualLbl:'ビジュアル', hetLbl:'ヘテロ', copy1:'1コピー', copy2:'2コピー', superLbl:'スーパー',
    partnerLbl:'2つ目の遺伝子', wildLbl:'ワイルド', nowLbl:'現在',
    warnH:'注意が必要な遺伝の組み合わせ・健康の問題',
    viveNote:function(p){return 'この組み合わせには<b>孵化・生存が困難な結果が '+p+'%</b> 含まれています。';},
    viveOn:'生存個体基準で見る', viveOff:'全体（理論値）で見る',
    viveBadge:'生存個体基準 — 生存困難な結果を除いて再計算した確率です',
    showAll:function(n){return '全 '+n+' 通りをすべて表示';},
    crossTag:'クロス', crossNote:'',
    polyH:'ラインブリード形質（確率計算不可）',
    polyDesc:'ポリジェニック（多因子）形質のため正確な確率は出せません。以下の形質は親が持ち、仔に程度の差はあれ現れる可能性があります。「(両方)」は両親とも持つ形質で、より強く発現する可能性があります。',
    polyBoth:'両方',
    proof:{ established:'', partial:'一部検証', contested:'未確定' },
    fakeSuperNote:'ラインブリード形質は遺伝子ではなく<b>選抜交配で強めた発現</b>です — 確率計算はできず、親より薄くも濃くも出ます。',
    note:'<b>この計算機が扱う形質</b> — パステル・エンチ・ファイアなどの不完全優性、アルビノ・パイボールド・クラウンなどの劣性、ピンストライプ・スパイダーなどの優性をメンデル遺伝で計算します。'
      +'<b>同じ座（対立遺伝子）としてまとめたもの</b> — ① BEL 複合（モハベ・レッサー・バター・ルッソ・スペシャル・ファントム・ミスティック）、② イエローベリー複合（YB・アスファルト・グラベル・スペクター）、'
      +'③ シナモン・ブラックパステル、④ アルビノ・ウルトラメル、⑤ キャンディ・トフィー。これらを独立遺伝子として扱う計算機とは結果が異なります。'
      +'<br><br><b>ホモが確認されていない遺伝子</b> — スパイダー・シャンパン・ウーマは、生きたホモ個体の確認例がありません。親の選択肢から2コピーを外し、仔の結果にのみ<b>生存困難</b>として表示します。'
      +'「生存個体基準で見る」を押すと、それらを除いて再計算した確率を確認できます。'
      +'<br><br><b>遺伝性の健康問題・不妊も表示します</b> — ボールパイソンはモルフごとに知られた健康問題があります。'
      +'<b>スパイダー</b>は持つ個体すべてが程度の差はあれウォブルを示し、<b>シャンパン・ウーマ・ヒドゥンジーンウーマ</b>にもウォブルやダックビルの報告があり、<b>2つ以上重なると症状が加算されます。</b>'
      +'とくに<b>シャンパン＋スパイダー</b>は孵化直後の死亡報告が繰り返されています。<b>デザートの雌はほぼ不妊</b>と報告され、この遺伝子は雄でのみ受け継ぐのが一般的です。'
      +'<b>スーパーシナモン・スーパーブラックパステル</b>はダックビル・キンク・孵化不全が多く、<b>キャラメルアルビノ</b>は初期系統でキンクの報告があります。'
      +'該当する組み合わせが出る場合、結果に<b>健康注意</b>の表示と説明が出ます。'
      +'<br><br><b>バナナ（コーラルグロー）</b>は性染色体と連鎖しており、系統によって仔の性比と発現が大きく偏ります。本計算機は性別を計算しません。'
      +'<br><br><b>ご留意ください</b> — ボールパイソンのモルフ名の多くは学術論文ではなくブリーダーの飼育記録と合意に基づいています。確率はあくまで参考であり、'
      +'実際に孵化した個体の外見は形質同士の相互作用や成長に伴う色変化によって異なる場合があります。重要な交配の判断は、血統を把握しているブリーダーにご相談ください。',
    terms:'利用規約', privacy:'プライバシーポリシー',
    seoIntroH:'ボールパイソン モルフ計算機',
    seoIntro:'ボールパイソンの両親の形質を選ぶと、仔のモルフと確率を計算します。パステル・モハベ・パイボールド・クラウン・アルビノなど60以上の遺伝子を検索で探して選べ、スパイダーのウォブルやデザート雌の不妊、スーパーシナモンの奇形といった遺伝性の健康問題も併せて表示します。登録不要・無料です。',
    footer:'確率はメンデル遺伝に基づく理論値です · ラインブリード（ポリジェニック）形質は確率計算の対象外です',
    updH:'アップデート情報', updDone:'更新済み', updSoon:'更新予定',
    updTitle:'更新履歴', modalMail:'お問い合わせ・ご提案:', btnToday:'今日は表示しない', btnClose:'閉じる',
    updDoneList:[
      'V1.0 テスト版リリース',
      '親カードごとのモルフ検索を追加（韓・英・日・中の名称と別名に対応）',
      'BEL・イエローベリー・シナモン・アルビノ・キャンディを対立遺伝子座として計算',
      'スパイダーのウォブル、デザート雌の不妊など健康に関する警告を追加',
      'コンボ名を追加 — バンブルビー・ファイアフライ・ピューター・パンダパイド・キャンディノなど。他の遺伝子が乗っても「エンチ バンブルビー」のように名前が続きます'
    ],
    updSoonList:[
      'モルフごとの写真・解説を追加予定',
      'バンブー・ダディなど BEL 複合の対立遺伝子の追加を検討'
    ],
    updMail:'お問い合わせ: ', today:'今日は表示しない', mclose:'閉じる',
    mailSubject:'ボールパイソン モルフ計算機 - 修正/ご要望',
  },
  zh:{
    htmlLang:'zh-Hans',
    title:'球蟒基因计算器',
    sub:'选择父母双方的基因，即可计算后代各形态的概率',
    langLabel:'语言', parentA:'亲本 A', parentB:'亲本 B',
    navStudio:'工作室', navGallery:'看看其他饲主的个体', navMail:'联系我们',
    parentRole:'选择遗传性状', helpBtn:'帮助',
    searchPh:'搜索形态（例：帕斯特, pied, yb）', searchClear:'清除搜索',
    searchNone:'没有匹配的形态，请换个写法或用英文名试试。',
    searchCount:function(n){return '显示 '+n+' 项';},
    selectedLabel:'已选性状', selNone:'尚未选择',
    reset:'重置', calc:'计算形态',
    modeVisual:'按表现型', modeGeno:'按基因型',
    partialToggle:'可能 het（66·33%）', extraToggle:'附加基因', polyToggle:'线育性状',
    optInfo:'选项说明',
    optNote:'<b>按表现型</b> — 仅按肉眼可见的形态归行，het（携带）在右侧单独标注。'
      +'<br><b>按基因型</b> — 将 het 也计为独立结果并展开。'
      +'<br><b>可能 het</b> — 在表格中显示 66%、33% 等概率性携带。球蟒<b>在出售时普遍直接标注 50%／66% het</b>，因此该选项默认开启。'
      +'<br><b>附加基因</b> — 把 Axanthic TSK、Monsoon 等较少使用或遗传方式尚未理清的性状显示在亲本卡片上。<b>即使关闭，搜索仍可找到。</b>'
      +'<br><b>线育性状</b> — 显示减纹、高金等通过选育得到的倾向，仅供参考（不参与概率计算）。',
    updBtn:'更新说明', contact:'联系我们',
    mailNote:'信息更正与功能建议请通过<b>联系我们</b>发送',
    emptyStart:'设置父母的性状后，点击<b>计算形态</b>。',
    emptyNone:'未选择任何性状。<br>请至少为一方选择一个遗传性状。',
    resultsH:'后代形态概率',
    summaryVisual:function(n){return '共 '+n+' 种表现型 · 按概率降序';},
    summaryGeno:function(n){return '共 '+n+' 种基因型 · 按概率降序';},
    normal:'普通', comboTag:'组合', deadTag:'不存活', healthTag:'健康提示',
    colProb:'概率', colVisual:'表现型', colMorph:'形态（含 het）', colHet:'Het（携带）', hetNone:'–',
    secGene:'遗传形态（可计算）',
    visualLbl:'表现', hetLbl:'het', copy1:'1个拷贝', copy2:'2个拷贝', superLbl:'超级',
    partnerLbl:'第二个基因', wildLbl:'野生型', nowLbl:'当前',
    warnH:'需要注意的基因组合与健康问题',
    viveNote:function(p){return '此配对包含 <b>'+p+'% 无法存活</b>的结果。';},
    viveOn:'按存活个体查看', viveOff:'查看完整理论值',
    viveBadge:'按存活个体计算 — 已剔除不存活结果并重新归一化',
    showAll:function(n){return '显示全部 '+n+' 种结果';},
    crossTag:'杂交', crossNote:'',
    polyH:'线育性状（非概率计算）',
    polyDesc:'这是多基因（polygenic）性状，无法计算精确概率。以下性状由父母携带，可能以不同程度出现在后代中。「(双方)」表示父母双方都携带，可能表现更强。',
    polyBoth:'双方',
    proof:{ established:'', partial:'部分验证', contested:'待确认' },
    fakeSuperNote:'线育性状不是基因，而是<b>通过选育强化的表现</b> — 无法计算概率，后代的表现可能比亲本更强或更弱。',
    note:'<b>本计算器涵盖的性状</b> — Pastel、Enchi、Fire 等不完全显性，白化、Piebald、Clown 等隐性，Pinstripe、Spider 等显性，均按孟德尔遗传计算。'
      +'<b>按同一基因座（等位基因）处理的有</b> — ① BEL 复合（Mojave、Lesser、Butter、Russo、Special、Phantom、Mystic），② Yellow Belly 复合（YB、Asphalt、Gravel、Specter），'
      +'③ Cinnamon 与 Black Pastel，④ 白化与 Ultramel，⑤ Candy 与 Toffee。若其他计算器将其视作独立基因，结果会不同。'
      +'<br><br><b>尚无确认纯合体的基因</b> — 超级 Spider、超级 Champagne、超级 Woma 都没有存活个体的确认记录。亲本选项中已移除 2 拷贝，仅在后代结果中标注为<b>不存活</b>。'
      +'点击「按存活个体查看」可查看剔除后重新归一化的概率。'
      +'<br><br><b>同时提示遗传性健康问题与不育</b> — 球蟒的部分形态有已知的健康问题。'
      +'<b>Spider</b> 的携带个体无一例外都有不同程度的摇头，<b>Champagne、Woma、Hidden Gene Woma</b> 也有摇头与鸭嘴的报告，<b>叠加两个以上时症状会累加</b>。'
      +'其中 <b>Champagne + Spider</b> 反复出现孵出后不久死亡的报告。<b>Desert 雌性被报告基本不育</b>，因此该基因通常只通过雄性延续；'
      +'<b>超级 Cinnamon／超级 Black Pastel</b> 的鸭嘴、脊椎扭结与孵化失败更常见；<b>焦糖白化</b>在早期品系中有扭结报告。'
      +'当配对可能产出这些个体时，结果中会显示<b>健康提示</b>与说明。'
      +'<br><br><b>Banana（Coral Glow）</b>与性染色体连锁，后代性别比例与表现会因品系而明显偏向一侧。本计算器不计算性别。'
      +'<br><br><b>请务必了解</b> — 球蟒的大多数形态名称来自繁育者的饲养记录与社群共识，而非已发表的研究。本计算器给出的概率仅供参考；'
      +'由于性状之间会相互影响，且体色会随成长变化，实际孵化个体的外观可能与预测不同。做重要配对决定前，请咨询了解血统的繁育者。',
    terms:'使用条款', privacy:'隐私政策',
    seoIntroH:'球蟒基因计算器',
    seoIntro:'选择球蟒父母双方的性状，即可计算后代形态与概率。可搜索 60 多种基因（Pastel、Mojave、Piebald、Clown、白化等）并直接选择，同时提示 Spider 摇头症、Desert 雌性不育、超级 Cinnamon 畸形等遗传健康问题。免注册免费使用。',
    footer:'概率为基于孟德尔遗传的理论值 · 线育（多基因）性状不在概率计算范围内',
    updH:'更新说明', updDone:'已更新', updSoon:'计划中',
    updTitle:'更新记录', modalMail:'咨询与建议:', btnToday:'今天不再显示', btnClose:'关闭',
    updDoneList:[
      'V1.0 测试版发布',
      '新增亲本卡片内的形态搜索（支持韩英日中名称与别名）',
      'BEL、Yellow Belly、Cinnamon、白化、Candy 按等位基因座计算',
      '新增 Spider 摇头症、Desert 雌性不育等健康警告',
      '新增组合名称 — Bumblebee、Firefly、Pewter、Panda Pied、Candino 等。即使叠加其他基因，名称也会保留，如「Enchi Bumblebee」'
    ],
    updSoonList:[
      '计划补充各形态的照片与说明',
      '评估加入 Bamboo、Daddy 等 BEL 复合等位基因'
    ],
    updMail:'联系: ', today:'今天不再显示', mclose:'关闭',
    mailSubject:'球蟒基因计算器 - 信息更正 / 功能建议',
  },
};

/* 언어별 주소(/en/ballpython/ 등)는 이 파일보다 먼저 var LANG 을 정해둡니다. */
if(!I18N[LANG]) LANG='ko';
let MODE='visual';
/* ⚠️ 볼파이톤도 50%·66% 헷 표기를 분양에 그대로 쓰기 때문에 기본값이 true 입니다.
   index.html 의 #partialchk 도 aria-pressed="true" 로 맞춰 두었습니다.
   반대로 라인브리딩 형질은 이 종에서 비중이 작고 카드가 이미 길어서 기본 꺼짐입니다. */
let showPartialHet=true, showPoly=false, showExtra=false, hasResult=false;
let liveOdds=false, expandAll=false;
const ROW_CAP=60;                     // 표가 길어지면 우선 60행만
function L(){ return I18N[LANG]; }

/* 부모 카드별 검색어 */
const QUERY={ A:'', B:'' };

/* 계산에 들어가는 유전자 — 고른 것은 [추가 유전자] 토글과 무관하게 모두 셉니다.
   검색으로 찾아 고른 추가 유전자가 조용히 빠지면 결과가 틀립니다. */
function usedGenes(){
  return BP_ALL_GENES().filter(function(g){ return !bpIsIdle(g,'A') || !bpIsIdle(g,'B'); });
}
/* 그 카드에 그릴 유전자 목록 */
function cardGenes(side){
  const q=QUERY[side];
  return BP_ALL_GENES().filter(function(g){
    if(!bpIsIdle(g,side)) return true;          // 이미 고른 것은 항상 남깁니다
    if(q) return bpMatches(g,q);                // 검색 중에는 [추가 유전자] 와 무관
    return g.core || showExtra;
  });
}
/* 다대립 자리는 검색에 걸리면 <b>자리째</b> 보여줍니다.
   '레서' 만 남기고 나머지를 감추면 두 번째 유전자를 고를 수 없어서, 이 자리에서
   실제로 하고 싶은 일(레서 + 무엇 = 무엇)을 할 수 없습니다. */
function cardAlleles(g, side){ return g.alleles; }

/* ================= 부모 카드 UI ================= */
function secHeader(text){ const d=document.createElement('div'); d.className='sechead'; d.textContent=text; return d; }
function proofTag(g){
  const p=L().proof[g.proof]; return p? ' <span class="chipq">'+escapeHtml(p)+'</span>' : '';
}
function mkChip(side, on, label, color, risky, tag){
  const chip=document.createElement('button'); chip.type='button';
  chip.className='chip'+(side==='B'?' b':'')+(on?' on':'');
  chip.innerHTML='<span class="sw" style="background:'+(color||'#CFC7A0')+'"></span>'+escapeHtml(label)
    +(risky?' <i class="bi bi-heart-pulse chiprisk" aria-hidden="true"></i>':'')+(tag||'');
  return chip;
}
function afterPick(side){ buildParent(side); if(hasResult) calculate(); }

/* 열성 / 불완전우성 / 우성 : 칩 + 서브 세그먼트 */
function twoStateChip(g, side, labels){
  const wrap=document.createElement('div'); wrap.className='chipwrap';
  const on = BP_STATE[side][g.id]!=='nn';
  const risky = !!(g.warnOnVisible||g.warnOnVisual||g.warnOnSuper||g.superNonViable);
  const chip=mkChip(side, on, gName(g), BP_COLOR[g.id], risky, proofTag(g));
  chip.onclick=function(){
    BP_STATE[side][g.id]= on ? 'nn' : (g.type==='rec' ? 'mm' : 'het');
    afterPick(side);
  };
  wrap.appendChild(chip);
  if(on && labels.length){
    const seg=document.createElement('div'); seg.className='subseg'+(side==='B'?' b':'');
    labels.forEach(function(pair){
      const b=document.createElement('button'); b.type='button'; b.textContent=pair[1];
      if(BP_STATE[side][g.id]===pair[0]) b.classList.add('on');
      b.onclick=function(e){ e.stopPropagation(); BP_STATE[side][g.id]=pair[0]; afterPick(side); };
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
  }
  return wrap;
}

/* 다대립 자리 : 대립유전자 칩 + '두 번째 유전자' 세그먼트 하나 */
function multiBlock(host, g, side){
  const list=cardAlleles(g, side);
  if(!list.length) return 0;
  const cur=String(BP_STATE[side][g.id]||'n|n').split('|');
  const grid=document.createElement('div'); grid.className='chipgrid';
  list.forEach(function(a){
    const on = cur.indexOf(a.id)>=0;
    const risky = !!(a.warn || (g.pairDefault&&g.pairDefault.warn));
    const chip=mkChip(side, on, tr(a), a.color||BP_COLOR[a.id], risky, proofTag(g));
    chip.onclick=function(){
      const solo=bpGenoKey(g, a.id, 'n');
      BP_STATE[side][g.id] = (BP_STATE[side][g.id]===solo) ? 'n|n' : solo;
      afterPick(side);
    };
    grid.appendChild(chip);
  });
  host.appendChild(grid);

  if(!bpIsIdle(g, side)){
    /* 기준이 되는 대립유전자 = 유전형 키의 앞쪽(야생형이 아닌 것) */
    const base = cur[0]!=='n' ? cur[0] : cur[1];
    const partner = (cur[0]===base) ? cur[1] : cur[0];
    const row=document.createElement('div'); row.className='locussel';
    const lab=document.createElement('span'); lab.className='locussel-lb'; lab.textContent=L().partnerLbl;
    row.appendChild(lab);
    const seg=document.createElement('div'); seg.className='subseg wrap'+(side==='B'?' b':'');
    const opts=[['n', L().wildLbl]].concat(g.alleles.map(function(a){ return [a.id, tr(a)]; }));
    opts.forEach(function(o){
      const b=document.createElement('button'); b.type='button'; b.textContent=o[1];
      if(partner===o[0]) b.classList.add('on');
      b.onclick=function(){ BP_STATE[side][g.id]=bpGenoKey(g, base, o[0]); afterPick(side); };
      seg.appendChild(b);
    });
    row.appendChild(seg);
    const now=document.createElement('div'); now.className='locusnow';
    const info=bpGenoInfo(g, BP_STATE[side][g.id]);
    now.textContent='= '+(info.name || gName(g));
    row.appendChild(now);
    host.appendChild(row);
  }
  return list.length;
}

function traitChip(t, side){
  const on = BP_STATE[side][t.id]==='yes';
  const chip=mkChip(side, on, tName(t), BP_COLOR[t.id], false, '');
  chip.onclick=function(){ BP_STATE[side][t.id]= on ? 'no' : 'yes'; afterPick(side); };
  return chip;
}

function famBlock(host, fam, genes, side){
  if(!genes.length) return 0;
  const h=document.createElement('div'); h.className='famhead';
  h.innerHTML='<span class="famname">'+escapeHtml(tr(fam))+'</span>'
    +'<span class="fambadge badge-'+fam.type+'">'+escapeHtml(tr(fam))+'</span>'
    +'<div class="famdesc">'+escapeHtml(tr(fam.desc))+'</div>';
  host.appendChild(h);
  let shown=0;
  const flat=document.createElement('div'); flat.className='chipgrid';
  genes.forEach(function(g){
    if(g.kind==='multi') return;                       // 다대립 자리는 따로 그립니다
    if(g.type==='incdom'){ flat.appendChild(twoStateChip(g, side, [['het',L().copy1],['mm',L().superLbl]])); shown++; return; }
    if(g.type==='dom'){
      /* 동형이 확인되지 않은 우성(스파이더·챔페인·워마)은 2카피를 고를 수 없습니다 */
      flat.appendChild(twoStateChip(g, side, bpSelectableAsParent(g,'mm') ? [['het',L().copy1],['mm',L().copy2]] : []));
      shown++; return;
    }
    flat.appendChild(twoStateChip(g, side, [['het',L().hetLbl],['mm',L().visualLbl]])); shown++;
  });
  if(flat.childNodes.length) host.appendChild(flat);
  genes.forEach(function(g){
    if(g.kind!=='multi') return;
    const sub=document.createElement('div'); sub.className='locusblock';
    const t=document.createElement('div'); t.className='locustitle';
    t.innerHTML=escapeHtml(gName(g))+proofTag(g);
    sub.appendChild(t);
    const n=multiBlock(sub, g, side);
    if(n){ host.appendChild(sub); shown+=n; }
  });
  if(!shown){ host.removeChild(h); return 0; }
  /* 유전자별 보충 설명 — 검색으로 아무것도 안 남은 계열의 설명은 띄우지 않습니다 */
  genes.filter(function(g){return g.note;}).forEach(function(g){
    const n=document.createElement('div'); n.className='locusnote'; n.style.marginTop='7px';
    n.innerHTML=tr(g.note); host.appendChild(n);
  });
  return shown;
}

function buildParent(side){
  const host=document.getElementById(side==='A'?'parentA':'parentB');
  host.innerHTML='';
  const pi=bpParentInfo(side);
  const matched=bpComboName(pi.tokens, pi.tnames);
  if(matched){
    const badge=document.createElement('div'); badge.className='parentcombo'+(side==='B'?' b':'');
    badge.textContent='= '+matched.name; host.appendChild(badge);
  }
  host.appendChild(secHeader(L().secGene));
  const genes=cardGenes(side);
  let shown=0;
  shown+=famBlock(host, BP_FAMILIES[0], genes.filter(function(g){
    return g.type==='incdom' || (g.kind==='multi' && g.visibleHet); }), side);
  shown+=famBlock(host, BP_FAMILIES[1], genes.filter(function(g){
    return g.type==='rec' || (g.kind==='multi' && !g.visibleHet); }), side);
  shown+=famBlock(host, BP_FAMILIES[2], genes.filter(function(g){ return g.type==='dom'; }), side);

  const q=QUERY[side];
  const traits=BP_TRAITS.filter(function(t){
    if(BP_STATE[side][t.id]==='yes') return true;
    if(q) return bpMatches(t,q);
    return showPoly;
  });
  if(traits.length){
    const pf=BP_FAMILIES[3];
    const ph=document.createElement('div'); ph.className='famhead';
    ph.innerHTML='<span class="famname">'+escapeHtml(tr(pf))+'</span>'
      +'<span class="fambadge badge-poly">'+escapeHtml(tr(pf))+'</span>'
      +'<div class="famdesc">'+escapeHtml(tr(pf.desc))+'</div>';
    host.appendChild(ph);
    BP_TRAIT_GROUPS.forEach(function(grp){
      const list=traits.filter(function(t){return t.grp===grp.id;});
      if(!list.length) return;
      host.appendChild(secHeader(tr(grp)));
      const g=document.createElement('div'); g.className='chipgrid';
      list.forEach(function(t){ g.appendChild(traitChip(t, side)); });
      host.appendChild(g);
    });
    if(!q){
      const fs=document.createElement('div'); fs.className='locusnote'; fs.style.marginTop='9px';
      fs.innerHTML=L().fakeSuperNote; host.appendChild(fs);
    }
    shown+=traits.length;
  }

  if(q && !shown){
    const none=document.createElement('div'); none.className='searchnone';
    none.textContent=L().searchNone; host.appendChild(none);
  }
  const cnt=document.getElementById('cnt'+side);
  if(cnt) cnt.textContent = q ? L().searchCount(shown) : '';
  renderSelected();   // 선택 요약 갱신
}

/* ================= 계산 ================= */
const PIE_COLORS=['#0E7C7B','#3B8DA0','#EAC36A','#6B5686','#C67B4A','#7FA653','#4E7CA8','#B06A86','#5FB0A8','#D0A24E','#8A8375','#9E5C5C'];

function selectedTraits(){
  const s=[]; BP_TRAITS.forEach(function(t){ if(BP_STATE.A[t.id]==='yes'||BP_STATE.B[t.id]==='yes') s.push(t.id); });
  return s;
}
function gatherPoly(){
  return BP_TRAITS.filter(function(t){ return BP_STATE.A[t.id]==='yes'||BP_STATE.B[t.id]==='yes'; })
    .map(function(t){ return { name:tName(t), both: BP_STATE.A[t.id]==='yes' && BP_STATE.B[t.id]==='yes' }; });
}

let LAST=null;
function calculate(){
  const genes=usedGenes();
  let rows=null, raw=[];
  if(genes.length){
    const traits=selectedTraits();
    raw=bpCross(genes, MODE);
    rows=raw.map(function(r){
      /* 콤보에 안 들어간 유전자는 이름 앞에 붙습니다 — '엔치 범블비'.
         남은 것이 없으면(exact) 예전처럼 콤보명만 나옵니다. */
      const cb=bpComboName(r.tokens, r.tnames);
      return {
        prob:r.prob,
        combo: cb ? cb.name : null,
        label: bpJoin(r.parts) || L().normal,
        isNormal: r.parts.length===0,
        tokens:[].concat(Array.from(r.tokens)), traits:traits,
        nonViable:r.nonViable, health:r.health,
        guaranteed: r.hets.filter(function(h){return h.p>=0.999;}).map(function(h){return h.name;}),
        partial:    r.hets.filter(function(h){return h.p<0.999;})
                          .map(function(h){ return {name:h.name, pct:Math.floor(h.p*100+1e-9)}; }),
      };
    });
  }
  const warnings=bpCollectWarnings(genes, raw);
  const poly=gatherPoly();
  LAST={ rows:rows, warnings:warnings, poly:poly,
         anything:(rows&&rows.length)||warnings.length||poly.length };
  hasResult=!!LAST.anything;
  render(LAST);
}

function buildPie(rows){
  let acc=0; const segs=[];
  rows.forEach(function(r,i){
    const start=acc, end=acc+r.prob*100; acc=end;
    r._color=PIE_COLORS[i%PIE_COLORS.length];
    segs.push(r._color+' '+start.toFixed(4)+'% '+end.toFixed(4)+'%');
  });
  const top=rows[0];
  return '<div class="pie-wrap"><div class="pie" style="background:conic-gradient('+segs.join(',')+')"><div class="pie-hole">'
    +ballSVG(bpProfile(top.tokens, top.traits), 96)
    +'<div class="pie-top">'+(top.prob*100>=9.95? Math.round(top.prob*100) : (top.prob*100).toFixed(1))+'%</div>'
    +'</div></div></div>';
}
function pctStr(p){ const n=p*100; return n>=9.95? n.toFixed(0) : n>=0.995? n.toFixed(1) : n.toFixed(2); }

function render(payload){
  const host=document.getElementById('results'), t=L();
  if(!payload || !payload.anything){ host.innerHTML='<div class="empty">'+t.emptyNone+'</div>'; return; }
  let html='';
  if(payload.warnings && payload.warnings.length){
    html+='<div class="warnhead"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> '+t.warnH+'</div>';
    payload.warnings.forEach(function(w){ html+='<div class="warnbox warn-'+w.level+'">'+w.text+'</div>'; });
  }
  if(payload.rows && payload.rows.length){
    let rows=payload.rows;
    const deadP=rows.filter(function(r){return r.nonViable;}).reduce(function(s,r){return s+r.prob;},0);
    if(deadP>1e-12){
      html+='<div class="vbar"><span>'+t.viveNote(pctStr(deadP))+(liveOdds? ' — '+escapeHtml(t.viveBadge) : '')+'</span>'
          +'<button type="button" onclick="toggleLive()">'+escapeHtml(liveOdds? t.viveOff : t.viveOn)+'</button></div>';
    }
    if(liveOdds && deadP>1e-12 && deadP<1-1e-12){
      rows=rows.filter(function(r){return !r.nonViable;})
               .map(function(r){ const o={}; for(var k in r) o[k]=r[k]; o.prob=r.prob/(1-deadP); return o; });
    }
    html+='<h2>'+t.resultsH+'</h2><div class="summary">'
        +(MODE==='geno'? t.summaryGeno(rows.length) : t.summaryVisual(rows.length))+'</div>';
    html+=buildPie(rows);
    const showHet=(MODE==='visual');
    const shown = (expandAll || rows.length<=ROW_CAP) ? rows : rows.slice(0,ROW_CAP);
    html+='<table class="rtable"><thead><tr><th>'+t.colProb+'</th><th>'
        +(showHet? t.colVisual : t.colMorph)+'</th>'+(showHet? '<th>'+t.colHet+'</th>':'')+'</tr></thead><tbody>';
    shown.forEach(function(r){
      let vtext='';
      if(r.nonViable) vtext+='<span class="deadtag">'+t.deadTag+'</span>';
      else if(r.health) vtext+='<span class="healthtag">'+t.healthTag+'</span>';
      vtext += r.combo
        ? '<span class="combotag">'+t.comboTag+'</span>'+escapeHtml(r.combo)+'<div class="submorph">'+escapeHtml(r.label)+'</div>'
        : escapeHtml(r.label);
      html+='<tr'+(r.nonViable?' class="dead"':'')+'>'
        +'<td class="c-prob"><span class="cdot" style="background:'+r._color+'"></span>'+pctStr(r.prob)+'%'
        +'<span class="cfrac">'+bpFrac(r.prob)+'</span></td>'
        +'<td class="c-vis"><div class="visrow"><span class="geckothumb">'+ballSVG(bpProfile(r.tokens,r.traits),46)+'</span>'
        +'<span class="vtext'+(r.isNormal?' isnorm':'')+'">'+vtext+'</span></div></td>';
      if(showHet){
        const parts=[];
        r.guaranteed.forEach(function(n){ parts.push('<span class="het100">100HET '+escapeHtml(n)+'</span>'); });
        if(showPartialHet) r.partial.forEach(function(p){ parts.push('<span class="hetp">'+p.pct+'HET '+escapeHtml(p.name)+'</span>'); });
        html+='<td class="c-het">'+(parts.length? parts.join('') : '<span class="hetnone">'+t.hetNone+'</span>')+'</td>';
      }
      html+='</tr>';
    });
    html+='</tbody></table>';
    if(shown.length<rows.length)
      html+='<button type="button" class="morebtn" onclick="expandRows()">'+escapeHtml(t.showAll(rows.length))+'</button>';
  }
  if(payload.poly && payload.poly.length){
    html+='<div class="polyblock"><h3>'+t.polyH+'</h3><div class="pdesc">'+t.polyDesc+'</div>';
    payload.poly.forEach(function(p){
      html+='<span class="polychip'+(p.both?' both':'')+'">'+escapeHtml(p.name)+(p.both?' ('+t.polyBoth+')':'')+'</span>';
    });
    html+='</div>';
  }
  host.innerHTML=html;
}
function toggleLive(){ liveOdds=!liveOdds; render(LAST); }
function expandRows(){ expandAll=true; render(LAST); }

function resetAll(){
  bpResetState(); hasResult=false; liveOdds=false; expandAll=false;
  QUERY.A=''; QUERY.B='';
  ['A','B'].forEach(function(s){ const el=document.getElementById('q'+s); if(el) el.value=''; });
  buildParent('A'); buildParent('B');
  document.getElementById('results').innerHTML='<div class="empty">'+L().emptyStart+'</div>';
}

/* ===== 선택된 형질 요약 =====
   화면의 .chip.on 을 훑는 대신 상태에서 바로 만듭니다. 검색으로 칩이 가려져
   있어도 요약에는 남아야 하고, 다대립 자리는 칩 두 개가 켜져도 결과는 유전형
   하나('모하비 팬텀')이기 때문입니다. ✕ 를 누르면 그 자리만 비웁니다. */
function selLabel(g, side){
  const st=BP_STATE[side][g.id];
  if(g.kind==='multi'){
    const i=bpGenoInfo(g, st);
    return { text:(i.name || gName(g)), color:BP_COLOR[i.token] || BP_COLOR[String(st).split('|')[0]] };
  }
  if(g.type==='rec')    return { text:(st==='het'? gHet(g) : gName(g)), color:BP_COLOR[g.id] };
  if(g.type==='incdom') return { text:(st==='het'? gName(g) : gSuper(g)),
                                 color:BP_COLOR[st==='het'? g.id : (g.supToken||('super_'+g.id))] || BP_COLOR[g.id] };
  return { text: gName(g)+(st==='mm'? ' ('+L().copy2+')' : ''), color:BP_COLOR[g.id] };
}
function clearGene(side, id){
  const g=BP_ALL_GENES().filter(function(x){return x.id===id;})[0];
  if(g) BP_STATE[side][g.id]=bpDefaultState(g);
  else  BP_STATE[side][id]='no';                 // 라인브리딩 형질
  afterPick(side);
}
function renderSelected(){
  ['A','B'].forEach(function(side){
    const box=document.getElementById('sel'+side);
    if(!box) return;
    const picked=[];
    BP_ALL_GENES().forEach(function(g){
      if(bpIsIdle(g,side)) return;
      const s=selLabel(g, side);
      picked.push({ id:g.id, label:s.text, color:s.color });
    });
    BP_TRAITS.forEach(function(t){
      if(BP_STATE[side][t.id]!=='yes') return;
      picked.push({ id:t.id, label:tName(t), color:BP_COLOR[t.id] });
    });
    if(!picked.length){
      box.innerHTML='<span class="sel-none">'+escapeHtml(L().selNone)+'</span>';
      return;
    }
    box.innerHTML=picked.map(function(p){
      return '<button type="button" class="selchip" onclick="clearGene(\''+side+'\',\''+p.id+'\')">'
        +(p.color? '<span class="sw" style="background:'+escapeHtml(p.color)+'"></span>':'')
        +escapeHtml(p.label)+'<i class="bi bi-x selx" aria-hidden="true"></i></button>';
    }).join('');
  });
}

/* ================= 언어 적용 ================= */
function applyLang(){
  const t=L();
  document.documentElement.lang=t.htmlLang;
  const set=function(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; };
  const setH=function(id,v){ const e=document.getElementById(id); if(e) e.innerHTML=v; };
  set('h-title',t.title); set('h-sub',t.sub);
  set('lbl-pa',t.parentA); set('lbl-pb',t.parentB);
  set('lbl-pa-role',t.parentRole); set('lbl-pb-role',t.parentRole);
  /* '선택 도움말' 버튼 두 개를 없앴습니다. 상단의 '표시 옵션 설명' 과 똑같은
     #optNote 를 여는 버튼이라, 한 화면에 같은 것을 여는 버튼이 셋이었습니다. */
  set('lbl-selected',t.selectedLabel);
  set('lbl-sel-a',t.parentA); set('lbl-sel-b',t.parentB);
  ['A','B'].forEach(function(s){
    const el=document.getElementById('q'+s);
    if(el){ el.placeholder=t.searchPh; el.setAttribute('aria-label', t.searchPh); }
    const cl=document.getElementById('qclr'+s);
    if(cl) cl.setAttribute('aria-label', t.searchClear);
  });
  setH('btn-reset','<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i><span>'+escapeHtml(t.reset)+'</span>');
  setH('btn-calc','<i class="bi bi-calculator" aria-hidden="true"></i><span>'+escapeHtml(t.calc)+'</span><i class="bi bi-chevron-right calc-arrow" aria-hidden="true"></i>');
  set('lbl-mode-visual',t.modeVisual); set('lbl-mode-geno',t.modeGeno);
  set('lbl-partial',t.partialToggle); set('lbl-extra',t.extraToggle);
  set('lbl-poly',t.polyToggle); set('lbl-optinfo',t.optInfo);
  setH('optNote',t.optNote);
  setH('btn-upd','<i class="bi bi-file-earmark-text" aria-hidden="true"></i><span>'+escapeHtml(t.updBtn)+'</span>');
  set('lbl-contact',t.contact);
  setH('mailNote',t.mailNote+' ('+BP_CONTACT_MAIL+')');
  setH('note',t.note);
  set('lbl-terms',t.terms); set('lbl-privacy',t.privacy);
  set('footer',t.footer); set('lbl-langtitle',t.langLabel);
  /* 헤더·하단의 고정 문구. HTML 에 한국어로 박혀 있어서 영어·일본어·중국어
     페이지에 그대로 남아 있었습니다 — 계산 결과는 번역되는데 그 주변만
     한국어라, 바깥에서 들어온 사람에게는 반쯤 깨진 화면으로 보입니다. */
  [['.blink.home span', 'navStudio'],
   ['.bottom-links .blink:not(#mailLink) span', 'navGallery'],
   ['#mailLink span', 'navMail']].forEach(function (pair) {
    const node = document.querySelector(pair[0]);
    if (node && t[pair[1]]) node.textContent = t[pair[1]];
  });
  setH('lbl-updh','<i class="bi bi-megaphone" aria-hidden="true"></i> '+escapeHtml(t.updH));
  setH('lbl-upddone','<i class="bi bi-check-circle-fill" aria-hidden="true"></i> '+escapeHtml(t.updDone));
  setH('lbl-updsoon','<i class="bi bi-clock" aria-hidden="true"></i> '+escapeHtml(t.updSoon));
  setH('updDone', t.updDoneList.map(function(x){return '<li>'+x+'</li>';}).join(''));
  setH('updSoon', t.updSoonList.map(function(x){return '<li>'+x+'</li>';}).join(''));
  setH('updMail', t.updMail+'<a href="mailto:'+BP_CONTACT_MAIL+'">'+BP_CONTACT_MAIL+'</a>');
  set('lbl-today',t.today); set('lbl-mclose',t.mclose);
  document.getElementById('mailLink').href='mailto:'+BP_CONTACT_MAIL+'?subject='+encodeURIComponent(t.mailSubject);
  document.querySelectorAll('#langMenu button').forEach(function(b){ b.classList.toggle('on', b.dataset.lang===LANG); });
  buildParent('A'); buildParent('B');
  if(hasResult) calculate();
  else document.getElementById('results').innerHTML='<div class="empty">'+t.emptyStart+'</div>';
}
function setLang(lang){ if(lang===LANG) return; LANG=lang; applyLang(); }

/* ================= 초기화 ================= */
const langMenuEl=document.getElementById('langMenu'), langBtnEl=document.getElementById('langBtn');
document.body.appendChild(langMenuEl);
function placeLangMenu(){
  const button=langBtnEl.getBoundingClientRect();
  const width=langMenuEl.offsetWidth, height=langMenuEl.offsetHeight;
  const margin=12, gap=8;
  const maxLeft=Math.max(margin, window.innerWidth-width-margin);
  const left=Math.min(Math.max(margin, button.right-width), maxLeft);
  const below=button.bottom+gap;
  const top=below+height<=window.innerHeight-margin
    ? below
    : Math.max(margin, button.top-height-gap);
  langMenuEl.style.position='fixed';
  langMenuEl.style.inset=top+'px auto auto '+left+'px';
}
langBtnEl.addEventListener('click',function(e){
  e.stopPropagation();
  const open=langMenuEl.classList.toggle('open');
  if(open) placeLangMenu();
});
document.querySelectorAll('#langMenu button').forEach(function(b){
  b.addEventListener('click',function(){ setLang(b.dataset.lang); langMenuEl.classList.remove('open'); });
});
document.addEventListener('click',function(e){
  if(langMenuEl.classList.contains('open') && !langMenuEl.contains(e.target) && !langBtnEl.contains(e.target))
    langMenuEl.classList.remove('open');
});
window.addEventListener('resize',function(){ if(langMenuEl.classList.contains('open')) placeLangMenu(); });
window.addEventListener('scroll',function(){ langMenuEl.classList.remove('open'); }, true);

(function(){
  // ⚠️ [data-mode] 로 범위를 좁힙니다. 세그먼트 바에 옵션 버튼도 함께 들어 있어서
  //    '#modeSeg button' 으로 잡으면 옵션을 눌러도 MODE 가 바뀌어 버립니다.
  document.querySelectorAll('#modeSeg button[data-mode]').forEach(function(b){
    b.addEventListener('click',function(){
      MODE=b.dataset.mode; expandAll=false;
      document.querySelectorAll('#modeSeg button[data-mode]').forEach(function(x){ x.classList.toggle('on', x===b); });
      if(hasResult) calculate();
    });
  });
  const press=function(el,on){ el.setAttribute('aria-pressed', on?'true':'false'); };
  const pc=document.getElementById('partialchk'), ex=document.getElementById('extrachk'),
        py=document.getElementById('polychk');
  press(pc, showPartialHet); press(ex, showExtra); press(py, showPoly);
  pc.addEventListener('click',function(){ showPartialHet=!showPartialHet; press(pc,showPartialHet); if(hasResult) calculate(); });
  ex.addEventListener('click',function(){ showExtra=!showExtra; press(ex,showExtra); buildParent('A'); buildParent('B'); if(hasResult) calculate(); });
  py.addEventListener('click',function(){ showPoly=!showPoly; press(py,showPoly); buildParent('A'); buildParent('B'); if(hasResult) calculate(); });
  const ib=document.getElementById('optInfoBtn'), nt=document.getElementById('optNote');
  ib.addEventListener('click',function(){
    const on=!nt.classList.contains('show');
    nt.classList.toggle('show',on); ib.setAttribute('aria-expanded', on?'true':'false');
  });

  /* 부모 카드 검색 — 입력창은 #parentA/#parentB 바깥(카드 머리)에 있습니다.
     안에 두면 칩을 누를 때마다 다시 그려지면서 포커스와 커서가 날아갑니다. */
  ['A','B'].forEach(function(side){
    const el=document.getElementById('q'+side);
    const clr=document.getElementById('qclr'+side);
    if(!el) return;
    el.addEventListener('input',function(){
      QUERY[side]=el.value;
      if(clr) clr.classList.toggle('show', !!el.value);
      buildParent(side);
    });
    /* 엔터로 폼이 제출되는 일이 없게 (input 은 form 밖이지만 습관적으로 누릅니다) */
    el.addEventListener('keydown',function(e){ if(e.key==='Enter') e.preventDefault(); });
    if(clr) clr.addEventListener('click',function(){
      el.value=''; QUERY[side]=''; clr.classList.remove('show'); buildParent(side); el.focus();
    });
  });
})();

/* 부모 카드의 ⓘ 버튼 — 세그먼트 바의 설명을 펼칩니다 */
function toggleOptNote(){
  const nt=document.getElementById('optNote'), ib=document.getElementById('optInfoBtn');
  const on=!nt.classList.contains('show');
  nt.classList.toggle('show',on);
  if(ib) ib.setAttribute('aria-expanded', on?'true':'false');
  if(on) nt.scrollIntoView({behavior:'smooth', block:'nearest'});
}

/* ===== 업데이트 노트 모달 ===== */
const UPD_VER='bp-2026-07-29a';
function todayKey(){ try{ return new Date().toISOString().slice(0,10); }catch(e){ return 'x'; } }
function openUpd(){ document.getElementById('updModal').classList.add('show'); }
function closeUpd(){ document.getElementById('updModal').classList.remove('show'); }
function dismissToday(){ try{ localStorage.setItem('bpUpdDismiss', UPD_VER+'|'+todayKey()); }catch(e){} closeUpd(); }
document.getElementById('updModal').addEventListener('click',function(e){ if(e.target.id==='updModal') closeUpd(); });

applyLang();

(function(){
  let dismissed=false;
  try{ dismissed=(localStorage.getItem('bpUpdDismiss')===UPD_VER+'|'+todayKey()); }catch(e){ dismissed=false; }
  /* 서버에서 받은 문구가 확정된 뒤에 엽니다. 기본 문구로 먼저 열면 읽는 도중에
     내용이 바뀝니다(assets/uitext.js 참고). 늦어지면 기본 문구로 그냥 엽니다. */
  if(!dismissed){
    if(window.StudioText && StudioText.whenReady) StudioText.whenReady(1200).then(openUpd);
    else openUpd();
  }
})();
