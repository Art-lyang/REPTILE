var LANG = (typeof LANG!=='undefined') ? LANG : 'ko';

/* ---- 공용 헬퍼 ---- */
function escapeHtml(s){return String(s).replace(/[&<>"]/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x];});}
function gName(g){ return g[LANG]||g.en; }
function gSuper(g){ return g['super'+LANG.charAt(0).toUpperCase()+LANG.slice(1)]||g.superEn; }
function pName(p){ return p[LANG]||p.en; }
function leoNorm(value){
  return String(value||'').toLowerCase().replace(/[\s·・.()（）\-_/&]/g,'');
}
function leoHaystack(item){
  if(!item) return '';
  const names=[
    item.id,
    item.ko, item.en, item.zh, item.ja,
    item.superKo, item.superEn, item.superZh, item.superJa
  ].concat(item.alias||[]);
  return names.filter(Boolean).map(leoNorm).join('|');
}
function leoMatches(item, query){
  if(!query) return true;
  return leoHaystack(item).indexOf(leoNorm(query))>=0;
}
function leoSearchKeeps(item, selected, query){
  return selected || !query || leoMatches(item, query);
}
var CORE_T = { ko:{normal:'노멀',visualTag:'비주얼',hetShort:'헷',superShort:'슈퍼폼'},
               en:{normal:'Normal',visualTag:'Visual',hetShort:'het',superShort:'Super form'},
               zh:{normal:'普通',visualTag:'表现',hetShort:'het',superShort:'超级形态'},
               ja:{normal:'ノーマル',visualTag:'ビジュアル',hetShort:'het',superShort:'スーパーフォーム'} };
if(typeof L!=='function'){ var L=function(){ return CORE_T[LANG]||CORE_T.ko; }; }
function tokenOptions(){ var o=[]; GENES.forEach(function(g){
  if(g.type==='incdom'){ o.push([g.id,gName(g)]); o.push(['super_'+g.id,gSuper(g)]); }
  else o.push([g.id,gName(g)]); }); return o; }
function morphNameOf(id){
  var g=GENES.filter(function(x){return x.id===id;})[0]; if(g) return gName(g);
  var q=POLY.filter(function(x){return x.id===id;})[0]; if(q) return pName(q);
  if(String(id).indexOf('super_')===0){ var g2=GENES.filter(function(x){return x.id===String(id).slice(6);})[0]; if(g2) return gSuper(g2); }
  return id; }

/* ===== 레오파드 모프 계산기 · 공용 코어 (index.html / breeding.html 공용) ===== */

/* --- 서비스 식별자 -------------------------------------------------------
   량 스튜디오 안에서 여러 도구가 같은 Supabase 를 씁니다.
   접속·조합 로그에 이 값을 함께 남겨야 관리자에서 서비스별로 나눠 볼 수 있어요.
   새 도구를 만들면 각자 다른 값을 쓰세요. (자세한 내용은 docs/STUDIO.md)   */
const SERVICE_ID = 'gecko';

/* --- 화면 노출 스위치 ------------------------------------------------------
   기능은 그대로 살아 있고 화면에서만 감춥니다. true 로 바꾸면 즉시 다시 보입니다.
   SHOW_PREMIUM_UI : 프리미엄 코드 버튼 + 프리미엄 혜택 안내
   SHOW_DONATE     : 개발자 후원 버튼 + 후원 계좌 안내
   ※ 프리미엄을 이미 보유한 회원의 [브리딩 관리] 진입은 막지 않습니다.      */
const SHOW_PREMIUM_UI = false;
const SHOW_DONATE     = false;
/* SHOW_ACCOUNT_UI : 로그인 / 내 정보 버튼
   SHOW_LEGAL_LINKS: 이용약관 · 개인정보처리방침 링크 + 쿠키 안내 바
   ※ 링크만 감출 뿐 terms.html 은 그대로 접근 가능합니다.
     개인정보처리방침은 공개 의무가 있으므로 파일을 지우지 마세요.
     정식 공개(회원가입 오픈) 전에 반드시 true 로 되돌려야 합니다. */
const SHOW_ACCOUNT_UI  = true;
const SHOW_LEGAL_LINKS = false;

/* --- 후원 계좌 --- */
const DONATE_BANK = '카카오뱅크';
const DONATE_ACCT = '3333-17-6613203';

/* --- 광고 ---------------------------------------------------------------
   AD_ENABLED : 광고 영역 표시 여부 (프리미엄 회원에게는 자동으로 숨겨짐)
   AD_HTML    : 광고 스크립트/태그를 여기에 붙여넣으면 그대로 렌더링됩니다.
                비워두면 "이 자리에 광고 코드를 넣을 수 있어요" 안내만 보입니다.

   ⚠️ 광고를 실제로 넣기 전에 반드시 확인할 것
   1. 광고 네트워크가 행태정보(쿠키)를 수집하면 개인정보처리방침의
      「5. 쿠키 및 유사 기술」에 광고 사업자명·수집 항목·거부 방법을 추가해야 합니다.
      (terms.html 에 관련 문단이 준비되어 있으니 사업자명만 채우면 됩니다)
   2. 만 14세 미만 이용자에게는 맞춤형 광고를 노출하지 않도록 설정해야 합니다.
   3. 애드센스 등 대부분의 네트워크는 자체 도메인·충분한 콘텐츠를 요구합니다.  */
const AD_ENABLED  = false;
const AD_HTML     = '';
const AD_PROVIDER = '';    // 예: 'Google AdSense' — 채우면 개인정보처리방침 안내에 표시됨
/* --- 백엔드(Supabase) 접속 정보는 assets/studio-config.js 로 옮겼습니다.
   여기 있으면 이 파일을 읽지 않는 다른 도구(크레스티드 등)가 못 씁니다.
   그 파일을 이 파일보다 먼저 읽어야 합니다. --- */
/* ============================================================================== */
const MORPH_IMG = {};       // 모프별 업로드 이미지 URL (관리자에서 채워짐)


/* ================= 멘델 유전자 정의 =================
   type: rec(열성) / incdom(불완전우성) / dom(우성)
   이름 키: ko / en / zh / ja , 슈퍼형: superKo/superEn/superZh/superJa */
const GENES = [
  {id:'tremper',  type:'rec', family:'albino', ko:'트램퍼 알비노', en:'Tremper Albino', zh:'特伦伯白化', ja:'トレンパーアルビノ'},
  {id:'bell',     type:'rec', family:'albino', ko:'벨 알비노', en:'Bell Albino', zh:'贝尔白化', ja:'ベルアルビノ'},
  {id:'rainwater',type:'rec', family:'albino', ko:'레인워터 알비노', en:'Rainwater Albino', zh:'雨水白化', ja:'レインウォーターアルビノ'},
  {id:'eclipse',  type:'rec', family:'eye', ko:'이클립스', en:'Eclipse', zh:'日食眼', ja:'エクリプス'},
  {id:'marble',   type:'rec', family:'eye', ko:'마블 아이', en:'Marble Eye', zh:'大理石眼', ja:'マーブルアイ'},
  {id:'blizzard', type:'rec', family:'patternless', ko:'블리자드', en:'Blizzard', zh:'暴雪', ja:'ブリザード'},
  {id:'murphy',   type:'rec', family:'patternless', ko:'머피 패턴리스', en:'Murphy Patternless', zh:'墨菲无纹', ja:'マーフィーパターンレス'},
  {id:'noir',     type:'rec', family:'melanisticgene', risk:true, ko:'느와르', en:'Noir', zh:'Noir（黑化）', ja:'ノワール'},
  /* 라인브리딩에 '자이언트' 로 있던 것을 열성 유전 형질로 옮기고 이름을
     '슈퍼자이언트' 로 바꿨습니다. 이제 확률 계산 대상이고, 한 개만 있으면
     헷 보인자로 표시됩니다. */
  {id:'giant',    type:'rec', family:'size', ko:'슈퍼자이언트', en:'Super Giant', zh:'超级巨人', ja:'スーパージャイアント'},
  {id:'macksnow', type:'incdom', family:'snowcolor', ko:'맥스노우', en:'Mack Snow', zh:'麦克雪花', ja:'マックスノー',
     superKo:'슈퍼 스노우', superEn:'Super Snow', superZh:'超级雪花', superJa:'スーパースノー'},
  {id:'lemonfrost',type:'incdom', family:'snowcolor', risk:true, ko:'레몬 프로스트', en:'Lemon Frost', zh:'柠檬霜', ja:'レモンフロスト',
     superKo:'슈퍼 레몬 프로스트', superEn:'Super Lemon Frost', superZh:'超级柠檬霜', superJa:'スーパーレモンフロスト'},
  {id:'enigma',   type:'dom', family:'dominant', risk:true, ko:'에니그마', en:'Enigma', zh:'谜 (Enigma)', ja:'エニグマ'},
  {id:'wy',       type:'dom', family:'dominant', ko:'화이트앤옐로우(WY)', en:'White & Yellow', zh:'白与黄 (W&Y)', ja:'ホワイト&イエロー'},
];

const LEO_LOCKED_GENE_LABELS = {wy:{ko:'화이트앤옐로우(WY)'}};
const LEO_LOCKED_GENE_STRUCTURE = {noir:{type:'rec',family:'melanisticgene',risk:true}};
const LEO_REQUIRED_GENE_IDS = new Set(['noir']);
function leoApplyLockedGeneLabels(gene){
  const labels=LEO_LOCKED_GENE_LABELS[gene.id];
  if(!labels)return gene;
  Object.keys(labels).forEach(key=>{gene[key]=labels[key];});
  return gene;
}
function leoApplyLockedGeneStructure(gene){
  const fields=LEO_LOCKED_GENE_STRUCTURE[gene.id];
  if(!fields)return gene;
  Object.keys(fields).forEach(key=>{gene[key]=fields[key];});
  return gene;
}
function leoMergeRequiredGenes(loadedGenes,builtinGenes){
  const loadedIds=new Set(loadedGenes.map(gene=>gene.id));
  return loadedGenes.concat(builtinGenes.filter(gene=>LEO_REQUIRED_GENE_IDS.has(gene.id)&&!loadedIds.has(gene.id)));
}

/* ================= 형질 계열 (families) — 표시 순서 & 유전방식 배지 ================= */
const FAMILIES = [
  {id:'albino', type:'rec', ko:'알비노 계열', en:'Albino', zh:'白化系', ja:'アルビノ系',
     desc:{ko:'색소 결핍 · 서로 다른 유전자(비대립)', en:'Pigment-loss · separate, non-allelic genes', zh:'色素缺失 · 不同基因（非等位）', ja:'色素欠乏 · 別々の遺伝子（非対立）'}},
  {id:'eye', type:'rec', ko:'눈 모프', en:'Eye', zh:'眼部形态', ja:'眼のモルフ',
     desc:{ko:'눈 색·구조 변이', en:'Eye color / structure', zh:'眼睛颜色 / 结构', ja:'眼の色・構造'}},
  {id:'patternless', type:'rec', ko:'패턴리스·화이트', en:'Patternless & White', zh:'无纹·白', ja:'パターンレス・白',
     desc:{ko:'패턴·색소 감소', en:'Reduced pattern / pigment', zh:'斑纹 / 色素减少', ja:'模様・色素の減少'}},
  {id:'melanisticgene', type:'rec', ko:'멜라니스틱 유전 형질', en:'Melanistic gene', zh:'黑化基因', ja:'黒化遺伝形質',
     desc:{ko:'열성 멜라닌 형질', en:'Recessive melanistic trait', zh:'隐性黑化性状', ja:'劣性の黒化形質'}},
  {id:'size', type:'rec', ko:'크기', en:'Size', zh:'体型', ja:'サイズ',
     desc:{ko:'몸 크기 · 두 개가 모두 모여야 발현', en:'Body size · needs two copies', zh:'体型 · 需两个拷贝', ja:'体の大きさ · 2つ揃って発現'}},
  {id:'snowcolor', type:'incdom', ko:'스노우·색', en:'Snow & Color', zh:'雪花·颜色', ja:'スノー・カラー',
     desc:{ko:'지색·색 변이 (슈퍼폼 발현)', en:'Ground / color (homozygous = super)', zh:'底色 / 颜色（纯合 = 超级）', ja:'地色・色（スーパーフォームあり）'}},
  {id:'dominant', type:'dom', ko:'우성 형질', en:'Dominant traits', zh:'显性性状', ja:'優性形質',
     desc:{ko:'한 쪽만 있어도 발현', en:'Expressed from a single copy', zh:'单拷贝即表现', ja:'片方だけでも発現'}},
  {id:'poly', type:'poly', ko:'라인브리딩', en:'Line-bred', zh:'线育', ja:'ラインブリード',
     desc:{ko:'다인자 · 확률 계산 불가', en:'Polygenic · not probability-based', zh:'多基因 · 无法计算概率', ja:'多因子 · 確率計算不可'}},
];

/* ================= 라인브리딩(폴리제닉) 형질 ================= */
const POLY = [
  {id:'tangerine', line:'tangerine', ko:'탠저린', en:'Tangerine', zh:'橘化', ja:'タンジェリン'},
  {id:'mandarin',  line:'tangerine', ko:'만다린', en:'Mandarin', zh:'曼达林', ja:'マンダリン'},
  {id:'blood',     line:'tangerine', ko:'블러드', en:'Blood', zh:'血红', ja:'ブラッド'},
  {id:'inferno',   line:'tangerine', ko:'인페르노', en:'Inferno', zh:'地狱火', ja:'インフェルノ'},
  {id:'sunglow',   line:'tangerine', implies:{tremper:'mm'}, ko:'썬글로우', en:'Sunglow', zh:'阳光', ja:'サングロー'},
  {id:'electric',  line:'tangerine', ko:'일렉트릭', en:'Electric', zh:'电光', ja:'エレクトリック'},
  {id:'atomic',    line:'tangerine', ko:'아토믹', en:'Atomic', zh:'原子', ja:'アトミック'},
  {id:'tangerinered',line:'tangerine', ko:'레드', en:'Red', zh:'红', ja:'レッド'},
  /* 레드데빌 — 붉은 발색 라인. 텐져린 계열로 묶었습니다.

     ⚠️ implies — 이 라인은 벨 알비노를 물고 있습니다.
     붉은 발색 자체는 다인자라 확률 계산 대상이 아니지만, 벨 알비노는
     열성 유전자라 계산 대상입니다. 그래서 레드데빌을 골랐는데 벨 알비노가
     꺼져 있으면 확률이 조용히 틀립니다 — 노멀과 붙여도 최소 50% 는 het
     벨인데 화면에는 0% 로 나옵니다.

     'mm' 이 아니라 'het' 인 이유. 벨 알비노는 열성이라 라인 안에 겉으로
     드러나지 않는 보인자가 섞여 있습니다. 레드데빌이라고 전부 비주얼
     알비노는 아니라는 뜻이고, 모든 레드데빌에 대해 확실히 말할 수 있는
     선은 '최소 보인자' 까지입니다.

     그래서 implies 는 **최소값** 으로 다룹니다 (genoRank 참고).
     내 개체가 눈으로 봐서 알비노면 벨 알비노 칩을 '비주얼' 로 올리면
     되고, 그때 경고는 안 뜹니다 — 어긋난 게 아니라 더 진한 경우니까요.
     반대로 아예 꺼버리면 확률이 실제보다 낮다고 알려줍니다. */
  {id:'reddevil',  line:'tangerine', implies:{bell:'het'},
     ko:'레드데빌', en:'Red Devil', zh:'红魔', ja:'レッドデビル'},
  /* 에머릴드 + 텐져린 계열. 예전에는 따로 보기도 했지만 요즘은
     텐져린 계열로 취급합니다. (현직 브리더 확인) */
  {id:'emerine',   line:'tangerine', ko:'에머린', en:'Emerine', zh:'翡翠橘', ja:'エメリン'},
  {id:'yellow',    ko:'옐로우', en:'Yellow', zh:'黄', ja:'イエロー'},
  {id:'green',     ko:'그린', en:'Green', zh:'绿', ja:'グリーン'},
  {id:'lavender',  ko:'라벤더', en:'Lavender', zh:'薰衣草', ja:'ラベンダー'},
  {id:'white',     ko:'화이트', en:'White', zh:'白', ja:'ホワイト'},
  {id:'hypo',      ko:'하이포', en:'Hypo', zh:'少黑色素', ja:'ハイポ'},
  {id:'superhypo', ko:'슈퍼하이포', en:'Super Hypo', zh:'超级少黑', ja:'スーパーハイポ'},
  {id:'melanistic',line:'melanistic', ko:'멜라니스틱', en:'Melanistic', zh:'黑化', ja:'メラニスティック'},
  {id:'blacknight',line:'melanistic', ko:'블랙나이트', en:'Black Night', zh:'黑夜', ja:'ブラックナイト'},
  /* 카본 — 흑화 계열 라인. 블랙나이트·차콜·블랙펄과 같은 부류로,
     단일 유전자가 아니라 검은 발색을 골라 고정한 라인입니다. */
  {id:'carbon',    line:'melanistic', ko:'카본', en:'Carbon', zh:'碳黑', ja:'カーボン'},
  {id:'dark',      line:'tangerine', ko:'다크', en:'Dark', zh:'暗色', ja:'ダーク'},
  {id:'carrottail',ko:'캐럿 테일', en:'Carrot Tail', zh:'胡萝卜尾', ja:'キャロットテール'},
  {id:'carrothead',ko:'캐럿 헤드', en:'Carrot Head', zh:'胡萝卜头', ja:'キャロットヘッド'},
  /* 발디 — 머리에 반점이 없는 개체. 슈퍼하이포처럼 반점이 적은 개체를
     골라 붙여 고정한 라인이라 확률 계산 대상이 아닙니다.
     캐럿헤드·볼드스트라이프처럼 계열(line)을 두지 않습니다 — 다른 형질과
     섞였을 때 되돌아갈 상위 라인이 없습니다. */
  {id:'baldy',     ko:'발디', en:'Baldy', zh:'无斑头', ja:'ボールディ'},
  {id:'boldstripe',ko:'볼드 스트라이프', en:'Bold Stripe', zh:'粗条纹', ja:'ボールドストライプ'},
  {id:'stripe',    ko:'스트라이프', en:'Stripe', zh:'条纹', ja:'ストライプ'},
  {id:'jungle',    ko:'정글', en:'Jungle', zh:'丛林', ja:'ジャングル'},
  {id:'ghost',     ko:'고스트', en:'Ghost', zh:'幽灵', ja:'ゴースト'},

  /* ── 흑화·다크 계열 라인 (브리더 '레게 태영이' 제공, 2026-07-29) ──────
     "전부 라인. 얘들끼리 나오는 조합이나 뭐끼리 붙이면 만들어지고
      그런 건 없다" 고 확인받았습니다. 그래서 전부 POLY 이고 COMBOS 에는
     넣지 않습니다. 확률 계산에는 들어가지 않습니다.

     gt · gg · gct.m · gct.s · BMD 는 약칭 그대로 씁니다. 브리더 사이에서
     쓰이는 이름이라 억지로 풀어 쓰면 오히려 못 알아봅니다. 정식 명칭을
     아시면 알려주세요 — ko/en/zh/ja 만 바꾸면 됩니다. */
  {id:'charcoal',  line:'melanistic', ko:'차콜', en:'Charcoal', zh:'木炭黑', ja:'チャコール'},
  {id:'blackblood',line:'melanistic', ko:'블랙블러드', en:'Black Blood', zh:'黑血', ja:'ブラックブラッド'},
  {id:'blackpearl',line:'melanistic', ko:'블랙펄', en:'Black Pearl', zh:'黑珍珠', ja:'ブラックパール'},
  {id:'pepper',    line:'melanistic', ko:'페퍼', en:'Pepper', zh:'胡椒', ja:'ペッパー'},
  /* 아프간은 원래 아종(E. m. afghanicus) 이름이지만, 국내에서는 흑화
     라인명으로 씁니다. 여기서도 라인으로 다룹니다. */
  {id:'afghan',    line:'melanistic', ko:'아프간', en:'Afghan', zh:'阿富汗', ja:'アフガン'},
  {id:'gt',        ko:'GT', en:'GT', zh:'GT', ja:'GT'},
  {id:'gg',        ko:'GG', en:'GG', zh:'GG', ja:'GG'},
  {id:'gctm',      ko:'GCT.M', en:'GCT.M', zh:'GCT.M', ja:'GCT.M'},
  {id:'gcts',      ko:'GCT.S', en:'GCT.S', zh:'GCT.S', ja:'GCT.S'},
  {id:'bmd',       ko:'BMD', en:'BMD', zh:'BMD', ja:'BMD'},
  /* '차콜카본다크만다린' 은 넣지 않습니다. 하나의 라인이 아니라
     차콜 + 카본 + 다크 + 만다린 을 붙여 쓴 이름이고, 넷 다 이미 위에
     따로 있습니다. 항목으로 만들면 같은 개체를 두 가지 방법으로 고를 수
     있게 되고, 그때 결과 이름이 서로 달라집니다. */

  /* ── 붉은 계열 라인 (같은 출처) ──────────────────────────────────── */
  {id:'crimson',       line:'tangerine', ko:'크림슨', en:'Crimson', zh:'深红', ja:'クリムゾン'},
  {id:'bordeaux',      line:'tangerine', ko:'보르도', en:'Bordeaux', zh:'波尔多', ja:'ボルドー'},
  {id:'darktangerine', line:'tangerine', ko:'다크텐져린', en:'Dark Tangerine', zh:'暗橘', ja:'ダークタンジェリン'},

  /* ── 알비노를 물고 있는 라인 ──────────────────────────────────────
     레드데빌과 같은 구조입니다. implies 설명은 위 reddevil 항목 참고.

     스모그는 트램퍼 알비노, 오렌지 스모그는 벨 알비노가 발현된 라인으로
     계산합니다. 따라서 다른 모프와 교배하면 해당 알비노의 보인자가
     자손에게 100% 전달됩니다.

     ⚠️ 트램퍼와 벨은 서로 다른 유전자입니다. 스모그(비주얼 트램퍼) 와
        오렌지 스모그(비주얼 벨) 를 붙여도 알비노는 안 나옵니다 — 더블 het
        가 될 뿐입니다. 계산기가 이 부분을 이미 안내합니다. */
  {id:'smog',       implies:{tremper:'mm'}, ko:'스모그', en:'Smog', zh:'烟灰', ja:'スモッグ'},
  {id:'orangesmog', implies:{bell:'mm'},    ko:'오렌지 스모그', en:'Orange Smog', zh:'橙烟灰', ja:'オレンジスモッグ'},
];

/* ================= 위험 조합 메시지 ================= */
const DANGER = {
  lemonfrost:{
    het:{level:'med',
      ko:'⚠️ 새끼에 <b>레몬 프로스트</b>가 나올 수 있습니다. 레몬 프로스트는 홑성(het)이라도 피부 종양(홍색소종, iridophoroma) 발생 위험이 높은 모프입니다.',
      en:'⚠️ Offspring may be <b>Lemon Frost</b>. Even heterozygous Lemon Frost carries a high risk of skin tumors (iridophoromas).',
      zh:'⚠️ 后代可能出现<b>柠檬霜</b>。柠檬霜即使为杂合(het)也有较高的皮肤肿瘤（虹彩细胞瘤）风险。',
      ja:'⚠️ 仔に<b>レモンフロスト</b>が出る可能性があります。レモンフロストはヘテロ(het)でも皮膚腫瘍（虹色素胞腫）のリスクが高いモルフです。'},
    super:{level:'high',
      ko:'🛑 <b>슈퍼 레몬 프로스트(슈퍼폼)</b>가 나올 수 있습니다. 슈퍼폼은 종양 발생률이 매우 높아 심각한 건강 문제를 일으키며, 이 조합의 브리딩은 권장되지 않습니다.',
      en:'🛑 <b>Super Lemon Frost (homozygous)</b> is possible. Supers have a very high tumor rate and serious welfare issues — this pairing is not recommended.',
      zh:'🛑 可能出现<b>超级柠檬霜（纯合）</b>。超级个体肿瘤发生率极高，会导致严重健康问题，不建议进行此配对繁殖。',
      ja:'🛑 <b>スーパーレモンフロスト（ホモ）</b>が出る可能性があります。スーパーは腫瘍発生率が非常に高く深刻な健康問題を招くため、この組み合わせの繁殖は推奨されません。'},
  },
  enigma:{
    any:{level:'med',
      ko:'⚠️ 새끼에 <b>에니그마</b>가 나올 수 있습니다. 에니그마는 신경 증상(ES: 균형 장애, 빙글빙글 돌기, 머리 기울임, 스트레스 취약)이 동반될 수 있습니다.',
      en:'⚠️ Offspring may be <b>Enigma</b>. Enigma can carry neurological symptoms (ES): balance loss, circling, head tilting, and stress sensitivity.',
      zh:'⚠️ 后代可能出现<b>谜 (Enigma)</b>。Enigma 可能伴随神经症状（ES：失衡、打转、歪头、易受应激）。',
      ja:'⚠️ 仔に<b>エニグマ</b>が出る可能性があります。エニグマは神経症状（ES：平衡障害・旋回・頭の傾き・ストレスに弱い）を伴うことがあります。'},
    double:{level:'high',
      ko:'🛑 <b>에니그마 × 에니그마</b> 교배입니다. 증상이 더 심한 개체가 나올 수 있어 이 조합은 일반적으로 권장되지 않습니다.',
      en:'🛑 This is an <b>Enigma × Enigma</b> pairing. It can produce more severely affected individuals and is generally discouraged.',
      zh:'🛑 这是<b>谜 × 谜 (Enigma × Enigma)</b> 配对，可能产生症状更严重的个体，通常不推荐。',
      ja:'🛑 <b>エニグマ × エニグマ</b>の交配です。より症状の重い個体が出ることがあり、一般的に推奨されません。'},
  },
  noir:{
    any:{level:'med',
      ko:'⚠️ <b>느와르</b> 비주얼 개체는 난임 또는 번식력 저하 이슈가 있을 수 있습니다. 개체차가 있으므로 교배 전 계통과 번식 이력을 함께 확인해 주세요.',
      en:'⚠️ Visual <b>Noir</b> animals may have reduced fertility or infertility. This varies by animal, so review lineage and breeding history before pairing.',
      zh:'⚠️ <b>Noir</b> 表现型个体可能存在生育力下降或不育问题。个体差异较大，配对前请同时确认血统与繁殖记录。',
      ja:'⚠️ <b>ノワール</b>のビジュアル個体には、繁殖力の低下や不妊の問題が見られる場合があります。個体差があるため、交配前に系統と繁殖履歴も確認してください。'},
  },
};

/* ================= 콤보(디자이너) 명칭 — 업로드 모프표 기반 =================
   tokens: 새끼가 '비주얼'로 발현한 성분 집합과 정확히 일치하면 해당 콤보명 표시.
   토큰: rec = 유전자id(mm), incdom = id(Nm)/super_id(mm), dom = id(비주얼)
   ※ 라인브리딩(탠저린·하이포·TUG·패턴리스 스트라이프)이 필요한 콤보는 자동 인식 제외 */
const COMBOS = [
  {tokens:['super_macksnow','eclipse'], ko:'갤럭시 (토탈 이클립스)', en:'Galaxy (Total Eclipse)'},
  {tokens:['super_macksnow','eclipse','wy'], ko:'유니버스', en:'Universe'},
  {tokens:['super_macksnow','eclipse','blizzard'], ko:'갤럭시 블리자드', en:'Galaxy Blizzard'},
  {tokens:['super_macksnow','eclipse','enigma'], ko:'갤럭시 이니그마', en:'Galaxy Enigma', vintage:true},
  {tokens:['super_macksnow','eclipse','wy','enigma'], ko:'유니그마', en:'Unigma', vintage:true},
  {tokens:['macksnow','eclipse','enigma'], ko:'블랙홀', en:'Black Hole', vintage:true},
  {tokens:['super_macksnow','murphy'], ko:'슈퍼 플래티넘', en:'Super Platinum'},
  {tokens:['super_macksnow','enigma'], ko:'달마시안', en:'Dalmatian', vintage:true},
  {tokens:['eclipse','enigma'], ko:'비 (Bee)', en:'Bee', vintage:true},
  {tokens:['blizzard','murphy'], ko:'바나나 블리자드', en:'Banana Blizzard'},
  /* 알비노 3계통 + 이클립스는 각각 이름이 따로 있습니다.
     벨→레이다, 레인워터→타이푼, 트램퍼→랩터. 앞의 둘만 있고 랩터가 빠져 있었습니다.
     (랩터를 기반으로 하는 디아블로 블랑코는 이미 아래에 들어가 있었습니다) */
  {tokens:['tremper','eclipse'], ko:'랩터', en:'RAPTOR'},
  {tokens:['tremper','eclipse','macksnow'], ko:'스노우 랩터', en:'Snow RAPTOR'},
  /* 슈퍼맥스노우가 섞인 것은 '슈퍼 스노우 랩터' 가 아니라 그냥 '슈퍼 랩터' 로 부릅니다.
     레이다·타이푼 계열(슈퍼 레이다·슈퍼 타이푼)과 같은 방식입니다. */
  {tokens:['tremper','eclipse','super_macksnow'], ko:'슈퍼 랩터', en:'Super RAPTOR'},
  {tokens:['tremper','eclipse','enigma'], ko:'노바', en:'Nova'},
  {tokens:['tremper','blizzard'], ko:'블레이징 블리자드', en:'Blazing Blizzard'},
  {tokens:['tremper','blizzard','eclipse'], ko:'디아블로 블랑코', en:'Diablo Blanco'},
  {tokens:['tremper','murphy'], ko:'알비노 루시스틱', en:'Albino Patternless', vintage:true},
  {tokens:['tremper','murphy','eclipse'], ko:'앰버', en:'Amber'},
  {tokens:['tremper','murphy','eclipse','macksnow'], ko:'스노우 플레이크', en:'Snowflake', vintage:true},
  {tokens:['bell','eclipse'], ko:'레이다 (레이더)', en:'Raida (Radar)'},
  {tokens:['bell','eclipse','macksnow'], ko:'스노우 레이다', en:'Snow Raida'},
  {tokens:['bell','eclipse','super_macksnow'], ko:'슈퍼 레이다', en:'Super Raida'},
  {tokens:['bell','eclipse','macksnow','enigma'], ko:'소나 (스텔스)', en:'Sona (Stealth)', vintage:true},
  {tokens:['bell','eclipse','macksnow','enigma','wy'], ko:'칼사이트', en:'Calcite', vintage:true},
  {tokens:['bell','eclipse','murphy'], ko:'프레데터', en:'Predator'},
  {tokens:['bell','blizzard'], ko:'벨 블레이징 블리자드', en:'Bell Blazing Blizzard'},
  {tokens:['bell','blizzard','eclipse'], ko:'화이트 나이트', en:'White Knight'},
  {tokens:['bell','wy'], ko:'오로라', en:'Aurora', vintage:true},
  {tokens:['rainwater','eclipse'], ko:'타이푼', en:'Typhoon'},
  {tokens:['rainwater','eclipse','macksnow'], ko:'스노우 타이푼', en:'Snow Typhoon'},
  {tokens:['rainwater','eclipse','super_macksnow'], ko:'슈퍼 타이푼', en:'Super Typhoon'},
  {tokens:['rainwater','eclipse','macksnow','enigma'], ko:'크리스탈', en:'Crystal', vintage:true},
  {tokens:['rainwater','blizzard'], ko:'레인워터 블리자드', en:'Rainwater Blizzard'},
  {tokens:['rainwater','eclipse','blizzard'], ko:'허리케인', en:'Hurricane', vintage:true},
  {tokens:['rainwater','eclipse','murphy'], ko:'싸이클론', en:'Cyclone', vintage:true},
  {tokens:['rainwater','eclipse','murphy','enigma'], ko:'볼텍스', en:'Vortex', vintage:true},
];
function partToken(p){
  const g=p.g, geno=p.geno;
  if(g.type==='rec')    return geno==='mm'? g.id : null;
  if(g.type==='incdom') return geno==='mm'? 'super_'+g.id : geno==='Nm'? g.id : null;
  return (geno==='mm'||geno==='Nm')? g.id : null; // dom
}
function matchCombo(tokenSet){
  for(const c of COMBOS){
    if(c.tokens.length!==tokenSet.size) continue;
    if(c.tokens.every(t=>tokenSet.has(t))) return c;
  }
  return null;
}

/* ================= 라인브리딩 조합 명칭 =================
   라인브리딩 형질도 새끼의 이름에 들어갑니다. 예전에는 참고용 칩으로만 보여주고
   결과는 '노멀' 로 뒀는데, 현직 브리더 확인 결과 그렇게 쓰지 않습니다.

     블나 × 블나            → 블랙나이트   (같은 라인이면 그 라인 이름)
     멜라니스틱 × 텐져린     → 멜라텐져린   (섞이면 고유 이름)

   두 번째처럼 단순히 이름을 잇는 게 아니라 따로 부르는 이름이 있는 조합은
   아래 표에 둡니다. 표에 없으면 형질 이름을 그대로 나열합니다.
   조합이 더 확인되면 관리자 → 레오 콤보 에서 추가할 수 있습니다. */
const POLY_COMBOS = [
  {tokens:['melanistic','tangerine'], ko:'멜라텐져린', en:'Mela Tangerine',
   zh:'黑化橘化', ja:'メラタンジェリン'},
];
/* 형질 id 를 계열로 바꿉니다. 계열이 없으면 자기 자신이 계열입니다.
   브리더가 말하는 기준은 개별 형질이 아니라 계열입니다.
   만다린은 텐져린 계열, 블랙나이트는 멜라니스틱 계열이라
   만다린 × 블랙나이트 도 멜라텐져린으로 불립니다. */
function polyLineOf(id){
  const p=POLY.filter(x=>x.id===id)[0];
  return (p && p.line) || id;
}
function matchPolyCombo(idSet){
  const lines=new Set([...idSet].map(polyLineOf));
  for(const c of POLY_COMBOS){
    if(c.tokens.length!==lines.size) continue;
    if(c.tokens.every(t=>lines.has(t))) return c;
  }
  return null;
}
/* ================= 시각화: 모프 대표색 + 게코 일러스트 ================= */
const GCOLOR={
  tremper:'#F0E0BE',bell:'#F0E0BE',rainwater:'#F0E0BE',
  eclipse:'#2B2724',marble:'#8A7C64',
  blizzard:'#EDEBE4',murphy:'#CFC7A0',
  noir:'#24211F',
  macksnow:'#D8D4C8',super_macksnow:'#F1F0EC',lemonfrost:'#EEE7A8',super_lemonfrost:'#F5EEB0',
  enigma:'#DCC78C',wy:'#F1EBD2',
  tangerine:'#E8944A',mandarin:'#E07A2E',blood:'#C7502A',
  inferno:'#E0662E',sunglow:'#F0A83C',electric:'#E8B94A',atomic:'#C7D06A',
  tangerinered:'#C7502A',emerine:'#BFC06A',yellow:'#EBD06A',green:'#A9B27A',lavender:'#B9A7C4',
  white:'#EFEDE7',hypo:'#EED089',superhypo:'#EBD07E',
  melanistic:'#4A4640',blacknight:'#332F2A',dark:'#6E655A',
  carrottail:'#E8944A',carrothead:'#E8944A',boldstripe:'#E4C883',stripe:'#DEC98C',
  jungle:'#C9B77A',ghost:'#D9D7CF',giant:'#D8CDB0'
};
// 발현 토큰 → 게코 겉모습 프로필
function geckoProfile(tokens){
  const t=new Set(tokens||[]), has=x=>t.has(x);
  let base='#E4C883';                 // 노멀 탠
  if(has('murphy')) base='#CFC7A0';
  if(has('macksnow')) base='#D8D4C8';
  if(has('lemonfrost')) base='#EEE7A8';
  if(has('blizzard')) base='#EAE7E0';
  if(has('tremper')||has('bell')||has('rainwater')) base='#F2E6CA';  // 알비노 파스텔
  if(has('super_macksnow')) base='#F1F0EC';                          // 슈퍼스노우 화이트
  if(has('noir')) base='#24211F';
  const albino = has('tremper')||has('bell')||has('rainwater');
  const solidEye = has('eclipse')||has('super_macksnow');            // 이클립스/슈퍼스노우 = 솔리드 블랙아이
  const eye = albino? '#C0392B' : '#2A2622';                         // 알비노 = 레드아이
  const spots = !(has('blizzard')||has('murphy')||has('super_macksnow'));
  const broken = has('enigma');
  return {base, eye, solidEye, spots, broken};
}
// 파라메트릭 게코 SVG (위에서 본 모습)
function geckoSVG(pf, w){
  const b=pf.base, sc='rgba(92,62,28,.42)';
  const eyeC = pf.solidEye? '#141210' : pf.eye;
  const legs=[[34,18,-32],[34,58,32],[76,18,32],[76,58,-32]]
    .map(function(a){return '<ellipse cx="'+a[0]+'" cy="'+a[1]+'" rx="11" ry="5.5" fill="'+b+'" transform="rotate('+a[2]+' '+a[0]+' '+a[1]+')"/>';}).join('');
  let spots='';
  if(pf.spots){
    const pts=[[44,27],[58,23],[70,30],[50,41],[64,45],[80,37],[36,45],[86,31]];
    const n=pf.broken?4:pts.length;
    for(let i=0;i<n;i++){spots+='<ellipse cx="'+pts[i][0]+'" cy="'+pts[i][1]+'" rx="4.4" ry="3.4" fill="'+sc+'"/>';}
  }
  return '<svg class="gecko" viewBox="0 0 132 76" width="'+w+'" height="'+Math.round(w*76/132)+'">'
    +'<path d="M80,30 Q118,28 128,38 Q118,48 80,46 Z" fill="'+b+'"/>'
    +legs
    +'<ellipse cx="56" cy="38" rx="32" ry="18" fill="'+b+'"/>'
    +'<ellipse cx="22" cy="38" rx="16" ry="14" fill="'+b+'"/>'
    +spots
    +'<circle cx="15" cy="31" r="3.3" fill="'+eyeC+'"/><circle cx="15" cy="45" r="3.3" fill="'+eyeC+'"/>'
    +'</svg>';
}

// 부모의 현재 선택(비주얼)로부터 콤보 토큰셋 — het는 비주얼 아님
function parentTokens(side){
  const s=new Set();
  GENES.forEach(g=>{
    const v=STATE[side][g.id];
    if(v==='nn') return;
    if(g.type==='rec'){ if(v==='mm') s.add(g.id); }
    else if(g.type==='incdom'){ if(v==='het') s.add(g.id); else if(v==='mm') s.add('super_'+g.id); }
    else { if(v==='het'||v==='mm') s.add(g.id); }
  });
  return s;
}


function alleleDist(state){
  if(state==='nn')  return [{a:'N',num:1,den:1}];
  if(state==='het') return [{a:'N',num:1,den:2},{a:'m',num:1,den:2}];
  return [{a:'m',num:1,den:1}];
}
function stateOptions(g){
  const t=L();
  if(g.type==='rec')    return [['nn',t.optRec.nn],['het',t.optRec.het],['mm',t.optRec.mm]];
  if(g.type==='incdom') return [['nn',t.optRec.nn],['het',gName(g)],['mm',gSuper(g)]];
  return [['nn',t.optDom.nn],['het',t.optDom.het],['mm',t.optDom.mm]];
}

const STATE={A:{}, B:{}};
GENES.forEach(g=>{STATE.A[g.id]='nn';STATE.B[g.id]='nn';});
POLY.forEach(p=>{STATE.A[p.id]='no';STATE.B[p.id]='no';});


/* ── 라인브리딩 형질이 깔고 가는 유전자 (implies) ────────────────────────
   라인브리딩은 원래 확률 계산 대상이 아닙니다. 그런데 라인 자체가 유전자를
   품고 있는 경우가 있습니다 — 레드데빌은 벨 알비노를 깔고 갑니다. 이때
   벨 알비노를 안 켜면 확률이 조용히 틀립니다.

   그래서 implies 가 붙은 칩을 켜면 해당 유전자도 같이 켭니다.

   기록을 **라인별이 아니라 유전자별로** 남깁니다. 벨 알비노는 레드데빌도
   오렌지 스모그도 물고 있어서, 라인별로 기억하면 이런 일이 납니다.
   레드데빌을 켜서 벨이 het 이 되고 → 오렌지 스모그를 켜면 이미 het 이라
   아무 기록도 안 남고 → 레드데빌을 끄면 오렌지 스모그가 넘겨받고 →
   오렌지 스모그를 끄면 되돌릴 값이 없어 het 이 그대로 남습니다.

   그래서 '사용자가 원래 두었던 값(base)' 과 '우리가 넣은 값(set)' 을
   유전자 하나당 한 벌만 기억하고, 켜고 끌 때마다 syncImplies() 로
   전체를 다시 맞춥니다. 우리가 넣은 값이 그대로 남아 있을 때만 되돌리기
   때문에, 중간에 사용자가 직접 바꿨으면 그 값을 그대로 둡니다. */
const IMPLIED={A:{}, B:{}};   // {유전자id: {base:원래값, set:우리가넣은값|null}}

/* implies 는 '이만큼은 확실하다' 는 **최소값** 입니다. 정확한 값이 아닙니다.
   레드데빌은 벨 알비노를 물고 있지만 열성이라 보인자인지 발현인지는
   개체마다 다릅니다. 그래서 het 을 깔되, 사용자가 비주얼로 올려둔 것을
   het 으로 끌어내리지 않고, 올려둔 것을 어긋났다고 경고하지도 않습니다.

   nn(정상) < het(보인자) < mm(발현) 순서. 'no' 는 라인브리딩 칩의 꺼짐입니다. */
const GENO_RANK={no:0, nn:0, het:1, mm:2};
function genoRank(v){ return GENO_RANK[v]===undefined? 0 : GENO_RANK[v]; }

/* 켜져 있는 라인들이 요구하는 최소치를 유전자별로 모읍니다.
   같은 유전자를 둘 이상이 요구하면 가장 높은 값이 이깁니다. */
function impliesNeeded(side){
  const need={};
  POLY.forEach(p=>{
    if(!p.implies || STATE[side][p.id]==='no') return;
    Object.keys(p.implies).forEach(gid=>{
      if(!GENES.some(g=>g.id===gid)) return;   // DB 에서 유전자가 빠졌을 수도
      if(genoRank(p.implies[gid]) > genoRank(need[gid])) need[gid]=p.implies[gid];
    });
  });
  return need;
}

/* 라인 칩을 켜든 끄든 이거 하나만 부르면 상태가 맞춰집니다. */
function syncImplies(side){
  const need=impliesNeeded(side), rec=IMPLIED[side];

  /* 1) 이제 아무도 요구하지 않는 유전자 — 사용자 값으로 되돌립니다.
        단 우리가 넣은 값이 그대로 남아 있을 때만. */
  Object.keys(rec).forEach(gid=>{
    if(need[gid]!==undefined) return;
    if(rec[gid].set!==null && STATE[side][gid]===rec[gid].set) STATE[side][gid]=rec[gid].base;
    delete rec[gid];
  });

  /* 2) 요구되는 유전자 — 최소치까지 올립니다. 내리지는 않습니다. */
  Object.keys(need).forEach(gid=>{
    const want=need[gid];
    if(!rec[gid]){
      /* 처음 요구됨 — 사용자가 두었던 값을 여기서 기억해 둡니다 */
      const base=STATE[side][gid];
      if(genoRank(base) >= genoRank(want)){ rec[gid]={base:base, set:null}; return; }
      STATE[side][gid]=want; rec[gid]={base:base, set:want};
      return;
    }
    /* 우리가 넣은 값이 사라졌다면 사용자가 손댄 것 — 건드리지 않습니다.
       (그 상태는 impliesReport 가 경고로 잡아줍니다) */
    if(rec[gid].set!==null && STATE[side][gid]!==rec[gid].set) return;
    if(genoRank(STATE[side][gid]) >= genoRank(want)) return;
    STATE[side][gid]=want; rec[gid].set=want;
  });
}

/* 초기화처럼 STATE 를 통째로 갈아엎을 때 기억을 비웁니다.
   안 비우면 '우리가 넣은 값' 이 안 맞아 다음에 켤 때 안 올라갑니다. */
function resetImplies(){ IMPLIED.A={}; IMPLIED.B={}; }

/* 지금 켜져 있는 라인브리딩 형질 중 implies 가 있는 것들을 훑어서,
   딸린 유전자가 실제로 맞게 켜져 있는지 봅니다. IMPLIED 기록이 아니라
   STATE 를 직접 보기 때문에, 사용자가 유전 모프에서 손으로 꺼 버린
   경우에도 어긋난 것을 잡아냅니다. */
function impliesReport(side){
  const on=[], off=[];
  POLY.forEach(p=>{
    if(!p.implies || STATE[side][p.id]==='no') return;
    Object.keys(p.implies).forEach(gid=>{
      const g=GENES.find(x=>x.id===gid); if(!g) return;
      const cur=STATE[side][gid];
      /* 최소치 이상이면 정상입니다. het 을 요구하는데 비주얼이면 그건
         어긋난 게 아니라 더 진한 경우라 경고하지 않습니다. */
      (genoRank(cur) >= genoRank(p.implies[gid]) ? on : off)
        .push({poly:p, gene:g, val:p.implies[gid], cur:cur});
    });
  });
  return {on:on, off:off};
}


/* ================= 계산 엔진 ================= */
function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b];}return a||1;}
function lcm(a,b){return a/gcd(a,b)*b;}
function geneOffspring(stateA, stateB){
  const A=alleleDist(stateA), B=alleleDist(stateB);
  const acc={NN:0,Nm:0,mm:0}; let den=1;
  A.forEach(x=>B.forEach(y=>{den=lcm(den,x.den*y.den);}));
  A.forEach(x=>B.forEach(y=>{
    const n=x.num*y.num*(den/(x.den*y.den));
    let key=(x.a==='N'&&y.a==='N')?'NN':(x.a==='m'&&y.a==='m')?'mm':'Nm';
    acc[key]+=n;
  }));
  const out=[];['NN','Nm','mm'].forEach(k=>{if(acc[k]>0)out.push({geno:k,num:acc[k],den:den});});
  return out;
}
function phenotype(g, geno){
  if(g.type==='rec')   return geno==='mm'?{visual:gName(g)}:geno==='Nm'?{het:gName(g)}:{};
  if(g.type==='incdom')return geno==='mm'?{visual:gSuper(g)}:geno==='Nm'?{visual:gName(g)}:{};
  return (geno==='mm'||geno==='Nm')?{visual:gName(g)}:{};
}
function computeWarnings(dists){
  const w=[];
  const distFor=id=>{const d=dists.find(x=>x.g.id===id);return d?d.dist:{NN:0,Nm:0,mm:0};};
  const lf=distFor('lemonfrost');
  if(lf.mm>0){const d=DANGER.lemonfrost.super; w.push({geneId:'lemonfrost',level:d.level,text:d[LANG]});}
  else if(lf.Nm>0){const d=DANGER.lemonfrost.het; w.push({geneId:'lemonfrost',level:d.level,text:d[LANG]});}
  const en=distFor('enigma');
  if(en.Nm>0||en.mm>0){
    const d=DANGER.enigma.any; w.push({geneId:'enigma',level:d.level,text:d[LANG]});
    if(STATE.A.enigma!=='nn'&&STATE.B.enigma!=='nn'){const d2=DANGER.enigma.double; w.push({geneId:'enigma',level:d2.level,text:d2[LANG]});}
  }
  const noir=distFor('noir');
  if(noir.mm>0||STATE.A.noir==='mm'||STATE.B.noir==='mm'){
    const d=DANGER.noir.any; w.push({geneId:'noir',level:d.level,text:d[LANG]});
  }
  return w;
}

/* 유전자별 새끼 유전형 확률 {NN,Nm,mm} */
function geneDist(g){
  const outs=geneOffspring(STATE.A[g.id], STATE.B[g.id]);
  const d={NN:0,Nm:0,mm:0};
  outs.forEach(o=>{ d[o.geno]=o.num/o.den; });
  return d;
}
/* 유전자별 '비주얼 표현형' 버킷 — 비주얼 발현/보인자(het) 확률 분리 */
function geneVisualBuckets(g){
  const d=geneDist(g), out=[];
  if(g.type==='rec'){
    if(d.mm>0) out.push({visualName:gName(g), token:g.id, rec:true, prob:d.mm, het:null});
    const nv=d.NN+d.Nm;
    if(nv>0) out.push({visualName:null, token:null, prob:nv, het: d.Nm>0? {name:gName(g), p:d.Nm/nv} : null});
  } else if(g.type==='incdom'){
    if(d.NN>0) out.push({visualName:null, token:null, prob:d.NN, het:null});
    if(d.Nm>0) out.push({visualName:gName(g), token:g.id, rec:false, prob:d.Nm, het:null});
    if(d.mm>0) out.push({visualName:gSuper(g), token:'super_'+g.id, rec:false, prob:d.mm, het:null});
  } else { // dom
    if(d.NN>0) out.push({visualName:null, token:null, prob:d.NN, het:null});
    const pp=d.Nm+d.mm;
    if(pp>0) out.push({visualName:gName(g), token:g.id, rec:false, prob:pp, het:null});
  }
  return out;
}
function nb(s){return String(s).replace(/ /g,String.fromCharCode(160));} // 모프명 내부 공백은 줄바꿈 방지
function buildVisualLabel(recVis, othVis){
  const t=L(), parts=[];
  recVis.forEach(v=>parts.push(nb(t.visualTag+' '+v)));
  othVis.forEach(v=>parts.push(nb(v)));
  return parts.length? parts.join(' · ') : t.normal;
}
/* 도넛(원형) 차트 — 각 결과 % + 색상 세그먼트 */
const PIE_COLORS=['#0E7C7B','#3B8DA0','#EAC36A','#6B5686','#C67B4A','#7FA653','#4E7CA8','#B06A86','#5FB0A8','#D0A24E','#8A8375','#9E5C5C'];
function buildPie(rows){
  let acc=0; const segs=[];
  rows.forEach((r,i)=>{
    const start=acc, end=acc+r.prob*100; acc=end;
    r._color=PIE_COLORS[i%PIE_COLORS.length];
    segs.push(r._color+' '+start.toFixed(3)+'% '+end.toFixed(3)+'%');
  });
  const grad='conic-gradient('+segs.join(',')+')';
  const top=rows[0];
  return '<div class="pie-wrap"><div class="pie" style="background:'+grad+'"><div class="pie-hole">'
    +'<span class="geckothumb gbig">'+geckoSVG(geckoProfile(top.tokens),92)+'</span>'
    +'<div class="pie-top">'+Math.round(top.prob*100)+'%</div>'
    +'</div></div></div>';
}
function gatherPoly(){
  if(!showPoly) return [];
  return POLY.filter(p=>STATE.A[p.id]==='yes'||STATE.B[p.id]==='yes')
    .map(p=>({
      id:p.id,
      name:pName(p),
      a:STATE.A[p.id]==='yes',
      b:STATE.B[p.id]==='yes',
      both:STATE.A[p.id]==='yes'&&STATE.B[p.id]==='yes'
    }));
}
/* 새끼 이름에 붙을 라인브리딩 부분.
   양쪽을 합친 형질 집합이 POLY_COMBOS 에 있으면 그 이름을, 없으면
   형질 이름을 그대로 나열합니다. 라인브리딩은 확률 대상이 아니라
   모든 새끼에 똑같이 붙습니다. */
function polyLabel(poly){
  if(!poly || !poly.length) return '';
  const ids=poly.map(p=>p.id);
  const lines=new Set(ids.map(polyLineOf));

  /* 서로 다른 계열이 섞였을 때 — 멜라텐져린 같은 고유 이름이 있으면 그걸 씁니다. */
  if(lines.size>1){
    const hit=matchPolyCombo(new Set(ids));
    return hit ? (hit[LANG]||hit.en) : poly.map(p=>p.name).join(' ');
  }

  /* 같은 계열 안에서만 섞인 경우.
     라인명이 붙었다는 건 그 형질의 고정률이 잡혔다는 뜻입니다.
     그런데 같은 계열이라도 다른 라인을 섞으면 그 고정이 풀려
     원점으로 돌아갑니다. 만다린 × 텐져린 이 만다린이 아니라
     텐져린이 되는 이유입니다. (현직 브리더 확인)
     한 가지 형질만 쓰였다면 고정이 유지되므로 그 라인명을 그대로 둡니다. */
  if(ids.length===1) return poly[0].both ? poly[0].name : '';
  const base=POLY.filter(p=>p.id===[...lines][0])[0];
  return base ? pName(base) : poly.map(p=>p.name).join(' ');
}


/* ================= 이미지 리사이즈 (공용) =================
   큰 사진(휴대폰 4천만 화소 등)도 안전하게 줄여서 업로드합니다.
   - EXIF 회전 자동 보정 (createImageBitmap)
   - 최대 변 길이 제한 + 목표 용량(기본 350KB)까지 화질 자동 조정
   - 아주 큰 이미지는 단계적으로 축소해 모바일 브라우저 메모리 초과 방지 */
/* 사진 줄이기는 assets/imgtool.js 로 옮겼습니다.
   케어·브리딩 화면이 종을 가리지 않게 되면서 크레스티드·팻테일·볼파이톤
   에서도 필요해졌는데, 그쪽은 이 파일을 읽지 않기 때문입니다. 구현을 두 벌
   두면 한쪽만 고쳐지므로 여기서는 넘기기만 합니다.

   ⚠️ 이 함수를 쓰는 페이지는 assets/imgtool.js 를 먼저 읽어야 합니다.
      (gecko/index.html · gecko/breeding.html · gecko/login.html · admin/index.html) */
async function resizeImage(file, max, opt){
  if(!window.ImgTool || !window.ImgTool.resize){
    throw new Error('사진 도구를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  }
  return window.ImgTool.resize(file, max, opt);
}

if(typeof window!=='undefined') window.resizeImage = resizeImage;
