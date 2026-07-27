/* =============================================================================
   크레스티드 게코 모프 계산기 · 공용 코어  (crested.html 전용)
   -----------------------------------------------------------------------------
   ※ 레오파드 게코용 gecko-core.js 와 완전히 별개 파일입니다. 서로 영향 없음.

   [ 계산 모델 ]
   첨부 「크레모프계산기_참조.xlsx」는 6개 유전자를 각각 독립으로 두고
   4096(=64×64) 배우자 조합을 펼친 표입니다. 다만 실제 유전학에서는
   ▸ 카푸치노(C) 와 세이블(S) 은 같은 자리(대립유전자) 입니다.
     → 한 마리가 슈퍼카푸치노이면서 동시에 슈퍼세이블일 수 없습니다.
     → 엑셀의 9가지 C×S 조합 중 CC/Ss, Cc/SS, CC/SS 3가지는 존재할 수 없고,
       Cc/Ss 는 「카푸세이블」이 아니라 <b>루왁(Luwak)</b> 입니다.
       (첨부 스크린샷의 '루왁' 칩이 바로 이 조합입니다)

   그래서 이 계산기는 C·S 를 3대립유전자 한 자리(CS 로커스)로 계산합니다.
     CS 유전형 : nn(노멀) · Cn(카푸치노) · Sn(세이블)
                 CC(슈퍼카푸치노) · SS(슈퍼세이블) · CS(루왁)

   ▸ 슈퍼릴리화이트(LL)는 치사 유전이라 성체가 존재하지 않습니다.
     따라서 부모로는 고를 수 없고(superNonViable), 새끼 결과에만
     '비생존'으로 표시됩니다.
   ============================================================================= */

var LANG = (typeof LANG !== 'undefined') ? LANG : 'ko';

/* ---- 공용 헬퍼 ---- */
function escapeHtml(s){return String(s).replace(/[&<>"]/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x];});}
function tr(o){ return (o && (o[LANG] || o.en)) || ''; }
function gName(g){ return tr(g); }
function gSuper(g){ return g['super'+LANG.charAt(0).toUpperCase()+LANG.slice(1)] || g.superEn || ''; }
function gHet(g){ return g['het'+LANG.charAt(0).toUpperCase()+LANG.slice(1)] || g.hetEn || ''; }
function tName(t){ return tr(t); }
/* 코어에서 쓰는 최소 문구 (화면 문구 전체는 crested.html 의 I18N 에 있습니다) */
const CR_T = {
  ko:{ copy1:'1카피', copy2:'2카피' }, en:{ copy1:'1 copy', copy2:'2 copies' },
  ja:{ copy1:'1コピー', copy2:'2コピー' }, zh:{ copy1:'1个拷贝', copy2:'2个拷贝' },
};
function crT(){ return CR_T[LANG] || CR_T.ko; }

/* --- 화면 노출 스위치 : 계산기부터 먼저 오픈 --- */
const CR_CONTACT_MAIL = 'kmc612000@gmail.com';

/* ============================================================================
   1. 유전자 정의
   ----------------------------------------------------------------------------
   kind  : 'bi'  = 2대립유전자 (N/m)  ·  'multi' = 다대립유전자 한 자리
   type  : 'incdom' 불완전우성 / 'rec' 열성 / 'dom' 우성
   core  : true  = 엑셀 참조표의 형질(항상 표시)
           false = 리서치로 확인된 추가 형질([추가 유전자] 토글을 켜야 표시)
   proof : 'established' 확립 / 'partial' 부분 검증 / 'contested' 미확정
   ============================================================================ */

/* --- 1-1. 릴리화이트 (불완전우성 · 슈퍼폼 비생존) --- */
const CR_G_LILLY = {
  id:'lilly', kind:'bi', type:'incdom', core:true, proof:'established', order:1,
  ko:'릴리화이트', en:'Lilly White', ja:'リリーホワイト', zh:'莉莉白',
  superKo:'슈퍼릴리화이트', superEn:'Super Lilly White', superJa:'スーパーリリーホワイト', superZh:'超级莉莉白',
  /* 슈퍼폼이 치사 → 성체가 없으므로 부모 선택지에서 제외됩니다.
     (새끼 결과에는 '비생존'으로 계속 표시)                                   */
  superNonViable:true,
  warnOnSuper:'W1',
  note:{ ko:'<b>슈퍼릴리화이트는 부모로 고를 수 없습니다.</b> 치사 유전이라 성체가 존재하지 않기 때문입니다. 릴리화이트끼리 교배하면 새끼 결과에 <b>비생존</b>으로 표시됩니다.',
         en:'<b>Super Lilly White cannot be selected as a parent</b> — it is effectively lethal, so no adult exists. It still appears in the offspring results, marked <b>non-viable</b>, when two Lilly Whites are paired.',
         ja:'<b>スーパーリリーホワイトは親として選べません。</b>致死遺伝のため成体が存在しないからです。リリーホワイト同士を交配した場合、仔の結果には<b>生存困難</b>として表示されます。',
         zh:'<b>超级莉莉白无法作为亲本选择</b> — 因其为致死遗传，不存在成体。莉莉白之间配对时，它仍会出现在后代结果中并标注为<b>不存活</b>。' },
};

/* --- 1-2. 카푸치노 / 세이블 : 같은 자리(3대립유전자) --- */
const CR_G_CS = {
  id:'cs', kind:'multi', core:true, proof:'established', order:2, type:'incdom',
  ko:'카푸치노 · 세이블', en:'Cappuccino · Sable', ja:'カプチーノ・セーブル', zh:'卡布奇诺・黑貂',
  /* 유전형 키 정렬 순서 — genos 의 키 표기(Cn·Sn·CS·CC·SS·nn)와 반드시 일치해야 합니다 */
  alleles:['C','S','n'],
  note:{ ko:'카푸치노와 세이블은 <b>같은 자리</b>의 다른 돌연변이입니다. 한 개체가 둘 다 슈퍼일 수 없고, 카푸치노 1개 + 세이블 1개를 가지면 <b>루왁</b>이 됩니다.',
         en:'Cappuccino and Sable are different mutations at the <b>same locus</b>. One animal cannot be super for both; one Cappuccino allele plus one Sable allele makes a <b>Luwak</b>.',
         ja:'カプチーノとセーブルは<b>同じ座</b>の別の変異です。1個体が両方のスーパーになることはなく、カプチーノ1つ＋セーブル1つで<b>ルアク</b>になります。',
         zh:'卡布奇诺与黑貂是<b>同一基因座</b>上的不同突变。同一个体不可能同时为两者的超级形态；一个卡布奇诺等位基因加一个黑貂等位基因即为<b>Luwak</b>。' },
  /* 선택 가능한 부모 상태 = 유전형 그대로 */
  genos:{
    nn:{ name:null, token:null },
    Cn:{ token:'cappuccino',       ko:'카푸치노',     en:'Cappuccino',        ja:'カプチーノ',              zh:'卡布奇诺' },
    Sn:{ token:'sable',            ko:'세이블',       en:'Sable',             ja:'セーブル',                zh:'黑貂' },
    CC:{ token:'super_cappuccino', ko:'슈퍼카푸치노', en:'Super Cappuccino',  ja:'スーパーカプチーノ',      zh:'超级卡布奇诺', warn:'W2', health:true },
    SS:{ token:'super_sable',      ko:'슈퍼세이블',   en:'Super Sable',       ja:'スーパーセーブル',        zh:'超级黑貂' },
    CS:{ token:'luwak',            ko:'루왁',         en:'Luwak',             ja:'ルアク',                  zh:'Luwak' },
  },
};

/* --- 1-3. 열성 3종 --- */
const CR_G_PHANTOM = {
  id:'phantom', kind:'bi', type:'rec', core:true, proof:'contested', order:3, approx:true,
  ko:'팬텀', en:'Phantom', ja:'ファントム', zh:'幻影',
  hetKo:'헷팬텀', hetEn:'het Phantom', hetJa:'ヘテロファントム', hetZh:'携带幻影',
};
const CR_G_CHOCHO = {
  id:'chocho', kind:'bi', type:'rec', core:true, proof:'contested', order:4,
  ko:'초초', en:'ChoCho', ja:'チョチョ', zh:'ChoCho',
  hetKo:'헷초초', hetEn:'het ChoCho', hetJa:'ヘテロチョチョ', hetZh:'携带ChoCho',
};
const CR_G_AXANTHIC = {
  id:'axanthic', kind:'bi', type:'rec', core:true, proof:'established', order:5,
  ko:'아잔틱', en:'Axanthic', ja:'アザンティック', zh:'无黄化',
  hetKo:'헷아잔틱', hetEn:'het Axanthic', hetJa:'ヘテロアザンティック', hetZh:'携带无黄化',
};

/* --- 1-4. 추가 유전자 (리서치 검증 · 기본 꺼짐) --- */
const CR_G_EXTRA = [
  { id:'whiteout', kind:'bi', type:'incdom', core:false, proof:'partial', order:6,
    ko:'화이트아웃', en:'Whiteout', ja:'ホワイトアウト', zh:'Whiteout',
    superKo:'화이트월', superEn:'Whitewall', superJa:'ホワイトウォール', superZh:'白墙' },

  { id:'empty_back', kind:'bi', type:'incdom', core:false, proof:'partial', order:7,
    ko:'엠티백', en:'Empty Back', ja:'エンプティバック', zh:'空背',
    superKo:'슈퍼 엠티백', superEn:'Super Empty Back', superJa:'スーパーエンプティバック', superZh:'超级空背' },

  { id:'dalmatian', kind:'bi', type:'dom', core:false, proof:'partial', order:8, noSuper:true,
    ko:'달마시안', en:'Dalmatian', ja:'ダルメシアン', zh:'大麦町',
    note:{ ko:'점의 <b>유무</b>는 우성으로 유전되지만 점의 <b>개수·크기</b>는 다인자입니다. ‘슈퍼달마시안’은 동형접합이 아니라 점이 많다는 뜻일 뿐입니다.',
           en:'The <b>presence</b> of spots is inherited dominantly, but spot <b>number and size</b> are polygenic. “Super Dalmatian” means heavily spotted — it is <b>not</b> a homozygote.',
           ja:'斑点の<b>有無</b>は優性遺伝ですが、斑点の<b>数・大きさ</b>は多因子です。「スーパーダルメシアン」はホモではなく、斑点が多いという意味に過ぎません。',
           zh:'斑点的<b>有无</b>为显性遗传，但斑点的<b>数量与大小</b>是多基因决定的。"超级大麦町"只表示斑点很多，<b>并非</b>纯合个体。' } },

  { id:'pied', kind:'bi', type:'rec', core:false, proof:'contested', order:9,
    ko:'파이드', en:'Pied', ja:'パイド', zh:'花斑',
    hetKo:'헷파이드', hetEn:'het Pied', hetJa:'ヘテロパイド', hetZh:'携带花斑' },

  { id:'fire', kind:'bi', type:'incdom', core:false, proof:'contested', order:10,
    ko:'파이어 (제네틱 하이포)', en:'Fire (Genetic Hypo)', ja:'ファイア（ジェネティックハイポ）', zh:'Fire（基因型低黑化）',
    superKo:'슈퍼파이어 (BEL)', superEn:'Super Fire (BEL)', superJa:'スーパーファイア（BEL）', superZh:'超级 Fire（黑眼白化）',
    warnOnSuper:'W5' },
];

/* 사용할 유전자 전체 목록 (표기 순서 = order) */
function CR_ALL_GENES(){
  return [CR_G_LILLY, CR_G_CS, CR_G_PHANTOM, CR_G_CHOCHO, CR_G_AXANTHIC]
    .concat(CR_G_EXTRA).sort((a,b)=>a.order-b.order);
}

/* 부모로 고를 수 있는 유전형인지 — 슈퍼폼이 치사인 형질은 부모가 될 수 없습니다 */
function crSelectableAsParent(g, state){
  if(state==='mm' && g.kind!=='multi' && g.type==='incdom' && g.superNonViable) return false;
  return true;
}

/* ---- 계열(패밀리) 설명 ---- */
const CR_FAMILIES = [
  { id:'incdom', type:'incdom', ko:'불완전우성', en:'Incomplete Dominant', ja:'不完全優性', zh:'不完全显性',
    desc:{ ko:'한 개만 있어도 겉으로 보이고, 두 개면 슈퍼폼이 됩니다',
           en:'Visible with one copy · two copies give the super form',
           ja:'1つでも発現し、2つでスーパーフォームになります',
           zh:'单拷贝即表现，纯合为超级形态' } },
  { id:'rec', type:'rec', ko:'열성', en:'Recessive', ja:'劣性', zh:'隐性',
    desc:{ ko:'두 개가 모두 모여야 겉으로 보입니다 (한 개면 헷 보인자)',
           en:'Only visible with two copies · one copy is a het carrier',
           ja:'2つ揃って初めて発現します（1つはヘテロ保因）',
           zh:'需两个拷贝才表现 · 单拷贝为 het 携带' } },
  { id:'dom', type:'dom', ko:'우성', en:'Dominant', ja:'優性', zh:'显性',
    desc:{ ko:'한 개만 있어도 겉으로 보입니다',
           en:'Expressed from a single copy',
           ja:'片方だけでも発現します',
           zh:'单拷贝即可表现' } },
  { id:'poly', type:'poly', ko:'라인브리딩', en:'Line-bred', ja:'ラインブリード', zh:'线育',
    desc:{ ko:'다인자 형질 · 확률 계산 불가 (참고용 표시)',
           en:'Polygenic · not probability-based (reference only)',
           ja:'多因子形質 · 確率計算不可（参考表示）',
           zh:'多基因性状 · 无法计算概率（仅供参考）' } },
];

/* ============================================================================
   2. 라인브리딩(폴리제닉) 형질 — 확률 계산 대상 아님
   첨부 스크린샷의 칩 목록 기준. 리서치에서 지적된 분류 오류는 바로잡았습니다.
   (타이거 → 패턴 / 벅스킨 → 컬러 / 바이·트라이 → 베이스)
   ============================================================================ */
const CR_TRAIT_GROUPS = [
  { id:'base',    ko:'베이스 모프',   en:'Base morph',       ja:'ベースモルフ',   zh:'基础形态' },
  { id:'pattern', ko:'패턴',          en:'Pattern',          ja:'パターン',       zh:'花纹' },
  { id:'struct',  ko:'구조 형질',     en:'Structural trait', ja:'構造形質',       zh:'结构性状' },
  { id:'color',   ko:'베이스 컬러',   en:'Base color',       ja:'ベースカラー',   zh:'底色' },
];

const CR_TRAITS = [
  /* --- 베이스 모프 (패턴 피복도 사다리) --- */
  { id:'patternless', grp:'base', ko:'패턴리스',      en:'Patternless',       ja:'パターンレス',              zh:'无纹' },
  { id:'bicolor',     grp:'base', ko:'바이',          en:'Bicolor',           ja:'バイカラー',                zh:'双色' },
  { id:'tricolor',    grp:'base', ko:'트라이',        en:'Tricolor',          ja:'トライカラー',              zh:'三色' },
  { id:'flame',       grp:'base', ko:'플레임',        en:'Flame',             ja:'フレイム',                  zh:'火焰' },
  { id:'harlequin',   grp:'base', ko:'할리퀸',        en:'Harlequin',         ja:'ハーレクイン',              zh:'小丑' },
  { id:'exharlequin', grp:'base', ko:'익스트림할리퀸', en:'Extreme Harlequin', ja:'エクストリームハーレクイン', zh:'极端小丑' },
  { id:'hypo',        grp:'base', ko:'하이포',        en:'Hypo',              ja:'ハイポ',                    zh:'低黑' },
  { id:'superhypo',   grp:'base', ko:'슈퍼하이포',    en:'Super Hypo',        ja:'スーパーハイポ',            zh:'超级低黑', fakeSuper:true },

  /* --- 패턴 --- */
  { id:'tiger',       grp:'pattern', ko:'타이거',        en:'Tiger',           ja:'タイガー',            zh:'虎纹' },
  { id:'brindle',     grp:'pattern', ko:'브린들',        en:'Brindle',         ja:'ブリンドル',          zh:'Brindle' },
  { id:'superdal',    grp:'pattern', ko:'슈퍼달마시안',  en:'Super Dalmatian', ja:'スーパーダルメシアン', zh:'超级大麦町', fakeSuper:true },
  { id:'pinstripe',   grp:'pattern', ko:'핀스트라이프',  en:'Pinstripe',       ja:'ピンストライプ',      zh:'直纹' },
  { id:'fullpin',     grp:'pattern', ko:'풀핀',          en:'Full Pinstripe',  ja:'フルピンストライプ',  zh:'满直纹' },
  { id:'whitepin',    grp:'pattern', ko:'화이트핀',      en:'White Pinstripe', ja:'ホワイトピンストライプ', zh:'白直纹' },
  { id:'superstripe', grp:'pattern', ko:'슈퍼스트라이프', en:'Super Stripe',   ja:'スーパーストライプ',  zh:'超级直纹', fakeSuper:true },
  { id:'quad',        grp:'pattern', ko:'쿼드',          en:'Quad Stripe',     ja:'クワッドストライプ',  zh:'Quad Stripe' },
  { id:'drippy',      grp:'pattern', ko:'드리피',        en:'Drippy',          ja:'ドリッピー',          zh:'Drippy' },
  { id:'whitespot',   grp:'pattern', ko:'화이트스팟',    en:'White Spot',      ja:'ホワイトスポット',    zh:'白斑' },

  /* --- 구조 형질 --- */
  { id:'solidback',   grp:'struct', ko:'솔리드백',      en:'Solid Back',      ja:'ソリッドバック',      zh:'Solid Back' },
  { id:'porthole',    grp:'struct', ko:'화이트포트홀',  en:'White Porthole',  ja:'ホワイトポートホール', zh:'白舷窗' },
  { id:'whitecrown',  grp:'struct', ko:'화이트크라운',  en:'White Crown',     ja:'ホワイトクラウン',    zh:'白冠' },

  /* --- 베이스 컬러 --- */
  { id:'red',        grp:'color', ko:'레드',        en:'Red',        ja:'レッド',        zh:'红色' },
  { id:'orange',     grp:'color', ko:'텐저린',      en:'Tangerine',  ja:'タンジェリン',  zh:'橘色' },
  { id:'yellow',     grp:'color', ko:'옐로우',      en:'Yellow',     ja:'イエロー',      zh:'黄色' },
  { id:'cream',      grp:'color', ko:'크림',        en:'Cream',      ja:'クリーム',      zh:'奶油色' },
  { id:'creamsicle', grp:'color', ko:'크림시클',    en:'Creamsicle', ja:'クリームシクル', zh:'奶油橙' },
  { id:'strawberry', grp:'color', ko:'스트로베리',  en:'Strawberry', ja:'ストロベリー',  zh:'草莓色' },
  { id:'halloween',  grp:'color', ko:'할로윈',      en:'Halloween',  ja:'ハロウィン',    zh:'万圣节' },
  { id:'buckskin',   grp:'color', ko:'벅스킨',      en:'Buckskin',   ja:'バックスキン',  zh:'鹿皮色' },
  { id:'charcoal',   grp:'color', ko:'챠콜',        en:'Charcoal',   ja:'チャコール',    zh:'炭灰色' },
  { id:'dark',       grp:'color', ko:'다크',        en:'Dark',       ja:'ダーク',        zh:'深色' },
  { id:'black',      grp:'color', ko:'블랙',        en:'Black',      ja:'ブラック',      zh:'黑色' },
  { id:'white',      grp:'color', ko:'화이트',      en:'White',      ja:'ホワイト',      zh:'白色' },
];

/* ============================================================================
   3. 콤보(디자이너) 명칭
   기본 유전형 이름(카푸치노·루왁·슈퍼세이블 등)은 유전자 정의가 직접 처리하고,
   여기에는 '여러 유전자가 만나야 생기는' 이름만 둡니다.
   ============================================================================ */
const CR_COMBOS = [
  { tokens:['cappuccino','lilly'],
    ko:'프라푸치노', en:'Frappuccino', ja:'フラペチーノ', zh:'法布奇诺', proof:'established' },
  { tokens:['sable','lilly'],
    ko:'릴리 세이블', en:'Lilly Sable', ja:'リリーセーブル', zh:'莉莉黑貂', proof:'established' },
  { tokens:['super_sable','lilly'],
    ko:'슈퍼세이블 릴리', en:'Super Sable Lilly White', ja:'スーパーセーブル リリーホワイト', zh:'超级黑貂莉莉白', proof:'established' },
  { tokens:['luwak','lilly'],
    ko:'루왁 릴리', en:'Luwak Lilly White', ja:'ルアク リリーホワイト', zh:'Luwak 莉莉白', proof:'established' },
  { tokens:['lilly','axanthic'],
    ko:'릴잔틱', en:'Lilyxanthic', ja:'リリーアザンティック', zh:'莉莉无黄化', proof:'partial' },
  { tokens:['super_cappuccino','lilly'],
    ko:'소락', en:'Sorak', ja:'ソラク', zh:'Sorak', proof:'contested', warn:'W3' },
];

/* ============================================================================
   4. 대표색 · 게코 일러스트
   ============================================================================ */
const CR_COLOR = {
  lilly:'#EFE6D8', super_lilly:'#F6F2EA',
  cappuccino:'#8A6A50', super_cappuccino:'#5C4433', sable:'#4A3A2E', super_sable:'#33271F', luwak:'#6E5340',
  phantom:'#8E8478', chocho:'#6B4A3E', axanthic:'#A9AAA4',
  whiteout:'#E8E2D4', super_whiteout:'#F4F1E9', empty_back:'#C9A878', super_empty_back:'#D6BA92',
  dalmatian:'#C7A87A', pied:'#DCCFB4', fire:'#D9A05B', super_fire:'#EDE7DA',
  patternless:'#C08E55', bicolor:'#C9A063', tricolor:'#D2AE72',
  flame:'#C98A3C', harlequin:'#C4762F', exharlequin:'#CE7A24', hypo:'#E0B372', superhypo:'#E8BE79',
  tiger:'#C98F3A', brindle:'#9A7A4A', superdal:'#BFA070',
  pinstripe:'#C89A55', fullpin:'#CFA054', whitepin:'#E4D8C0', superstripe:'#CB9A4F',
  quad:'#C79A5A', drippy:'#C08F63', whitespot:'#DCD2BE',
  solidback:'#B98E56', porthole:'#E0D6C2', whitecrown:'#E6DCC8',
  red:'#A83E2A', orange:'#D2762A', yellow:'#DFB43F', cream:'#E4D2AC', creamsicle:'#E0A469',
  strawberry:'#C2543F', halloween:'#B4581F', buckskin:'#B08E5E', charcoal:'#4E4A44',
  dark:'#6A5F52', black:'#2C2825', white:'#EFECE4',
};

function crProfile(tokens, traits){
  const t=new Set(tokens||[]), p=new Set(traits||[]);
  const has=x=>t.has(x), hasT=x=>p.has(x);
  let base='#C9A063';
  if(hasT('cream'))      base='#E4D2AC';
  if(hasT('buckskin'))   base='#B08E5E';
  if(hasT('yellow'))     base='#DFB43F';
  if(hasT('orange'))     base='#D2762A';
  if(hasT('red'))        base='#A83E2A';
  if(hasT('charcoal'))   base='#4E4A44';
  if(hasT('black'))      base='#2C2825';
  if(hasT('white'))      base='#EFECE4';
  if(has('fire'))        base='#D9A05B';
  if(has('cappuccino'))  base='#8A6A50';
  if(has('luwak'))       base='#6E5340';
  if(has('sable'))       base='#4A3A2E';
  if(has('super_sable')) base='#33271F';
  if(has('super_cappuccino')) base='#5C4433';
  if(has('chocho'))      base='#6B4A3E';
  if(has('axanthic'))    base='#A9AAA4';        // 황색소 결핍 → 은회색
  if(has('lilly'))       base='#E7DCCA';
  if(has('super_fire'))  base='#EDE7DA';
  if(has('super_lilly')) base='#F6F2EA';

  const white  = has('lilly')||has('super_lilly')||has('whiteout')||has('super_whiteout')||has('pied')||hasT('whitepin');
  const spots  = has('dalmatian')||hasT('superdal')||hasT('whitespot')||hasT('drippy');
  const stripe = hasT('pinstripe')||hasT('fullpin')||hasT('quad')||hasT('superstripe')||hasT('whitepin');
  const flame  = hasT('flame')||hasT('harlequin')||hasT('exharlequin')||hasT('tiger')||hasT('bicolor');
  const plain  = hasT('patternless')||has('super_lilly')||has('super_whiteout');
  const eye    = has('axanthic') ? '#4A4C4E' : has('super_fire') ? '#1A1714' : '#3A2E22';
  return { base, white, spots, stripe, flame, plain, eye,
           dense: hasT('superdal')||hasT('exharlequin') };
}

/* 파라메트릭 크레스티드 게코 SVG (위에서 본 모습 · 눈 위 크레스트 강조) */
function crestedSVG(pf, w){
  const b=pf.base, ink='rgba(50,34,18,.42)', pale='rgba(255,252,244,.72)';
  const legs=[[46,17,-30],[46,59,30],[84,19,28],[84,57,-28]]
    .map(a=>'<ellipse cx="'+a[0]+'" cy="'+a[1]+'" rx="10.5" ry="5" fill="'+b+'" transform="rotate('+a[2]+' '+a[0]+' '+a[1]+')"/>').join('');
  let deco='';
  if(!pf.plain){
    if(pf.flame)  deco+='<path d="M34,38 Q56,26 82,31 Q92,38 82,45 Q56,50 34,38 Z" fill="'+pale+'" opacity=".55"/>';
    if(pf.stripe) deco+='<path d="M30,29 Q60,23 92,29" stroke="'+pale+'" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
                      +'<path d="M30,47 Q60,53 92,47" stroke="'+pale+'" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    if(pf.spots){
      const pts=[[48,29],[62,25],[74,32],[54,45],[68,48],[84,40],[42,44],[88,30],[58,36],[78,25]];
      const n=pf.dense?pts.length:6;
      for(let i=0;i<n;i++) deco+='<circle cx="'+pts[i][0]+'" cy="'+pts[i][1]+'" r="2.9" fill="'+ink+'"/>';
    }
  }
  if(pf.white) deco+='<path d="M30,26 Q60,20 94,27" stroke="rgba(255,255,255,.92)" stroke-width="4" fill="none" stroke-linecap="round"/>'
                   +'<path d="M30,50 Q60,56 94,49" stroke="rgba(255,255,255,.92)" stroke-width="4" fill="none" stroke-linecap="round"/>';
  return '<svg class="gecko" viewBox="0 0 140 76" width="'+w+'" height="'+Math.round(w*76/140)+'" aria-hidden="true">'
    +'<path d="M96,31 Q126,29 136,38 Q126,47 96,45 Z" fill="'+b+'"/>'
    +legs
    +'<ellipse cx="64" cy="38" rx="34" ry="17" fill="'+b+'"/>'
    +'<path d="M32,38 L8,27 Q2,38 8,49 Z" fill="'+b+'"/>'
    +'<ellipse cx="28" cy="38" rx="17" ry="14.5" fill="'+b+'"/>'
    +'<path d="M18,27 Q30,20 44,26" stroke="'+b+'" stroke-width="4.5" fill="none" stroke-linecap="round"/>'
    +'<path d="M18,49 Q30,56 44,50" stroke="'+b+'" stroke-width="4.5" fill="none" stroke-linecap="round"/>'
    +'<path d="M19,26.5 Q30,20.5 43,25.5" stroke="rgba(255,255,255,.45)" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
    +'<path d="M19,49.5 Q30,55.5 43,50.5" stroke="rgba(255,255,255,.45)" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
    +deco
    +'<circle cx="19" cy="32" r="3.6" fill="'+pf.eye+'"/><circle cx="19" cy="44" r="3.6" fill="'+pf.eye+'"/>'
    +'<circle cx="18.2" cy="31.2" r="1.1" fill="rgba(255,255,255,.55)"/><circle cx="18.2" cy="43.2" r="1.1" fill="rgba(255,255,255,.55)"/>'
    +'</svg>';
}

/* ============================================================================
   5. 계산 엔진
   ----------------------------------------------------------------------------
   상태 표기
     2대립유전자 : 'nn'(없음) / 'het'(한 개) / 'mm'(두 개)
     CS 로커스   : 'nn' / 'Cn' / 'Sn' / 'CC' / 'SS' / 'CS'
   ============================================================================ */
const CR_STATE = { A:{}, B:{} };
function crResetState(){
  CR_ALL_GENES().forEach(g=>{ CR_STATE.A[g.id]='nn'; CR_STATE.B[g.id]='nn'; });
  CR_TRAITS.forEach(t=>{ CR_STATE.A[t.id]='no'; CR_STATE.B[t.id]='no'; });
}
crResetState();

function crGcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b];}return a||1;}

/* --- 배우자(gamete) 분포 --- */
function crGametes(g, state){
  if(g.kind==='multi'){
    if(state==='nn') return {n:1};
    const a=state[0], b=state[1];
    if(a===b) return {[a]:1};
    return {[a]:0.5, [b]:0.5};
  }
  if(state==='nn')  return {N:1};
  if(state==='het') return {N:0.5, m:0.5};
  return {m:1};
}
/* --- 유전형 키 정규화 (대립유전자 우선순위대로 정렬) --- */
function crGenoKey(g, x, y){
  if(g.kind==='multi'){
    const rank=g.alleles;
    return (rank.indexOf(x)<=rank.indexOf(y)) ? x+y : y+x;
  }
  if(x==='N'&&y==='N') return 'NN';
  if(x==='m'&&y==='m') return 'mm';
  return 'Nm';
}
/* --- 부모 두 상태 → 새끼 유전형 확률 --- */
function crGenoDist(g, sA, sB){
  const A=crGametes(g,sA), B=crGametes(g,sB), out={};
  Object.keys(A).forEach(x=>Object.keys(B).forEach(y=>{
    const k=crGenoKey(g,x,y);
    out[k]=(out[k]||0)+A[x]*B[y];
  }));
  return out;
}

/* --- 유전형 → 표시 정보 --- */
function crGenoInfo(g, key){
  if(g.kind==='multi'){
    const e=g.genos[key] || g.genos.nn;
    return { name: e.name===null ? null : tr(e), token:e.token||null,
             isHet:false, warn:e.warn||null, health:!!e.health, nonViable:false };
  }
  if(key==='NN') return { name:null, token:null, isHet:false, warn:null, nonViable:false };
  if(g.type==='rec'){
    if(key==='Nm') return { name:gHet(g), token:null, isHet:true, hetOf:gName(g), warn:null, nonViable:false };
    return { name:gName(g), token:g.id, isHet:false, warn:null, nonViable:false };
  }
  if(g.type==='incdom'){
    if(key==='Nm') return { name:gName(g), token:g.id, isHet:false, warn:null, nonViable:false };
    return { name:gSuper(g), token:'super_'+g.id, isHet:false,
             warn:g.warnOnSuper||null, nonViable:!!g.superNonViable };
  }
  /* dom — 겉모습은 1카피와 2카피가 같지만, 유전형 기준 표에서는 구분해서 보여줍니다
     (달마시안처럼 '슈퍼'라는 이름을 붙이면 안 되는 형질이라 카피 수로만 표기) */
  return { name: gName(g)+' ('+(key==='mm'? crT().copy2 : crT().copy1)+')',
           token:g.id, isHet:false, warn:null, nonViable:false };
}

/* --- 표현형(비주얼) 버킷 : 눈에 보이는 것만 행으로, 헷은 보인자 정보로 --- */
function crVisualBuckets(g, sA, sB){
  const d=crGenoDist(g,sA,sB), out=[];
  if(g.kind==='multi' || g.type!=='rec'){
    Object.keys(d).forEach(k=>{
      if(d[k]<=0) return;
      const i=crGenoInfo(g,k);
      out.push({ prob:d[k], name:i.name, token:i.token, het:null,
                 warn:i.warn, nonViable:i.nonViable, health:i.health });
    });
    /* 우성은 1카피와 2카피의 겉모습이 같으므로 표현형 기준에서는 하나로 합칩니다 */
    if(g.type==='dom'){
      const vis=out.filter(o=>o.name), non=out.filter(o=>!o.name);
      if(vis.length){
        const p=vis.reduce((s,o)=>s+o.prob,0);
        return non.concat([{ prob:p, name:gName(g), token:g.id, het:null, warn:null, nonViable:false }]);
      }
    }
    return out;
  }
  /* 열성 */
  const mm=d.mm||0, NN=d.NN||0, Nm=d.Nm||0, nv=NN+Nm;
  if(mm>0) out.push({ prob:mm, name:gName(g), token:g.id, het:null, warn:null, nonViable:false });
  if(nv>0) out.push({ prob:nv, name:null, token:null, warn:null, nonViable:false,
                      het: Nm>0 ? { name:gName(g), p:Nm/nv } : null });
  return out;
}
/* --- 유전형 버킷 : 헷도 별개의 결과 행으로 (엑셀 참조표와 같은 방식) --- */
function crGenoBuckets(g, sA, sB){
  const d=crGenoDist(g,sA,sB), out=[];
  Object.keys(d).forEach(k=>{
    if(d[k]<=0) return;
    const i=crGenoInfo(g,k);
    out.push({ prob:d[k], name:i.name, token:i.token, het:null,
               warn:i.warn, nonViable:i.nonViable, health:i.health });
  });
  return out;
}

/* --- 콤보 매칭 --- */
function crMatchCombo(tokenSet){
  for(const c of CR_COMBOS){
    if(c.tokens.length!==tokenSet.size) continue;
    if(c.tokens.every(t=>tokenSet.has(t))) return c;
  }
  return null;
}
/* --- 부모의 현재 선택 → 비주얼 토큰 집합 --- */
function crParentTokens(side){
  const s=new Set();
  CR_ALL_GENES().forEach(g=>{
    const v=CR_STATE[side][g.id];
    if(!v || v==='nn') return;
    if(g.kind==='multi'){ const e=g.genos[v]; if(e&&e.token) s.add(e.token); return; }
    if(g.type==='rec'){ if(v==='mm') s.add(g.id); }
    else if(g.type==='incdom'){ if(v==='het') s.add(g.id); else if(v==='mm') s.add('super_'+g.id); }
    else { s.add(g.id); }
  });
  return s;
}

/* --- 모프 이름 조립 --- */
function crJoin(parts){
  if(!parts.length) return null;
  return parts.join(LANG==='en' ? ' · ' : '·');
}

/* --- 메인 계산 --------------------------------------------------------------
   genes : 계산에 포함할 유전자 배열
   mode  : 'visual' 표현형 기준 / 'geno' 유전형 기준
   반환  : { prob, parts, tokens, hets, warns, nonViable, health }[]         */
function crCross(genes, mode){
  let rows=[{ prob:1, parts:[], tokens:new Set(), hets:[], warns:new Set(), nonViable:false, health:false }];
  genes.forEach(g=>{
    const list = (mode==='geno')
      ? crGenoBuckets(g, CR_STATE.A[g.id], CR_STATE.B[g.id])
      : crVisualBuckets(g, CR_STATE.A[g.id], CR_STATE.B[g.id]);
    const next=[];
    rows.forEach(r=>list.forEach(b=>{
      if(b.prob<=0) return;
      const tokens=new Set(r.tokens); if(b.token) tokens.add(b.token);
      const warns=new Set(r.warns);   if(b.warn) warns.add(b.warn);
      next.push({
        prob:r.prob*b.prob,
        parts: b.name ? r.parts.concat([b.name]) : r.parts,
        tokens, warns,
        hets: b.het ? r.hets.concat([b.het]) : r.hets,
        nonViable: r.nonViable || !!b.nonViable,
        health: r.health || !!b.health,
      });
    }));
    rows=next;
  });
  return rows.filter(r=>r.prob>1e-12).sort((a,b)=>b.prob-a.prob);
}

/* 분수 표기 (1/4, 3/16 …) */
function crFrac(prob){
  let best={n:0,d:1,err:1};
  for(let d=1; d<=4096; d++){
    const n=Math.round(prob*d), err=Math.abs(prob-n/d);
    if(err<best.err-1e-12){ best={n,d,err}; }
    if(err<1e-12) break;
  }
  const g=crGcd(best.n,best.d);
  return (best.n/g)+'/'+(best.d/g);
}

/* ============================================================================
   6. 주의가 필요한 조합 (리서치 반영)
   ============================================================================ */
const CR_DANGER = {
  W1:{ level:'high',
    ko:'🛑 <b>릴리화이트 × 릴리화이트</b> — 자손의 약 25%가 슈퍼릴리화이트(동형)입니다. 슈퍼릴리화이트는 알에서 부화하지 못하거나, 부화하더라도 호흡 곤란·운동 능력 저하·거식을 보이며 보통 며칠에서 일주일 내에 폐사한다고 보고됩니다. 장기 생존이 확인된 개체는 없습니다. 이 조합은 권장되지 않습니다.',
    en:'🛑 <b>Lilly White × Lilly White</b> — about 25% of offspring are Super Lilly White (homozygous). Super Lilly Whites either fail to hatch or, if they do, struggle to breathe, have poor motor control, refuse food, and typically die within a few days to a week. No confirmed long-lived Super Lilly White exists. This pairing is not recommended.',
    ja:'🛑 <b>リリーホワイト × リリーホワイト</b> — 約25%がスーパーリリーホワイト（ホモ）になります。スーパーリリーホワイトは孵化に至らないか、孵化しても呼吸困難・運動機能の低下・拒食を示し、通常は数日から一週間ほどで死亡すると報告されています。長期生存が確認された個体は存在しません。この組み合わせは推奨されません。',
    zh:'🛑 <b>莉莉白 × 莉莉白</b> — 约25%的后代为超级莉莉白（纯合）。超级莉莉白通常无法孵化，即使孵出也会出现呼吸困难、运动能力差、拒食等情况，一般在数天至一周内死亡。目前没有长期存活的记录。不建议进行此配对。' },

  W2:{ level:'high',
    ko:'⚠️ 이 조합은 <b>슈퍼카푸치노</b>를 낼 수 있습니다. 약 100마리 표본 조사에서 슈퍼카푸치노·소락 개체의 약 11%가 콧구멍 이상(일부는 구조적 결손이 아니라 탈피 잔여물), 3% 미만이 스펙타클 아이를 보였다는 보고가 있습니다. 슈퍼 개체는 크레스트 감소·긴 꼬리·무른 비늘도 함께 나타나는 편입니다. 진행하실 경우 근친 교배를 피하고 20.5~21.7℃(69~71℉)의 저온 인큐베이팅과 구조 개선을 위한 아웃크로스를 권장합니다.',
    en:'⚠️ This pairing can produce <b>Super Cappuccino</b>. In a survey of roughly 100 animals, about 11% of Super Cappuccino / Sorak individuals showed nostril abnormalities (some of which were stuck shed rather than structural occlusion) and under 3% showed spectacle eye. Supers also tend to show reduced crest, a longer tail and soft scale. If you proceed: avoid inbreeding, incubate cooler (69–71°F / 20.5–21.7°C), and outcross for structure.',
    ja:'⚠️ この組み合わせは<b>スーパーカプチーノ</b>を出す可能性があります。約100個体の調査では、スーパーカプチーノおよびソラクの約11%に鼻孔の異常（一部は構造的欠損ではなく脱皮不全の残留）、3%未満にスペクタクルアイが見られたと報告されています。スーパー個体はクレストの減少・尾の伸長・柔らかい鱗も伴う傾向があります。実施される場合は近親交配を避け、20.5〜21.7℃（69〜71℉）の低温インキュベートと、構造改善のためのアウトクロスを推奨します。',
    zh:'⚠️ 此配对可能产出<b>超级卡布奇诺</b>。在约100只个体的调查中，超级卡布奇诺及 Sorak 个体中约11%出现鼻孔异常（部分为蜕皮残留而非结构性闭塞），不足3%出现眼罩积液。超级个体还常伴有背嵴减少、尾部偏长、鳞片柔软等特征。若仍要进行：请避免近亲繁殖，采用较低温度孵化（20.5~21.7℃／69~71℉），并通过外血改善体型结构。' },

  W3:{ level:'high',
    ko:'⚠️ <b>소락(슈퍼카푸치노 릴리)</b>은 슈퍼카푸치노의 콧구멍·안구 위험을 그대로 물려받습니다. 또한 ‘소락’은 브리더 사이의 통용어일 뿐 기초 유전 자료에 정리된 공식 명칭이 아닙니다. 윤리적 이유로 이 조합의 생산을 피하는 브리더가 많습니다.',
    en:'⚠️ <b>Sorak (Super Cappuccino Lilly White)</b> inherits the full nostril and eye risk profile of Super Cappuccino. "Sorak" is also breeder slang rather than a name settled in the foundation-genetics documentation. Many breeders decline to produce this combination on ethical grounds.',
    ja:'⚠️ <b>ソラク（スーパーカプチーノ・リリーホワイト）</b>は、スーパーカプチーノの鼻孔および眼のリスクをそのまま受け継ぎます。また「ソラク」はブリーダー間の通称であり、基礎遺伝資料に整理された正式名ではありません。倫理的理由からこの組み合わせを避けるブリーダーも多くいます。',
    zh:'⚠️ <b>Sorak（超级卡布奇诺莉莉白）</b>会完整继承超级卡布奇诺的鼻孔与眼部风险。此外，"Sorak" 只是繁育者之间的俗称，并未被基础遗传学资料正式收录。许多繁育者出于伦理考虑拒绝产出此组合。' },

  W4:{ level:'med',
    ko:'ℹ️ <b>초초·아잔틱</b>은 열성이며 창시 개체군이 매우 작습니다. 비주얼 개체를 얻으려고 반복 근친 교배를 하면 번식력 저하 등 근친 약세가 나타날 수 있습니다. 유전자 자체의 결함으로 확인된 것은 아니지만 계통 관리를 권장합니다. 또한 아잔틱은 여러 계통(AE·MSL·Obscurial)이 있고 계통 간 교배가 검증되지 않았습니다 — 이 계산은 하나의 유전자로 가정합니다.',
    en:'ℹ️ <b>ChoCho and Axanthic</b> are recessive traits with very small founder populations. Repeated inbreeding to obtain visuals can cause inbreeding depression, including reduced fertility. This is not a confirmed defect of either gene, but careful line management is recommended. Axanthic also exists as several lines (AE / MSL / Obscurial) whose cross-compatibility is unproven — this calculation assumes a single locus.',
    ja:'ℹ️ <b>チョチョ・アザンティック</b>は劣性遺伝で、創始個体群が非常に小さい系統です。ビジュアル個体を得るための反復的な近親交配は、繁殖力の低下を含む近交弱勢を招く可能性があります。遺伝子自体の欠陥として確認されたものではありませんが、系統管理をお勧めします。またアザンティックは複数系統（AE・MSL・Obscurial）が存在し、系統間交配は未検証です — 本計算は単一遺伝子と仮定しています。',
    zh:'ℹ️ <b>ChoCho 与无黄化</b>均为隐性基因，且奠基种群非常小。为获得显性个体而反复近亲繁殖，可能导致近交衰退（包括繁殖力下降）。这并非已确认的基因缺陷，但仍建议做好血统管理。此外无黄化存在多个品系（AE／MSL／Obscurial），品系间的兼容性尚未验证 — 本计算假设其为同一基因座。' },

  W5:{ level:'med',
    ko:'ℹ️ <b>슈퍼파이어(블랙아이 루시스틱)</b>는 표본 수가 매우 적고 독립적인 재현 사례가 없습니다. 릴리화이트의 슈퍼 개체가 생존하지 못한 전례를 고려하면, 이 조합을 목표로 삼기 전에 생존성에 대한 확인이 필요합니다.',
    en:'ℹ️ <b>Super Fire (Black-Eyed Leucistic)</b> rests on a very small sample with no independent replication. Given the Lilly White precedent, its viability deserves independent confirmation before breeding toward it.',
    ja:'ℹ️ <b>スーパーファイア（ブラックアイリューシスティック）</b>は標本数が極めて少なく、独立した再現例がありません。リリーホワイトのスーパー個体が生存できなかった前例を踏まえると、この組み合わせを目指す前に生存性の確認が必要です。',
    zh:'ℹ️ <b>超级 Fire（黑眼白化）</b>目前样本极少，且没有独立复现记录。考虑到莉莉白超级个体无法存活的先例，在朝该方向繁育之前应先确认其存活能力。' },

  W6:{ level:'med',
    ko:'ℹ️ 이 결과에는 <b>유전 방식이 완전히 확립되지 않은 형질</b>이 포함되어 있습니다. 확률은 참고용 근사치이며, 실제 표현형은 다른 형질의 영향과 성장에 따른 색 변화로 달라질 수 있습니다.',
    en:'ℹ️ This result includes <b>a trait whose inheritance is not fully established</b>. The probabilities are an approximation for reference only, and the actual phenotype can be altered by other traits and by colour change as the animal grows.',
    ja:'ℹ️ この結果には<b>遺伝様式が完全には確立されていない形質</b>が含まれています。確率はあくまで参考値であり、実際の表現型は他の形質の影響や成長に伴う色変化によって変わる可能性があります。',
    zh:'ℹ️ 此结果包含<b>遗传方式尚未完全确立的性状</b>。所示概率仅供参考，实际表型可能受其他性状影响以及生长过程中的体色变化而改变。' },
};

/* 결과 전체에서 발생한 경고 코드 수집 */
function crCollectWarnings(genes, rows){
  const codes=new Set();
  (rows||[]).forEach(r=>r.warns.forEach(w=>codes.add(w)));
  /* 릴리 × 릴리 : 슈퍼가 나올 수 있으면 W1 */
  const lil=genes.find(g=>g.id==='lilly');
  if(lil){ const d=crGenoDist(lil, CR_STATE.A.lilly, CR_STATE.B.lilly); if(d.mm>0) codes.add('W1'); }
  /* 열성 계통 근친 노출 : 초초·아잔틱 비주얼이 나올 수 있으면 W4 */
  ['chocho','axanthic'].forEach(id=>{
    const g=genes.find(x=>x.id===id); if(!g) return;
    const d=crGenoDist(g, CR_STATE.A[id], CR_STATE.B[id]);
    if((d.mm||0)>0) codes.add('W4');
  });
  /* 미확정 형질이 계산에 포함되면 W6 */
  if(genes.some(g=>g.proof==='contested')) codes.add('W6');
  const order=['W1','W2','W3','W5','W4','W6'];
  return order.filter(c=>codes.has(c)).map(c=>({ code:c, level:CR_DANGER[c].level, text:tr(CR_DANGER[c]) }));
}
