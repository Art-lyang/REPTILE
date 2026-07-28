/* fattail-ui.js — 펫테일(아프리카 팻테일) 계산기 화면 로직
   crested-ui.js 와 같은 구조입니다. 레이아웃을 고칠 일이 있으면 두 파일을 함께 보세요.

   ※ 이 종은 브리더들이 66%·33% 가능성 헷을 실제 분양 표기에 그대로 쓰기 때문에
     [가능성 헷] 옵션이 처음부터 켜져 있습니다. (crested/leopard 는 기본 꺼짐) */

/* ================= 다국어 사전 ================= */
const I18N = {
  ko:{
    htmlLang:'ko',
    title:'펫테일 게코 모프 계산기',
    sub:'부모의 유전 형질을 선택해 새끼 모프 확률을 계산하세요',
    langLabel:'언어', parentA:'부모 A', parentB:'부모 B',
    parentRole:'유전 형질 선택', helpBtn:'선택 도움말',
    selectedLabel:'선택된 형질', selNone:'아직 고르지 않았어요',
    reset:'초기화', calc:'모프 계산하기',
    modeVisual:'표현형 기준', modeGeno:'유전형 기준',
    partialToggle:'가능성 헷 (66·33%)', extraToggle:'추가 유전자', polyToggle:'라인브리딩 형질',
    optInfo:'표시 옵션 설명',
    optNote:'<b>표현형 기준</b> — 눈으로 보이는 모프만 행으로 묶고, 헷(보인자)은 오른쪽 칸에 따로 표기합니다.'
      +'<br><b>유전형 기준</b> — 헷도 하나의 결과로 세어 펼칩니다.'
      +'<br><b>가능성 헷</b> — 66%·33% 처럼 확률적인 보인자를 표에 표시합니다. 펫테일은 <b>66% 헷·33% 헷 표기를 실제 분양에서 그대로 쓰는 종</b>이라 이 옵션이 처음부터 켜져 있습니다.'
      +'<br><b>추가 유전자</b> — 화이트삭스처럼 유전 방식이 아직 확실하지 않은 형질을 계산에 넣습니다.'
      +'<br><b>라인브리딩 형질</b> — 애버런트·정글·탠저린 같은 다인자 형질을 부모 카드에 표시합니다(확률 계산 대상 아님).',
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
    visualLbl:'비주얼', hetLbl:'헷', copy1:'1카피', copy2:'2카피',
    warnH:'주의가 필요한 유전 조합',
    viveNote:function(p){return '이 조합에는 <b>부화·생존이 어려운 결과</b>가 '+p+'% 포함되어 있습니다.';},
    viveOn:'생존 개체 기준으로 보기', viveOff:'전체(이론값)로 보기',
    viveBadge:'생존 개체 기준 — 비생존 결과를 제외하고 다시 나눈 확률입니다',
    showAll:function(n){return '전체 '+n+'가지 모두 보기';},
    crossTag:'크로스', crossNote:'라인브리딩 형질이 섞인 교배입니다. 새끼에게 형질이 보이지 않아도 유전자에는 섞여 있으므로, 분양·재교배 시 <b>크로스 개체</b>로 표기하는 것을 권합니다.',
    polyH:'라인브리딩 형질 (확률 계산 불가)',
    polyDesc:'폴리제닉(다인자) 형질이라 정확한 확률을 낼 수 없습니다. 아래 형질은 부모가 지녀 새끼에 나타날 수 있으며 발현 정도는 개체마다 다릅니다. ‘(양쪽)’은 부모 둘 다 지닌 형질로 더 강하게 발현될 가능성이 있습니다.',
    polyBoth:'양쪽',
    proof:{ established:'', partial:'부분검증', contested:'미확정' },
    fakeSuperNote:'라인브리딩 형질은 유전자가 아니라 <b>선발 교배로 강화한 표현</b>입니다 — 확률로 계산할 수 없고, 부모보다 옅거나 진하게 나올 수 있습니다.',
    note:'<b>이 계산기가 다루는 것</b> — 화이트아웃, 패턴리스·스팅어(같은 자리), 아멜라니스틱, 오레오, 캬라멜 알비노, 고스트, 줄루, 스트라이프를 멘델 유전으로 계산합니다. '
      +'<b>스팅어·제로와 패턴리스는 같은 자리의 대립유전자</b>로 두었습니다. 스팅어는 한 개만 있어도 보이고, 두 개이거나 패턴리스와 한 개씩이면 슈퍼 스팅어가 됩니다. '
      +'<b>제로는 별개 유전자가 아니라 스팅어 + 스트라이프</b>의 이름이라, 스트라이프를 함께 고르면 결과에 ‘제로’·‘슈퍼 제로’로 표시됩니다. '
      +'또 <b>슈퍼 화이트아웃은 지금까지 생존한 개체가 없어</b> 부모 선택지에서 제외했습니다 — 새끼 결과에만 비생존으로 표시됩니다.'
      +'<br><br><b>66% 헷 · 33% 헷</b> — 펫테일은 다른 종보다 가능성 헷 표기를 훨씬 자주 씁니다. 표현형 기준으로 보면 오른쪽 HET 칸에 '
      +'100% 헷(확정)과 66%·33% 헷(가능성)이 함께 나옵니다. 66% 헷은 ‘비주얼이 아닌 새끼 중 3분의 2가 보인자’라는 뜻이지 그 개체가 66% 만큼 보인자라는 뜻이 아닙니다. '
      +'확정하려면 검증 교배가 필요합니다.'
      +'<br><br><b>꼭 알아두실 점</b> — 펫테일 게코의 유전학은 레오파드만큼 정리되어 있지 않습니다. 단일 유전자로 확실히 증명된 형질은 소수이며, '
      +'대부분의 모프 이름은 학술 논문이 아니라 브리더들의 사육 기록과 합의에 기반합니다. 이 계산기의 확률은 참고용이며, 실제 부화 개체의 외형은 여러 형질의 상호작용과 '
      +'성장에 따른 색 변화로 달라질 수 있습니다. 중요한 교배 결정은 계통 정보를 가진 브리더와 상의하십시오.',
    terms:'이용약관', privacy:'개인정보처리방침',
    footer:'확률은 멘델 유전 법칙에 따른 이론값입니다 · 라인브리딩(폴리제닉) 형질은 확률 계산 대상이 아닙니다',
    updH:'업데이트 노트', updDone:'업데이트 됨', updSoon:'업데이트 예정',
    updDoneList:[
      'V1.0 테스트버전 출시',
      '가능성 헷(66·33%) 표기 기본 켜짐'
    ],
    updSoonList:[
      '모프별 사진·설명 추가 예정'
    ],
    updMail:'문의 · 건의: ', today:'오늘 하루 안 보기', mclose:'닫기',
    mailSubject:'펫테일 모프 계산기 - 정보수정/업데이트 건의',
  },
  en:{
    htmlLang:'en',
    title:'African Fat-Tailed Gecko Morph Calculator',
    sub:'Pick each parent’s genetics to see the probability of each offspring morph',
    langLabel:'Language', parentA:'Parent A', parentB:'Parent B',
    parentRole:'Choose genetic traits', helpBtn:'Help',
    selectedLabel:'Selected', selNone:'Nothing selected yet',
    reset:'Reset', calc:'Calculate Morphs',
    modeVisual:'By phenotype', modeGeno:'By genotype',
    partialToggle:'Possible hets (66·33%)', extraToggle:'Extra genes', polyToggle:'Line-bred traits',
    optInfo:'About these options',
    optNote:'<b>By phenotype</b> — groups rows by what you can actually see; het carriers are listed separately on the right.'
      +'<br><b>By genotype</b> — counts hets as outcomes of their own.'
      +'<br><b>Possible hets</b> — shows probabilistic carriers such as 66% and 33%. Fat-tails are <b>routinely advertised as 66% / 33% het</b>, so this option is on by default.'
      +'<br><b>Extra genes</b> — adds traits whose inheritance is not yet settled, such as White Socks.'
      +'<br><b>Line-bred traits</b> — shows polygenic traits (Aberrant, Jungle, Tangerine…) on the parent cards for reference only.',
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
    visualLbl:'Visual', hetLbl:'het', copy1:'1 copy', copy2:'2 copies',
    warnH:'Genetics that need caution',
    viveNote:function(p){return 'This pairing includes <b>'+p+'% outcomes that do not survive</b>.';},
    viveOn:'Show live-hatchling odds', viveOff:'Show full theoretical odds',
    viveBadge:'Live-hatchling odds — non-viable outcomes removed and the rest renormalised',
    showAll:function(n){return 'Show all '+n+' outcomes';},
    crossTag:'cross', crossNote:'This pairing mixes line-bred traits. Even when a hatchling shows none of them, the genes are still in the mix — label such animals as <b>crosses</b> when selling or re-pairing.',
    polyH:'Line-bred traits (not probability-based)',
    polyDesc:'These are polygenic traits, so exact probabilities can’t be calculated. The traits below are carried by a parent and may appear in offspring to varying degrees. “(both)” means both parents carry it, so it may express more strongly.',
    polyBoth:'both',
    proof:{ established:'', partial:'partly proven', contested:'unconfirmed' },
    fakeSuperNote:'Line-bred traits are not genes but <b>expression built up by selective breeding</b> — they can’t be calculated, and offspring may show them more or less strongly than the parents.',
    note:'<b>What this calculator covers</b> — White Out, Patternless/Stinger (one shared locus), Amelanistic, Oreo, Caramel Albino, Ghost, Zulu and Stripe, calculated by Mendelian inheritance. '
      +'<b>Stinger/Zero and Patternless are treated as alleles of one locus.</b> A single Stinger allele is visible; two copies — or one Stinger plus one Patternless — give a Super Stinger. '
      +'<b>Zero is not a separate gene: it is Stinger plus Stripe</b>, so selecting Stripe as well renames the result to “Zero” / “Super Zero”. '
      +'<b>Super White Out has no surviving animals</b>, so it is excluded from the parent options — it appears only in the offspring results, marked non-viable.'
      +'<br><br><b>66% het · 33% het</b> — fat-tails use possible-het labelling far more than most species. In phenotype view the right-hand HET column shows both 100% (guaranteed) '
      +'and 66% / 33% (possible) hets. A 66% het means “two out of three non-visual siblings carry it”, not that the animal is 66% of a carrier. Only a test breeding confirms it.'
      +'<br><br><b>Please read</b> — Fat-tailed gecko genetics is far less settled than leopard gecko genetics. Only a handful of traits are firmly proven to be single-gene, and most morph names '
      +'come from breeder records and community consensus rather than published studies. The probabilities here are for reference only; a real hatchling’s appearance can differ because traits '
      +'interact and because colour changes as the animal grows. Consult a breeder who knows the lineage before making an important pairing decision.',
    terms:'Terms', privacy:'Privacy',
    footer:'Probabilities are theoretical values from Mendelian inheritance · line-bred (polygenic) traits are not probability-based',
    updH:'Update notes', updDone:'Shipped', updSoon:'Coming next',
    updDoneList:[
      'V1.0 test release',
      'Possible-het (66 · 33%) display on by default'
    ],
    updSoonList:[
      'Photos and descriptions per morph'
    ],
    updMail:'Contact: ', today:'Don’t show today', mclose:'Close',
    mailSubject:'African Fat-Tailed Gecko Morph Calculator - correction / feature request',
  },
  ja:{
    htmlLang:'ja',
    title:'ファットテールゲッコー モルフ計算機',
    sub:'両親の遺伝形質を選ぶと、仔のモルフ確率を計算します',
    langLabel:'言語', parentA:'親 A', parentB:'親 B',
    parentRole:'遺伝形質を選択', helpBtn:'ヘルプ',
    selectedLabel:'選択した形質', selNone:'まだ選んでいません',
    reset:'リセット', calc:'モルフを計算',
    modeVisual:'表現型で表示', modeGeno:'遺伝型で表示',
    partialToggle:'可能性 het（66・33%）', extraToggle:'追加遺伝子', polyToggle:'ラインブリード形質',
    optInfo:'表示オプションの説明',
    optNote:'<b>表現型で表示</b> — 見た目で分かるモルフだけを行にまとめ、ヘテロ（保因）は右の列に別記します。'
      +'<br><b>遺伝型で表示</b> — ヘテロも1つの結果として数えて展開します。'
      +'<br><b>可能性 het</b> — 66%・33% などの確率的な保因を表に表示します。ファットテールは<b>66%・33% ヘテロ表記を分譲でそのまま使う種</b>のため、この項目は最初からオンです。'
      +'<br><b>追加遺伝子</b> — ホワイトソックスのように遺伝様式がまだ確定していない形質を計算に加えます。'
      +'<br><b>ラインブリード形質</b> — アベラント・ジャングル・タンジェリンなどの多因子形質を親カードに表示します（確率計算の対象外）。',
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
    visualLbl:'ビジュアル', hetLbl:'ヘテロ', copy1:'1コピー', copy2:'2コピー',
    warnH:'注意が必要な遺伝の組み合わせ',
    viveNote:function(p){return 'この組み合わせには<b>孵化・生存が困難な結果が '+p+'%</b> 含まれています。';},
    viveOn:'生存個体基準で見る', viveOff:'全体（理論値）で見る',
    viveBadge:'生存個体基準 — 生存困難な結果を除いて再計算した確率です',
    showAll:function(n){return '全 '+n+' 通りをすべて表示';},
    crossTag:'クロス', crossNote:'ラインブリード形質が混ざった交配です。仔に形質が出なくても遺伝子には混ざっているため、分譲・再交配の際は<b>クロス個体</b>と表記することをおすすめします。',
    polyH:'ラインブリード形質（確率計算不可）',
    polyDesc:'ポリジェニック（多因子）形質のため正確な確率は出せません。以下の形質は親が持ち、仔に程度の差はあれ現れる可能性があります。「(両方)」は両親とも持つ形質で、より強く発現する可能性があります。',
    polyBoth:'両方',
    proof:{ established:'', partial:'一部検証', contested:'未確定' },
    fakeSuperNote:'ラインブリード形質は遺伝子ではなく<b>選抜交配で強めた発現</b>です — 確率計算はできず、親より薄くも濃くも出ます。',
    note:'<b>この計算機が扱う形質</b> — ホワイトアウト、パターンレス／スティンガー（同一座）、アメラニスティック、オレオ、キャラメルアルビノ、ゴースト、ズールー、ストライプをメンデル遺伝で計算します。'
      +'<b>スティンガー・ゼロとパターンレスは同じ座の対立遺伝子</b>として扱います。スティンガーは1つでも発現し、2つ、またはパターンレスと1つずつでスーパースティンガーになります。'
      +'<b>ゼロは別の遺伝子ではなくスティンガー＋ストライプ</b>の呼び名なので、ストライプも選ぶと結果が「ゼロ」「スーパーゼロ」と表示されます。'
      +'また<b>スーパーホワイトアウトは生存個体が確認されていない</b>ため、親の選択肢から除外しています — 仔の結果にのみ生存困難として表示されます。'
      +'<br><br><b>66% ヘテロ・33% ヘテロ</b> — ファットテールは他種より可能性ヘテロの表記を多用します。表現型表示では右の HET 欄に 100%（確定）と 66%・33%（可能性）が並びます。'
      +'66% ヘテロとは「ビジュアルでない仔の3分の2が保因」という意味で、その個体が66%だけ保因という意味ではありません。確定には検証交配が必要です。'
      +'<br><br><b>ご留意ください</b> — ファットテールゲッコーの遺伝学は、レオパードゲッコーほど整理されていません。単一遺伝子であると確実に証明されている形質はごく少数で、'
      +'モルフ名の多くは学術論文ではなくブリーダーの飼育記録と合意に基づいています。この計算機の確率はあくまで参考であり、実際に孵化した個体の外見は、形質同士の相互作用や'
      +'成長に伴う色変化によって異なる場合があります。重要な交配の判断は、血統を把握しているブリーダーにご相談ください。',
    terms:'利用規約', privacy:'プライバシーポリシー',
    footer:'確率はメンデル遺伝に基づく理論値です · ラインブリード（ポリジェニック）形質は確率計算の対象外です',
    updH:'アップデート情報', updDone:'更新済み', updSoon:'更新予定',
    updDoneList:[
      'V1.0 テスト版リリース',
      '可能性 het（66・33%）表示をデフォルトでオン'
    ],
    updSoonList:[
      'モルフごとの写真・解説を追加予定'
    ],
    updMail:'お問い合わせ: ', today:'今日は表示しない', mclose:'閉じる',
    mailSubject:'ファットテールゲッコー モルフ計算機 - 修正/ご要望',
  },
  zh:{
    htmlLang:'zh-Hans',
    title:'肥尾守宫基因计算器',
    sub:'选择父母双方的基因，即可计算后代各形态的概率',
    langLabel:'语言', parentA:'亲本 A', parentB:'亲本 B',
    parentRole:'选择遗传性状', helpBtn:'帮助',
    selectedLabel:'已选性状', selNone:'尚未选择',
    reset:'重置', calc:'计算形态',
    modeVisual:'按表现型', modeGeno:'按基因型',
    partialToggle:'可能 het（66·33%）', extraToggle:'附加基因', polyToggle:'线育性状',
    optInfo:'选项说明',
    optNote:'<b>按表现型</b> — 仅按肉眼可见的形态归行，het（携带）在右侧单独标注。'
      +'<br><b>按基因型</b> — 将 het 也计为独立结果并展开。'
      +'<br><b>可能 het</b> — 在表格中显示 66%、33% 等概率性携带。肥尾守宫<b>在出售时普遍直接标注 66%／33% het</b>，因此该选项默认开启。'
      +'<br><b>附加基因</b> — 加入 White Socks 等遗传方式尚未确定的性状。'
      +'<br><b>线育性状</b> — 在亲本卡片上显示异常纹、丛林纹、橘色等多基因性状，仅供参考（不参与概率计算）。',
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
    visualLbl:'表现', hetLbl:'het', copy1:'1个拷贝', copy2:'2个拷贝',
    warnH:'需要注意的基因组合',
    viveNote:function(p){return '此配对包含 <b>'+p+'% 无法存活</b>的结果。';},
    viveOn:'按存活个体查看', viveOff:'查看完整理论值',
    viveBadge:'按存活个体计算 — 已剔除不存活结果并重新归一化',
    showAll:function(n){return '显示全部 '+n+' 种结果';},
    crossTag:'杂交', crossNote:'本次配对混入了线育性状。即使后代未表现出来，基因中仍然含有，因此出售或再次配对时建议标注为<b>杂交个体</b>。',
    polyH:'线育性状（非概率计算）',
    polyDesc:'这是多基因（polygenic）性状，无法计算精确概率。以下性状由父母携带，可能以不同程度出现在后代中。「(双方)」表示父母双方都携带，可能表现更强。',
    polyBoth:'双方',
    proof:{ established:'', partial:'部分验证', contested:'待确认' },
    fakeSuperNote:'线育性状不是基因，而是<b>通过选育强化的表现</b> — 无法计算概率，后代的表现可能比亲本更强或更弱。',
    note:'<b>本计算器涵盖的性状</b> — White Out、无纹／Stinger（同一基因座）、白化（Amel）、Oreo、焦糖白化、Ghost、Zulu、条纹，按孟德尔遗传计算。'
      +'<b>Stinger／Zero 与无纹视为同一基因座的等位基因</b>。Stinger 单拷贝即表现，两个拷贝、或与无纹各一个即为超级 Stinger。'
      +'<b>Zero 并非独立基因，而是 Stinger 加条纹</b>的名称，因此同时选择条纹后，结果会显示为「Zero」「超级 Zero」。'
      +'另外<b>超级 White Out 尚无存活个体</b>，因此已从亲本选项中移除 — 它只会出现在后代结果中并标注为不存活。'
      +'<br><br><b>66% het · 33% het</b> — 肥尾守宫比其他物种更常使用「可能 het」标注。表现型视图右侧的 HET 列会同时显示 100%（确定）与 66%／33%（可能）。'
      +'66% het 的含义是「非表现型的同窝个体中三分之二为携带者」，而不是该个体有 66% 的携带程度。要确定仍需做验证配对。'
      +'<br><br><b>请务必了解</b> — 肥尾守宫的遗传学远不如豹纹守宫成熟。目前被确证为单基因的性状只有少数几个，大多数品系名称来自繁育者的饲养记录与社群共识，'
      +'而非已发表的研究。本计算器给出的概率仅供参考；由于性状之间会相互影响，且体色会随成长变化，实际孵化个体的外观可能与预测不同。'
      +'做重要配对决定前，请咨询了解血统的繁育者。',
    terms:'使用条款', privacy:'隐私政策',
    footer:'概率为基于孟德尔遗传的理论值 · 线育（多基因）性状不在概率计算范围内',
    updH:'更新说明', updDone:'已更新', updSoon:'计划中',
    updDoneList:[
      'V1.0 测试版发布',
      '默认开启可能 het（66 · 33%）显示'
    ],
    updSoonList:[
      '计划补充各形态的照片与说明'
    ],
    updMail:'联系: ', today:'今天不再显示', mclose:'关闭',
    mailSubject:'肥尾守宫基因计算器 - 信息更正 / 功能建议',
  },
};

LANG='ko';
let MODE='visual';
/* ⚠️ 펫테일은 66%·33% 헷 표기를 실제로 많이 쓰기 때문에 기본값이 true 입니다.
   index.html 의 #partialchk 도 aria-pressed="true" 로 맞춰 두었습니다. */
let showPartialHet=true, showPoly=true, showExtra=false, hasResult=false;
let liveOdds=false, expandAll=false;
const ROW_CAP=60;                     // 표가 길어지면 우선 60행만
function L(){ return I18N[LANG]; }

function activeGenes(){ return FT_ALL_GENES().filter(g=>g.core || showExtra); }
function usedGenes(){ return activeGenes().filter(g=>FT_STATE.A[g.id]!=='nn' || FT_STATE.B[g.id]!=='nn'); }

/* ================= 부모 카드 UI ================= */
function secHeader(text){ const d=document.createElement('div'); d.className='sechead'; d.textContent=text; return d; }
function proofTag(g){
  const p=L().proof[g.proof]; return p? ' <span class="chipq">'+escapeHtml(p)+'</span>' : '';
}
/* 불완전우성/우성 : 상태별 독립 칩 */
function stateChip(g, side, state, label, colorKey, risky){
  const on = FT_STATE[side][g.id]===state;
  const chip=document.createElement('button'); chip.type='button';
  chip.className='chip'+(side==='B'?' b':'')+(on?' on':'');
  chip.innerHTML='<span class="sw" style="background:'+(FT_COLOR[colorKey]||'#CFC7A0')+'"></span>'+escapeHtml(label)
    +(risky?' <i class="bi bi-exclamation-triangle-fill chiprisk" aria-hidden="true"></i>':'')+proofTag(g);
  chip.onclick=()=>{ FT_STATE[side][g.id]= on ? 'nn' : state; buildParent(side); if(hasResult) calculate(); };
  return chip;
}
/* 열성 / 우성 : 칩 + 서브 세그먼트 */
function twoStateChip(g, side, labels){
  const wrap=document.createElement('div'); wrap.className='chipwrap';
  const on = FT_STATE[side][g.id]!=='nn';
  const chip=document.createElement('button'); chip.type='button';
  chip.className='chip'+(side==='B'?' b':'')+(on?' on':'');
  chip.innerHTML='<span class="sw" style="background:'+(FT_COLOR[g.id]||'#CFC7A0')+'"></span>'+escapeHtml(gName(g))+proofTag(g);
  chip.onclick=()=>{ FT_STATE[side][g.id]= on ? 'nn' : (g.type==='rec' ? 'mm' : 'het'); buildParent(side); if(hasResult) calculate(); };
  wrap.appendChild(chip);
  if(on){
    const seg=document.createElement('div'); seg.className='subseg'+(side==='B'?' b':'');
    labels.forEach(([val,lab])=>{
      const b=document.createElement('button'); b.type='button'; b.textContent=lab;
      if(FT_STATE[side][g.id]===val) b.classList.add('on');
      b.onclick=e=>{ e.stopPropagation(); FT_STATE[side][g.id]=val; buildParent(side); if(hasResult) calculate(); };
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
  }
  return wrap;
}
function traitChip(t, side){
  const on = FT_STATE[side][t.id]==='yes';
  const chip=document.createElement('button'); chip.type='button';
  chip.className='chip'+(side==='B'?' b':'')+(on?' on':'');
  chip.innerHTML='<span class="sw" style="background:'+(FT_COLOR[t.id]||'#CFC7A0')+'"></span>'+escapeHtml(tName(t));
  chip.onclick=()=>{ FT_STATE[side][t.id]= on ? 'no' : 'yes'; buildParent(side); if(hasResult) calculate(); };
  return chip;
}

function famBlock(host, fam, genes, side){
  if(!genes.length) return;
  const h=document.createElement('div'); h.className='famhead';
  h.innerHTML='<span class="famname">'+escapeHtml(tr(fam))+'</span>'
    +'<span class="fambadge badge-'+fam.type+'">'+escapeHtml(tr(fam))+'</span>'
    +'<div class="famdesc">'+escapeHtml(tr(fam.desc))+'</div>';
  host.appendChild(h);
  const grid=document.createElement('div'); grid.className='chipgrid';
  genes.forEach(g=>{
    if(g.kind==='multi'){
      Object.keys(g.genos).forEach(k=>{
        if(k==='nn') return;
        const e=g.genos[k];
        /* 헷(보인자) 칩은 토큰이 없어 색이 비므로 대표색을 대신 씁니다 */
        grid.appendChild(stateChip(g, side, k, tr(e), e.token || e.hetOf, !!e.warn));
      });
      return;
    }
    if(g.type==='incdom'){
      grid.appendChild(stateChip(g, side, 'het', gName(g), g.id, false));
      /* 슈퍼폼이 치사인 형질(화이트아웃)은 성체가 없으므로 부모 칩을 만들지 않습니다 */
      if(ftSelectableAsParent(g,'mm'))
        grid.appendChild(stateChip(g, side, 'mm', gSuper(g), 'super_'+g.id, !!g.warnOnSuper));
      return;
    }
    if(g.type==='dom'){ grid.appendChild(twoStateChip(g, side, [['het',L().copy1],['mm',L().copy2]])); return; }
    grid.appendChild(twoStateChip(g, side, [['het',L().hetLbl],['mm',L().visualLbl]]));
  });
  host.appendChild(grid);
  /* 유전자별 보충 설명 */
  genes.filter(g=>g.note).forEach(g=>{
    const n=document.createElement('div'); n.className='locusnote'; n.style.marginTop='7px';
    n.innerHTML=tr(g.note); host.appendChild(n);
  });
}

function buildParent(side){
  const host=document.getElementById(side==='A'?'parentA':'parentB');
  host.innerHTML='';
  const matched=ftMatchCombo(ftParentTokens(side));
  if(matched){
    const badge=document.createElement('div'); badge.className='parentcombo'+(side==='B'?' b':'');
    badge.textContent='= '+tr(matched); host.appendChild(badge);
  }
  host.appendChild(secHeader(L().secGene));
  const genes=activeGenes();
  famBlock(host, FT_FAMILIES[0], genes.filter(g=>g.kind==='multi'||g.type==='incdom'), side);
  famBlock(host, FT_FAMILIES[1], genes.filter(g=>g.kind!=='multi'&&g.type==='rec'), side);
  famBlock(host, FT_FAMILIES[2], genes.filter(g=>g.kind!=='multi'&&g.type==='dom'), side);

  if(showPoly){
    const pf=FT_FAMILIES[3];
    const ph=document.createElement('div'); ph.className='famhead';
    ph.innerHTML='<span class="famname">'+escapeHtml(tr(pf))+'</span>'
      +'<span class="fambadge badge-poly">'+escapeHtml(tr(pf))+'</span>'
      +'<div class="famdesc">'+escapeHtml(tr(pf.desc))+'</div>';
    host.appendChild(ph);
    FT_TRAIT_GROUPS.forEach(grp=>{
      const list=FT_TRAITS.filter(t=>t.grp===grp.id);
      if(!list.length) return;
      host.appendChild(secHeader(tr(grp)));
      const g=document.createElement('div'); g.className='chipgrid';
      list.forEach(t=>g.appendChild(traitChip(t, side)));
      host.appendChild(g);
    });
    const fs=document.createElement('div'); fs.className='locusnote'; fs.style.marginTop='9px';
    fs.innerHTML=L().fakeSuperNote; host.appendChild(fs);
  }
  renderSelected();   // 선택 요약 갱신
}

/* ================= 계산 ================= */
const PIE_COLORS=['#0E7C7B','#3B8DA0','#EAC36A','#6B5686','#C67B4A','#7FA653','#4E7CA8','#B06A86','#5FB0A8','#D0A24E','#8A8375','#9E5C5C'];

function selectedTraits(){
  const s=[]; FT_TRAITS.forEach(t=>{ if(FT_STATE.A[t.id]==='yes'||FT_STATE.B[t.id]==='yes') s.push(t.id); });
  return s;
}
function gatherPoly(){
  if(!showPoly) return [];
  return FT_TRAITS.filter(t=>FT_STATE.A[t.id]==='yes'||FT_STATE.B[t.id]==='yes')
    .map(t=>({ name:tName(t), both: FT_STATE.A[t.id]==='yes' && FT_STATE.B[t.id]==='yes' }));
}

let LAST=null;
function calculate(){
  const genes=usedGenes();
  let rows=null, raw=[];
  if(genes.length){
    const traits=selectedTraits();
    raw=ftCross(genes, MODE);
    rows=raw.map(r=>{
      const cb=ftMatchCombo(r.tokens);
      if(cb && cb.warn) r.warns.add(cb.warn);
      return {
        prob:r.prob,
        combo: cb ? tr(cb) : null,
        label: ftJoin(r.parts) || L().normal,
        isNormal: r.parts.length===0,
        tokens:[...r.tokens], traits,
        nonViable:r.nonViable, health:r.health,
        guaranteed: r.hets.filter(h=>h.p>=0.999).map(h=>h.name),
        partial:    r.hets.filter(h=>h.p<0.999).map(h=>({name:h.name, pct:Math.floor(h.p*100+1e-9)})),
      };
    });
  }
  const warnings=ftCollectWarnings(genes, raw);
  const poly=gatherPoly();
  LAST={ rows, warnings, poly, anything:(rows&&rows.length)||warnings.length||poly.length };
  hasResult=!!LAST.anything;
  render(LAST);
}

function buildPie(rows){
  let acc=0; const segs=[];
  rows.forEach((r,i)=>{
    const start=acc, end=acc+r.prob*100; acc=end;
    r._color=PIE_COLORS[i%PIE_COLORS.length];
    segs.push(r._color+' '+start.toFixed(4)+'% '+end.toFixed(4)+'%');
  });
  const top=rows[0];
  return '<div class="pie-wrap"><div class="pie" style="background:conic-gradient('+segs.join(',')+')"><div class="pie-hole">'
    +fattailSVG(ftProfile(top.tokens, top.traits), 96)
    +'<div class="pie-top">'+(top.prob*100>=9.95? Math.round(top.prob*100) : (top.prob*100).toFixed(1))+'%</div>'
    +'</div></div></div>';
}
function pctStr(p){ const n=p*100; return n>=9.95? n.toFixed(0) : n>=0.995? n.toFixed(1) : n.toFixed(2); }

function render(payload){
  const host=document.getElementById('results'), t=L();
  if(!payload || !payload.anything){ host.innerHTML='<div class="empty">'+t.emptyNone+'</div>'; return; }
  /* 크로스 표기는 레오파드에서만 씁니다. 크레스티드·펫테일은 표기하지 않습니다.
     번역 문구(t.crossTag / t.crossNote)는 나중에 되살릴 수 있게 남겨둡니다. */
  const crossTag = '';
  let html='';
  if(payload.warnings && payload.warnings.length){
    html+='<div class="warnhead"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> '+t.warnH+'</div>';
    payload.warnings.forEach(w=>{ html+='<div class="warnbox warn-'+w.level+'">'+w.text+'</div>'; });
  }
  if(payload.rows && payload.rows.length){
    let rows=payload.rows;
    const deadP=rows.filter(r=>r.nonViable).reduce((s,r)=>s+r.prob,0);
    if(deadP>1e-12){
      html+='<div class="vbar"><span>'+t.viveNote(pctStr(deadP))+(liveOdds? ' — '+escapeHtml(t.viveBadge) : '')+'</span>'
          +'<button type="button" onclick="toggleLive()">'+escapeHtml(liveOdds? t.viveOff : t.viveOn)+'</button></div>';
    }
    if(liveOdds && deadP>1e-12 && deadP<1-1e-12){
      rows=rows.filter(r=>!r.nonViable).map(r=>Object.assign({}, r, {prob:r.prob/(1-deadP)}));
    }
    html+='<h2>'+t.resultsH+'</h2><div class="summary">'
        +(MODE==='geno'? t.summaryGeno(rows.length) : t.summaryVisual(rows.length))+'</div>';
    html+=buildPie(rows);
    const showHet=(MODE==='visual');
    const shown = (expandAll || rows.length<=ROW_CAP) ? rows : rows.slice(0,ROW_CAP);
    html+='<table class="rtable"><thead><tr><th>'+t.colProb+'</th><th>'
        +(showHet? t.colVisual : t.colMorph)+'</th>'+(showHet? '<th>'+t.colHet+'</th>':'')+'</tr></thead><tbody>';
    shown.forEach(r=>{
      let vtext='';
      if(r.nonViable) vtext+='<span class="deadtag">'+t.deadTag+'</span>';
      else if(r.health) vtext+='<span class="healthtag">'+t.healthTag+'</span>';
      vtext += r.combo
        ? '<span class="combotag">'+t.comboTag+'</span>'+escapeHtml(r.combo)+'<div class="submorph">'+escapeHtml(r.label)+'</div>'
        : escapeHtml(r.label);
      if(crossTag) vtext+='<span class="crosstag">'+escapeHtml(crossTag)+'</span>';
      html+='<tr'+(r.nonViable?' class="dead"':'')+'>'
        +'<td class="c-prob"><span class="cdot" style="background:'+r._color+'"></span>'+pctStr(r.prob)+'%'
        +'<span class="cfrac">'+ftFrac(r.prob)+'</span></td>'
        +'<td class="c-vis"><div class="visrow"><span class="geckothumb">'+fattailSVG(ftProfile(r.tokens,r.traits),46)+'</span>'
        +'<span class="vtext'+(r.isNormal?' isnorm':'')+'">'+vtext+'</span></div></td>';
      if(showHet){
        const parts=[];
        r.guaranteed.forEach(n=>parts.push('<span class="het100">100HET '+escapeHtml(n)+'</span>'));
        if(showPartialHet) r.partial.forEach(p=>parts.push('<span class="hetp">'+p.pct+'HET '+escapeHtml(p.name)+'</span>'));
        html+='<td class="c-het">'+(parts.length? parts.join('') : '<span class="hetnone">'+t.hetNone+'</span>')+'</td>';
      }
      html+='</tr>';
    });
    html+='</tbody></table>';
    if(crossTag) html+='<div class="crossnote">'+t.crossNote+'</div>';
    if(shown.length<rows.length)
      html+='<button type="button" class="morebtn" onclick="expandRows()">'+escapeHtml(t.showAll(rows.length))+'</button>';
  }
  if(payload.poly && payload.poly.length){
    html+='<div class="polyblock"><h3>'+t.polyH+'</h3><div class="pdesc">'+t.polyDesc+'</div>';
    payload.poly.forEach(p=>{ html+='<span class="polychip'+(p.both?' both':'')+'">'+escapeHtml(p.name)+(p.both?' ('+t.polyBoth+')':'')+'</span>'; });
    html+='</div>';
  }
  host.innerHTML=html;
}
function toggleLive(){ liveOdds=!liveOdds; render(LAST); }
function expandRows(){ expandAll=true; render(LAST); }

function resetAll(){
  ftResetState(); hasResult=false; liveOdds=false; expandAll=false;
  buildParent('A'); buildParent('B');
  document.getElementById('results').innerHTML='<div class="empty">'+L().emptyStart+'</div>';
}

/* ================= 언어 적용 ================= */
function applyLang(){
  const t=L();
  document.documentElement.lang=t.htmlLang;
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  const setH=(id,v)=>{ const e=document.getElementById(id); if(e) e.innerHTML=v; };
  set('h-title',t.title); set('h-sub',t.sub);
  set('lbl-pa',t.parentA); set('lbl-pb',t.parentB);
  set('lbl-pa-role',t.parentRole); set('lbl-pb-role',t.parentRole);
  set('lbl-help',t.helpBtn); set('lbl-help2',t.helpBtn);
  set('lbl-selected',t.selectedLabel);
  set('lbl-sel-a',t.parentA); set('lbl-sel-b',t.parentB);
  setH('btn-reset','<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i><span>'+escapeHtml(t.reset)+'</span>');
  setH('btn-calc','<i class="bi bi-calculator" aria-hidden="true"></i><span>'+escapeHtml(t.calc)+'</span><i class="bi bi-chevron-right calc-arrow" aria-hidden="true"></i>');
  set('lbl-mode-visual',t.modeVisual); set('lbl-mode-geno',t.modeGeno);
  set('lbl-partial',t.partialToggle); set('lbl-extra',t.extraToggle);
  set('lbl-poly',t.polyToggle); set('lbl-optinfo',t.optInfo);
  setH('optNote',t.optNote);
  setH('btn-upd','<i class="bi bi-file-earmark-text" aria-hidden="true"></i><span>'+escapeHtml(t.updBtn)+'</span>');
  set('lbl-contact',t.contact);
  setH('mailNote',t.mailNote+' ('+FT_CONTACT_MAIL+')');
  setH('note',t.note);
  set('lbl-terms',t.terms); set('lbl-privacy',t.privacy);
  set('footer',t.footer); set('lbl-langtitle',t.langLabel);
  setH('lbl-updh','<i class="bi bi-megaphone" aria-hidden="true"></i> '+escapeHtml(t.updH));
  setH('lbl-upddone','<i class="bi bi-check-circle-fill" aria-hidden="true"></i> '+escapeHtml(t.updDone));
  setH('lbl-updsoon','<i class="bi bi-clock" aria-hidden="true"></i> '+escapeHtml(t.updSoon));
  setH('updDone', t.updDoneList.map(x=>'<li>'+x+'</li>').join(''));
  setH('updSoon', t.updSoonList.map(x=>'<li>'+x+'</li>').join(''));
  setH('updMail', t.updMail+'<a href="mailto:'+FT_CONTACT_MAIL+'">'+FT_CONTACT_MAIL+'</a>');
  set('lbl-today',t.today); set('lbl-mclose',t.mclose);
  document.getElementById('mailLink').href='mailto:'+FT_CONTACT_MAIL+'?subject='+encodeURIComponent(t.mailSubject);
  document.querySelectorAll('#langMenu button').forEach(b=>b.classList.toggle('on', b.dataset.lang===LANG));
  buildParent('A'); buildParent('B');
  if(hasResult) calculate();
  else document.getElementById('results').innerHTML='<div class="empty">'+t.emptyStart+'</div>';
}
function setLang(lang){ if(lang===LANG) return; LANG=lang; applyLang(); }

/* ================= 초기화 ================= */
const langMenuEl=document.getElementById('langMenu'), langBtnEl=document.getElementById('langBtn');
langBtnEl.addEventListener('click',e=>{ e.stopPropagation(); langMenuEl.classList.toggle('open'); });
document.querySelectorAll('#langMenu button').forEach(b=>b.addEventListener('click',()=>{ setLang(b.dataset.lang); langMenuEl.classList.remove('open'); }));
document.addEventListener('click',e=>{ if(langMenuEl.classList.contains('open') && !langMenuEl.contains(e.target) && !langBtnEl.contains(e.target)) langMenuEl.classList.remove('open'); });

(function(){
  // ⚠️ [data-mode] 로 범위를 좁힙니다. 세그먼트 바에 옵션 버튼도 함께 들어 있어서
  //    '#modeSeg button' 으로 잡으면 옵션을 눌러도 MODE 가 바뀌어 버립니다.
  document.querySelectorAll('#modeSeg button[data-mode]').forEach(b=>b.addEventListener('click',()=>{
    MODE=b.dataset.mode; expandAll=false;
    document.querySelectorAll('#modeSeg button[data-mode]').forEach(x=>x.classList.toggle('on', x===b));
    if(hasResult) calculate();
  }));
  const press=(el,on)=>el.setAttribute('aria-pressed', on?'true':'false');
  const pc=document.getElementById('partialchk'), ex=document.getElementById('extrachk'),
        py=document.getElementById('polychk');
  press(pc, showPartialHet);            // 기본 켜짐(66·33% 헷)을 화면에도 반영
  pc.addEventListener('click',()=>{ showPartialHet=!showPartialHet; press(pc,showPartialHet); if(hasResult) calculate(); });
  ex.addEventListener('click',()=>{ showExtra=!showExtra; press(ex,showExtra); buildParent('A'); buildParent('B'); renderSelected(); if(hasResult) calculate(); });
  py.addEventListener('click',()=>{ showPoly=!showPoly; press(py,showPoly); buildParent('A'); buildParent('B'); renderSelected(); if(hasResult) calculate(); });
  const ib=document.getElementById('optInfoBtn'), nt=document.getElementById('optNote');
  ib.addEventListener('click',()=>{ const on=!nt.classList.contains('show');
    nt.classList.toggle('show',on); ib.setAttribute('aria-expanded', on?'true':'false'); });
})();

/* 부모 카드의 ⓘ 버튼 — 세그먼트 바의 설명을 펼칩니다 */
function toggleOptNote(){
  const nt=document.getElementById('optNote'), ib=document.getElementById('optInfoBtn');
  const on=!nt.classList.contains('show');
  nt.classList.toggle('show',on);
  if(ib) ib.setAttribute('aria-expanded', on?'true':'false');
  if(on) nt.scrollIntoView({behavior:'smooth', block:'nearest'});
}

/* ===== 선택된 형질 요약 ===== */
function renderSelected(){
  ['A','B'].forEach(side=>{
    const box=document.getElementById('sel'+side);
    if(!box) return;
    const picked=[];
    document.querySelectorAll('#parent'+side+' .chip.on').forEach(c=>{
      const sw=c.querySelector('.sw');
      const label=(c.textContent||'').trim();
      if(label) picked.push({label, color: sw? getComputedStyle(sw).backgroundColor : ''});
    });
    if(!picked.length){
      box.innerHTML='<span class="sel-none">'+escapeHtml(L().selNone||'선택 없음')+'</span>';
      return;
    }
    box.innerHTML=picked.map(p=>'<span class="selchip">'
      +(p.color? '<span class="sw" style="background:'+escapeHtml(p.color)+'"></span>':'')
      +escapeHtml(p.label)+'</span>').join('');
  });
}

/* ===== 업데이트 노트 모달 ===== */
const UPD_VER='ft-2026-07-28a';
function todayKey(){ try{ return new Date().toISOString().slice(0,10); }catch(e){ return 'x'; } }
function openUpd(){ document.getElementById('updModal').classList.add('show'); }
function closeUpd(){ document.getElementById('updModal').classList.remove('show'); }
function dismissToday(){ try{ localStorage.setItem('ftUpdDismiss', UPD_VER+'|'+todayKey()); }catch(e){} closeUpd(); }
document.getElementById('updModal').addEventListener('click',e=>{ if(e.target.id==='updModal') closeUpd(); });

applyLang();

(function(){
  let dismissed=false;
  try{ dismissed=(localStorage.getItem('ftUpdDismiss')===UPD_VER+'|'+todayKey()); }catch(e){ dismissed=false; }
  if(!dismissed) openUpd();
})();
