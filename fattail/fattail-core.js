/* =============================================================================
   펫테일(아프리카 팻테일) 게코 모프 계산기 · 공용 코어  (fattail/index.html 전용)
   -----------------------------------------------------------------------------
   ※ gecko-core.js(레오파드) · crested-core.js(크레스티드) 와 완전히 별개 파일입니다.
     계산 엔진의 뼈대는 crested-core.js 와 같습니다. 화면이 같아 보이도록 일부러
     같은 구조를 유지했습니다. 엔진을 고칠 일이 생기면 두 파일을 함께 보세요.

   [ 계산 모델 ]
   ▸ 화이트아웃(White Out) 은 불완전우성입니다. 두 개면 슈퍼 화이트아웃이 되는데
     지금까지 보고된 슈퍼 개체는 알에서 죽거나 부화 후 수 시간~며칠 안에 폐사했습니다.
     그래서 부모로는 고를 수 없고(superNonViable), 새끼 결과에만 '비생존'으로 나옵니다.
     (크레스티드의 슈퍼릴리화이트와 같은 처리입니다)

   ▸ 스팅어(Stinger) · 제로(Zero) · 패턴리스(Patternless) 는 서로 다른 유전자가
     아니라 <b>같은 자리(로커스)</b> 의 대립유전자로 봅니다.
       - 스팅어 = 그 대립유전자 1개 (한 개만 있어도 보입니다)
       - 슈퍼 스팅어 = 2개 (동형) · 패턴리스 대립유전자와의 조합(컴파운드)도 같은 모습
       - 패턴리스 = 패턴리스 대립유전자 2개 (1개만 있으면 겉으로는 노멀 = 헷)
     '제로' 는 별개 유전자가 아니라 <b>스팅어 + 스트라이프</b> 의 이름입니다.
     같은 이유로 '슈퍼 제로' = 슈퍼 스팅어 + 스트라이프 입니다. (콤보 이름으로 처리)

   ▸ 이 종의 유전 정보는 레오파드만큼 정리되어 있지 않습니다. 확립되지 않은 형질에는
     proof:'partial' / 'contested' 를 달아 화면에 표시합니다.
   ============================================================================= */

/* 서비스 식별자 — 접속/조합 로그에 이 값이 붙어야 관리자에서 도구별로
   나눠 볼 수 있습니다. 레오파드는 'gecko', 크레스티드는 'crested'. (docs/STUDIO.md) */
const SERVICE_ID = 'fattail';

var LANG = (typeof LANG !== 'undefined') ? LANG : 'ko';

/* ---- 공용 헬퍼 ---- */
function escapeHtml(s){return String(s).replace(/[&<>"]/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x];});}
function tr(o){ return (o && (o[LANG] || o.en)) || ''; }
function gName(g){ return tr(g); }
function gSuper(g){ return g['super'+LANG.charAt(0).toUpperCase()+LANG.slice(1)] || g.superEn || ''; }
function gHet(g){ return g['het'+LANG.charAt(0).toUpperCase()+LANG.slice(1)] || g.hetEn || ''; }
function tName(t){ return tr(t); }
/* 코어에서 쓰는 최소 문구 (화면 문구 전체는 fattail-ui.js 의 I18N 에 있습니다) */
const FT_T = {
  ko:{ copy1:'1카피', copy2:'2카피' }, en:{ copy1:'1 copy', copy2:'2 copies' },
  ja:{ copy1:'1コピー', copy2:'2コピー' }, zh:{ copy1:'1个拷贝', copy2:'2个拷贝' },
};
function ftT(){ return FT_T[LANG] || FT_T.ko; }

const FT_CONTACT_MAIL = 'kmc612000@gmail.com';

/* ============================================================================
   1. 유전자 정의
   ----------------------------------------------------------------------------
   kind  : 'bi'  = 2대립유전자 (N/m)  ·  'multi' = 다대립유전자 한 자리
   type  : 'incdom' 불완전우성 / 'rec' 열성 / 'dom' 우성
   core  : true  = 항상 표시 · false = [추가 유전자] 토글을 켜야 표시
   proof : 'established' 확립 / 'partial' 부분 검증 / 'contested' 미확정
   ============================================================================ */

/* --- 1-1. 화이트아웃 (불완전우성 · 슈퍼폼 비생존) --- */
const FT_G_WHITEOUT = {
  id:'whiteout', kind:'bi', type:'incdom', core:true, proof:'established', order:1,
  ko:'화이트아웃', en:'White Out', ja:'ホワイトアウト', zh:'White Out',
  superKo:'슈퍼 화이트아웃', superEn:'Super White Out', superJa:'スーパーホワイトアウト', superZh:'超级 White Out',
  superNonViable:true,
  warnOnSuper:'W1',
  note:{ ko:'<b>슈퍼 화이트아웃은 부모로 고를 수 없습니다.</b> 보고된 슈퍼 개체는 알 속에서 죽거나 부화 후 몇 시간~며칠 안에 폐사했습니다. 화이트아웃끼리 교배하면 새끼 결과에 <b>비생존</b>으로 표시됩니다.',
         en:'<b>Super White Out cannot be selected as a parent.</b> Reported supers either die in the egg or within hours to a few days of hatching. Pairing two White Outs shows the super in the offspring results marked <b>non-viable</b>.',
         ja:'<b>スーパーホワイトアウトは親として選べません。</b>報告されているスーパー個体は卵内で死亡するか、孵化後数時間〜数日で死亡しています。ホワイトアウト同士を交配すると、仔の結果に<b>生存困難</b>として表示されます。',
         zh:'<b>超级 White Out 无法作为亲本选择。</b>已报告的超级个体多在蛋内死亡，或在孵化后数小时至数天内死亡。White Out 之间配对时，它会出现在后代结果中并标注为<b>不存活</b>。' },
};

/* --- 1-2. 패턴리스 / 스팅어 : 같은 자리(3대립유전자) ---
   p = 패턴리스 대립유전자(단독으로는 안 보임) · s = 스팅어 대립유전자(1개도 보임) · n = 야생형
   pn 처럼 '겉으로 안 보이는 보인자' 는 hetOf 로 표시합니다.                         */
const FT_G_PAT = {
  id:'pat', kind:'multi', core:true, proof:'partial', order:2, type:'incdom',
  ko:'패턴리스 · 스팅어', en:'Patternless · Stinger', ja:'パターンレス・スティンガー', zh:'无纹・Stinger',
  /* 유전형 키 정렬 순서 — genos 의 키 표기(pp·ps·pn·ss·sn·nn)와 반드시 일치해야 합니다 */
  alleles:['p','s','n'],
  note:{ ko:'패턴리스와 스팅어는 <b>같은 자리</b>의 다른 대립유전자로 봅니다. 스팅어는 한 개만 있어도 보이고, 두 개(또는 패턴리스와 한 개씩)면 <b>슈퍼 스팅어</b>가 됩니다. 패턴리스는 두 개가 모여야 보입니다. <b>제로</b>는 별개 유전자가 아니라 스팅어에 스트라이프가 얹힌 이름입니다.',
         en:'Patternless and Stinger are treated as different alleles at the <b>same locus</b>. One Stinger allele is already visible; two (or one Stinger plus one Patternless) give a <b>Super Stinger</b>. Patternless needs two copies to show. <b>Zero</b> is not a separate gene — it is a Stinger that also carries Stripe.',
         ja:'パターンレスとスティンガーは<b>同じ座</b>の別の対立遺伝子として扱います。スティンガーは1つでも発現し、2つ（またはパターンレスと1つずつ）で<b>スーパースティンガー</b>になります。パターンレスは2つ揃って初めて発現します。<b>ゼロ</b>は別の遺伝子ではなく、スティンガーにストライプが乗った呼び名です。',
         zh:'无纹与 Stinger 视为<b>同一基因座</b>上的不同等位基因。Stinger 单拷贝即表现，两个拷贝（或与无纹各一个）即为<b>超级 Stinger</b>。无纹需两个拷贝才表现。<b>Zero</b> 并非独立基因，而是带有条纹基因的 Stinger。' },
  genos:{
    nn:{ name:null, token:null },
    sn:{ token:'stinger',       ko:'스팅어',           en:'Stinger',            ja:'スティンガー',              zh:'Stinger' },
    ss:{ token:'super_stinger', ko:'슈퍼 스팅어',      en:'Super Stinger',      ja:'スーパースティンガー',      zh:'超级 Stinger' },
    ps:{ token:'super_stinger', ko:'슈퍼 스팅어 (패턴리스 조합)', en:'Super Stinger (Patternless compound)',
         ja:'スーパースティンガー（パターンレス複合）', zh:'超级 Stinger（无纹复合）' },
    pp:{ token:'patternless',   ko:'패턴리스',         en:'Patternless',        ja:'パターンレス',              zh:'无纹' },
    /* 겉으로는 노멀 — 패턴리스 보인자 */
    pn:{ hetOf:'patternless',   ko:'헷 패턴리스',      en:'het Patternless',    ja:'ヘテロパターンレス',        zh:'携带无纹' },
  },
};

/* --- 1-3. 열성 --- */
const FT_G_AMEL = {
  id:'amel', kind:'bi', type:'rec', core:true, proof:'established', order:3,
  ko:'아멜라니스틱 (알비노)', en:'Amelanistic (Albino)', ja:'アメラニスティック（アルビノ）', zh:'白化（Amel）',
  hetKo:'헷 아멜', hetEn:'het Amel', hetJa:'ヘテロアメラ', hetZh:'携带白化',
};
const FT_G_OREO = {
  id:'oreo', kind:'bi', type:'rec', core:true, proof:'established', order:4,
  ko:'오레오', en:'Oreo', ja:'オレオ', zh:'Oreo',
  hetKo:'헷 오레오', hetEn:'het Oreo', hetJa:'ヘテロオレオ', hetZh:'携带 Oreo',
};
const FT_G_CARAMEL = {
  id:'caramel', kind:'bi', type:'rec', core:true, proof:'partial', order:5,
  ko:'캬라멜 알비노', en:'Caramel Albino', ja:'キャラメルアルビノ', zh:'焦糖白化',
  hetKo:'헷 캬라멜', hetEn:'het Caramel', hetJa:'ヘテロキャラメル', hetZh:'携带焦糖',
  note:{ ko:'캬라멜 알비노는 아멜라니스틱과 <b>다른 자리</b>의 열성으로 계산합니다. 두 알비노 계통이 같은 자리인지(교배 시 비주얼이 나오는지)는 아직 정리된 자료가 없습니다.',
         en:'Caramel Albino is calculated as a recessive at a <b>different locus</b> from Amelanistic. Whether the two albino lines are compatible (i.e. share a locus) is not settled.',
         ja:'キャラメルアルビノはアメラニスティックとは<b>別の座</b>の劣性として計算します。2つのアルビノ系統が同座かどうか（交配で発現するか）は未整理です。',
         zh:'焦糖白化按与 Amel <b>不同基因座</b>的隐性计算。两条白化品系是否兼容（同座）尚无定论。' },
};
const FT_G_GHOST = {
  id:'ghost', kind:'bi', type:'rec', core:true, proof:'partial', order:6,
  ko:'고스트', en:'Ghost', ja:'ゴースト', zh:'Ghost',
  hetKo:'헷 고스트', hetEn:'het Ghost', hetJa:'ヘテロゴースト', hetZh:'携带 Ghost',
};
const FT_G_ZULU = {
  id:'zulu', kind:'bi', type:'rec', core:true, proof:'partial', order:7,
  ko:'줄루', en:'Zulu', ja:'ズールー', zh:'Zulu',
  hetKo:'헷 줄루', hetEn:'het Zulu', hetJa:'ヘテロズールー', hetZh:'携带 Zulu',
};

/* --- 1-4. 우성 --- */
const FT_G_STRIPE = {
  id:'stripe', kind:'bi', type:'dom', core:true, proof:'established', order:8, noSuper:true,
  ko:'스트라이프', en:'Stripe', ja:'ストライプ', zh:'条纹',
  note:{ ko:'우성이라 한 개만 있어도 등줄이 나옵니다. 두 개(동형)여도 <b>겉모습은 같아서</b> 구별할 수 없습니다 — 표현형 기준에서는 하나로 묶고, 유전형 기준에서만 1카피·2카피로 나눕니다.',
         en:'Dominant — a single copy already shows the stripe, and two copies look <b>the same</b>. Phenotype view merges them; genotype view splits 1 copy / 2 copies.',
         ja:'優性のため1つでもストライプが出ます。2つ（ホモ）でも<b>見た目は同じ</b>で区別できません — 表現型では1つにまとめ、遺伝型でのみ1コピー・2コピーに分けます。',
         zh:'显性 — 单拷贝即显条纹，纯合<b>外观相同</b>无法区分。表现型视图合并，基因型视图区分 1 拷贝／2 拷贝。' },
};

/* --- 1-5. 추가 유전자 (기본 꺼짐) --- */
const FT_G_EXTRA = [
  { id:'whitesocks', kind:'bi', type:'rec', core:false, proof:'contested', order:9,
    ko:'화이트삭스', en:'White Socks', ja:'ホワイトソックス', zh:'White Socks',
    hetKo:'헷 화이트삭스', hetEn:'het White Socks', hetJa:'ヘテロホワイトソックス', hetZh:'携带 White Socks' },
];

/* 사용할 유전자 전체 목록 (표기 순서 = order) */
function FT_ALL_GENES(){
  return [FT_G_WHITEOUT, FT_G_PAT, FT_G_AMEL, FT_G_OREO, FT_G_CARAMEL, FT_G_GHOST, FT_G_ZULU, FT_G_STRIPE]
    .concat(FT_G_EXTRA).sort((a,b)=>a.order-b.order);
}

/* 부모로 고를 수 있는 유전형인지 — 슈퍼폼이 치사인 형질은 부모가 될 수 없습니다 */
function ftSelectableAsParent(g, state){
  if(state==='mm' && g.kind!=='multi' && g.type==='incdom' && g.superNonViable) return false;
  return true;
}

/* ---- 계열(패밀리) 설명 ---- */
const FT_FAMILIES = [
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
   ============================================================================ */
const FT_TRAIT_GROUPS = [
  { id:'base',    ko:'베이스 패턴',   en:'Base pattern',     ja:'ベースパターン', zh:'基础花纹' },
  { id:'pattern', ko:'패턴',          en:'Pattern',          ja:'パターン',       zh:'花纹' },
  { id:'color',   ko:'베이스 컬러',   en:'Base color',       ja:'ベースカラー',   zh:'底色' },
];

const FT_TRAITS = [
  /* --- 베이스 패턴 --- */
  { id:'banded',    grp:'base', ko:'밴디드 (와일드타입)', en:'Banded (wild type)', ja:'バンデッド（ワイルド）', zh:'条带（野生型）' },
  { id:'aberrant',  grp:'base', ko:'애버런트',            en:'Aberrant',           ja:'アベラント',             zh:'异常纹' },
  { id:'jungle',    grp:'base', ko:'정글',                en:'Jungle',             ja:'ジャングル',             zh:'丛林纹' },

  /* --- 패턴 --- */
  { id:'granite',   grp:'pattern', ko:'그래나이트',  en:'Granite',   ja:'グラナイト',    zh:'花岗岩纹' },
  { id:'calico',    grp:'pattern', ko:'칼리코',      en:'Calico',    ja:'キャリコ',      zh:'三花' },
  { id:'starburst', grp:'pattern', ko:'스타버스트',  en:'Starburst', ja:'スターバースト', zh:'星爆' },

  /* --- 베이스 컬러 --- */
  { id:'tangerine', grp:'color', ko:'탠저린',   en:'Tangerine', ja:'タンジェリン', zh:'橘色' },
  { id:'sunglow',   grp:'color', ko:'선글로우', en:'Sunglow',   ja:'サングロー',   zh:'Sunglow' },
];

/* ============================================================================
   3. 콤보(디자이너) 명칭
   기본 유전형 이름(스팅어·패턴리스 등)은 유전자 정의가 직접 처리하고,
   여기에는 '여러 유전자가 만나야 생기는' 이름만 둡니다.
   ============================================================================ */
const FT_COMBOS = [
  { tokens:['stinger','stripe'],
    ko:'제로', en:'Zero', ja:'ゼロ', zh:'Zero', proof:'established' },
  { tokens:['super_stinger','stripe'],
    ko:'슈퍼 제로', en:'Super Zero', ja:'スーパーゼロ', zh:'超级 Zero', proof:'established' },
  /* 패턴리스는 밴딩 자체가 없어서 스트라이프가 얹혀도 겉으로는 그냥 패턴리스입니다 */
  { tokens:['patternless','stripe'],
    ko:'패턴리스', en:'Patternless', ja:'パターンレス', zh:'无纹', proof:'partial' },
  { tokens:['amel','oreo'],
    ko:'스노우', en:'Snow', ja:'スノー', zh:'雪花', proof:'established' },
  { tokens:['caramel','oreo'],
    ko:'캬라멜 스노우', en:'Caramel Snow', ja:'キャラメルスノー', zh:'焦糖雪花', proof:'partial' },
  { tokens:['ghost','oreo','patternless'],
    ko:'퍼플 헤이즈', en:'Purple Haze', ja:'パープルヘイズ', zh:'Purple Haze', proof:'partial' },
];

/* ============================================================================
   4. 대표색 · 게코 일러스트
   ============================================================================ */
const FT_COLOR = {
  whiteout:'#EDE7DB', super_whiteout:'#F7F4EE',
  stinger:'#7A5A3C', super_stinger:'#5B4028', patternless:'#C0906A',
  amel:'#E7B47A', caramel:'#C98B52', oreo:'#8E8A84', ghost:'#C2AE95', zulu:'#8A6A45',
  stripe:'#E3D6B8', whitesocks:'#EFE8DA',
  /* 라인브리딩 형질 */
  banded:'#A97C4E', aberrant:'#B98A57', jungle:'#9E7040',
  granite:'#8C7A63', calico:'#C79A6B', starburst:'#D08A3E',
  tangerine:'#D2762A', sunglow:'#E79A4A',
};

function ftProfile(tokens, traits){
  const t=new Set(tokens||[]), p=new Set(traits||[]);
  const has=x=>t.has(x), hasT=x=>p.has(x);
  let base='#A97C4E';                                  // 야생형 갈색
  if(hasT('tangerine')) base='#C97B32';
  if(hasT('sunglow'))   base='#E79A4A';
  if(hasT('granite'))   base='#8C7A63';
  if(has('zulu'))       base='#8A6A45';
  if(has('ghost'))      base='#C2AE95';
  if(has('caramel'))    base='#C98B52';
  if(has('amel'))       base='#E7B47A';
  if(has('oreo'))       base='#8E8A84';                // 황·적색소 감소 → 회갈색
  if(has('amel') && has('oreo')) base='#EFE2CE';       // 스노우
  if(has('whiteout'))       base='#E4D9C6';
  if(has('super_whiteout')) base='#F7F4EE';

  /* 밴딩(가로 띠)이 보이는지 — 패턴리스·슈퍼 스팅어 계열은 띠가 이어지거나 사라집니다 */
  const plain   = has('patternless') || has('super_whiteout');
  const merged  = has('super_stinger');                // 등의 띠가 이어져 통짜로 보임
  const stripe  = has('stripe') && !plain;
  const pale    = has('amel') || has('caramel') || has('whiteout') || has('super_whiteout') || has('ghost');
  const socks   = has('whitesocks');
  const eye     = has('amel') ? '#B4483C' : has('caramel') ? '#9A5A3A' : has('oreo') ? '#2E2C2A' : '#3A2E22';
  return { base, plain, merged, stripe, pale, socks, eye,
           speck: hasT('granite')||hasT('calico')||hasT('starburst') };
}

/* 파라메트릭 펫테일 게코 SVG (위에서 본 모습 · 통통한 꼬리 강조) */
function fattailSVG(pf, w){
  const b=pf.base, ink='rgba(48,32,18,.46)', pale='rgba(255,252,244,.78)';
  const bandInk = pf.pale ? 'rgba(150,110,70,.42)' : ink;
  const legs=[[50,17,-30],[50,59,30],[86,19,28],[86,57,-28]]
    .map(a=>'<ellipse cx="'+a[0]+'" cy="'+a[1]+'" rx="10"'+' ry="4.8" fill="'+(pf.socks?'#F1EADC':b)+'" transform="rotate('+a[2]+' '+a[0]+' '+a[1]+')"/>').join('');
  let deco='';
  if(!pf.plain){
    if(pf.merged){
      /* 슈퍼 스팅어 : 등의 띠가 하나로 이어진 굵은 무늬 */
      deco+='<path d="M40,28 Q68,23 96,29 Q98,38 96,47 Q68,53 40,48 Q37,38 40,28 Z" fill="'+bandInk+'" opacity=".55"/>';
    }else{
      /* 밴디드 : 등을 가로지르는 띠 3줄 */
      [46,64,82].forEach(function(x){
        deco+='<path d="M'+x+',23 Q'+(x+5)+',38 '+x+',53 L'+(x+9)+',53 Q'+(x+14)+',38 '+(x+9)+',23 Z" fill="'+bandInk+'" opacity=".5"/>';
      });
    }
    if(pf.speck){
      const pts=[[52,30],[66,26],[78,33],[58,46],[72,49],[88,41],[46,44],[92,31]];
      for(let i=0;i<pts.length;i++) deco+='<circle cx="'+pts[i][0]+'" cy="'+pts[i][1]+'" r="2.4" fill="'+ink+'" opacity=".6"/>';
    }
  }
  if(pf.stripe) deco+='<path d="M26,38 Q70,34 122,38" stroke="'+pale+'" stroke-width="5" fill="none" stroke-linecap="round"/>';
  return '<svg class="gecko" viewBox="0 0 140 76" width="'+w+'" height="'+Math.round(w*76/140)+'" aria-hidden="true">'
    /* 통통한 꼬리 */
    +'<path d="M98,30 Q124,26 134,38 Q124,50 98,46 Z" fill="'+b+'"/>'
    +'<ellipse cx="118" cy="38" rx="15" ry="11" fill="'+b+'"/>'
    +legs
    +'<ellipse cx="66" cy="38" rx="34" ry="16" fill="'+b+'"/>'
    +'<ellipse cx="30" cy="38" rx="18" ry="14" fill="'+b+'"/>'
    +'<path d="M14,31 Q24,26 38,29" stroke="'+b+'" stroke-width="4" fill="none" stroke-linecap="round"/>'
    +'<path d="M14,45 Q24,50 38,47" stroke="'+b+'" stroke-width="4" fill="none" stroke-linecap="round"/>'
    +deco
    +'<circle cx="21" cy="32" r="3.6" fill="'+pf.eye+'"/><circle cx="21" cy="44" r="3.6" fill="'+pf.eye+'"/>'
    +'<circle cx="20.2" cy="31.2" r="1.1" fill="rgba(255,255,255,.55)"/><circle cx="20.2" cy="43.2" r="1.1" fill="rgba(255,255,255,.55)"/>'
    +'</svg>';
}

/* ============================================================================
   5. 계산 엔진
   ----------------------------------------------------------------------------
   상태 표기
     2대립유전자 : 'nn'(없음) / 'het'(한 개) / 'mm'(두 개)
     패턴리스 로커스 : 'nn' / 'sn' / 'ss' / 'ps' / 'pp' / 'pn'
   ============================================================================ */
const FT_STATE = { A:{}, B:{} };
function ftResetState(){
  FT_ALL_GENES().forEach(g=>{ FT_STATE.A[g.id]='nn'; FT_STATE.B[g.id]='nn'; });
  FT_TRAITS.forEach(t=>{ FT_STATE.A[t.id]='no'; FT_STATE.B[t.id]='no'; });
}
ftResetState();

function ftGcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b];}return a||1;}

/* --- 배우자(gamete) 분포 --- */
function ftGametes(g, state){
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
function ftGenoKey(g, x, y){
  if(g.kind==='multi'){
    const rank=g.alleles;
    return (rank.indexOf(x)<=rank.indexOf(y)) ? x+y : y+x;
  }
  if(x==='N'&&y==='N') return 'NN';
  if(x==='m'&&y==='m') return 'mm';
  return 'Nm';
}
/* --- 부모 두 상태 → 새끼 유전형 확률 --- */
function ftGenoDist(g, sA, sB){
  const A=ftGametes(g,sA), B=ftGametes(g,sB), out={};
  Object.keys(A).forEach(x=>Object.keys(B).forEach(y=>{
    const k=ftGenoKey(g,x,y);
    out[k]=(out[k]||0)+A[x]*B[y];
  }));
  return out;
}

/* --- 유전자 안에서 토큰으로 이름 찾기 (헷 표기에 씁니다) --- */
function ftTokenName(g, token){
  if(g.kind==='multi'){
    const keys=Object.keys(g.genos);
    for(let i=0;i<keys.length;i++){
      const e=g.genos[keys[i]];
      if(e.token===token) return tr(e);
    }
  }
  return gName(g);
}

/* --- 유전형 → 표시 정보 --- */
function ftGenoInfo(g, key){
  if(g.kind==='multi'){
    const e=g.genos[key] || g.genos.nn;
    /* 겉으로 보이지 않는 보인자(헷) */
    if(e.hetOf) return { name:tr(e), token:null, isHet:true, hetOf:ftTokenName(g, e.hetOf),
                         warn:null, health:false, nonViable:false };
    return { name: e.name===null ? null : tr(e), token:e.token||null,
             isHet:false, warn:e.warn||null, health:!!e.health, nonViable:!!e.nonViable };
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
  /* dom — 겉모습은 1카피와 2카피가 같지만, 유전형 기준 표에서는 구분해서 보여줍니다 */
  return { name: gName(g)+' ('+(key==='mm'? ftT().copy2 : ftT().copy1)+')',
           token:g.id, isHet:false, warn:null, nonViable:false };
}

/* --- 표현형(비주얼) 버킷 : 눈에 보이는 것만 행으로, 헷은 보인자 정보로 --- */
function ftVisualBuckets(g, sA, sB){
  const d=ftGenoDist(g,sA,sB), out=[];
  if(g.kind==='multi'){
    /* 다대립 자리 : 보이는 유전형은 행으로, 안 보이는 유전형(노멀·헷)은 하나로 묶습니다 */
    let invis=0, hetP=0, hetName=null;
    Object.keys(d).forEach(k=>{
      if(d[k]<=0) return;
      const i=ftGenoInfo(g,k);
      if(i.isHet){ invis+=d[k]; hetP+=d[k]; hetName=i.hetOf; return; }
      if(!i.name){ invis+=d[k]; return; }
      out.push({ prob:d[k], name:i.name, token:i.token, het:null,
                 warn:i.warn, nonViable:i.nonViable, health:i.health });
    });
    if(invis>0) out.push({ prob:invis, name:null, token:null, warn:null, nonViable:false,
                           het: hetP>0 ? { name:hetName, p:hetP/invis } : null });
    return out;
  }
  if(g.type!=='rec'){
    Object.keys(d).forEach(k=>{
      if(d[k]<=0) return;
      const i=ftGenoInfo(g,k);
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
/* --- 유전형 버킷 : 헷도 별개의 결과 행으로 --- */
function ftGenoBuckets(g, sA, sB){
  const d=ftGenoDist(g,sA,sB), out=[];
  Object.keys(d).forEach(k=>{
    if(d[k]<=0) return;
    const i=ftGenoInfo(g,k);
    out.push({ prob:d[k], name:i.name, token:i.token, het:null,
               warn:i.warn, nonViable:i.nonViable, health:i.health });
  });
  return out;
}

/* --- 콤보 매칭 --- */
function ftMatchCombo(tokenSet){
  for(const c of FT_COMBOS){
    if(c.tokens.length!==tokenSet.size) continue;
    if(c.tokens.every(t=>tokenSet.has(t))) return c;
  }
  return null;
}
/* --- 부모의 현재 선택 → 비주얼 토큰 집합 --- */
function ftParentTokens(side){
  const s=new Set();
  FT_ALL_GENES().forEach(g=>{
    const v=FT_STATE[side][g.id];
    if(!v || v==='nn') return;
    if(g.kind==='multi'){ const e=g.genos[v]; if(e&&e.token) s.add(e.token); return; }
    if(g.type==='rec'){ if(v==='mm') s.add(g.id); }
    else if(g.type==='incdom'){ if(v==='het') s.add(g.id); else if(v==='mm') s.add('super_'+g.id); }
    else { s.add(g.id); }
  });
  return s;
}

/* --- 모프 이름 조립 --- */
function ftJoin(parts){
  if(!parts.length) return null;
  return parts.join(LANG==='en' ? ' · ' : '·');
}

/* --- 메인 계산 --------------------------------------------------------------
   genes : 계산에 포함할 유전자 배열
   mode  : 'visual' 표현형 기준 / 'geno' 유전형 기준
   반환  : { prob, parts, tokens, hets, warns, nonViable, health }[]         */
function ftCross(genes, mode){
  let rows=[{ prob:1, parts:[], tokens:new Set(), hets:[], warns:new Set(), nonViable:false, health:false }];
  genes.forEach(g=>{
    const list = (mode==='geno')
      ? ftGenoBuckets(g, FT_STATE.A[g.id], FT_STATE.B[g.id])
      : ftVisualBuckets(g, FT_STATE.A[g.id], FT_STATE.B[g.id]);
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
function ftFrac(prob){
  let best={n:0,d:1,err:1};
  for(let d=1; d<=4096; d++){
    const n=Math.round(prob*d), err=Math.abs(prob-n/d);
    if(err<best.err-1e-12){ best={n,d,err}; }
    if(err<1e-12) break;
  }
  const g=ftGcd(best.n,best.d);
  return (best.n/g)+'/'+(best.d/g);
}

/* ============================================================================
   6. 주의가 필요한 조합
   ============================================================================ */
const FT_DANGER = {
  W1:{ level:'high',
    ko:'🛑 <b>화이트아웃 × 화이트아웃</b> — 자손의 약 25%가 슈퍼 화이트아웃(동형)입니다. 보고된 슈퍼 개체는 알 속에서 죽거나, 부화하더라도 대부분 몇 시간 안에 폐사했고 가장 오래 산 기록도 며칠 수준입니다. 장기 생존이 확인된 개체는 없습니다. 이 조합은 권장되지 않습니다.',
    en:'🛑 <b>White Out × White Out</b> — about 25% of offspring are Super White Out (homozygous). Reported supers die in the egg or, when they hatch, usually within a few hours; the longest recorded survival is only a few days. No long-lived Super White Out is known. This pairing is not recommended.',
    ja:'🛑 <b>ホワイトアウト × ホワイトアウト</b> — 約25%がスーパーホワイトアウト（ホモ）になります。報告されているスーパー個体は卵内で死亡するか、孵化してもほとんどが数時間で死亡し、最長でも数日です。長期生存が確認された個体はありません。この組み合わせは推奨されません。',
    zh:'🛑 <b>White Out × White Out</b> — 约25%的后代为超级 White Out（纯合）。已报告的超级个体多在蛋内死亡，即使孵出通常也只存活数小时，最长记录也仅数天。目前没有长期存活的个体。不建议进行此配对。' },

  W2:{ level:'med',
    ko:'ℹ️ <b>스팅어·제로 계열과 패턴리스는 같은 자리</b>로 계산합니다. 두 형질을 각각 독립 유전자로 두는 계산기와는 결과가 다를 수 있습니다. 또한 과거에는 알비노(아멜)와 제로 계열의 조합이 나오지 않는다는 보고가 있었지만, 이후 조합 개체가 부화했다는 보고가 있어 이 계산기는 정상적으로 계산합니다.',
    en:'ℹ️ <b>Stinger / Zero and Patternless are treated as one locus</b> here. Calculators that model them as independent genes will give different numbers. Older reports also claimed Albino (Amel) could not be combined with the Zero line; combined animals have since been reported, so this calculator treats the pairing as normal.',
    ja:'ℹ️ <b>スティンガー・ゼロ系とパターンレスは同じ座</b>として計算します。両者を独立遺伝子として扱う計算機とは結果が異なります。また過去にはアルビノ（アメラ）とゼロ系の組み合わせが出ないという報告もありましたが、その後組み合わせ個体の孵化報告があるため、本計算機では通常どおり計算します。',
    zh:'ℹ️ 本计算器把 <b>Stinger／Zero 与无纹视为同一基因座</b>。若其他计算器将其视作独立基因，结果会不同。此外早期曾有白化（Amel）与 Zero 系无法组合的报告，但之后已有组合个体孵化的记录，因此本计算器按常规计算。' },

  W3:{ level:'med',
    ko:'ℹ️ <b>캬라멜 알비노 · 줄루 · 고스트</b>는 창시 개체군이 작은 열성 계통입니다. 비주얼을 얻으려고 반복 근친 교배를 하면 번식력 저하 등 근친 약세가 나타날 수 있습니다. 유전자 자체의 결함으로 확인된 것은 아니지만 계통 관리를 권장합니다.',
    en:'ℹ️ <b>Caramel Albino, Zulu and Ghost</b> are recessive lines with small founder populations. Repeated inbreeding to obtain visuals can cause inbreeding depression, including reduced fertility. This is not a confirmed defect of any of these genes, but careful line management is recommended.',
    ja:'ℹ️ <b>キャラメルアルビノ・ズールー・ゴースト</b>は創始個体群が小さい劣性系統です。ビジュアルを得るための反復的な近親交配は、繁殖力の低下を含む近交弱勢を招く可能性があります。遺伝子自体の欠陥として確認されたものではありませんが、系統管理をお勧めします。',
    zh:'ℹ️ <b>焦糖白化、Zulu 与 Ghost</b> 均为奠基种群较小的隐性品系。为获得显性个体而反复近亲繁殖，可能导致近交衰退（包括繁殖力下降）。这并非已确认的基因缺陷，但仍建议做好血统管理。' },

  W6:{ level:'med',
    ko:'ℹ️ 이 결과에는 <b>유전 방식이 완전히 확립되지 않은 형질</b>이 포함되어 있습니다. 확률은 참고용 근사치이며, 실제 표현형은 다른 형질의 영향과 성장에 따른 색 변화로 달라질 수 있습니다.',
    en:'ℹ️ This result includes <b>a trait whose inheritance is not fully established</b>. The probabilities are an approximation for reference only, and the actual phenotype can be altered by other traits and by colour change as the animal grows.',
    ja:'ℹ️ この結果には<b>遺伝様式が完全には確立されていない形質</b>が含まれています。確率はあくまで参考値であり、実際の表現型は他の形質の影響や成長に伴う色変化によって変わる可能性があります。',
    zh:'ℹ️ 此结果包含<b>遗传方式尚未完全确立的性状</b>。所示概率仅供参考，实际表型可能受其他性状影响以及生长过程中的体色变化而改变。' },
};

/* 결과 전체에서 발생한 경고 코드 수집 */
function ftCollectWarnings(genes, rows){
  const codes=new Set();
  (rows||[]).forEach(r=>r.warns.forEach(w=>codes.add(w)));
  /* 화이트아웃 × 화이트아웃 : 슈퍼가 나올 수 있으면 W1 */
  const wo=genes.find(g=>g.id==='whiteout');
  if(wo){ const d=ftGenoDist(wo, FT_STATE.A.whiteout, FT_STATE.B.whiteout); if(d.mm>0) codes.add('W1'); }
  /* 패턴리스 로커스를 쓰면 계산 전제를 안내 */
  if(genes.some(g=>g.id==='pat')) codes.add('W2');
  /* 창시 개체군이 작은 열성 : 비주얼이 나올 수 있으면 W3 */
  ['caramel','zulu','ghost'].forEach(id=>{
    const g=genes.find(x=>x.id===id); if(!g) return;
    const d=ftGenoDist(g, FT_STATE.A[id], FT_STATE.B[id]);
    if((d.mm||0)>0) codes.add('W3');
  });
  /* 미확정 형질이 계산에 포함되면 W6 */
  if(genes.some(g=>g.proof==='contested')) codes.add('W6');
  const order=['W1','W2','W3','W6'];
  return order.filter(c=>codes.has(c)).map(c=>({ code:c, level:FT_DANGER[c].level, text:tr(FT_DANGER[c]) }));
}
