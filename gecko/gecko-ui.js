/* gecko-ui.js — gecko 화면 로직
   HTML 에서 분리했습니다. 유지보수는 이 파일에서 하세요. */

/* ================= 다국어 사전 ================= */
const I18N = {
  ko:{
    htmlLang:'ko',
    title:'레오파드 게코 모프 계산기',
    sub:'부모의 유전 형질을 선택해 새끼 모프 확률을 계산하세요',
    langLabel:'언어',
    parentA:'부모 A', parentB:'부모 B',
    parentRole:'유전 형질 선택', helpBtn:'선택 도움말', selectedLabel:'선택된 형질',
    reset:'초기화', calc:'모프 계산하기',
    polyToggle:'라인브리딩(폴리제닉) 형질 포함', polyToggleHint:'탠저린·볼드 등 — 확률 계산 불가, 참고용으로만 표시',
    polyPresent:'있음', polyAbsent:'없음',
    emptyStart:'부모의 형질을 선택하고 <b>모프 계산하기</b>를 눌러주세요.',
    emptyNone:'선택된 형질이 없어요.<br>부모의 형질을 하나 이상 골라주세요.',
    resultsH:'새끼 모프 확률',
    summary:function(n){return '총 '+n+'가지 조합 · 확률 내림차순';},
    normal:'노멀', het:'het', comboTag:'콤보',
    visualTag:'비주얼', hetShort:'헷', superShort:'슈퍼폼', colProb:'확률', colVisual:'비주얼 (발현)', colHet:'HET (보인자)', hetNone:'–',
    partialToggle:'가능성 헷 표시 (66·33%)', partialHint:'확률적 보인자(66·33% 등)까지 표로 표시',
    vintageToggle:'추억의 모프 보기', vintageHint:'요즘 보기 힘든 과거 모프·콤보까지 표시', optInfo:'표시 옵션 설명',
    comboLoad:'콤보 개체 불러오기…', donate:'개발자 후원하기', adLabel:'광고', adHint:'이 자리에 광고 코드를 넣을 수 있어요',
    secCombo:'콤보 (탭하면 자동 세팅)', secGene:'유전 모프 (확률 계산)',
    comboNote:'<b>콤보 이름</b> — 계산 결과가 알려진 콤보와 일치하면 디자이너 명칭(예: 갤럭시, 레이다)을 함께 표시합니다. 다만 탠저린·하이포·TUG 스노우 등 라인브리딩이 필요한 콤보(앱터 등)는 자동 인식되지 않습니다.',
    warnH:'⚠️ 주의가 필요한 유전 조합',
    crossTag:'크로스', crossNote:'라인브리딩 형질이 섞인 교배입니다. 새끼에게 형질이 보이지 않아도 유전자에는 섞여 있으므로, 분양·재교배 시 <b>크로스 개체</b>로 표기하는 것을 권합니다.',
    polyH:'라인브리딩 형질 (확률 계산 불가)',
    polyDesc:'폴리제닉(다인자) 형질이라 정확한 확률을 낼 수 없습니다. 아래 형질은 부모가 지녀 새끼에 나타날 수 있으며 발현 정도는 개체마다 다릅니다. ‘(양쪽)’은 부모 둘 다 지닌 형질로, 더 강하게 발현될 가능성이 있습니다. 라인명(만다린·블러드 등)이 붙었다는 것은 그 색의 <b>고정률이 잡혔다</b>는 뜻입니다. 다른 라인과 섞이면 고정이 풀려 계열의 기본 이름으로 돌아갑니다 — 만다린 × 텐져린은 <b>텐져린</b>이 됩니다. 부모 중 한쪽이라도 라인명을 알 수 없으면 <b>텐져린</b>으로 보시면 됩니다.',
    polyBoth:'양쪽',
    cat:{rec:'열성 (Recessive)', incdom:'불완전우성 (Incomplete Dominant)', dom:'우성 (Dominant)', poly:'라인브리딩 (Line-bred)'},
    inh:{rec:'열성', incdom:'불완전우성', dom:'우성', poly:'다인자'},
    optRec:{nn:'정상', het:'het 보인자', mm:'비주얼'},
    optDom:{nn:'정상', het:'비주얼', mm:'슈퍼폼'},
    note:'<b>참고</b> — 트램퍼·벨·레인워터 알비노는 서로 <b>다른 유전자</b>라서, 한쪽 알비노 het와 다른 알비노 het를 교배하면 알비노가 나오지 않습니다(더블 het). 맥스노우는 불완전우성(슈퍼폼 = 슈퍼 스노우, 건강함)이고, 에니그마·W&Y는 우성입니다. <b>일부 모프는 슈퍼폼이나 특정 조합에서 심각한 건강 문제·치사성이 나타납니다</b>(예: 슈퍼 레몬 프로스트의 종양, 에니그마의 신경 증상). 위험 조합은 결과 상단에 경고로 표시됩니다.',
    updDone:'업데이트 됨', updSoon:'업데이트 예정',
    updDoneList:['V1.0 테스트버전 출시'],
    updSoonList:['리스트 준비중'],
    mailNote:'정보수정, 버그 및 업데이트 건의는 <b>문의하기</b>로 보내주세요',
    credit:'해당 레오파드 모프 계산기는 <b>Stylish Gecko</b> 의 자문 및 도움을 받아 제작되었습니다.',
    footer:'확률은 멘델 유전 법칙에 따른 이론값입니다 · 라인브리딩(폴리제닉) 형질은 확률 계산 대상이 아닙니다',
  },
  en:{
    htmlLang:'en',
    title:'Leopard Gecko Morph Calculator',
    sub:'Pick each parent’s genetics to see the probability of each offspring morph',
    langLabel:'Language',
    parentA:'Parent A', parentB:'Parent B',
    parentRole:'Select genetic traits', helpBtn:'Selection help', selectedLabel:'Selected traits',
    reset:'Reset', calc:'Calculate Morphs',
    polyToggle:'Include line-bred (polygenic) traits', polyToggleHint:'Tangerine, Bold, etc. — not probability-based, shown for reference only',
    polyPresent:'Present', polyAbsent:'None',
    emptyStart:'Set the parents’ traits and tap <b>Calculate Morphs</b>.',
    emptyNone:'No traits selected.<br>Choose at least one trait on a parent.',
    resultsH:'Offspring Morph Probabilities',
    summary:function(n){return n+' possible combination'+(n===1?'':'s')+' · sorted by probability';},
    normal:'Normal', het:'het', comboTag:'COMBO',
    visualTag:'Visual', hetShort:'het', superShort:'Super form', colProb:'Prob.', colVisual:'Visual (expressed)', colHet:'Het (carrier)', hetNone:'–',
    partialToggle:'Show possible hets (66·33%)', partialHint:'Include probabilistic carriers (66·33%, etc.) in the table',
    vintageToggle:'Show vintage morphs', vintageHint:'Include older, rarely-seen morphs and combos', optInfo:'About these options',
    comboLoad:'Load a combo animal…', donate:'Support the developer', adLabel:'Advertisement', adHint:'Place your ad code here',
    secCombo:'Combos (tap to auto-set)', secGene:'Genetic morphs (calculated)',
    comboNote:'<b>Combo names</b> — when an outcome matches a known combo, its designer name (e.g. Galaxy, Radar) is shown. Combos requiring line-bred traits (Tangerine, Hypo, TUG snow) such as APTOR aren’t auto-detected.',
    warnH:'⚠️ Genetics that need caution',
    crossTag:'cross', crossNote:'This pairing mixes line-bred traits. Even when a hatchling shows none of them, the genes are still in the mix — label such animals as <b>crosses</b> when selling or re-pairing.',
    polyH:'Line-bred traits (not probability-based)',
    polyDesc:'These are polygenic traits, so exact probabilities can’t be calculated. The traits below are carried by a parent and may appear in offspring to varying degrees. “(both)” means both parents carry it, so it may express more strongly. A line name (Mandarin, Blood and so on) means that colour has been <b>fixed</b> in the line. Mixing a different line undoes that and the name falls back to the base — Mandarin x Tangerine is <b>Tangerine</b>. If either parent’s line is unknown, treat it as <b>Tangerine</b>.',
    polyBoth:'both',
    cat:{rec:'Recessive', incdom:'Incomplete Dominant', dom:'Dominant', poly:'Line-bred / Polygenic'},
    inh:{rec:'Recessive', incdom:'Inc. dominant', dom:'Dominant', poly:'Polygenic'},
    optRec:{nn:'Normal', het:'het (carrier)', mm:'Visual'},
    optDom:{nn:'Normal', het:'Visual', mm:'Super form'},
    note:'<b>Note</b> — Tremper, Bell and Rainwater albino are <b>separate genes</b>, so crossing a het of one with a het of another yields no albinos (double het). Mack Snow is incomplete dominant (homozygous = Super Snow, healthy); Enigma and W&Y are dominant. <b>Some morphs cause serious health issues or lethality in their super (homozygous) form or in certain pairings</b> (e.g. tumors in Super Lemon Frost, neurological symptoms in Enigma). Risky pairings are flagged at the top of the results.',
    updDone:'Shipped', updSoon:'Coming next',
    updDoneList:['V1.0 test release'],
    updSoonList:['List coming soon'],
    mailNote:'Corrections, bug reports and feature requests are welcome via <b>Contact</b>',
    credit:'This leopard gecko morph calculator was built with advice and help from <b>Stylish Gecko</b>.',
    footer:'Probabilities are theoretical values from Mendelian inheritance · line-bred (polygenic) traits are not probability-based',
  },
  zh:{
    htmlLang:'zh-Hans',
    title:'豹纹守宫基因计算器',
    sub:'选择父母双方的基因，即可计算后代各形态的概率',
    langLabel:'语言',
    parentA:'亲本 A', parentB:'亲本 B',
    parentRole:'选择遗传性状', helpBtn:'选择帮助', selectedLabel:'已选性状',
    reset:'重置', calc:'计算形态',
    polyToggle:'包含线育（多基因）性状', polyToggleHint:'橘化、粗条纹等 — 无法计算概率，仅供参考',
    polyPresent:'有', polyAbsent:'无',
    emptyStart:'设置父母的性状后，点击<b>计算形态</b>。',
    emptyNone:'未选择任何性状。<br>请至少为一方选择一个性状。',
    resultsH:'后代形态概率',
    summary:function(n){return '共 '+n+' 种组合 · 按概率降序';},
    normal:'普通', het:'het', comboTag:'组合',
    visualTag:'表现', hetShort:'het', superShort:'超级', colProb:'概率', colVisual:'表现型', colHet:'Het (携带)', hetNone:'–',
    partialToggle:'显示可能 het（66·33%）', partialHint:'在表格中包含概率性携带（66·33% 等）',
    vintageToggle:'显示怀旧形态', vintageHint:'包含现在少见的旧形态与组合', optInfo:'选项说明',
    comboLoad:'载入组合个体…', donate:'支持开发者', adLabel:'广告', adHint:'可在此处放置广告代码',
    secCombo:'组合（点击自动设置）', secGene:'遗传形态（可计算）',
    comboNote:'<b>组合名称</b> — 当结果与已知组合一致时，会显示其商品名（如 Galaxy、Radar）。需要线育性状（橘化、Hypo、TUG 雪花）的组合（如 APTOR）不会自动识别。',
    warnH:'⚠️ 需要注意的基因组合',
    crossTag:'杂交', crossNote:'本次配对混入了线育性状。即使后代未表现出来，基因中仍然含有，因此出售或再次配对时建议标注为<b>杂交个体</b>。',
    polyH:'线育性状（非概率计算）',
    polyDesc:'这是多基因（polygenic）性状，无法计算精确概率。以下性状由父母携带，可能以不同程度出现在后代中。「(双方)」表示父母双方都携带，可能表现更强。 线名（曼达林、血红等）表示该颜色的<b>固定率已建立</b>。与其他线混合会失去固定，名称回到基础名 — 曼达林 × 橘化即为<b>橘化</b>。若父母任一方的线名不明，按<b>橘化</b>处理。',
    polyBoth:'双方',
    cat:{rec:'隐性 (Recessive)', incdom:'不完全显性 (Incomplete Dominant)', dom:'显性 (Dominant)', poly:'线育 (Line-bred)'},
    inh:{rec:'隐性', incdom:'不完全显性', dom:'显性', poly:'多基因'},
    optRec:{nn:'普通', het:'het 携带', mm:'表现型'},
    optDom:{nn:'普通', het:'表现型', mm:'超级形态'},
    note:'<b>注意</b> — 特伦伯、贝尔、雨水白化是<b>不同的基因</b>，因此一方白化 het 与另一方白化 het 交配不会产生白化（双 het）。麦克雪花为不完全显性（纯合 = 超级雪花，健康），Enigma 与 W&Y 为显性。<b>部分形态在超级（纯合）形式或特定配对中会出现严重健康问题或致死</b>（例如超级柠檬霜的肿瘤、Enigma 的神经症状）。有风险的配对会在结果顶部以警告显示。',
    updDone:'已更新', updSoon:'计划中',
    updDoneList:['V1.0 测试版发布'],
    updSoonList:['列表准备中'],
    mailNote:'信息更正、错误报告与功能建议请通过<b>联系我们</b>发送',
    credit:'本豹纹守宫基因计算器在 <b>Stylish Gecko</b> 的指导与协助下制作。',
    footer:'概率为基于孟德尔遗传的理论值 · 线育（多基因）性状不在概率计算范围内',
  },
  ja:{
    htmlLang:'ja',
    title:'ヒョウモントカゲモドキ モルフ計算機',
    sub:'両親の遺伝形質を選ぶと、仔のモルフ確率を計算します',
    langLabel:'言語',
    parentA:'親 A', parentB:'親 B',
    parentRole:'遺伝形質を選択', helpBtn:'選択ヘルプ', selectedLabel:'選択した形質',
    reset:'リセット', calc:'モルフを計算',
    polyToggle:'ラインブリード（ポリジェニック）形質を含める', polyToggleHint:'タンジェリン・ボールド等 — 確率計算は不可、参考表示のみ',
    polyPresent:'あり', polyAbsent:'なし',
    emptyStart:'両親の形質を選んで<b>モルフを計算</b>を押してください。',
    emptyNone:'選択された形質がありません。<br>片方に1つ以上選んでください。',
    resultsH:'仔のモルフ確率',
    summary:function(n){return '全 '+n+' 通りの組み合わせ · 確率の高い順';},
    normal:'ノーマル', het:'het', comboTag:'コンボ',
    visualTag:'ビジュアル', hetShort:'het', superShort:'スーパーフォーム', colProb:'確率', colVisual:'ビジュアル（発現）', colHet:'Het（保因）', hetNone:'–',
    partialToggle:'可能性 het を表示（66・33%）', partialHint:'66・33% など確率的な保因も表に表示',
    vintageToggle:'懐かしのモルフを表示', vintageHint:'今では見かけない古いモルフ・コンボも表示', optInfo:'表示オプションの説明',
    comboLoad:'コンボ個体を読み込む…', donate:'開発者を支援', adLabel:'広告', adHint:'ここに広告コードを配置できます',
    secCombo:'コンボ（タップで自動設定）', secGene:'遺伝モルフ（確率計算）',
    comboNote:'<b>コンボ名</b> — 結果が既知のコンボと一致すると、そのデザイナー名（例：Galaxy、Radar）を表示します。ラインブリード形質（タンジェリン・ハイポ・TUGスノー）が必要なコンボ（APTOR等）は自動判別されません。',
    warnH:'⚠️ 注意が必要な遺伝の組み合わせ',
    crossTag:'クロス', crossNote:'ラインブリード形質が混ざった交配です。仔に形質が出なくても遺伝子には混ざっているため、分譲・再交配の際は<b>クロス個体</b>と表記することをおすすめします。',
    polyH:'ラインブリード形質（確率計算不可）',
    polyDesc:'ポリジェニック（多因子）形質のため正確な確率は出せません。以下の形質は親が持ち、仔に程度の差はあれ現れる可能性があります。「(両方)」は両親とも持つ形質で、より強く発現する可能性があります。 ラインネーム（マンダリン・ブラッド等）が付くのは、その色の<b>固定率が取れている</b>という意味です。別のラインと混ざると固定が外れ、系統の基本名に戻ります — マンダリン × タンジェリンは<b>タンジェリン</b>になります。両親のどちらかのライン名が不明なら<b>タンジェリン</b>として扱ってください。',
    polyBoth:'両方',
    cat:{rec:'劣性 (Recessive)', incdom:'不完全優性 (Incomplete Dominant)', dom:'優性 (Dominant)', poly:'ラインブリード (Line-bred)'},
    inh:{rec:'劣性', incdom:'不完全優性', dom:'優性', poly:'多因子'},
    optRec:{nn:'ノーマル', het:'het（保因）', mm:'ビジュアル'},
    optDom:{nn:'ノーマル', het:'ビジュアル', mm:'スーパーフォーム'},
    note:'<b>参考</b> — トレンパー・ベル・レインウォーターアルビノは<b>別々の遺伝子</b>のため、片方のアルビノ het と別のアルビノ het を交配してもアルビノは出ません（ダブル het）。マックスノーは不完全優性（ホモ = スーパースノー、健康）、エニグマ・W&Y は優性です。<b>一部のモルフはスーパー（ホモ）や特定の組み合わせで深刻な健康問題や致死性が生じます</b>（例：スーパーレモンフロストの腫瘍、エニグマの神経症状）。リスクのある組み合わせは結果上部に警告表示されます。',
    updDone:'更新済み', updSoon:'更新予定',
    updDoneList:['V1.0 テスト版リリース'],
    updSoonList:['リスト準備中'],
    mailNote:'情報の修正・不具合のご報告・ご要望は<b>お問い合わせ</b>からお送りください',
    credit:'本モルフ計算機は <b>Stylish Gecko</b> の助言と協力を得て制作しました。',
    footer:'確率はメンデル遺伝に基づく理論値です · ラインブリード（ポリジェニック）形質は確率計算の対象外です',
  },
};

LANG='ko';
let showPoly=true, showPartialHet=false, showVintage=false, hasResult=false;
function L(){ return I18N[LANG]; }
function gName(g){ return g[LANG]; }
function gSuper(g){ return g['super'+LANG.charAt(0).toUpperCase()+LANG.slice(1)]; }
function pName(p){ return p[LANG]; }

/* ================= UI ================= */
function famHeader(fam){
  const d=document.createElement('div'); d.className='famhead';
  const desc=fam.desc[LANG];
  d.innerHTML='<span class="famname">'+escapeHtml(fam[LANG])+'</span>'
    +'<span class="fambadge badge-'+fam.type+'">'+escapeHtml(L().inh[fam.type])+'</span>'
    +(desc?'<div class="famdesc">'+escapeHtml(desc)+'</div>':'');
  return d;
}
function secHeader(text){ const d=document.createElement('div'); d.className='sechead'; d.textContent=text; return d; }
function comboChip(combo, side, matched){
  const on = (matched===combo);
  const chip=document.createElement('button');
  chip.className='chip combochip'+(side==='B'?' b':'')+(on?' on':'');
  chip.innerHTML='<i class="bi bi-stars combo-icon" aria-hidden="true"></i>'+escapeHtml(combo[LANG]||combo.en)
    +(combo.risk?' <i class="bi bi-exclamation-triangle-fill chiprisk" aria-hidden="true"></i>':'');
  chip.onclick=()=>{
    if(on){ GENES.forEach(g=>STATE[side][g.id]='nn'); }
    else { applyComboToParent(side, combo); }
    buildParent(side);
    if(hasResult) calculate();
  };
  return chip;
}
function buildParent(side){
  const host=document.getElementById(side==='A'?'parentA':'parentB');
  host.innerHTML='';
  const matched=matchCombo(parentTokens(side));
  // 명칭 있는 콤보면 부모 카드에 명칭 표시 (예: = 갤럭시)
  if(matched){ const badge=document.createElement('div'); badge.className='parentcombo'+(side==='B'?' b':''); badge.textContent='= '+(matched[LANG]||matched.en); host.appendChild(badge); }
  // 콤보 칩 (탭하면 구성 유전자 자동 세팅)
  host.appendChild(secHeader(L().secCombo));
  const cgrid=document.createElement('div'); cgrid.className='chipgrid';
  COMBOS.filter(c=>!c.vintage||showVintage||c===matched).forEach(c=>cgrid.appendChild(comboChip(c, side, matched)));
  host.appendChild(cgrid);
  // 유전 모프 (열성/우성 구분 없이 하나의 칩셋)
  host.appendChild(secHeader(L().secGene));
  const grid=document.createElement('div'); grid.className='chipgrid';
  GENES.forEach(g=>{
    if(g.type==='incdom'){          // 불완전우성: 비주얼/슈퍼를 각각 별도 칩으로
      grid.appendChild(incdomChip(g, side, 'het', gName(g)));
      grid.appendChild(incdomChip(g, side, 'mm', gSuper(g)));
    } else {
      grid.appendChild(chipFor(g, side, false));
    }
  });
  host.appendChild(grid);
  // 라인브리딩(폴리제닉) — 확률 계산 불가, 참고용
  const pf=FAMILIES.find(f=>f.id==='poly');
  host.appendChild(famHeader(pf));
  const pgrid=document.createElement('div'); pgrid.className='chipgrid';
  POLY.forEach(p=>pgrid.appendChild(chipFor(p, side, true)));
  host.appendChild(pgrid);
  renderLeoSelected();
}
// 칩을 처음 켤 때 기본값 (rec=비주얼, incdom/dom=첫 비주얼 상태)
function defaultOn(g){ return g.type==='rec'? 'mm' : 'het'; }
// 켜진 칩 아래 서브 토글 옵션
function subsegOptions(g){
  const t=L();
  if(g.type==='rec')    return [['het', t.hetShort], ['mm', t.visualTag]];   // 헷 / 비주얼
  if(g.type==='incdom') return [['het', gName(g)], ['mm', gSuper(g)]];        // 맥스노우 / 슈퍼 스노우
  return [['het', t.visualTag], ['mm', t.superShort]];                       // 비주얼 / 슈퍼폼
}
// 불완전우성 전용: 상태(het=비주얼 / mm=슈퍼)별 독립 칩
function incdomChip(g, side, state, label){
  const on = STATE[side][g.id]===state;
  const chip=document.createElement('button');
  chip.className='chip'+(side==='B'?' b':'')+(on?' on':'');
  const col = (state==='mm'? (GCOLOR['super_'+g.id]||'#EFEEEA') : (GCOLOR[g.id]||'#CFC7A0'));
  chip.innerHTML='<span class="sw" style="background:'+col+'"></span>'+escapeHtml(label)
    +(g.risk?' <i class="bi bi-exclamation-triangle-fill chiprisk" aria-hidden="true"></i>':'');
  chip.onclick=()=>{ STATE[side][g.id]= on? 'nn' : state; buildParent(side); if(hasResult) calculate(); };
  return chip;
}
function chipFor(g, side, isPoly){
  const wrap=document.createElement('div'); wrap.className='chipwrap';
  const off= isPoly? 'no':'nn';
  const on = STATE[side][g.id]!==off;
  const chip=document.createElement('button');
  chip.className='chip'+(side==='B'?' b':'')+(on?' on':'');
  const col=GCOLOR[g.id]||'#CFC7A0';
  const sw = MORPH_IMG[g.id]? '<span class="sw img" style="background-image:url('+MORPH_IMG[g.id]+')"></span>' : '<span class="sw" style="background:'+col+'"></span>';
  chip.innerHTML=sw+escapeHtml(isPoly? pName(g) : gName(g))
    +(g.risk?' <i class="bi bi-exclamation-triangle-fill chiprisk" aria-hidden="true"></i>':'');
  chip.onclick=()=>{
    STATE[side][g.id]= on? off : (isPoly? 'yes' : defaultOn(g));
    buildParent(side);
    if(hasResult) calculate();
  };
  wrap.appendChild(chip);
  if(on && !isPoly){
    const seg=document.createElement('div'); seg.className='subseg'+(side==='B'?' b':'');
    subsegOptions(g).forEach(([val,lab])=>{
      const b=document.createElement('button'); b.textContent=lab;
      if(STATE[side][g.id]===val) b.classList.add('on');
      b.onclick=(e)=>{ e.stopPropagation(); STATE[side][g.id]=val; buildParent(side); if(hasResult) calculate(); };
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
  }
  return wrap;
}

/* 콤보 개체를 부모에 적용 — 콤보 토큰을 유전자 상태로 변환 */
function applyComboToParent(side, combo){
  GENES.forEach(g=>STATE[side][g.id]='nn'); // 멘델 형질 초기화
  combo.tokens.forEach(tk=>{
    if(tk.indexOf('super_')===0){ const id=tk.slice(6); if(STATE[side][id]!==undefined) STATE[side][id]='mm'; return; }
    const g=GENES.find(x=>x.id===tk); if(!g) return;
    STATE[side][g.id]= (g.type==='rec')? 'mm' : 'het'; // rec=비주얼(mm), incdom Nm / dom 비주얼
  });
}
function applyLang(){
  const t=L();
  document.documentElement.lang=t.htmlLang;
  document.getElementById('h-title').textContent=t.title;
  document.getElementById('h-sub').textContent=t.sub;
  document.getElementById('lbl-pa').textContent=t.parentA;
  document.getElementById('lbl-pb').textContent=t.parentB;
  document.getElementById('lbl-pa-role-leo').textContent=t.parentRole;
  document.getElementById('lbl-pb-role-leo').textContent=t.parentRole;
  document.getElementById('lbl-help-leo').textContent=t.helpBtn;
  document.getElementById('lbl-help2-leo').textContent=t.helpBtn;
  document.getElementById('lbl-selected').textContent=t.selectedLabel;
  document.getElementById('lbl-sel-a').textContent=t.parentA;
  document.getElementById('lbl-sel-b').textContent=t.parentB;
  document.getElementById('btn-reset').innerHTML='<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i><span>'+escapeHtml(t.reset)+'</span>';
  document.getElementById('btn-calc').innerHTML='<i class="bi bi-calculator" aria-hidden="true"></i><span>'+escapeHtml(t.calc)+'</span><i class="bi bi-chevron-right calc-arrow" aria-hidden="true"></i>';
  document.getElementById('lbl-partial').textContent=t.partialToggle;
  document.getElementById('lbl-vintage').textContent=t.vintageToggle;
  document.getElementById('lbl-optinfo').textContent=t.optInfo;
  document.getElementById('optNote').innerHTML='<b>'+escapeHtml(t.partialToggle)+'</b> — '+escapeHtml(t.partialHint)
    +'<br><b>'+escapeHtml(t.vintageToggle)+'</b> — '+escapeHtml(t.vintageHint);
  document.getElementById('note').innerHTML=t.note+'<br><br>'+t.comboNote;
  const MAIL='kmc612000@gmail.com';
  const setTx=(id,html)=>{ const e=document.getElementById(id); if(e) e.innerHTML=html; };
  setTx('mailNote', t.mailNote+' ('+MAIL+')');
  setTx('creditNote', t.credit);
  document.getElementById('footer').textContent=t.footer;
  /* 업데이트 노트 — 예전에는 index.html 에 <li> 로 박혀 있어서 문구 하나 고치려면
     배포를 해야 했습니다. 이제 여기서 그리고, 관리자에서 고친 값이 있으면
     gecko-app.js 가 t.updDoneList / t.updSoonList 를 덮어씁니다. */
  const setUpd=(id,val)=>{ const el=document.getElementById(id); if(el) el.innerHTML=val; };
  setUpd('lbl-upddone','✅ '+escapeHtml(t.updDone));
  setUpd('lbl-updsoon','🔜 '+escapeHtml(t.updSoon));
  setUpd('updDone',(t.updDoneList||[]).map(x=>'<li>'+x+'</li>').join(''));
  setUpd('updSoon',(t.updSoonList||[]).map(x=>'<li>'+x+'</li>').join(''));
  document.getElementById('lbl-langtitle').textContent=t.langLabel;
  document.querySelectorAll('#langMenu button').forEach(b=>b.classList.toggle('on', b.dataset.lang===LANG));
  // 후원 버튼 + 광고 영역
  const dn=document.getElementById('donateBtn'); dn.innerHTML='<i class="bi bi-cup-hot" aria-hidden="true"></i><span>'+escapeHtml(t.donate)+'</span>';
  dn.closest('.donate-wrap').style.display = SHOW_DONATE? '' : 'none';
  const ad=document.getElementById('adSlot');
  if(AD_ENABLED && !window.__isPrem){ ad.style.display='flex'; ad.innerHTML = AD_HTML || ('<div class="adlbl">'+escapeHtml(t.adLabel)+'</div><div class="adhint">'+escapeHtml(t.adHint)+'</div>'); }
  else ad.style.display='none';
  buildParent('A'); buildParent('B');
  if(hasResult) calculate();
  else document.getElementById('results').innerHTML='<div class="empty">'+t.emptyStart+'</div>';
}
function setLang(lang){ if(lang===LANG) return; LANG=lang; applyLang(); }

function renderLeoSelected(){
  ['A','B'].forEach(side=>{
    const box=document.getElementById('leoSel'+side);
    if(!box) return;
    const picked=[];
    document.querySelectorAll('#parent'+side+' .chip.on:not(.combochip)').forEach(chip=>{
      const sw=chip.querySelector('.sw');
      const label=(chip.textContent||'').trim();
      if(label) picked.push({label, color:sw?getComputedStyle(sw).backgroundColor:''});
    });
    if(!picked.length){
      box.innerHTML='<span class="sel-none">—</span>';
      return;
    }
    box.innerHTML=picked.map(item=>'<span class="selchip">'
      +(item.color?'<span class="sw" style="background:'+escapeHtml(item.color)+'"></span>':'')
      +escapeHtml(item.label)+'</span>').join('');
  });
}

function toggleLeoOptNote(){
  const note=document.getElementById('optNote');
  const button=document.getElementById('optInfoBtn');
  const open=!note.classList.contains('show');
  note.classList.toggle('show',open);
  button.setAttribute('aria-expanded',open?'true':'false');
  if(open) note.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function resetAll(){
  GENES.forEach(g=>{STATE.A[g.id]='nn';STATE.B[g.id]='nn';});
  POLY.forEach(p=>{STATE.A[p.id]='no';STATE.B[p.id]='no';});
  hasResult=false;
  buildParent('A'); buildParent('B');
  document.getElementById('results').innerHTML='<div class="empty">'+L().emptyStart+'</div>';
}

function calculate(){
  const active=GENES.filter(g=>STATE.A[g.id]!=='nn'||STATE.B[g.id]!=='nn');
  let rows=null, dists=[];
  if(active.length>0){
    dists=active.map(g=>({g, dist:geneDist(g)}));
    const buckets=active.map(g=>geneVisualBuckets(g));
    let combos=[{prob:1, recVis:[], othVis:[], hets:[], tokens:new Set()}];
    buckets.forEach(list=>{
      const next=[];
      combos.forEach(c=>list.forEach(bk=>{
        const recVis=c.recVis.slice(), othVis=c.othVis.slice(), hets=c.hets.slice(), tokens=new Set(c.tokens);
        if(bk.visualName){ (bk.rec?recVis:othVis).push(bk.visualName); if(bk.token) tokens.add(bk.token); }
        if(bk.het) hets.push(bk.het);
        next.push({prob:c.prob*bk.prob, recVis, othVis, hets, tokens});
      }));
      combos=next;
    });
    rows=combos.filter(c=>c.prob>1e-9).map(c=>{
      const cb=matchCombo(c.tokens);
      const guaranteed=c.hets.filter(h=>h.p>=0.999).map(h=>h.name);
      const partial=c.hets.filter(h=>h.p<0.999).map(h=>({name:h.name, pct:Math.floor(h.p*100+1e-9)}));
      return {
        prob:c.prob,
        combo: cb?(cb[LANG]||cb.en):null,
        visualLabel: buildVisualLabel(c.recVis, c.othVis),
        isNormal: (c.recVis.length+c.othVis.length)===0,
        tokens:[...c.tokens],
        guaranteed, partial
      };
    }).sort((a,b)=>b.prob-a.prob);
  }
  const warnings=computeWarnings(dists);
  const poly=gatherPoly();
  /* 라인브리딩 형질만 고른 경우에도 결과 한 줄은 나와야 합니다.
     유전 모프가 없으면 위에서 rows 를 아예 만들지 않아 표가 통째로 빠지고,
     그 안에 붙는 크로스 표기도 같이 사라졌습니다. 만다린 × 블랙나이트처럼
     라인만 섞은 교배야말로 크로스 표기가 필요한 경우인데 안 보였습니다.
     유전적으로는 전부 노멀이므로 100% 노멀 한 줄을 만들어 줍니다. */
  if((!rows || !rows.length) && poly.length){
    rows=[{ prob:1, combo:null, visualLabel:buildVisualLabel([],[]), isNormal:true,
            tokens:[], guaranteed:[], partial:[] }];
  }
  const anything = (rows&&rows.length) || warnings.length || poly.length;
  hasResult=!!anything;
  render({rows, warnings, poly, anything});
}

/* ================= 결과 렌더 ================= */
function fracStr(prob){
  let best={n:0,d:1,err:1};
  for(let d=1; d<=256; d++){
    const n=Math.round(prob*d), err=Math.abs(prob-n/d);
    if(err<best.err-1e-9){best={n,d,err};}
    if(err<1e-9) break;
  }
  const gg=gcd(best.n,best.d);
  return (best.n/gg)+'/'+(best.d/gg);
}
function render(payload){
  const host=document.getElementById('results'), t=L();
  if(!payload || !payload.anything){
    host.innerHTML='<div class="empty">'+t.emptyNone+'</div>';
    return;
  }
  /* 다인자(라인브리딩) 크로스 표기
     ─────────────────────────────────────────────────────────────
     탠저린 같은 라인브리딩 형질이 교배에 섞이면, 새끼에서 그 형질이
     보일 수도 안 보일 수도 있지만 유전자에는 이미 섞여 있습니다.
     그래서 결과 모프명 옆에 '(탠저린 크로스)' 를 남겨 순수 개체와
     구분할 수 있게 합니다. 분양·재교배 때 이력이 남아야 하기 때문입니다. */
  /* ⚠️ 양쪽 부모가 '같은' 라인브리딩 형질을 가진 경우는 크로스가 아닙니다.
     만다린 × 만다린은 그냥 만다린 라인이지 크로스가 아니고, 크로스는 서로 다른
     라인이 섞였을 때만 씁니다. (현직 브리더 확인)
     gatherPoly 가 both=true 로 표시해 주므로 그것만 빼면 됩니다. */
  const crossPoly = (payload.poly || []).filter(p=>!p.both);
  /* 라인브리딩 이름은 결과명에 직접 붙습니다(아래 polyName).
     그러면 '(만다린 크로스)' 태그까지 붙이면 같은 말을 두 번 쓰게 돼서,
     서로 다른 라인이 섞였을 때만 태그를 남깁니다. 안내문은 그대로 둘니다. */
  const polyName = (typeof polyLabel==='function') ? polyLabel(payload.poly||[]) : '';
  const crossTag = (crossPoly.length && crossPoly.length===(payload.poly||[]).length && !polyName)
    ? '(' + crossPoly.map(p=>p.name).join('·') + ' ' + t.crossTag + ')'
    : '';
  let html='';
  if(payload.warnings && payload.warnings.length){
    html+='<div class="warnhead">'+t.warnH+'</div>';
    payload.warnings.forEach(w=>{ html+='<div class="warnbox warn-'+w.level+'">'+w.text+'</div>'; });
  }
  if(payload.rows && payload.rows.length){
    const rows=payload.rows;
    html+='<h2>'+t.resultsH+'</h2><div class="summary">'+t.summary(rows.length)+'</div>';
    html+=buildPie(rows);
    html+='<table class="rtable"><thead><tr><th>'+t.colProb+'</th><th>'+t.colVisual+'</th><th>'+t.colHet+'</th></tr></thead><tbody>';
    rows.forEach(r=>{
      const pctNum=r.prob*100, pct= pctNum>=9.95? pctNum.toFixed(0):pctNum.toFixed(1);
      let vtext;
      /* 라인브리딩은 확률 대상이 아니라 모든 새끼에 똑같이 붙습니다.
         유전 모프가 없으면 '노멀' 대신 라인 이름만 남습니다. */
      const baseLabel = polyName
        ? (r.isNormal ? polyName : (r.visualLabel+' '+polyName))
        : r.visualLabel;
      if(r.combo) vtext='<span class="combotag">'+t.comboTag+'</span>'+escapeHtml(r.combo)
        +(polyName? ' '+escapeHtml(polyName):'')
        +'<div class="submorph">'+escapeHtml(r.visualLabel)+'</div>';
      else vtext=escapeHtml(baseLabel);
      // 다인자(라인브리딩) 크로스 표기 — 발현 여부와 무관하게 유전자에 섞였음을 남깁니다.
      if(crossTag) vtext+='<span class="crosstag">'+escapeHtml(crossTag)+'</span>';
      /* TODO(모프 설명): 여기에 r.tokens 기준 간략 설명을 넣을 자리입니다.
         gecko-core.js 의 GENES/POLY 에 desc 필드를 추가한 뒤 아래 주석을 풀어주세요.
         vtext += '<div class="morphdesc">'+escapeHtml(morphDescFor(r.tokens))+'</div>'; */
      const vcell='<div class="visrow"><span class="geckothumb">'+geckoSVG(geckoProfile(r.tokens),46)+'</span>'
        +'<span class="vtext'+(r.isNormal?' isnorm':'')+'">'+vtext+'</span></div>';
      const hetParts=[];
      r.guaranteed.forEach(n=>hetParts.push('<span class="het100">100HET '+escapeHtml(n)+'</span>'));
      if(showPartialHet) r.partial.forEach(p=>hetParts.push('<span class="hetp">'+p.pct+'HET '+escapeHtml(p.name)+'</span>'));
      const hcell = hetParts.length? hetParts.join('') : '<span class="hetnone">'+t.hetNone+'</span>';
      html+='<tr><td class="c-prob"><span class="cdot" style="background:'+r._color+'"></span>'+pct+'%</td>'
        +'<td class="c-vis">'+vcell+'</td>'
        +'<td class="c-het">'+hcell+'</td></tr>';
    });
    html+='</tbody></table>';
    if(crossTag) html+='<div class="crossnote">'+t.crossNote+'</div>';
    if(window.__isPrem) html+='<div class="abar" style="margin-top:10px"><button class="abtn sm ghost" onclick="exportImage()">🖼️ 이미지 저장</button></div>';
  }
  if(payload.poly && payload.poly.length){
    html+='<div class="polyblock"><h3>'+t.polyH+'</h3><div class="pdesc">'+t.polyDesc+'</div>';
    payload.poly.forEach(p=>{ html+='<span class="polychip'+(p.both?' both':'')+'">'+escapeHtml(p.name)+(p.both?' ('+t.polyBoth+')':'')+'</span>'; });
    html+='</div>';
  }
  host.innerHTML=html;
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

/* ================= 초기화 ================= */
const langMenuEl=document.getElementById('langMenu'), langBtnEl=document.getElementById('langBtn');
langBtnEl.addEventListener('click',e=>{ e.stopPropagation(); langMenuEl.classList.toggle('open'); });
document.querySelectorAll('#langMenu button').forEach(b=>b.addEventListener('click',()=>{ setLang(b.dataset.lang); langMenuEl.classList.remove('open'); }));
document.addEventListener('click',e=>{ if(langMenuEl.classList.contains('open') && !langMenuEl.contains(e.target) && !langBtnEl.contains(e.target)) langMenuEl.classList.remove('open'); });
(function(){
  const pc=document.getElementById('partialchk'), vc=document.getElementById('vintagechk');
  const set=(el,on)=>el.setAttribute('aria-pressed', on?'true':'false');
  pc.addEventListener('click',()=>{ showPartialHet=!showPartialHet; set(pc,showPartialHet); if(hasResult) calculate(); });
  vc.addEventListener('click',()=>{ showVintage=!showVintage; set(vc,showVintage); buildParent('A'); buildParent('B'); });
  const ib=document.getElementById('optInfoBtn'), nt=document.getElementById('optNote');
  ib.addEventListener('click',()=>{ const on=!nt.classList.contains('show');
    nt.classList.toggle('show',on); ib.setAttribute('aria-expanded', on?'true':'false'); });
})();

/* ===== 약관·개인정보 링크 노출 스위치 (gecko-core.js) ===== */
(function(){
  if(SHOW_LEGAL_LINKS) return;
  const el=document.getElementById('legalLinks'); if(el) el.style.display='none';
})();

/* ===== 쿠키 안내 ===== */
window.okCookie=function(){ try{ localStorage.setItem('leoCookieOk','1'); }catch(e){} document.getElementById('cookieBar').classList.remove('show'); };
(function(){ let ok=false; try{ ok=localStorage.getItem('leoCookieOk')==='1'; }catch(e){ ok=true; }
  // 약관 링크를 감춘 테스트 기간에는 쿠키 안내도 함께 숨깁니다 (안내가 가리키는 문서가 안 보이므로)
  if(!SHOW_LEGAL_LINKS) return;
  if(!ok && !(location.hash==='#admin')) setTimeout(()=>document.getElementById('cookieBar').classList.add('show'), 1400); })();

/* ===== 업데이트 노트 모달 ===== */
const UPD_VER='2026-07-27-v1.0'; // 버전 바뀌면 '오늘 하루 안 보기' 무관하게 다시 노출
function todayKey(){ try{ return new Date().toISOString().slice(0,10); }catch(e){ return 'x'; } }
function openUpd(){ document.getElementById('updModal').classList.add('show'); }
function closeUpd(){ document.getElementById('updModal').classList.remove('show'); }
function dismissToday(){ try{ localStorage.setItem('leoUpdDismiss', UPD_VER+'|'+todayKey()); }catch(e){} closeUpd(); }
document.getElementById('updModal').addEventListener('click',e=>{ if(e.target.id==='updModal') closeUpd(); });
// 문의 이메일 (제목 포함)
document.getElementById('mailLink').href='mailto:kmc612000@gmail.com?subject='+encodeURIComponent('레오파드 모프 계산기 - 정보수정/업데이트 건의');

applyLang();

// 오늘 하루 안 보기 처리 후 첫 방문 시 자동 노출
(function(){
  let dismissed=false;
  try{ dismissed = (localStorage.getItem('leoUpdDismiss')===UPD_VER+'|'+todayKey()); }catch(e){ dismissed=false; }
  const onAdmin = (location.hash==='#admin') || /\/admin\/?$/.test(location.pathname);
  if(!dismissed && !onAdmin) openUpd();
})();
