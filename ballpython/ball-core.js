/* =============================================================================
   볼파이톤(볼 파이썬) 모프 계산기 · 공용 코어  (ballpython/index.html 전용)
   -----------------------------------------------------------------------------
   ※ gecko-core.js(레오파드) · crested-core.js(크레스티드) · fattail-core.js
     (펫테일) 와 완전히 별개 파일입니다. 계산 엔진의 뼈대는 fattail-core.js 와
     같습니다. 화면이 같아 보이도록 일부러 같은 구조를 유지했습니다.

   [ 펫테일 코어와 달라진 점 — 볼파이톤이라 필요한 것들 ]
   ▸ 다대립 자리(multi)가 대립유전자 개수 제한 없이 동작합니다.
     펫테일은 대립유전자가 3개뿐이라 유전형 이름(pp·ps·pn…)을 손으로 적어
     두었지만, 볼파이톤의 BEL 복합은 대립유전자만 7개(=유전형 28가지)라
     손으로 적을 수 없습니다. 유전형 키를 'mojave|lesser' 처럼 이름으로 잇고
     이름은 규칙으로 만듭니다.

   ▸ 유전 건강 이슈를 유전자 하나 단위가 아니라 '조합' 단위로도 잡습니다.
     스파이더 × 챔페인처럼 각각은 살아 있는데 둘이 만나면 문제가 되는
     조합이 볼파이톤에는 여럿 있습니다. BP_COMBO_RISKS 를 보세요.

   ▸ 헷(보인자) 표기가 자리마다 여러 개일 수 있습니다. 알비노 자리는 헷
     알비노와 헷 울트라멜이 동시에 나올 수 있어, 버킷의 het 를 배열로 바꿨습니다.

   [ 꼭 알아둘 계산 전제 ]
   ▸ 슈퍼폼이 확인되지 않은 유전자(스파이더·챔페인·워마)는 부모로 동형(2카피)을
     고를 수 없고, 새끼 결과에만 '비생존'으로 나옵니다.
   ▸ 바나나/코랄글로우는 성염색체와 연관된 것으로 봅니다. 이 계산기는 성별을
     계산하지 않으므로 확률은 성별을 무시한 값입니다. (H14 안내)
   ▸ 아잔틱은 계통(VPI·MJ·TSK·졸리프)마다 별개 자리로 둡니다. 계통 간 호환
     여부는 아직 정리되지 않았습니다.
   ============================================================================= */

/* 서비스 식별자 — 접속/조합 로그에 이 값이 붙어야 관리자에서 도구별로
   나눠 볼 수 있습니다. 레오파드는 'gecko', 크레스티드는 'crested'. (docs/STUDIO.md) */
const SERVICE_ID = 'ballpython';

var LANG = (typeof LANG !== 'undefined') ? LANG : 'ko';

/* ---- 공용 헬퍼 ---- */
function escapeHtml(s){return String(s).replace(/[&<>"]/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x];});}
function tr(o){ return (o && (o[LANG] || o.en)) || ''; }
function gName(g){ return tr(g); }

/* 접두어 — '슈퍼 ○○' · '헷 ○○' 를 유전자마다 4개 언어로 적지 않기 위해서입니다.
   볼파이톤은 유전자가 60개가 넘어서 손으로 적으면 240줄이 그냥 이름으로 찹니다.
   특별한 이름이 따로 있는 것(파이어의 슈퍼 = 블랙아이 루시스틱)만 sup/hetName 에
   적어 두면 그쪽이 우선합니다. */
const BP_AFFIX = {
  ko:{ het:'헷 ',    sup:'슈퍼 ',    copy1:'1카피',    copy2:'2카피' },
  en:{ het:'het ',   sup:'Super ',   copy1:'1 copy',   copy2:'2 copies' },
  ja:{ het:'ヘテロ', sup:'スーパー', copy1:'1コピー',  copy2:'2コピー' },
  zh:{ het:'携带 ',  sup:'超级 ',    copy1:'1个拷贝',  copy2:'2个拷贝' },
};
function aff(k){ return (BP_AFFIX[LANG] || BP_AFFIX.ko)[k]; }
function bpT(){ return BP_AFFIX[LANG] || BP_AFFIX.ko; }

function gSuper(g){ return g.sup ? tr(g.sup) : (aff('sup') + gName(g)); }
function gHet(g){ return g.hetName ? tr(g.hetName) : (aff('het') + gName(g)); }
function tName(t){ return tr(t); }

const BP_CONTACT_MAIL = 'kmc612000@gmail.com';

/* ============================================================================
   1. 유전자 정의
   ----------------------------------------------------------------------------
   kind  : 'bi'  = 2대립유전자 (N/m)  ·  'multi' = 다대립유전자 한 자리
   type  : 'incdom' 불완전우성(공동우성) / 'rec' 열성 / 'dom' 우성
   core  : true  = 항상 표시 · false = [추가 유전자] 토글을 켜야 표시
           (검색으로 찾으면 토글이 꺼져 있어도 나옵니다 — ball-ui.js)
   proof : 'established' 확립 / 'partial' 부분 검증 / 'contested' 미확정
   alias : 검색용 별칭. 4개 언어 이름은 자동으로 검색어에 들어가므로,
           여기에는 흔히 쓰는 다른 표기(약칭·오탈자·영문 철자)만 넣습니다.

   건강 관련 필드
   ----------------------------------------------------------------------------
   warnOnVisible : 겉으로 보이는 개체(1카피 포함)면 붙는 경고 코드.
                   스파이더 워블처럼 '헷이 아니라 발현 개체 전부'가 대상일 때.
   warnOnSuper   : 동형(슈퍼)일 때만 붙는 경고 코드.
   warnOnVisual  : 열성 비주얼일 때만 붙는 경고 코드.
   superNonViable: 동형 개체가 확인되지 않음(치사). 부모로 고를 수 없습니다.
   health*       : 결과 표에 '건강주의' 딱지를 붙일지.
   ============================================================================ */

/* --- 1-1. 불완전우성(공동우성) · 단일 자리 ------------------------------- */
const BP_G_INCDOM = [
  { id:'pastel', kind:'bi', type:'incdom', core:true, proof:'established', order:11,
    ko:'파스텔', en:'Pastel', ja:'パステル', zh:'帕斯特 Pastel', alias:['pastel','파스텔'] },

  { id:'enchi', kind:'bi', type:'incdom', core:true, proof:'established', order:12,
    ko:'엔치', en:'Enchi', ja:'エンチ', zh:'Enchi', alias:['enchi','엔치','엔찌'] },

  { id:'fire', kind:'bi', type:'incdom', core:true, proof:'established', order:13,
    ko:'파이어', en:'Fire', ja:'ファイア', zh:'Fire 火',
    sup:{ ko:'블랙아이 루시스틱 (슈퍼 파이어)', en:'Black Eyed Leucistic (Super Fire)',
          ja:'ブラックアイリューシスティック（スーパーファイア）', zh:'黑眼白化 BlkEL（超级 Fire）' },
    supToken:'blkel', alias:['fire','파이어','블랙아이','blkel','bel'] },

  { id:'vanilla', kind:'bi', type:'incdom', core:true, proof:'established', order:14,
    ko:'바닐라', en:'Vanilla', ja:'バニラ', zh:'Vanilla', alias:['vanilla','바닐라'] },

  { id:'ghi', kind:'bi', type:'incdom', core:true, proof:'established', order:15,
    ko:'GHI', en:'GHI', ja:'GHI', zh:'GHI', alias:['ghi','지에이치아이','고스트락'] },

  { id:'orangedream', kind:'bi', type:'incdom', core:true, proof:'established', order:16,
    ko:'오렌지 드림', en:'Orange Dream', ja:'オレンジドリーム', zh:'Orange Dream',
    alias:['orange dream','od','오렌지드림','오드'] },

  { id:'chocolate', kind:'bi', type:'incdom', core:true, proof:'established', order:17,
    ko:'초콜릿', en:'Chocolate', ja:'チョコレート', zh:'Chocolate', alias:['chocolate','초콜렛','초코'] },

  { id:'leopard', kind:'bi', type:'incdom', core:true, proof:'established', order:18,
    ko:'레오파드', en:'Leopard', ja:'レオパード', zh:'Leopard', alias:['leopard','레오파드','레오'] },

  { id:'calico', kind:'bi', type:'incdom', core:true, proof:'partial', order:19,
    ko:'칼리코', en:'Calico', ja:'キャリコ', zh:'Calico', alias:['calico','칼리코'] },

  { id:'spotnose', kind:'bi', type:'incdom', core:true, proof:'established', order:20,
    ko:'스팟노즈', en:'Spotnose', ja:'スポットノーズ', zh:'Spotnose',
    alias:['spotnose','스팟노즈','스포트노즈'] },

  { id:'mahogany', kind:'bi', type:'incdom', core:true, proof:'established', order:21,
    ko:'마호가니', en:'Mahogany', ja:'マホガニー', zh:'Mahogany', alias:['mahogany','마호가니'] },

  { id:'banana', kind:'bi', type:'incdom', core:true, proof:'partial', order:22,
    ko:'바나나 · 코랄글로우', en:'Banana · Coral Glow', ja:'バナナ・コーラルグロー', zh:'Banana 香蕉',
    alias:['banana','coral glow','바나나','코랄글로우','코랄'],
    warnOnVisible:'H14',
    note:{ ko:'바나나(코랄글로우)는 <b>성염색체와 연관</b>된 것으로 봅니다. 수컷이 어느 쪽 계통이냐에 따라 새끼의 <b>성비와 바나나 발현이 크게 치우칩니다</b> — 흔히 메일메이커·피메일메이커로 부릅니다. 이 계산기는 성별을 계산하지 않으므로, 여기 확률은 성별을 무시한 값입니다.',
           en:'Banana (Coral Glow) is understood to be <b>sex-linked</b>. Depending on which line the sire belongs to, the <b>sex ratio and which hatchlings show Banana are heavily skewed</b> — the “male-maker / female-maker” effect. This calculator does not model sex, so the odds here ignore it.',
           ja:'バナナ（コーラルグロー）は<b>性染色体と連鎖</b>していると考えられています。父個体がどちらの系統かによって<b>仔の性比とバナナの発現が大きく偏ります</b>（メールメーカー・フィメールメーカー）。本計算機は性別を計算しないため、ここでの確率は性別を無視した値です。',
           zh:'Banana（Coral Glow）被认为与<b>性染色体连锁</b>。视父本属于哪一系，<b>后代性别比例与 Banana 的出现会明显偏向一侧</b>（即 male-maker／female-maker）。本计算器不计算性别，因此这里的概率忽略性别。' } },

  { id:'hgw', kind:'bi', type:'incdom', core:true, proof:'partial', order:23,
    ko:'히든진 워마 (HGW)', en:'Hidden Gene Woma (HGW)', ja:'ヒドゥンジーンウーマ（HGW）', zh:'Hidden Gene Woma',
    alias:['hgw','hidden gene woma','ducati','히든진','히든진워마','두카티'],
    warnOnSuper:'H11', healthOnSuper:true,
    note:{ ko:'워마와 <b>이름만 비슷할 뿐 다른 유전자</b>입니다. 슈퍼폼(동형)에 대해서는 보고가 엇갈립니다 — 부화 사례가 있다는 이야기와, 결함이 있거나 살아남지 못한다는 이야기가 함께 있습니다. 이 계산기는 슈퍼폼을 치사로 두지 않되 <b>건강주의</b>로 표시합니다.',
           en:'Despite the name this is <b>a different gene from Woma</b>. Reports on the homozygous form conflict — some claim hatched supers, others report defects or failure to survive. This calculator does not treat the super as lethal but flags it as a <b>health concern</b>.',
           ja:'ウーマとは<b>名前が似ているだけの別遺伝子</b>です。スーパー体（ホモ）については報告が分かれています — 孵化例があるという話と、欠陥がある・生存しないという話が併存します。本計算機はスーパー体を致死とはせず<b>健康注意</b>として表示します。',
           zh:'尽管名称相近，它与 Woma <b>是不同的基因</b>。关于纯合超级体的报告并不一致 — 既有孵出的说法，也有畸形或无法存活的报告。本计算器不将其视为致死，但会标注<b>健康提示</b>。' } },

  /* --- 추가 유전자 (기본 꺼짐) --- */
  { id:'acid', kind:'bi', type:'incdom', core:false, proof:'partial', order:24,
    ko:'애시드', en:'Acid', ja:'アシッド', zh:'Acid', alias:['acid','애시드','에시드'] },
  { id:'confusion', kind:'bi', type:'incdom', core:false, proof:'partial', order:25,
    ko:'컨퓨전', en:'Confusion', ja:'コンフュージョン', zh:'Confusion', alias:['confusion','컨퓨전'] },
  { id:'cypress', kind:'bi', type:'incdom', core:false, proof:'contested', order:26,
    ko:'사이프러스', en:'Cypress', ja:'サイプレス', zh:'Cypress', alias:['cypress','사이프러스'] },
];

/* --- 1-2. BEL 복합 (블루아이 루시스틱 자리) -------------------------------
   모하비·레서·버터·루소·스페셜·팬텀·미스틱을 <b>같은 자리</b>의 대립유전자로 둡니다.
   흰 계열끼리 두 개 모이면(동형이든 조합이든) 블루아이 루시스틱이 됩니다.
   팬텀·미스틱은 같은 자리이지만 두 개가 모여도 흰색이 되지 않습니다.        */
const BP_L_BEL = {
  id:'bel', kind:'multi', core:true, proof:'partial', order:1, visibleHet:true,
  ko:'BEL 복합 (모하비·레서·버터 …)', en:'BEL complex (Mojave · Lesser · Butter …)',
  ja:'BEL 複合（モハベ・レッサー・バター …）', zh:'BEL 复合（Mojave・Lesser・Butter …）',
  alias:['bel','blue eyed','leucistic','루시','루시스틱','블루아이'],
  alleles:[
    { id:'mojave',  grp:'w', ko:'모하비',   en:'Mojave',  ja:'モハベ',       zh:'Mojave',  color:'#8C7C68', alias:['mojave','모하비','모하브'] },
    { id:'lesser',  grp:'w', ko:'레서',     en:'Lesser',  ja:'レッサー',     zh:'Lesser',  color:'#B9A98C', alias:['lesser','platinum','레서','플래티넘'] },
    { id:'butter',  grp:'w', ko:'버터',     en:'Butter',  ja:'バター',       zh:'Butter',  color:'#D8C48A', alias:['butter','버터'] },
    { id:'russo',   grp:'w', ko:'루소',     en:'Russo',   ja:'ルッソ',       zh:'Russo',   color:'#A79376', alias:['russo','루소'] },
    { id:'special', grp:'w', ko:'스페셜',   en:'Special', ja:'スペシャル',   zh:'Special', color:'#C0B08F', alias:['special','스페셜'] },
    { id:'phantom', grp:'d', ko:'팬텀',     en:'Phantom', ja:'ファントム',   zh:'Phantom', color:'#6E6455', alias:['phantom','팬텀','판텀'] },
    { id:'mystic',  grp:'d', ko:'미스틱',   en:'Mystic',  ja:'ミスティック', zh:'Mystic',  color:'#77705F', alias:['mystic','미스틱'] },
  ],
  /* 이름이 따로 있는 조합만 적습니다. 나머지는 규칙(bpPairInfo)이 만듭니다. */
  pairs:{
    'phantom|mystic':{ ko:'미스틱 포션', en:'Mystic Potion', ja:'ミスティックポーション', zh:'Mystic Potion',
                       token:'bel_white', proof:'partial' },
    /* 흰 계열 × 팬텀·미스틱 조합 중 이름이 굳어진 것. 나머지는 규칙대로
       '모하비 미스틱' 처럼 두 이름을 잇습니다. */
    'mojave|phantom':{ ko:'퍼플 패션', en:'Purple Passion', ja:'パープルパッション', zh:'Purple Passion',
                       token:'purplepassion', proof:'established' },
  },
  note:{ ko:'모하비·레서·버터·루소·스페셜·팬텀·미스틱은 <b>같은 자리</b>의 대립유전자로 계산합니다. 흰 계열(모하비·레서·버터·루소·스페셜) 중 <b>아무 두 개</b>가 모이면 — 같은 것 두 개든 서로 다른 것 하나씩이든 — <b>블루아이 루시스틱(BEL)</b> 이 됩니다. 팬텀·미스틱은 같은 자리이지만 두 개가 모여도 흰색이 되지 않고 슈퍼 팬텀·슈퍼 미스틱이 되며, 둘이 만나면 미스틱 포션입니다. 흰 계열 × 팬텀·미스틱 조합은 흰색으로 치우치되 계통에 따라 편차가 커서 <b>부분 검증</b>으로 표시합니다. 뱀부·대디 등 이 자리에 속한다고 보는 다른 대립유전자는 아직 넣지 않았습니다.',
         en:'Mojave, Lesser, Butter, Russo, Special, Phantom and Mystic are calculated as alleles of <b>one locus</b>. <b>Any two</b> of the white group (Mojave, Lesser, Butter, Russo, Special) — homozygous or as a compound — give a <b>Blue Eyed Leucistic (BEL)</b>. Phantom and Mystic sit at the same locus but two copies do not produce white: they give Super Phantom / Super Mystic, and together they give Mystic Potion. White × Phantom/Mystic compounds trend toward white but vary a lot by line, so they are marked <b>partly proven</b>. Other alleles said to belong here (Bamboo, Daddy…) are not included yet.',
         ja:'モハベ・レッサー・バター・ルッソ・スペシャル・ファントム・ミスティックは<b>同じ座</b>の対立遺伝子として計算します。白系（モハベ・レッサー・バター・ルッソ・スペシャル）の<b>いずれか2つ</b>が揃えば — 同じもの2つでも別々に1つずつでも — <b>ブルーアイリューシスティック（BEL）</b>になります。ファントム・ミスティックは同座ですが2つ揃っても白にならず、スーパーファントム・スーパーミスティックになり、両者が合わさるとミスティックポーションです。白系×ファントム/ミスティックの複合は白寄りになりますが系統差が大きいため<b>一部検証</b>としています。バンブー・ダディなど同座とされる他の対立遺伝子はまだ含めていません。',
         zh:'Mojave、Lesser、Butter、Russo、Special、Phantom、Mystic 按<b>同一基因座</b>的等位基因计算。白系（Mojave、Lesser、Butter、Russo、Special）中<b>任意两个</b>凑齐 — 无论是同一个两拷贝还是两个不同的各一份 — 都会得到<b>蓝眼白化（BEL）</b>。Phantom 与 Mystic 位于同座，但两拷贝并不变白，而是超级 Phantom／超级 Mystic；两者相遇则为 Mystic Potion。白系 × Phantom/Mystic 的复合偏向白色但品系差异大，故标注为<b>部分验证</b>。Bamboo、Daddy 等被认为属于此座的其他等位基因尚未纳入。' },
};

/* --- 1-3. 옐로우벨리 복합 자리 ------------------------------------------- */
const BP_L_YB = {
  id:'yb', kind:'multi', core:true, proof:'partial', order:2, visibleHet:true,
  ko:'옐로우벨리 복합 (YB·아스팔트·그래블)', en:'Yellow Belly complex (YB · Asphalt · Gravel)',
  ja:'イエローベリー複合（YB・アスファルト・グラベル）', zh:'Yellow Belly 复合（YB・Asphalt・Gravel）',
  alias:['yellow belly','yb','옐로우벨리','옐벨','아이보리','ivory'],
  alleles:[
    { id:'yellowbelly', ko:'옐로우벨리', en:'Yellow Belly', ja:'イエローベリー', zh:'Yellow Belly',
      color:'#C6A85E', alias:['yellow belly','yb','옐로우벨리','옐벨'] },
    { id:'asphalt', ko:'아스팔트', en:'Asphalt', ja:'アスファルト', zh:'Asphalt',
      color:'#6E6659', alias:['asphalt','아스팔트'] },
    { id:'gravel',  ko:'그래블',   en:'Gravel',  ja:'グラベル',     zh:'Gravel',
      color:'#8A8171', alias:['gravel','그래블','그라벨'] },
    { id:'specter', ko:'스펙터',   en:'Specter', ja:'スペクター',   zh:'Specter',
      color:'#9C9078', alias:['specter','spectre','스펙터'] },
  ],
  pairs:{
    'yellowbelly|yellowbelly':{ ko:'아이보리', en:'Ivory', ja:'アイボリー', zh:'Ivory',
      token:'ivory', proof:'established' },
    'yellowbelly|asphalt':{ ko:'프리웨이', en:'Freeway', ja:'フリーウェイ', zh:'Freeway',
      token:'ivory', proof:'established' },
    'yellowbelly|gravel':{ ko:'하이웨이', en:'Highway', ja:'ハイウェイ', zh:'Highway',
      token:'ivory', proof:'established' },
  },
  note:{ ko:'옐로우벨리·아스팔트·그래블·스펙터를 <b>같은 자리</b>로 둡니다. 옐로우벨리 두 개는 아이보리, 옐로우벨리와 그래블은 하이웨이, 옐로우벨리와 아스팔트는 프리웨이입니다. 그 밖의 조합은 흰색·연회색 쪽으로 가지만 이름이 통일돼 있지 않아 <b>컴파운드</b>로만 표시합니다. 헷 레드아잔틱(설퍼) 등 이 자리에 속한다고 보는 다른 대립유전자는 아직 넣지 않았습니다.',
         en:'Yellow Belly, Asphalt, Gravel and Specter are treated as <b>one locus</b>. Two Yellow Bellies give Ivory, Yellow Belly + Gravel gives Highway, Yellow Belly + Asphalt gives Freeway. Other pairings trend pale but have no settled trade name, so they are shown only as <b>compounds</b>. Other alleles said to belong here (Het Red Axanthic / Sulfur…) are not included yet.',
         ja:'イエローベリー・アスファルト・グラベル・スペクターを<b>同じ座</b>として扱います。イエローベリー2つでアイボリー、イエローベリー＋グラベルでハイウェイ、イエローベリー＋アスファルトでフリーウェイです。それ以外の組み合わせは白・淡色寄りになりますが名称が定まっていないため<b>コンパウンド</b>とだけ表示します。ヘテロレッドアザンティック（サルファー）など同座とされる対立遺伝子はまだ含めていません。',
         zh:'Yellow Belly、Asphalt、Gravel、Specter 视为<b>同一基因座</b>。两个 Yellow Belly 为 Ivory，Yellow Belly + Gravel 为 Highway，Yellow Belly + Asphalt 为 Freeway。其余组合偏向浅白但尚无统一名称，因此仅显示为<b>复合</b>。Het Red Axanthic（Sulfur）等被认为属于此座的等位基因尚未纳入。' },
};

/* --- 1-4. 시나몬 / 블랙파스텔 자리 ---------------------------------------
   두 유전자는 서로 대립유전자입니다. 동형이든 조합이든 '슈퍼' 상태가 되면
   덕빌(주둥이 변형) · 킹크 · 부화 실패가 늘어난다는 보고가 많습니다.       */
const BP_L_CINNY = {
  id:'cinny', kind:'multi', core:true, proof:'established', order:3, visibleHet:true,
  ko:'시나몬 · 블랙파스텔', en:'Cinnamon · Black Pastel', ja:'シナモン・ブラックパステル',
  zh:'Cinnamon・Black Pastel',
  alias:['cinnamon','black pastel','시나몬','블랙파스텔','블파'],
  alleles:[
    { id:'cinnamon',    ko:'시나몬',     en:'Cinnamon',     ja:'シナモン',           zh:'Cinnamon',
      color:'#6A4C34', alias:['cinnamon','시나몬'] },
    { id:'blackpastel', ko:'블랙파스텔', en:'Black Pastel', ja:'ブラックパステル',   zh:'Black Pastel',
      color:'#463A2E', alias:['black pastel','blackpastel','블랙파스텔','블파'] },
  ],
  /* 세 가지 슈퍼 상태 모두 같은 문제를 안고 있어 경고를 함께 답니다. */
  pairDefault:{ warn:'H9', health:true, token:'super_cinny' },
  note:{ ko:'시나몬과 블랙파스텔은 <b>같은 자리</b>의 대립유전자입니다. 슈퍼 시나몬·슈퍼 블랙파스텔·시나몬 블랙파스텔은 겉모습이 거의 같고, <b>덕빌(주둥이가 오리처럼 뭉툭해짐)·킹크(척추 꺾임)·부화 실패</b>가 다른 조합보다 많이 보고됩니다. 이 세 결과에는 건강주의가 붙습니다.',
         en:'Cinnamon and Black Pastel are alleles of <b>one locus</b>. Super Cinnamon, Super Black Pastel and Cinnamon Black Pastel look nearly identical, and <b>duckbilling, kinking and failure to hatch</b> are reported far more often in them. All three results carry a health flag here.',
         ja:'シナモンとブラックパステルは<b>同じ座</b>の対立遺伝子です。スーパーシナモン・スーパーブラックパステル・シナモンブラックパステルは見た目がほぼ同じで、<b>ダックビル（吻部の変形）・キンク（脊椎の屈曲）・孵化不全</b>の報告が他より多くあります。これら3つの結果には健康注意が付きます。',
         zh:'Cinnamon 与 Black Pastel 是<b>同一基因座</b>的等位基因。超级 Cinnamon、超级 Black Pastel 与 Cinnamon Black Pastel 外观几乎相同，且<b>鸭嘴（吻部变形）、脊椎扭结、孵化失败</b>的报告明显更多。这三种结果都会标注健康提示。' },
};

/* --- 1-5. 알비노(울트라멜) 자리 · 열성 ----------------------------------- */
const BP_L_ALBINO = {
  id:'albinolocus', kind:'multi', core:true, proof:'partial', order:41, visibleHet:false,
  ko:'알비노 · 울트라멜', en:'Albino · Ultramel', ja:'アルビノ・ウルトラメル', zh:'白化・Ultramel',
  alias:['albino','ultramel','ultra','알비노','울트라멜','울트라','아멜'],
  alleles:[
    { id:'albino',   ko:'알비노 (아멜라니스틱)', en:'Albino (Amelanistic)', ja:'アルビノ（アメラニスティック）',
      zh:'白化（Amel）', color:'#F0D07E', alias:['albino','amel','알비노','아멜'] },
    { id:'ultramel', ko:'울트라멜', en:'Ultramel', ja:'ウルトラメル', zh:'Ultramel',
      color:'#D8A868', alias:['ultramel','ultra','울트라멜','울트라'] },
  ],
  pairs:{
    'albino|ultramel':{ ko:'울트라 (알비노 × 울트라멜 조합)', en:'Ultra (Albino × Ultramel compound)',
      ja:'ウルトラ（アルビノ×ウルトラメル複合）', zh:'Ultra（白化×Ultramel 复合）',
      token:'ultra', proof:'partial' },
  },
  warnOnVisualAny:'H12',
  note:{ ko:'알비노와 울트라멜은 <b>같은 자리</b>의 열성 대립유전자입니다. 알비노 두 개면 알비노, 울트라멜 두 개면 울트라멜, 하나씩이면 그 중간인 <b>울트라</b>가 됩니다. 한 개만 있으면 겉으로는 노멀(헷)입니다.',
         en:'Albino and Ultramel are recessive alleles at <b>the same locus</b>. Two Albino alleles give Albino, two Ultramel give Ultramel, one of each gives the intermediate <b>Ultra</b>. A single copy of either looks normal (het).',
         ja:'アルビノとウルトラメルは<b>同じ座</b>の劣性対立遺伝子です。アルビノ2つでアルビノ、ウルトラメル2つでウルトラメル、1つずつでその中間の<b>ウルトラ</b>になります。1つだけなら見た目はノーマル（ヘテロ）です。',
         zh:'白化与 Ultramel 是<b>同一基因座</b>的隐性等位基因。两个白化为白化，两个 Ultramel 为 Ultramel，各一个则为中间型 <b>Ultra</b>。仅一个拷贝时外观正常（het）。' },
};

/* --- 1-6. 캔디 / 토피 자리 · 열성 ---------------------------------------- */
const BP_L_CANDY = {
  id:'candylocus', kind:'multi', core:true, proof:'partial', order:42, visibleHet:false,
  ko:'캔디 · 토피', en:'Candy · Toffee', ja:'キャンディ・トフィー', zh:'Candy・Toffee',
  alias:['candy','toffee','캔디','토피','토피빈'],
  alleles:[
    { id:'candy',  ko:'캔디',  en:'Candy',  ja:'キャンディ', zh:'Candy',  color:'#E7B9A8', alias:['candy','캔디'] },
    { id:'toffee', ko:'토피',  en:'Toffee', ja:'トフィー',   zh:'Toffee', color:'#D79A70', alias:['toffee','toffeebelly','토피','토피벨리'] },
  ],
  warnOnVisualAny:'H12',
  note:{ ko:'캔디와 토피는 <b>같은 자리</b>의 열성 대립유전자입니다. 하나씩 가지면 겉으로 보이는 <b>캔디 토피</b> 조합이 됩니다. 두 계통 모두 색소가 크게 줄어 빛에 민감할 수 있습니다.',
         en:'Candy and Toffee are recessive alleles at <b>the same locus</b>; one of each gives the visible <b>Candy Toffee</b> compound. Both lines are strongly reduced in pigment and can be light sensitive.',
         ja:'キャンディとトフィーは<b>同じ座</b>の劣性対立遺伝子で、1つずつ持つと発現する<b>キャンディトフィー</b>複合になります。どちらも色素が大きく減るため光に敏感なことがあります。',
         zh:'Candy 与 Toffee 是<b>同一基因座</b>的隐性等位基因，各持一个即为可见的 <b>Candy Toffee</b> 复合。两系色素都大幅减少，可能对光敏感。' },
};

/* --- 1-7. 열성 (단일 자리) ----------------------------------------------- */
const BP_G_REC = [
  { id:'piebald', kind:'bi', type:'rec', core:true, proof:'established', order:43,
    ko:'파이볼드', en:'Piebald', ja:'パイボールド', zh:'Piebald 拼图',
    alias:['piebald','pied','파이볼드','파이드'] },

  { id:'clown', kind:'bi', type:'rec', core:true, proof:'established', order:44,
    ko:'클라운', en:'Clown', ja:'クラウン', zh:'Clown 小丑', alias:['clown','클라운','크라운'] },

  { id:'ghost', kind:'bi', type:'rec', core:true, proof:'established', order:45,
    ko:'고스트 (하이포)', en:'Ghost (Hypo)', ja:'ゴースト（ハイポ）', zh:'Ghost 幽灵（Hypo）',
    alias:['ghost','hypo','orange ghost','고스트','하이포'] },

  { id:'desertghost', kind:'bi', type:'rec', core:true, proof:'established', order:46,
    ko:'데저트 고스트 (DG)', en:'Desert Ghost (DG)', ja:'デザートゴースト（DG）', zh:'Desert Ghost',
    alias:['desert ghost','dg','데저트고스트','디지'],
    note:{ ko:'이름은 비슷하지만 <b>데저트(우성)와는 다른 유전자</b>입니다. 데저트 고스트는 열성이고, 암컷 불임 보고는 이쪽이 아니라 <b>데저트</b> 쪽입니다.',
           en:'Despite the name this is <b>a different gene from Desert (dominant)</b>. Desert Ghost is recessive; the female-infertility reports belong to <b>Desert</b>, not to this gene.',
           ja:'名前は似ていますが<b>デザート（優性）とは別の遺伝子</b>です。デザートゴーストは劣性で、雌の不妊報告は<b>デザート</b>の側の話です。',
           zh:'虽然名称相似，但它与 <b>Desert（显性）是不同的基因</b>。Desert Ghost 为隐性；雌性不育的报告属于 <b>Desert</b>，与本基因无关。' } },

  { id:'geneticstripe', kind:'bi', type:'rec', core:true, proof:'established', order:47,
    ko:'제네틱 스트라이프', en:'Genetic Stripe', ja:'ジェネティックストライプ', zh:'Genetic Stripe',
    alias:['genetic stripe','stripe','제네틱스트라이프','스트라이프'] },

  { id:'lavender', kind:'bi', type:'rec', core:true, proof:'established', order:48,
    ko:'라벤더 알비노', en:'Lavender Albino', ja:'ラベンダーアルビノ', zh:'薰衣草白化',
    alias:['lavender','lavender albino','라벤더','라벤더알비노'],
    warnOnVisual:'H12' },

  { id:'caramel', kind:'bi', type:'rec', core:true, proof:'established', order:49,
    ko:'캐러멜 알비노', en:'Caramel Albino', ja:'キャラメルアルビノ', zh:'焦糖白化',
    alias:['caramel','caramel albino','캐러멜','카라멜'],
    warnOnVisual:'H10', healthOnVisual:true,
    note:{ ko:'초기 캐러멜 알비노 계통에서 <b>킹크(척추가 꺾이는 변형)</b>가 눈에 띄게 많이 보고됐습니다. 아웃크로스로 개선을 시도한 계통도 있지만, 이 형질의 비주얼을 계획한다면 <b>모계·부계 계통 정보</b>를 먼저 확인하세요.',
           en:'The early Caramel Albino lines had a notably high rate of <b>kinking (spinal deformity)</b>. Some lines have been outcrossed to reduce it, but if you plan on visuals, check the <b>lineage of both parents</b> first.',
           ja:'初期のキャラメルアルビノ系統では<b>キンク（脊椎の変形）</b>が目立って多く報告されました。アウトクロスで改善を図った系統もありますが、ビジュアルを狙うなら<b>両親の系統情報</b>を先に確認してください。',
           zh:'早期焦糖白化品系中<b>脊椎扭结（kink）</b>的报告明显偏多。部分品系已通过外血改善，但若计划产出表现型，请先确认<b>父母双方的血统</b>。' } },

  { id:'axvpi', kind:'bi', type:'rec', core:true, proof:'established', order:50,
    ko:'아잔틱 (VPI)', en:'Axanthic (VPI)', ja:'アザンティック（VPI）', zh:'Axanthic（VPI）',
    alias:['axanthic','vpi','아잔틱','악산틱'] },
  { id:'axmj', kind:'bi', type:'rec', core:true, proof:'established', order:51,
    ko:'아잔틱 (MJ)', en:'Axanthic (MJ)', ja:'アザンティック（MJ）', zh:'Axanthic（MJ）',
    alias:['axanthic','mj','markus jayne','아잔틱','악산틱'] },
  { id:'axtsk', kind:'bi', type:'rec', core:false, proof:'partial', order:52,
    ko:'아잔틱 (TSK)', en:'Axanthic (TSK)', ja:'アザンティック（TSK）', zh:'Axanthic（TSK）',
    alias:['axanthic','tsk','아잔틱'] },
  { id:'axjolliff', kind:'bi', type:'rec', core:false, proof:'partial', order:53,
    ko:'아잔틱 (졸리프)', en:'Axanthic (Jolliff)', ja:'アザンティック（ジョリフ）', zh:'Axanthic（Jolliff）',
    alias:['axanthic','jolliff','아잔틱','졸리프'] },

  { id:'monsoon', kind:'bi', type:'rec', core:false, proof:'partial', order:54,
    ko:'몬순', en:'Monsoon', ja:'モンスーン', zh:'Monsoon', alias:['monsoon','몬순'] },
  { id:'sunset', kind:'bi', type:'rec', core:false, proof:'partial', order:55,
    ko:'선셋', en:'Sunset', ja:'サンセット', zh:'Sunset', alias:['sunset','선셋'] },
  { id:'tristripe', kind:'bi', type:'rec', core:false, proof:'contested', order:56,
    ko:'트라이 스트라이프', en:'Tri-stripe', ja:'トライストライプ', zh:'Tri-stripe',
    alias:['tri stripe','tristripe','트라이스트라이프'] },
  { id:'puzzle', kind:'bi', type:'rec', core:false, proof:'partial', order:57,
    ko:'퍼즐', en:'Puzzle', ja:'パズル', zh:'Puzzle', alias:['puzzle','퍼즐'] },
];

/* --- 1-8. 우성 ------------------------------------------------------------
   볼파이톤의 우성 중에는 동형(2카피)이 확인되지 않은 것들이 있습니다.
   superNonViable 을 달면 부모로 고를 수 없고, 새끼 결과에만 비생존으로 나옵니다. */
const BP_G_DOM = [
  { id:'pinstripe', kind:'bi', type:'dom', core:true, proof:'established', order:61,
    ko:'핀스트라이프', en:'Pinstripe', ja:'ピンストライプ', zh:'Pinstripe 细纹',
    alias:['pinstripe','pin','핀스트라이프','핀'],
    note:{ ko:'우성이라 한 개만 있어도 무늬가 나옵니다. 두 개(동형)여도 <b>겉모습이 같아</b> 구별할 수 없습니다 — 표현형 기준에서는 하나로 묶고, 유전형 기준에서만 1카피·2카피로 나눕니다.',
           en:'Dominant — a single copy already shows, and two copies look <b>the same</b>. Phenotype view merges them; genotype view splits 1 copy / 2 copies.',
           ja:'優性のため1つでも発現します。2つ（ホモ）でも<b>見た目は同じ</b>で区別できません — 表現型では1つにまとめ、遺伝型でのみ1コピー・2コピーに分けます。',
           zh:'显性 — 单拷贝即表现，纯合<b>外观相同</b>无法区分。表现型视图合并，基因型视图区分 1 拷贝／2 拷贝。' } },

  { id:'spider', kind:'bi', type:'dom', core:true, proof:'established', order:62,
    ko:'스파이더', en:'Spider', ja:'スパイダー', zh:'Spider 蜘蛛',
    alias:['spider','스파이더','스파이더워블','wobble'],
    superNonViable:true, warnOnSuper:'H2',
    warnOnVisible:'H1', healthOnVisible:true,
    note:{ ko:'<b>스파이더 유전자를 가진 개체는 정도의 차이가 있을 뿐 모두 워블(머리 흔들림)을 보입니다.</b> 먹이를 놓치거나 코르크스크루(몸이 돌아감)까지 가는 개체도 있습니다. 개체 관리로 완화할 수는 있지만 유전자에서 분리할 수는 없습니다. 또 <b>슈퍼 스파이더는 지금까지 부화 개체가 확인되지 않았습니다</b> — 부모로 고를 수 없고, 스파이더 × 스파이더 결과에만 비생존으로 표시됩니다.',
           en:'<b>Every animal carrying Spider shows some degree of wobble</b> (head tremor); some miss strikes or corkscrew. Husbandry can reduce it but it cannot be separated from the gene. In addition <b>no Super Spider has ever been confirmed to hatch</b> — it cannot be chosen as a parent and appears only in Spider × Spider results, marked non-viable.',
           ja:'<b>スパイダー遺伝子を持つ個体は程度の差こそあれ全てウォブル（頭の震え）を示します。</b>餌を外す、コークスクリュー（体が回る）まで至る個体もいます。飼育で軽減はできても遺伝子から切り離すことはできません。また<b>スーパースパイダーは孵化個体が確認されていません</b> — 親として選べず、スパイダー×スパイダーの結果にのみ生存困難として表示されます。',
           zh:'<b>携带 Spider 的个体无一例外都会出现不同程度的摇头（wobble）</b>，有的会扑食失误甚至出现螺旋扭转。良好饲养可减轻，但无法与基因分离。此外<b>超级 Spider 至今没有确认孵化的个体</b> — 无法作为亲本选择，仅在 Spider × Spider 的结果中标注为不存活。' } },

  { id:'champagne', kind:'bi', type:'dom', core:true, proof:'established', order:63,
    ko:'챔페인', en:'Champagne', ja:'シャンパン', zh:'Champagne 香槟',
    alias:['champagne','챔페인','샴페인'],
    superNonViable:true, warnOnSuper:'H4',
    warnOnVisible:'H3', healthOnVisible:true,
    note:{ ko:'챔페인도 <b>워블·덕빌 보고가 있는 신경 계열</b>입니다. <b>슈퍼 챔페인은 부화하지 못합니다.</b> 특히 <b>스파이더와의 조합</b>은 부화 직후 폐사하거나 심한 증상을 보인다는 보고가 반복돼 권장되지 않습니다.',
           en:'Champagne is also in the <b>neurological group, with wobble and duckbilling reported</b>. <b>Super Champagne does not hatch.</b> The <b>Champagne × Spider</b> combination in particular is repeatedly reported to die soon after hatching or to be severely affected, and is not recommended.',
           ja:'シャンパンも<b>ウォブル・ダックビルの報告がある神経系</b>です。<b>スーパーシャンパンは孵化しません。</b>とくに<b>スパイダーとの組み合わせ</b>は孵化直後に死亡する、重い症状が出るという報告が繰り返されており推奨されません。',
           zh:'Champagne 同样属于<b>有摇头与鸭嘴报告的神经类基因</b>。<b>超级 Champagne 无法孵化。</b>尤其是<b>与 Spider 的组合</b>，反复有孵出后不久死亡或症状严重的报告，不建议进行。' } },

  { id:'woma', kind:'bi', type:'dom', core:true, proof:'established', order:64,
    ko:'워마', en:'Woma', ja:'ウーマ', zh:'Woma',
    alias:['woma','워마'],
    superNonViable:true, warnOnSuper:'H6',
    /* 워마 한 마리만으로는 H7(신경 증상 중첩)을 띄우지 않습니다 — H7 은 '둘 이상
       겹칠 때' 를 설명하는 글이라, 워마 한 마리에 붙이면 없는 말을 하게 됩니다.
       스파이더·챔페인·HGW 와 겹치는 경우는 BP_COMBO_RISKS 가 잡습니다. */
    note:{ ko:'<b>슈퍼 워마(동형)는 살아서 부화하지 않습니다.</b> 워마 자체도 개체에 따라 가벼운 워블·덕빌이 보고되며, <b>스파이더·챔페인처럼 신경 증상이 있는 유전자와 겹치면 증상이 더 심해집니다.</b> 히든진 워마(HGW)와는 이름만 비슷할 뿐 다른 유전자입니다.',
           en:'<b>Super Woma (homozygous) does not hatch alive.</b> Woma itself is reported to show mild wobble or duckbilling in some animals, and <b>stacking it with other neurological genes such as Spider or Champagne makes symptoms worse.</b> Hidden Gene Woma (HGW) is a different gene despite the name.',
           ja:'<b>スーパーウーマ（ホモ）は生きて孵化しません。</b>ウーマ自体も個体によって軽いウォブル・ダックビルが報告され、<b>スパイダーやシャンパンなど神経症状のある遺伝子と重なると症状が強くなります。</b>ヒドゥンジーンウーマ（HGW）とは名前が似ているだけの別遺伝子です。',
           zh:'<b>超级 Woma（纯合）无法存活孵化。</b>Woma 本身在部分个体中也有轻度摇头或鸭嘴的报告，<b>与 Spider、Champagne 等神经类基因叠加时症状会加重。</b>Hidden Gene Woma（HGW）与其名称相近但属不同基因。' } },

  { id:'desert', kind:'bi', type:'dom', core:true, proof:'established', order:65,
    ko:'데저트', en:'Desert', ja:'デザート', zh:'Desert 沙漠',
    alias:['desert','데저트','데저트암컷'],
    warnOnVisible:'H8', healthOnVisible:true,
    note:{ ko:'<b>데저트 암컷은 번식이 거의 불가능하다고 보고됩니다.</b> 배란은 하지만 알을 낳지 못하거나 난포가 굳는 사례가 반복 보고돼, 사실상 <b>암컷 불임 유전자</b>로 다뤄집니다. 수컷은 정상적으로 번식합니다. 그래서 이 유전자는 <b>수컷 쪽으로만 이어가는 것</b>이 일반적입니다. 열성인 데저트 고스트(DG)와는 다른 유전자입니다.',
           en:'<b>Desert females are reported to be effectively unable to reproduce.</b> They ovulate but repeatedly fail to lay, or the follicles harden — so Desert is treated in practice as a <b>female-infertility gene</b>. Males breed normally, so the gene is usually carried forward <b>through males only</b>. This is a different gene from the recessive Desert Ghost (DG).',
           ja:'<b>デザートの雌はほぼ繁殖できないと報告されています。</b>排卵はするものの産卵に至らない、卵胞が固まるといった事例が繰り返し報告され、実質的に<b>雌の不妊遺伝子</b>として扱われます。雄は正常に繁殖するため、この遺伝子は<b>雄側でのみ</b>受け継ぐのが一般的です。劣性のデザートゴースト（DG）とは別の遺伝子です。',
           zh:'<b>Desert 雌性被报告基本无法繁殖。</b>会排卵但常无法产卵，或卵泡硬化，实际上被当作<b>雌性不育基因</b>处理。雄性繁殖正常，因此该基因通常<b>只通过雄性</b>延续。它与隐性的 Desert Ghost（DG）是不同的基因。' } },
];

/* 사용할 유전자 전체 목록 (표기 순서 = order) */
function BP_ALL_GENES(){
  return [BP_L_BEL, BP_L_YB, BP_L_CINNY, BP_L_ALBINO, BP_L_CANDY]
    .concat(BP_G_INCDOM).concat(BP_G_REC).concat(BP_G_DOM)
    .sort(function(a,b){ return a.order-b.order; });
}

/* 대립유전자 정의 찾기 */
function bpAllele(g, id){
  for(let i=0;i<g.alleles.length;i++) if(g.alleles[i].id===id) return g.alleles[i];
  return null;
}
/* 대립유전자 우선순위 — 유전형 키를 항상 같은 순서로 적기 위해 씁니다 */
function bpRank(g){ return g.alleles.map(function(a){return a.id;}).concat(['n']); }

/* 부모로 고를 수 있는 유전형인지 — 동형이 치사인 형질은 부모가 될 수 없습니다 */
function bpSelectableAsParent(g, state){
  if(g.kind==='multi') return true;
  if(state==='mm' && g.superNonViable) return false;
  return true;
}

/* ---- 계열(패밀리) 설명 ---- */
const BP_FAMILIES = [
  { id:'incdom', type:'incdom', ko:'불완전우성 · 공동우성', en:'Incomplete / Co-dominant',
    ja:'不完全優性・共優性', zh:'不完全显性・共显性',
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
    desc:{ ko:'한 개만 있어도 겉으로 보입니다 (동형이 치사인 것도 있습니다)',
           en:'Expressed from a single copy · some are lethal when homozygous',
           ja:'片方だけでも発現します（ホモが致死のものもあります）',
           zh:'单拷贝即可表现（部分纯合致死）' } },
  { id:'poly', type:'poly', ko:'라인브리딩', en:'Line-bred', ja:'ラインブリード', zh:'线育',
    desc:{ ko:'다인자 형질 · 확률 계산 불가 (참고용 표시)',
           en:'Polygenic · not probability-based (reference only)',
           ja:'多因子形質 · 確率計算不可（参考表示）',
           zh:'多基因性状 · 无法计算概率（仅供参考）' } },
];

/* ============================================================================
   2. 라인브리딩(폴리제닉) 형질 — 확률 계산 대상 아님
   ============================================================================ */
const BP_TRAIT_GROUPS = [
  { id:'pattern', ko:'패턴 성향', en:'Pattern',    ja:'パターン傾向', zh:'花纹倾向' },
  { id:'color',   ko:'발색 성향', en:'Colour',     ja:'発色傾向',     zh:'发色倾向' },
];

const BP_TRAITS = [
  { id:'reduced',  grp:'pattern', ko:'리듀스드 패턴', en:'Reduced pattern', ja:'リデュースドパターン', zh:'减纹',
    alias:['reduced','리듀스드'] },
  { id:'aberrant', grp:'pattern', ko:'애버런트 패턴', en:'Aberrant pattern', ja:'アベラントパターン',  zh:'异常纹',
    alias:['aberrant','애버런트'] },
  { id:'banded',   grp:'pattern', ko:'밴디드 성향',   en:'Banded',           ja:'バンデッド傾向',      zh:'条带倾向',
    alias:['banded','밴디드'] },
  { id:'highgold', grp:'color',   ko:'하이 골드',     en:'High gold',        ja:'ハイゴールド',        zh:'高金',
    alias:['high gold','gold','하이골드'] },
  { id:'contrast', grp:'color',   ko:'하이 컨트라스트', en:'High contrast',  ja:'ハイコントラスト',    zh:'高对比',
    alias:['high contrast','contrast','컨트라스트'] },
  { id:'blushing', grp:'color',   ko:'블러싱',        en:'Blushing',         ja:'ブラッシング',        zh:'blushing',
    alias:['blushing','블러싱'] },
];

/* ============================================================================
   3. 콤보(디자이너) 명칭
   ----------------------------------------------------------------------------
   기본 유전형 이름(슈퍼 파스텔·아이보리·BEL 등)은 유전자 정의가 직접 처리하고,
   여기에는 '여러 유전자가 만나야 생기는' 이름만 둡니다.

   ▸ 다른 계산기(레오파드·펫테일)는 토큰이 <b>정확히 일치</b>할 때만 콤보명을
     붙입니다. 볼파이톤에서 그렇게 하면 이름이 거의 안 붙습니다 — 유전자를
     서너 개씩 얹는 종이라 '파스텔 + 스파이더' 만 있는 새끼가 드뭅니다.
     그리고 브리더들도 그렇게 부르지 않습니다. 엔치가 하나 더 붙으면
     'Enchi Bumblebee' 라고 부르지, 이름이 사라지지 않습니다.
     그래서 여기서는 <b>부분 일치</b>를 씁니다 — 콤보에 들어간 유전자를 빼고
     남은 것을 앞에 붙여 '엔치 범블비' 처럼 만듭니다. (bpComboName)

   ▸ 볼파이톤의 조합 이름은 수천 가지입니다. 여기에는 이름이 굳어져 여러
     브리더가 같은 뜻으로 쓰는 것만 담았습니다. 확실하지 않은 이름을 넣으면
     계산기가 없는 사실을 알려주게 됩니다. 아는 이름이 빠져 있으면 문의로
     알려주시면 확인하고 넣겠습니다.
   ============================================================================ */
const BP_COMBOS = [
  /* --- 파스텔 · 스파이더 · 핀스트라이프 계열 --- */
  { tokens:['pastel','spider'],              ko:'범블비', en:'Bumblebee', ja:'バンブルビー', zh:'Bumblebee', proof:'established' },
  { tokens:['super_pastel','spider'],        ko:'킬러비', en:'Killer Bee', ja:'キラービー', zh:'Killer Bee', proof:'established' },
  { tokens:['pastel','pinstripe'],           ko:'레몬 블라스트', en:'Lemon Blast', ja:'レモンブラスト', zh:'Lemon Blast', proof:'established' },
  { tokens:['super_pastel','pinstripe'],     ko:'슈퍼 블라스트', en:'Super Blast', ja:'スーパーブラスト', zh:'Super Blast', proof:'established' },
  { tokens:['spider','pinstripe'],           ko:'스피너', en:'Spinner', ja:'スピナー', zh:'Spinner', proof:'established' },
  /* 스피너블라스트는 범블비(2개)·스피너(2개)보다 토큰이 많아 우선 잡힙니다 */
  { tokens:['pastel','spider','pinstripe'],  ko:'스피너블라스트', en:'Spinnerblast', ja:'スピナーブラスト', zh:'Spinnerblast', proof:'established' },

  /* --- 파스텔 조합 --- */
  { tokens:['pastel','fire'],                ko:'파이어플라이', en:'Firefly', ja:'ファイアフライ', zh:'Firefly', proof:'established' },
  { tokens:['pastel','mojave'],              ko:'파스타브', en:'Pastave', ja:'パスタブ', zh:'Pastave', proof:'partial' },
  /* 시나몬과 블랙파스텔은 같은 자리의 대립유전자라 둘 다 퓨터로 부릅니다 */
  { tokens:['pastel','cinnamon'],            ko:'퓨터', en:'Pewter', ja:'ピューター', zh:'Pewter', proof:'established' },
  { tokens:['pastel','blackpastel'],         ko:'퓨터', en:'Pewter', ja:'ピューター', zh:'Pewter', proof:'established' },

  /* --- 파이볼드 조합 --- */
  { tokens:['cinnamon','piebald'],           ko:'판다 파이드', en:'Panda Pied', ja:'パンダパイド', zh:'Panda Pied', proof:'established' },
  { tokens:['blackpastel','piebald'],        ko:'판다 파이드', en:'Panda Pied', ja:'パンダパイド', zh:'Panda Pied', proof:'established' },
  { tokens:['lavender','piebald'],           ko:'드림시클', en:'Dreamsicle', ja:'ドリームシクル', zh:'Dreamsicle', proof:'established' },

  /* --- 열성끼리 만나 이름이 생기는 것 --- */
  { tokens:['albino','axvpi'],               ko:'스노우 (VPI)', en:'Snow (VPI)', ja:'スノー（VPI）', zh:'Snow（VPI）', proof:'established' },
  { tokens:['albino','axmj'],                ko:'스노우 (MJ)', en:'Snow (MJ)', ja:'スノー（MJ）', zh:'Snow（MJ）', proof:'established' },
  { tokens:['albino','candy'],               ko:'캔디노', en:'Candino', ja:'キャンディノ', zh:'Candino', proof:'established' },
  { tokens:['albino','toffee'],              ko:'토피노', en:'Toffino', ja:'トフィーノ', zh:'Toffino', proof:'established' },
];

/* 토큰 집합을 덮는 콤보 중 가장 많이 덮는 것을 고릅니다.
   같은 개수면 위 표에서 먼저 나오는 것이 이깁니다 — 그래서 표의 순서가
   그대로 우선순위입니다. */
function bpComboFor(tokenSet){
  let best=null;
  for(let i=0;i<BP_COMBOS.length;i++){
    const c=BP_COMBOS[i];
    if(c.tokens.length>tokenSet.size) continue;
    let ok=true;
    for(let j=0;j<c.tokens.length;j++){ if(!tokenSet.has(c.tokens[j])){ ok=false; break; } }
    if(!ok) continue;
    if(!best || c.tokens.length>best.tokens.length) best=c;
  }
  return best;
}
/* 콤보명 만들기 — 콤보에 안 들어간 유전자는 이름 앞에 붙입니다.
   tnames 는 '토큰 → 그 토큰이 화면에 쓰는 이름' 입니다 (bpCross 가 채웁니다).
   반환 { name, exact }  ·  exact=true 면 남은 유전자 없이 딱 그 콤보입니다. */
function bpComboName(tokenSet, tnames){
  const c=bpComboFor(tokenSet);
  if(!c) return null;
  const used={};
  c.tokens.forEach(function(t){ used[t]=1; });
  const extras=[];
  tokenSet.forEach(function(t){
    if(!used[t] && tnames && tnames[t]) extras.push(tnames[t]);
  });
  return { combo:c, name:extras.concat([tr(c)]).join(' '), exact:extras.length===0 };
}

/* ============================================================================
   3-1. 조합 단위 건강 경고
   각각은 살아 있는데 둘이 만나면 문제가 되는 조합입니다.
   결과 행의 토큰 집합이 tokens 를 모두 포함하면 경고와 건강주의를 붙입니다.
   ============================================================================ */
const BP_COMBO_RISKS = [
  { tokens:['spider','champagne'], code:'H5', health:true },
  { tokens:['spider','woma'],      code:'H7', health:true },
  { tokens:['spider','hgw'],       code:'H7', health:true },
  { tokens:['champagne','woma'],   code:'H7', health:true },
  { tokens:['champagne','hgw'],    code:'H7', health:true },
  { tokens:['woma','hgw'],         code:'H7', health:true },
];

/* ============================================================================
   4. 대표색 · 볼파이톤 일러스트
   ============================================================================ */
const BP_COLOR = {
  /* 불완전우성 */
  pastel:'#D3A954', super_pastel:'#E9C877', enchi:'#C29A50', super_enchi:'#DFBA6A',
  fire:'#B58B54', blkel:'#F6F4EE', vanilla:'#C3A374', super_vanilla:'#DDC49A',
  ghi:'#5E4B3A', super_ghi:'#3F3227', orangedream:'#D08A44', super_orangedream:'#E7A85E',
  chocolate:'#5B4132', super_chocolate:'#43301F', leopard:'#B99356', super_leopard:'#D1AE72',
  calico:'#C7B08A', super_calico:'#DECBA8', spotnose:'#A8854E', super_spotnose:'#C4A369',
  mahogany:'#7A5540', super_mahogany:'#5D3E2C', banana:'#E8A85E', super_banana:'#F3C489',
  hgw:'#B29A6A', super_hgw:'#CBB78E', acid:'#9C7E4E', confusion:'#A08A62', cypress:'#7E7052',
  /* BEL 복합 */
  mojave:'#8C7C68', lesser:'#B9A98C', butter:'#D8C48A', russo:'#A79376', special:'#C0B08F',
  phantom:'#6E6455', mystic:'#77705F', bel_white:'#F4F3EF', bel:'#F4F3EF',
  super_phantom:'#4E4739', super_mystic:'#585141',
  /* 옐로우벨리 복합 */
  yellowbelly:'#C6A85E', asphalt:'#6E6659', gravel:'#8A8171', specter:'#9C9078', ivory:'#F0E7CF',
  /* 시나몬 자리 */
  cinnamon:'#6A4C34', blackpastel:'#463A2E', super_cinny:'#332A22',
  /* 열성 */
  albino:'#F0D07E', ultramel:'#D8A868', ultra:'#E4BC73',
  candy:'#E7B9A8', toffee:'#D79A70',
  piebald:'#F2EDE2', clown:'#8A6A45', ghost:'#B79A6C', desertghost:'#A08052',
  geneticstripe:'#B08C50', lavender:'#EFD9A8', caramel:'#C99A56',
  axvpi:'#8C8C8C', axmj:'#8C8C8C', axtsk:'#8C8C8C', axjolliff:'#8C8C8C',
  monsoon:'#7E6A50', sunset:'#B3603C', tristripe:'#A5854E', puzzle:'#B69B6E',
  /* 우성 */
  pinstripe:'#C0964E', spider:'#C09B62', super_spider:'#D8B98C',
  champagne:'#B98F63', super_champagne:'#D3B08A', woma:'#C2A268', super_woma:'#D8BE90',
  desert:'#B08E5E',
  /* 라인브리딩 형질 */
  reduced:'#A08862', aberrant:'#A9905F', banded:'#967E5E',
  highgold:'#D9A93F', contrast:'#6B5A42', blushing:'#E0CBA8',
};

/* 결과 행의 토큰 → 그림 정보 */
function bpProfile(tokens, traits){
  const t=new Set(tokens||[]), p=new Set(traits||[]);
  const has=function(x){return t.has(x);}, hasT=function(x){return p.has(x);};

  let base='#8A6A45', blotch='#33281C';        // 야생형 갈색 + 짙은 무늬
  if(hasT('highgold'))  base='#B08A44';
  if(has('yellowbelly')||has('gravel')||has('asphalt')||has('specter')) base='#8E7148';
  if(has('enchi')||has('super_enchi'))         base='#BF9A55';
  if(has('leopard')||has('super_leopard'))     base='#B08850';
  if(has('spotnose')||has('super_spotnose'))   base='#A8854E';
  if(has('mojave')||has('russo')||has('special')||has('lesser')||has('butter')) base='#A8977A';
  if(has('phantom')||has('mystic'))            base='#6E6455';
  if(has('super_phantom')||has('super_mystic'))base='#4E4739';
  if(has('pinstripe'))                         base='#B08D4E';
  if(has('spider'))                            base='#BE9A62';
  if(has('champagne'))                         base='#BE9670';
  if(has('woma'))                              base='#C2A268';
  if(has('desert'))                            base='#B08E5E';
  if(has('hgw')||has('super_hgw'))             base='#B29A6A';
  if(has('mahogany'))                          base='#7A5540';
  if(has('chocolate')||has('super_chocolate')) base='#57402F';
  if(has('cinnamon')||has('blackpastel'))      base='#5A4232';
  if(has('ghi'))                               base='#5E4B3A';
  if(has('super_ghi')||has('super_cinny'))     base='#372C22';
  if(has('ghost')||has('desertghost'))         base='#B79A6C';
  if(has('pastel'))                            base='#D3A954';
  if(has('super_pastel'))                      base='#E9C877';
  if(has('orangedream')||has('super_orangedream')) base='#D08A44';
  if(has('banana')||has('super_banana'))       base='#E8A85E';
  if(has('sunset'))                            base='#B3603C';
  if(has('caramel'))                           base='#C99A56';
  if(has('ultra'))                             base='#E4BC73';
  if(has('ultramel'))                          base='#DFB273';
  if(has('lavender'))                          base='#EFD9A8';
  if(has('albino'))                            base='#F0D07E';
  if(has('candy')||has('toffee')||has('candy_toffee')) base='#EBC4AE';
  /* 아잔틱은 노란색소가 빠집니다 — 위에서 정한 색을 회색으로 끕니다 */
  const axan = has('axvpi')||has('axmj')||has('axtsk')||has('axjolliff');
  if(axan){ base = has('albino') ? '#EDEAE4' : '#8E8C88'; }
  /* 흰 개체 */
  const leucistic = has('bel')||has('bel_white')||has('blkel')||has('ivory');
  if(leucistic) base='#F6F4EE';

  if(has('albino')||has('lavender')||has('candy')||has('toffee')) blotch='#D9A45E';
  else if(has('ultra')||has('ultramel')||has('caramel')) blotch='#B07C3E';
  else if(axan) blotch='#3C3C3C';
  else if(has('ghost')||has('desertghost')) blotch='#7C6242';

  const eye = (has('bel')||has('bel_white')) ? '#6FA8CC'
            : (has('albino')||has('lavender')||has('candy')||has('toffee')) ? '#C4544A'
            : (has('ultra')||has('ultramel')||has('caramel')) ? '#9A5A3A'
            : '#241D16';

  return {
    base, blotch, eye,
    plain:   leucistic,
    pied:    has('piebald'),
    reduced: has('clown')||has('spider')||has('pinstripe')||has('geneticstripe')||has('super_cinny')||hasT('reduced'),
    striped: has('geneticstripe')||has('pinstripe'),
    faded:   has('super_pastel')||has('ghost')||has('desertghost')||has('super_vanilla'),
  };
}

/* 파라메트릭 볼파이톤 SVG — 똬리를 튼(공처럼 말린) 모습 */
function ballSVG(pf, w){
  const b=pf.base, ink=pf.blotch;
  let s='<svg class="gecko" viewBox="0 0 140 76" width="'+w+'" height="'+Math.round(w*76/140)+'" aria-hidden="true">';
  /* 몸통 — 바깥 고리 · 안쪽 고리 */
  s+='<circle cx="70" cy="39" r="27" fill="none" stroke="'+b+'" stroke-width="13"/>';
  s+='<circle cx="70" cy="39" r="14" fill="none" stroke="'+b+'" stroke-width="11"/>';
  /* 무늬 */
  if(!pf.plain){
    const op = pf.faded ? .38 : .72;
    const ring=function(r,half,n,ph){
      let o='';
      for(let i=0;i<n;i++){
        const a=(i/n)*Math.PI*2+ph, x=70+Math.cos(a)*r, y=39+Math.sin(a)*r;
        const deg=(a*180/Math.PI)+90;
        o+='<ellipse cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" rx="'+(pf.reduced?2.4:4.2).toFixed(1)
          +'" ry="'+half.toFixed(1)+'" fill="'+ink+'" opacity="'+op+'" transform="rotate('
          +deg.toFixed(1)+' '+x.toFixed(1)+' '+y.toFixed(1)+')"/>';
      }
      return o;
    };
    if(pf.striped){
      /* 등줄 — 고리를 따라 이어지는 가는 선 */
      s+='<circle cx="70" cy="39" r="27" fill="none" stroke="'+ink+'" stroke-width="3" opacity="'+op+'"/>';
      s+='<circle cx="70" cy="39" r="14" fill="none" stroke="'+ink+'" stroke-width="2.6" opacity="'+op+'"/>';
    }else{
      s+=ring(27,5.4,pf.reduced?7:11,0.28);
      s+=ring(14,4.6,pf.reduced?4:7,0.9);
    }
  }
  /* 파이볼드 — 흰 구간이 불규칙하게 끼어듭니다 */
  if(pf.pied){
    s+='<circle cx="70" cy="39" r="27" fill="none" stroke="#FAF8F2" stroke-width="13.4" stroke-dasharray="26 44 16 84"/>';
    s+='<circle cx="70" cy="39" r="14" fill="none" stroke="#FAF8F2" stroke-width="11.4" stroke-dasharray="20 32"/>';
  }
  /* 머리 — 똬리 한가운데에 얹혀 있습니다 */
  s+='<ellipse cx="70" cy="40" rx="13" ry="9.4" fill="'+b+'"/>';
  s+='<path d="M57,40 Q60,35.6 65,36" stroke="'+b+'" stroke-width="3" fill="none" stroke-linecap="round"/>';
  s+='<circle cx="64.4" cy="35.8" r="2.5" fill="'+pf.eye+'"/><circle cx="64.4" cy="44.2" r="2.5" fill="'+pf.eye+'"/>';
  s+='<circle cx="63.7" cy="35.1" r=".8" fill="rgba(255,255,255,.6)"/><circle cx="63.7" cy="43.5" r=".8" fill="rgba(255,255,255,.6)"/>';
  return s+'</svg>';
}

/* ============================================================================
   5. 계산 엔진
   ----------------------------------------------------------------------------
   상태 표기
     2대립유전자 : 'nn'(없음) / 'het'(한 개) / 'mm'(두 개)
     다대립 자리 : 'a|b' (야생형은 'n')  · 기본값은 'n|n'
   ============================================================================ */
const BP_STATE = { A:{}, B:{} };
function bpDefaultState(g){ return g.kind==='multi' ? 'n|n' : 'nn'; }
function bpResetState(){
  BP_ALL_GENES().forEach(function(g){
    BP_STATE.A[g.id]=bpDefaultState(g); BP_STATE.B[g.id]=bpDefaultState(g);
  });
  BP_TRAITS.forEach(function(t){ BP_STATE.A[t.id]='no'; BP_STATE.B[t.id]='no'; });
}
bpResetState();
/* 고르지 않은 상태인지 — 'nn' 과 'n|n' 을 한 번에 봅니다 */
function bpIsIdle(g, side){ return BP_STATE[side][g.id]===bpDefaultState(g); }

function bpGcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){var t=b;b=a%b;a=t;}return a||1;}

/* --- 배우자(gamete) 분포 --- */
function bpGametes(g, state){
  if(g.kind==='multi'){
    const ab=String(state||'n|n').split('|');
    const a=ab[0]||'n', b=ab[1]||'n';
    if(a===b){ const o={}; o[a]=1; return o; }
    const o={}; o[a]=0.5; o[b]=0.5; return o;
  }
  if(state==='nn')  return {N:1};
  if(state==='het') return {N:0.5, m:0.5};
  return {m:1};
}
/* --- 유전형 키 정규화 (대립유전자 우선순위대로 정렬) --- */
function bpGenoKey(g, x, y){
  if(g.kind==='multi'){
    const rank=bpRank(g);
    return (rank.indexOf(x)<=rank.indexOf(y)) ? (x+'|'+y) : (y+'|'+x);
  }
  if(x==='N'&&y==='N') return 'NN';
  if(x==='m'&&y==='m') return 'mm';
  return 'Nm';
}
/* --- 부모 두 상태 → 새끼 유전형 확률 --- */
function bpGenoDist(g, sA, sB){
  const A=bpGametes(g,sA), B=bpGametes(g,sB), out={};
  Object.keys(A).forEach(function(x){ Object.keys(B).forEach(function(y){
    const k=bpGenoKey(g,x,y);
    out[k]=(out[k]||0)+A[x]*B[y];
  });});
  return out;
}

/* --- 다대립 자리의 조합 이름 만들기 ----------------------------------------
   pairs 에 적어 둔 이름이 있으면 그것을 쓰고, 없으면 규칙으로 만듭니다.
     · 같은 대립유전자 두 개  → '슈퍼 ○○'  (열성 자리에서는 그냥 '○○')
     · 서로 다른 두 개        → '○○ ○○' (열성 자리에서는 '(컴파운드)' 표시)
   BEL 복합만 예외 규칙이 있습니다 — 흰 계열 둘이 만나면 언제나 BEL 입니다.  */
function bpPairInfo(g, a, b){
  const rank=bpRank(g);
  const key=(rank.indexOf(a)<=rank.indexOf(b)) ? (a+'|'+b) : (b+'|'+a);
  const A=bpAllele(g,a), B=bpAllele(g,b);
  const named = g.pairs && g.pairs[key];
  if(named) return {
    name:tr(named), token:named.token||null,
    warn:named.warn || (g.pairDefault&&g.pairDefault.warn) || null,
    health:!!(named.health || (g.pairDefault&&g.pairDefault.health)),
    nonViable:!!named.nonViable };

  /* BEL 복합 — 흰 계열끼리는 무엇이 만나든 블루아이 루시스틱 */
  if(g.id==='bel' && A.grp==='w' && B.grp==='w'){
    const nm={ ko:'블루아이 루시스틱 (BEL)', en:'Blue Eyed Leucistic (BEL)',
               ja:'ブルーアイリューシスティック（BEL）', zh:'蓝眼白化（BEL）' };
    return { name:tr(nm), token:'bel', warn:null, health:false, nonViable:false };
  }

  const dflt=g.pairDefault||{};
  let name;
  if(a===b){
    name = g.visibleHet ? (aff('sup')+tr(A)) : tr(A);
  }else{
    const joined = LANG==='en' ? (tr(A)+' '+tr(B)) : (tr(A)+' '+tr(B));
    name = g.visibleHet ? joined : (joined + (LANG==='ko' ? ' (컴파운드)' : LANG==='ja' ? '（コンパウンド）' : LANG==='zh' ? '（复合）' : ' (compound)'));
  }
  return { name:name, token:(a===b ? (g.visibleHet? 'super_'+a : a) : null),
           warn:dflt.warn||null, health:!!dflt.health, nonViable:!!dflt.nonViable };
}

/* --- 유전형 → 표시 정보 --- */
function bpGenoInfo(g, key){
  if(g.kind==='multi'){
    const ab=key.split('|'), a=ab[0], b=ab[1];
    if(a==='n' && b==='n') return { name:null, token:null, isHet:false, warn:null, health:false, nonViable:false };
    const one = (a==='n') ? b : (b==='n') ? a : null;
    if(one!==null){
      const al=bpAllele(g,one);
      if(g.visibleHet) return { name:tr(al), token:al.token||one, isHet:false,
                                warn:al.warn||null, health:!!al.health, nonViable:false };
      /* 열성 자리 — 겉으로는 노멀인 보인자 */
      return { name:aff('het')+tr(al), token:null, isHet:true, hetOf:tr(al),
               warn:null, health:false, nonViable:false };
    }
    const p=bpPairInfo(g,a,b);
    return { name:p.name, token:p.token, isHet:false, warn:p.warn, health:p.health, nonViable:p.nonViable };
  }
  if(key==='NN') return { name:null, token:null, isHet:false, warn:null, health:false, nonViable:false };
  if(g.type==='rec'){
    if(key==='Nm') return { name:gHet(g), token:null, isHet:true, hetOf:gName(g),
                            warn:null, health:false, nonViable:false };
    /* 비주얼(동형)일 때만 붙는 경고·건강 표시. 헷에는 붙이지 않습니다 —
       붙이면 헷 개체까지 문제가 있는 것처럼 읽힙니다. */
    return { name:gName(g), token:g.id, isHet:false,
             warn:g.warnOnVisual||null, health:!!g.healthOnVisual, nonViable:false };
  }
  if(g.type==='incdom'){
    if(key==='Nm') return { name:gName(g), token:g.id, isHet:false,
                            warn:g.warnOnVisible||null, health:!!g.healthOnVisible, nonViable:false };
    return { name:gSuper(g), token:g.supToken||('super_'+g.id), isHet:false,
             warn:g.warnOnSuper||g.warnOnVisible||null,
             health:!!(g.healthOnSuper||g.healthOnVisible), nonViable:!!g.superNonViable };
  }
  /* dom */
  if(key==='mm' && g.superNonViable){
    return { name:gSuper(g), token:null, isHet:false,
             warn:g.warnOnSuper||null, health:false, nonViable:true };
  }
  if(key==='Nm') return { name:gName(g), token:g.id, isHet:false,
                          warn:g.warnOnVisible||null, health:!!g.healthOnVisible, nonViable:false };
  /* 겉모습은 1카피와 2카피가 같지만, 유전형 기준 표에서는 구분해 보여줍니다 */
  return { name: gName(g)+' ('+bpT().copy2+')', token:g.id, isHet:false,
           warn:g.warnOnVisible||null, health:!!g.healthOnVisible, nonViable:false };
}

/* --- 표현형(비주얼) 버킷 : 눈에 보이는 것만 행으로, 헷은 보인자 정보로 --- */
function bpVisualBuckets(g, sA, sB){
  const d=bpGenoDist(g,sA,sB), out=[];
  if(g.kind==='multi'){
    /* 보이는 유전형은 행으로, 안 보이는 유전형(노멀·헷)은 하나로 묶습니다.
       헷은 종류가 여럿일 수 있어(헷 알비노 · 헷 울트라멜) 배열로 모읍니다. */
    let invis=0; const hetMap={};
    Object.keys(d).forEach(function(k){
      if(d[k]<=0) return;
      const i=bpGenoInfo(g,k);
      if(i.isHet){ invis+=d[k]; hetMap[i.hetOf]=(hetMap[i.hetOf]||0)+d[k]; return; }
      if(!i.name){ invis+=d[k]; return; }
      out.push({ prob:d[k], name:i.name, token:i.token, hets:[],
                 warn:i.warn, nonViable:i.nonViable, health:i.health });
    });
    if(invis>0){
      const hets=Object.keys(hetMap).map(function(n){ return { name:n, p:hetMap[n]/invis }; });
      out.push({ prob:invis, name:null, token:null, warn:null, nonViable:false, hets:hets });
    }
    return out;
  }
  if(g.type!=='rec'){
    Object.keys(d).forEach(function(k){
      if(d[k]<=0) return;
      const i=bpGenoInfo(g,k);
      out.push({ prob:d[k], name:i.name, token:i.token, hets:[],
                 warn:i.warn, nonViable:i.nonViable, health:i.health });
    });
    /* 우성은 1카피와 2카피의 겉모습이 같으므로 표현형 기준에서는 합칩니다.
       단 동형이 비생존인 형질(스파이더 등)은 합치면 안 됩니다 — 살아 있는
       개체와 부화하지 못하는 개체가 한 줄로 묶여 버립니다. */
    if(g.type==='dom'){
      const vis=out.filter(function(o){return o.name && !o.nonViable;});
      const rest=out.filter(function(o){return !(o.name && !o.nonViable);});
      if(vis.length){
        const p=vis.reduce(function(s,o){return s+o.prob;},0);
        return rest.concat([{ prob:p, name:gName(g), token:g.id, hets:[],
                              warn:g.warnOnVisible||null, health:!!g.healthOnVisible, nonViable:false }]);
      }
    }
    return out;
  }
  /* 열성 */
  const mm=d.mm||0, NN=d.NN||0, Nm=d.Nm||0, nv=NN+Nm;
  if(mm>0){
    const vi=bpGenoInfo(g,'mm');
    out.push({ prob:mm, name:vi.name, token:vi.token, hets:[],
               warn:vi.warn, health:vi.health, nonViable:false });
  }
  if(nv>0) out.push({ prob:nv, name:null, token:null, warn:null, nonViable:false,
                      hets: Nm>0 ? [{ name:gName(g), p:Nm/nv }] : [] });
  return out;
}
/* --- 유전형 버킷 : 헷도 별개의 결과 행으로 --- */
function bpGenoBuckets(g, sA, sB){
  const d=bpGenoDist(g,sA,sB), out=[];
  Object.keys(d).forEach(function(k){
    if(d[k]<=0) return;
    const i=bpGenoInfo(g,k);
    out.push({ prob:d[k], name:i.name, token:i.token, hets:[],
               warn:i.warn, nonViable:i.nonViable, health:i.health });
  });
  return out;
}

/* 콤보 이름 붙이기는 위쪽 bpComboFor / bpComboName 이 합니다 (3장).
   다른 계산기에 있는 '정확히 일치할 때만' 매칭은 여기 두지 않습니다 —
   볼파이톤에서는 그 방식이면 이름이 거의 안 붙습니다. 3장 머리말 참고. */

/* --- 조합 건강 경고 (토큰 집합이 포함하기만 하면) --- */
function bpComboRisks(tokenSet){
  const out=[];
  BP_COMBO_RISKS.forEach(function(r){
    if(r.tokens.every(function(t){return tokenSet.has(t);})) out.push(r);
  });
  return out;
}
/* --- 부모의 현재 선택 → 비주얼 토큰 집합 + 토큰별 이름 ---
   이름까지 모으는 이유는 결과 행과 같습니다 — 부모 카드에도 '엔치 범블비'
   처럼 콤보명을 붙이려면 콤보에 안 들어간 유전자의 이름이 필요합니다. */
function bpParentInfo(side){
  const s=new Set(), names={};
  const put=function(tok, nm){ if(!tok) return; s.add(tok); names[tok]=nm; };
  BP_ALL_GENES().forEach(function(g){
    const v=BP_STATE[side][g.id];
    if(!v || v===bpDefaultState(g)) return;
    if(g.kind==='multi'){
      const i=bpGenoInfo(g, v);
      put(i.token, i.name);
      return;
    }
    if(g.type==='rec'){ if(v==='mm') put(g.id, gName(g)); }
    else if(g.type==='incdom'){
      if(v==='het') put(g.id, gName(g));
      else if(v==='mm') put(g.supToken||('super_'+g.id), gSuper(g));
    }
    else { put(g.id, gName(g)); }
  });
  return { tokens:s, tnames:names };
}
function bpParentTokens(side){ return bpParentInfo(side).tokens; }

/* --- 모프 이름 조립 --- */
function bpJoin(parts){
  if(!parts.length) return null;
  return parts.join(LANG==='en' ? ' · ' : '·');
}

/* --- 메인 계산 --------------------------------------------------------------
   genes : 계산에 포함할 유전자 배열
   mode  : 'visual' 표현형 기준 / 'geno' 유전형 기준
   반환  : { prob, parts, tokens, hets, warns, nonViable, health }[]         */
function bpCross(genes, mode){
  let rows=[{ prob:1, parts:[], tokens:new Set(), tnames:{}, hets:[], warns:new Set(),
              nonViable:false, health:false }];
  genes.forEach(function(g){
    const list = (mode==='geno')
      ? bpGenoBuckets(g, BP_STATE.A[g.id], BP_STATE.B[g.id])
      : bpVisualBuckets(g, BP_STATE.A[g.id], BP_STATE.B[g.id]);
    const next=[];
    rows.forEach(function(r){ list.forEach(function(b){
      if(b.prob<=0) return;
      const tokens=new Set(r.tokens); if(b.token) tokens.add(b.token);
      const warns=new Set(r.warns);   if(b.warn) warns.add(b.warn);
      /* 콤보명을 만들 때 '남은 유전자' 를 이름으로 적어야 해서, 토큰마다
         화면에 쓰는 이름을 같이 들고 다닙니다. */
      let tnames=r.tnames;
      if(b.token){ tnames={}; for(var k in r.tnames) tnames[k]=r.tnames[k]; tnames[b.token]=b.name; }
      next.push({
        prob:r.prob*b.prob,
        parts: b.name ? r.parts.concat([b.name]) : r.parts,
        tokens:tokens, tnames:tnames, warns:warns,
        hets: r.hets.concat(b.hets||[]),
        nonViable: r.nonViable || !!b.nonViable,
        health: r.health || !!b.health,
      });
    });});
    rows=next;
  });
  /* 조합 단위 건강 경고 — 행이 다 만들어진 뒤에 확인합니다 */
  rows.forEach(function(r){
    bpComboRisks(r.tokens).forEach(function(x){
      r.warns.add(x.code); if(x.health) r.health=true;
    });
  });
  return rows.filter(function(r){return r.prob>1e-12;}).sort(function(a,b){return b.prob-a.prob;});
}

/* 분수 표기 (1/4, 3/16 …) */
function bpFrac(prob){
  let best={n:0,d:1,err:1};
  for(let d=1; d<=4096; d++){
    const n=Math.round(prob*d), err=Math.abs(prob-n/d);
    if(err<best.err-1e-12){ best={n:n,d:d,err:err}; }
    if(err<1e-12) break;
  }
  const g=bpGcd(best.n,best.d);
  return (best.n/g)+'/'+(best.d/g);
}

/* ============================================================================
   6. 주의가 필요한 조합 · 유전 건강 이슈
   ----------------------------------------------------------------------------
   볼파이톤은 '치사 동형'과 '신경 증상'이 함께 있는 종이라, 다른 계산기보다
   이 표가 깁니다. level:'high' 는 번식 계획을 다시 볼 만한 것,
   'med' 는 알고 시작해야 하는 것입니다.
   ============================================================================ */
const BP_DANGER = {
  H1:{ level:'med',
    ko:'⚠️ <b>스파이더 워블</b> — 스파이더 유전자를 가진 개체는 정도 차이가 있을 뿐 <b>모두 신경 증상(워블)을 보입니다.</b> 머리가 흔들리고, 먹이를 정확히 물지 못하거나 심하면 몸이 돌아가는 코르크스크루가 나옵니다. 조용한 환경·집게 급여로 생활은 가능하지만 <b>유전자에서 분리할 수는 없습니다.</b> 결과의 모든 스파이더 개체가 여기 해당합니다.',
    en:'⚠️ <b>Spider wobble</b> — every animal carrying Spider shows <b>some degree of neurological symptoms.</b> Head tremor, missed strikes, and in bad cases corkscrewing. A quiet setup and tong feeding make it manageable, but it <b>cannot be bred out of the gene.</b> Every Spider in the results is affected.',
    ja:'⚠️ <b>スパイダーウォブル</b> — スパイダー遺伝子を持つ個体は程度の差こそあれ<b>すべて神経症状（ウォブル）を示します。</b>頭が震え、餌を正確に捕らえられず、重い場合は体が回るコークスクリューが出ます。静かな環境やピンセット給餌で飼育は可能ですが、<b>遺伝子から切り離すことはできません。</b>結果に出るすべてのスパイダーが該当します。',
    zh:'⚠️ <b>Spider 摇头症</b> — 携带 Spider 基因的个体<b>无一例外都有不同程度的神经症状</b>：头部震颤、扑食不准，严重时出现螺旋扭转。安静环境与镊子喂食可以让它们正常生活，但<b>无法从基因中剥离</b>。结果中的所有 Spider 个体都适用。' },

  H2:{ level:'high',
    ko:'🛑 <b>스파이더 × 스파이더</b> — 자손의 약 25%가 슈퍼 스파이더(동형)입니다. <b>지금까지 살아서 부화한 슈퍼 스파이더는 확인되지 않았습니다</b> — 알 속에서 발생이 멈추는 것으로 봅니다. 결과에는 비생존으로 표시되며, 알 수가 줄어드는 것을 감수해야 하는 조합입니다.',
    en:'🛑 <b>Spider × Spider</b> — about 25% of offspring are homozygous. <b>No Super Spider has ever been confirmed to hatch alive</b>; they are believed to die in the egg. The result is shown as non-viable, and you should expect a reduced clutch.',
    ja:'🛑 <b>スパイダー × スパイダー</b> — 約25%がホモになります。<b>生きて孵化したスーパースパイダーは確認されていません</b> — 卵内で発生が止まると考えられています。結果には生存困難と表示され、有効な卵数が減ることを前提にした組み合わせです。',
    zh:'🛑 <b>Spider × Spider</b> — 约25%的后代为纯合。<b>至今没有确认存活孵化的超级 Spider</b>，一般认为其在蛋内停止发育。结果标注为不存活，此配对需接受有效出壳数减少。' },

  H3:{ level:'med',
    ko:'⚠️ <b>챔페인 신경 증상</b> — 챔페인 개체에서도 워블과 덕빌(주둥이가 뭉툭해짐)이 보고됩니다. 스파이더보다는 정도가 약한 편이지만 개체 차이가 큽니다.',
    en:'⚠️ <b>Champagne neurological signs</b> — wobble and duckbilling are also reported in Champagne animals. Generally milder than Spider, but it varies a lot between individuals.',
    ja:'⚠️ <b>シャンパンの神経症状</b> — シャンパン個体でもウォブルやダックビル（吻部が丸く潰れる）が報告されます。スパイダーよりは軽い傾向ですが個体差が大きいです。',
    zh:'⚠️ <b>Champagne 神经症状</b> — Champagne 个体也有摇头与鸭嘴（吻部变钝）的报告。通常比 Spider 轻，但个体差异很大。' },

  H4:{ level:'high',
    ko:'🛑 <b>챔페인 × 챔페인</b> — 자손의 약 25%가 슈퍼 챔페인(동형)입니다. <b>슈퍼 챔페인은 부화하지 못합니다.</b> 결과에 비생존으로 표시됩니다.',
    en:'🛑 <b>Champagne × Champagne</b> — about 25% of offspring are homozygous. <b>Super Champagne does not hatch.</b> It is shown as non-viable in the results.',
    ja:'🛑 <b>シャンパン × シャンパン</b> — 約25%がホモになります。<b>スーパーシャンパンは孵化しません。</b>結果に生存困難と表示されます。',
    zh:'🛑 <b>Champagne × Champagne</b> — 约25%的后代为纯合。<b>超级 Champagne 无法孵化。</b>结果中标注为不存活。' },

  H5:{ level:'high',
    ko:'🛑 <b>챔페인 + 스파이더 조합</b> — 이 조합으로 나온 개체는 <b>부화 직후 폐사하거나 스스로 먹지 못할 정도의 신경 증상을 보인다는 보고가 반복</b>되고 있습니다. 두 유전자 각각도 신경 증상을 갖고 있는데, 겹치면 훨씬 심해집니다. <b>이 조합은 권장되지 않습니다.</b>',
    en:'🛑 <b>Champagne + Spider</b> — animals from this combination are <b>repeatedly reported to die shortly after hatching, or to be too neurologically affected to feed on their own.</b> Both genes carry neurological issues on their own and stacking them makes it far worse. <b>This pairing is not recommended.</b>',
    ja:'🛑 <b>シャンパン＋スパイダーの組み合わせ</b> — この組み合わせの個体は<b>孵化直後に死亡する、あるいは自力で摂餌できないほどの神経症状を示すという報告が繰り返し</b>あります。両遺伝子ともに神経症状を持ち、重なると著しく悪化します。<b>この組み合わせは推奨されません。</b>',
    zh:'🛑 <b>Champagne + Spider 组合</b> — 该组合的个体<b>反复被报告在孵出后不久死亡，或神经症状严重到无法自主进食</b>。两个基因各自即带有神经问题，叠加后会大幅加重。<b>不建议进行此配对。</b>' },

  H6:{ level:'high',
    ko:'🛑 <b>워마 × 워마</b> — 자손의 약 25%가 슈퍼 워마(동형)입니다. <b>슈퍼 워마는 살아서 부화하지 않습니다.</b> 결과에 비생존으로 표시됩니다.',
    en:'🛑 <b>Woma × Woma</b> — about 25% of offspring are homozygous. <b>Super Woma does not hatch alive.</b> It is shown as non-viable in the results.',
    ja:'🛑 <b>ウーマ × ウーマ</b> — 約25%がホモになります。<b>スーパーウーマは生きて孵化しません。</b>結果に生存困難と表示されます。',
    zh:'🛑 <b>Woma × Woma</b> — 约25%的后代为纯合。<b>超级 Woma 无法存活孵化。</b>结果中标注为不存活。' },

  H7:{ level:'high',
    ko:'🛑 <b>신경 증상 유전자가 겹칩니다</b> — 스파이더 · 챔페인 · 워마 · 히든진 워마는 각각 워블이나 덕빌 보고가 있는 계열입니다. <b>둘 이상을 한 개체에 겹치면 증상이 더해지는 것으로 보고</b>됩니다. 스스로 먹지 못하는 개체가 나올 수 있으므로, 이런 조합을 계획한다면 급여 방식까지 미리 준비하세요.',
    en:'🛑 <b>Neurological genes are stacking</b> — Spider, Champagne, Woma and Hidden Gene Woma all have wobble or duckbilling reports. <b>Combining two or more in one animal is reported to compound the symptoms.</b> Animals that cannot feed themselves do occur, so plan your feeding approach before making this pairing.',
    ja:'🛑 <b>神経症状のある遺伝子が重なっています</b> — スパイダー・シャンパン・ウーマ・ヒドゥンジーンウーマはいずれもウォブルやダックビルの報告がある系統です。<b>1個体に2つ以上重なると症状が加算されると報告</b>されています。自力で摂餌できない個体が出ることがあるため、給餌方法まで用意してから計画してください。',
    zh:'🛑 <b>神经类基因发生叠加</b> — Spider、Champagne、Woma、Hidden Gene Woma 都有摇头或鸭嘴的报告。<b>在同一个体上叠加两个以上时，症状会累加</b>。可能出现无法自主进食的个体，若计划此类配对请提前准备喂食方式。' },

  H8:{ level:'high',
    ko:'🛑 <b>데저트 암컷 불임</b> — 이 조합은 데저트 개체를 낼 수 있습니다. <b>데저트 암컷은 사실상 번식이 불가능하다고 보고됩니다</b> — 배란은 하지만 산란까지 가지 못하거나 난포가 굳는 사례가 반복 보고되었고, 그 과정에서 암컷이 위험해지기도 합니다. <b>수컷은 정상적으로 번식합니다.</b> 이 유전자는 수컷 쪽으로만 이어가는 것이 일반적입니다.',
    en:'🛑 <b>Desert female infertility</b> — this pairing can produce Desert animals. <b>Desert females are reported to be effectively unable to reproduce</b>: they ovulate but fail to lay, or the follicles harden, and the female herself can be put at risk. <b>Males breed normally</b>, so the gene is usually carried on through males only.',
    ja:'🛑 <b>デザート雌の不妊</b> — この組み合わせはデザート個体を出す可能性があります。<b>デザートの雌はほぼ繁殖できないと報告されています</b> — 排卵しても産卵に至らない、卵胞が固まるといった事例が繰り返し報告され、その過程で雌自身が危険になることもあります。<b>雄は正常に繁殖します。</b>この遺伝子は雄側でのみ受け継ぐのが一般的です。',
    zh:'🛑 <b>Desert 雌性不育</b> — 此配对可能产出 Desert 个体。<b>Desert 雌性被报告基本无法繁殖</b>：会排卵但无法产卵，或卵泡硬化，过程中甚至危及母蛇。<b>雄性繁殖正常</b>，因此该基因通常只通过雄性延续。' },

  H9:{ level:'high',
    ko:'🛑 <b>시나몬 · 블랙파스텔의 슈퍼 상태</b> — 슈퍼 시나몬, 슈퍼 블랙파스텔, 시나몬 블랙파스텔에서 <b>덕빌(주둥이 변형) · 킹크(척추 꺾임) · 부화 실패</b>가 다른 조합보다 많이 보고됩니다. 살아서 부화해 잘 자라는 개체도 많지만, 이 조합을 계획한다면 그 비율을 감안하세요.',
    en:'🛑 <b>Super forms of Cinnamon / Black Pastel</b> — Super Cinnamon, Super Black Pastel and Cinnamon Black Pastel are reported to show <b>duckbilling, kinking and failure to hatch</b> more often than other combinations. Many do hatch and thrive, but factor the rate in before planning this pairing.',
    ja:'🛑 <b>シナモン・ブラックパステルのスーパー体</b> — スーパーシナモン、スーパーブラックパステル、シナモンブラックパステルでは<b>ダックビル（吻部の変形）・キンク（脊椎の屈曲）・孵化不全</b>が他より多く報告されます。無事に孵化して育つ個体も多いですが、計画する際はその割合を織り込んでください。',
    zh:'🛑 <b>Cinnamon／Black Pastel 的超级形态</b> — 超级 Cinnamon、超级 Black Pastel 与 Cinnamon Black Pastel 被报告出现<b>鸭嘴、脊椎扭结与孵化失败</b>的比例高于其他组合。也有很多能顺利孵化并健康成长，但计划此配对时请把该比例纳入考虑。' },

  H10:{ level:'med',
    ko:'⚠️ <b>캐러멜 알비노 킹크</b> — 이 조합은 캐러멜 알비노 비주얼을 낼 수 있습니다. 초기 계통에서 <b>킹크(척추가 꺾이는 변형)</b> 보고가 눈에 띄게 많았습니다. 아웃크로스로 개선을 시도한 계통도 있으니 <b>양쪽 부모의 계통 정보</b>를 확인하세요.',
    en:'⚠️ <b>Caramel Albino kinking</b> — this pairing can produce visual Caramel Albino. The early lines had a notably high rate of <b>kinking (spinal deformity)</b>. Some lines have been outcrossed to improve it, so check <b>the lineage of both parents</b>.',
    ja:'⚠️ <b>キャラメルアルビノのキンク</b> — この組み合わせはキャラメルアルビノのビジュアルを出す可能性があります。初期系統では<b>キンク（脊椎の変形）</b>の報告が目立って多くありました。アウトクロスで改善した系統もあるため、<b>両親の系統情報</b>を確認してください。',
    zh:'⚠️ <b>焦糖白化的脊椎扭结</b> — 此配对可能产出焦糖白化表现型。早期品系中<b>脊椎扭结</b>的报告明显偏多。部分品系已通过外血改善，请确认<b>父母双方的血统信息</b>。' },

  H11:{ level:'med',
    ko:'ℹ️ <b>히든진 워마(HGW)의 슈퍼폼</b>에 대해서는 보고가 엇갈립니다. 부화 사례가 있다는 이야기와, 결함이 있거나 살아남지 못한다는 이야기가 함께 있습니다. 이 계산기는 치사로 처리하지 않고 <b>건강주의</b>로만 표시합니다.',
    en:'ℹ️ Reports on the <b>homozygous form of Hidden Gene Woma (HGW)</b> conflict — some claim hatched supers, others report defects or failure to survive. This calculator does not treat it as lethal, only flags it as a <b>health concern</b>.',
    ja:'ℹ️ <b>ヒドゥンジーンウーマ（HGW）のスーパー体</b>については報告が分かれています。孵化例があるという話と、欠陥がある・生存しないという話が併存します。本計算機は致死とは扱わず<b>健康注意</b>としてのみ表示します。',
    zh:'ℹ️ 关于 <b>Hidden Gene Woma（HGW）的纯合超级体</b>，报告并不一致：既有孵出的说法，也有畸形或无法存活的报告。本计算器不按致死处理，仅标注<b>健康提示</b>。' },

  H12:{ level:'med',
    ko:'ℹ️ <b>색소가 줄어든 개체는 빛에 민감</b>합니다. 알비노 · 울트라멜 · 라벤더 알비노 · 캔디 · 토피처럼 눈의 색소까지 줄어든 계통은 강한 조명 아래에서 눈을 감고 있거나 은신처에서 나오지 않을 수 있습니다. 조도를 낮추고 그늘과 은신처를 넉넉히 만들어 주세요.',
    en:'ℹ️ <b>Reduced-pigment animals are light sensitive.</b> Lines with reduced eye pigment — Albino, Ultramel, Lavender Albino, Candy, Toffee — may keep their eyes shut under bright light or refuse to leave the hide. Lower the light level and provide plenty of shade and hides.',
    ja:'ℹ️ <b>色素が少ない個体は光に敏感</b>です。アルビノ・ウルトラメル・ラベンダーアルビノ・キャンディ・トフィーのように眼の色素まで減った系統は、強い照明下で目を閉じたりシェルターから出てこないことがあります。照度を下げ、日陰とシェルターを十分に用意してください。',
    zh:'ℹ️ <b>色素减少的个体对光敏感。</b>白化、Ultramel、薰衣草白化、Candy、Toffee 等连眼部色素也减少的品系，在强光下可能常闭眼或不愿离开躲避屋。请降低照度并提供充足遮蔽与躲避处。' },

  H13:{ level:'med',
    ko:'ℹ️ 이 결과에는 <b>유전 방식이 완전히 확립되지 않은 형질</b>이 포함되어 있습니다. 확률은 참고용 근사치이며, 실제 표현형은 다른 형질의 영향과 성장에 따른 색 변화로 달라질 수 있습니다.',
    en:'ℹ️ This result includes <b>a trait whose inheritance is not fully established</b>. The probabilities are an approximation for reference only, and the actual phenotype can be altered by other traits and by colour change as the animal grows.',
    ja:'ℹ️ この結果には<b>遺伝様式が完全には確立されていない形質</b>が含まれています。確率はあくまで参考値であり、実際の表現型は他の形質の影響や成長に伴う色変化によって変わる可能性があります。',
    zh:'ℹ️ 此结果包含<b>遗传方式尚未完全确立的性状</b>。所示概率仅供参考，实际表型可能受其他性状影响以及生长过程中的体色变化而改变。' },

  H14:{ level:'med',
    ko:'ℹ️ <b>바나나(코랄글로우)는 성염색체와 연관</b>되어 있습니다. 수컷이 어느 계통이냐에 따라 새끼의 성비와 바나나 발현이 한쪽으로 크게 치우칩니다(메일메이커·피메일메이커). <b>이 계산기는 성별을 계산하지 않으므로</b> 여기 확률은 성별을 무시한 값입니다.',
    en:'ℹ️ <b>Banana (Coral Glow) is sex-linked.</b> Depending on the sire’s line, the sex ratio and which hatchlings are Banana skew heavily to one side (male-maker / female-maker). <b>This calculator does not model sex</b>, so the odds here ignore it.',
    ja:'ℹ️ <b>バナナ（コーラルグロー）は性染色体と連鎖</b>しています。父個体の系統によって仔の性比とバナナの発現が大きく片寄ります（メールメーカー・フィメールメーカー）。<b>本計算機は性別を計算しない</b>ため、ここでの確率は性別を無視した値です。',
    zh:'ℹ️ <b>Banana（Coral Glow）与性染色体连锁。</b>视父本所属品系，后代性别比例与 Banana 的出现会明显偏向一侧（male-maker／female-maker）。<b>本计算器不计算性别</b>，因此这里的概率忽略性别。' },

  H15:{ level:'med',
    ko:'ℹ️ <b>열성 비주얼을 만들 때의 근친 누적</b> — 열성 형질을 빨리 비주얼로 만들려고 형제 교배를 반복하면, 유전자 자체와 별개로 <b>부화율 저하·성장 부진·기형</b> 같은 근친 약세가 나타날 수 있습니다. 같은 형질이라도 계통이 다른 개체를 섞어 두면 나중에 선택지가 넓어집니다.',
    en:'ℹ️ <b>Inbreeding when working toward recessive visuals</b> — repeatedly pairing siblings to reach visuals faster can bring inbreeding depression (<b>lower hatch rates, poor growth, deformities</b>) quite apart from the gene itself. Bringing in unrelated animals of the same trait keeps your options open later.',
    ja:'ℹ️ <b>劣性ビジュアルを作る際の近親累積</b> — 早くビジュアルを出そうと兄妹交配を繰り返すと、遺伝子自体とは別に<b>孵化率の低下・成長不良・奇形</b>といった近交弱勢が出ることがあります。同じ形質でも系統の異なる個体を混ぜておくと後の選択肢が広がります。',
    zh:'ℹ️ <b>培育隐性表现型时的近交累积</b> — 为尽快出表现型而反复同胞配对，可能带来与基因本身无关的近交衰退（<b>孵化率下降、生长不良、畸形</b>）。引入同性状但血缘不同的个体，后续选择会更宽裕。' },
};

/* 다대립 자리의 유전형 키에 야생형이 없는지 — 즉 '겉으로 보이는 조합'인지.
   ⚠️ key.indexOf('n')<0 으로 확인하면 안 됩니다. albino·cinnamon 처럼 대립유전자
      이름 안에 n 이 들어 있어서, 야생형이 없는데도 있다고 읽습니다. */
function bpNoWild(key){
  const p=String(key).split('|');
  return p.length===2 && p[0]!=='n' && p[1]!=='n';
}

/* 결과 전체에서 발생한 경고 코드 수집 */
function bpCollectWarnings(genes, rows){
  const codes=new Set();
  (rows||[]).forEach(function(r){ r.warns.forEach(function(w){ codes.add(w); }); });

  const gene=function(id){ return genes.filter(function(g){return g.id===id;})[0]; };
  /* 동형이 나올 수 있는지 (2대립유전자 전용) */
  const homoOf=function(id){
    const g=gene(id); if(!g) return 0;
    return bpGenoDist(g, BP_STATE.A[id], BP_STATE.B[id]).mm || 0;
  };
  /* 겉으로 보이는 개체가 나올 수 있는지 */
  const visibleOf=function(id){
    const g=gene(id); if(!g) return 0;
    const d=bpGenoDist(g, BP_STATE.A[id], BP_STATE.B[id]);
    if(g.type==='rec') return d.mm||0;
    return (d.Nm||0)+(d.mm||0);
  };

  if(visibleOf('spider')>0) codes.add('H1');
  if(homoOf('spider')>0)    codes.add('H2');
  if(visibleOf('champagne')>0) codes.add('H3');
  if(homoOf('champagne')>0)    codes.add('H4');
  if(homoOf('woma')>0)         codes.add('H6');
  if(visibleOf('desert')>0)    codes.add('H8');
  if(homoOf('hgw')>0)          codes.add('H11');

  /* 시나몬 자리 — 슈퍼 상태(동형·컴파운드)가 나올 수 있으면 H9 */
  const cin=gene('cinny');
  if(cin){
    const d=bpGenoDist(cin, BP_STATE.A.cinny, BP_STATE.B.cinny);
    let sup=0;
    Object.keys(d).forEach(function(k){ if(bpNoWild(k)) sup+=d[k]; });
    if(sup>0) codes.add('H9');
  }
  if(visibleOf('caramel')>0) codes.add('H10');
  if(visibleOf('banana')>0)  codes.add('H14');

  /* 색소 결핍 계열의 빛 민감성 */
  const albinoish=['lavender'];
  let pale = albinoish.some(function(id){ return visibleOf(id)>0; });
  ['albinolocus','candylocus'].forEach(function(id){
    const g=gene(id); if(!g) return;
    const d=bpGenoDist(g, BP_STATE.A[id], BP_STATE.B[id]);
    Object.keys(d).forEach(function(k){ if(d[k]>0 && bpNoWild(k)) pale=true; });
  });
  if(pale) codes.add('H12');

  /* 열성 비주얼이 나올 수 있으면 근친 누적 안내 */
  const recVisual = genes.some(function(g){
    if(g.kind==='multi' && !g.visibleHet){
      const d=bpGenoDist(g, BP_STATE.A[g.id], BP_STATE.B[g.id]);
      return Object.keys(d).some(function(k){ return d[k]>0 && bpNoWild(k); });
    }
    return g.type==='rec' && (bpGenoDist(g, BP_STATE.A[g.id], BP_STATE.B[g.id]).mm||0)>0;
  });
  if(recVisual) codes.add('H15');

  /* 미확정 형질이 계산에 포함되면 H13 */
  if(genes.some(function(g){return g.proof==='contested';})) codes.add('H13');

  const order=['H2','H4','H5','H6','H7','H8','H9','H1','H3','H10','H11','H12','H14','H15','H13'];
  return order.filter(function(c){return codes.has(c);})
              .map(function(c){ return { code:c, level:BP_DANGER[c].level, text:tr(BP_DANGER[c]) }; });
}

/* ============================================================================
   7. 검색 — 부모 카드의 검색창이 씁니다 (ball-ui.js)
   ----------------------------------------------------------------------------
   4개 언어 이름과 alias 를 한 줄로 이어 두고 부분 문자열로 찾습니다.
   공백·가운뎃점·괄호는 지웁니다. '옐로우 벨리' 로 쳐도 '옐로우벨리' 가 걸리게.
   ============================================================================ */
function bpNorm(s){
  return String(s||'').toLowerCase().replace(/[\s·・.()（）\-_/]/g,'');
}
function bpHaystack(o){
  if(o._hay) return o._hay;
  let parts=[o.ko,o.en,o.ja,o.zh].concat(o.alias||[]);
  if(o.sup)     parts=parts.concat([o.sup.ko,o.sup.en,o.sup.ja,o.sup.zh]);
  if(o.alleles) o.alleles.forEach(function(a){
    parts=parts.concat([a.ko,a.en,a.ja,a.zh]).concat(a.alias||[]);
  });
  if(o.pairs)   Object.keys(o.pairs).forEach(function(k){
    const p=o.pairs[k]; parts=parts.concat([p.ko,p.en,p.ja,p.zh]);
  });
  o._hay = parts.filter(Boolean).map(bpNorm).join('|');
  return o._hay;
}
/* 유전자(또는 라인브리딩 형질)가 검색어에 걸리는지 */
function bpMatches(o, q){
  if(!q) return true;
  return bpHaystack(o).indexOf(bpNorm(q)) >= 0;
}
