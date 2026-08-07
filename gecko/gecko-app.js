/* gecko-app.js — gecko 화면 로직
   HTML 에서 분리했습니다. 유지보수는 이 파일에서 하세요. */

/* ================= 백엔드(Supabase) + 관리자 페이지 ================= */
(function(){
  const SB = (SUPABASE_URL && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;
  const esc = escapeHtml;
  const accountLabels={
    ko:{login:'로그인',account:'내 정보'},
    en:{login:'Log in',account:'Account'},
    zh:{login:'登录',account:'账户'},
    ja:{login:'ログイン',account:'アカウント'}
  };
  function accountLabel(key){ const labels=accountLabels[LANG]||accountLabels.ko; return labels[key]||accountLabels.ko[key]; }
  function dev(){ try{ let d=localStorage.getItem('leoDevice'); if(!d){ d='dev_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); localStorage.setItem('leoDevice',d); } return d; }catch(e){ return 'dev_anon'; } }
  let USER=null;                       // 로그인한 사용자
  function uid(){ return USER? 'u_'+USER.id : dev(); }   // 프리미엄·데이터 소유 키
  async function refreshUser(){ if(!SB) return null; try{ const r=await SB.auth.getSession(); USER=r.data.session? r.data.session.user : null; }catch(e){ USER=null; } return USER; }

  /* ---------- 통계 ----------
     기록 자체는 assets/analytics.js 가 합니다. 크레스티드도 같은 코드를 쓰고,
     사람/수집기 구분도 거기서 붙습니다. */
  async function logVisit(){ if(!SB || !window.StudioAnalytics) return;
    return StudioAnalytics.logVisit(SB, SERVICE_ID, LANG); }
  function sideKey(side){ const p=[]; GENES.forEach(g=>{const v=STATE[side][g.id]; if(v&&v!=='nn')p.push(g.id+':'+v);}); POLY.forEach(x=>{if(STATE[side][x.id]==='yes')p.push(x.id);}); return p.sort().join('+')||'normal'; }
  function sideLabel(side){ const t=[]; GENES.forEach(g=>{const v=STATE[side][g.id]; if(!v||v==='nn')return; let nm=(g.type==='incdom'&&v==='mm')?gSuper(g):gName(g); if(v==='het'&&g.type==='rec')nm='het '+nm; t.push(nm);}); POLY.forEach(x=>{if(STATE[side][x.id]==='yes')t.push(pName(x));}); return t.join(' ')||L().normal; }
  window.calcAndLog=function(){ calculate();
    if(SB){ const a=sideKey('A'),b=sideKey('B');
      if(!(a==='normal'&&b==='normal') && window.StudioAnalytics){
      /* 통계 목록은 관리자가 보는 것이라 항상 한국어로 남깁니다.
         보는 사람의 화면 언어대로 남기면 목록에 한·영·일이 섞여 뭐가 뭐지 알아볼 수
         없습니다. 이름을 만드는 동안만 LANG 을 잠시 바꿔놓습니다. */
        const _l=LANG; LANG='ko';
        const lab=sideLabel('A')+' × '+sideLabel('B');
        LANG=_l;
        StudioAnalytics.logCombo(SB, SERVICE_ID, [a,b].sort().join(' × '), lab);
      } } };

  /* ---------- 모프/콤보 오버라이드 로드 ---------- */
  function applyMorphRows(rows){
    const genes=[], poly=[];
    const builtinGenes=GENES.slice();
    /* 라인브리딩 계열(line)은 아직 morphs 표에 컬럼이 없습니다.
       그냥 덮어쓰면 내장 값이 날아가서 만다린 × 블랙나이트 같은 계열 조합이
       이름을 잎어버립니다. DB 값이 없으면 내장 계열을 그대로 유지합니다. */
    const builtinLine={}; POLY.forEach(p=>{ if(p.line) builtinLine[p.id]=p.line; });
    /* implies(동반 유전자)도 morphs 표에 컬럼이 없습니다. 계열과 달리 이건
       확률에 직접 영향을 줍니다 — 레드데빌은 벨 알비노를 깔고 가는 라인이라,
       이 정보가 날아가면 레드데빌끼리 붙였을 때 100% 벨 알비노가 0% 로
       나옵니다. 그래서 DB 가 목록을 덮어써도 내장 값을 반드시 살립니다. */
    const builtinImplies={}; POLY.forEach(p=>{ if(p.implies) builtinImplies[p.id]=p.implies; });
    rows.forEach(r=>{ if(r.color)GCOLOR[r.id]=r.color; if(r.image_url)MORPH_IMG[r.id]=r.image_url;
      if(r.kind==='poly'){ const q={id:r.id,ko:r.ko,en:r.en,zh:r.zh,ja:r.ja};
        const ln=r.line||builtinLine[r.id]; if(ln) q.line=ln;
        if(builtinImplies[r.id]) q.implies=builtinImplies[r.id];
        poly.push(q); }
      else { const g=leoApplyLockedGeneStructure(leoApplyLockedGeneLabels({id:r.id,type:r.kind,family:r.family||'albino',ko:r.ko,en:r.en,zh:r.zh,ja:r.ja,risk:!!r.risk}));
        if(r.super_ko){g.superKo=r.super_ko;g.superEn=r.super_en;g.superZh=r.super_zh;g.superJa=r.super_ja;} genes.push(g); } });
    if(genes.length){ const mergedGenes=leoMergeRequiredGenes(genes,builtinGenes); GENES.length=0; mergedGenes.forEach(g=>GENES.push(g)); }
    if(poly.length){ POLY.length=0; poly.forEach(p=>POLY.push(p)); }
    GENES.forEach(g=>{ if(STATE.A[g.id]===undefined)STATE.A[g.id]='nn'; if(STATE.B[g.id]===undefined)STATE.B[g.id]='nn'; });
    POLY.forEach(p=>{ if(STATE.A[p.id]===undefined)STATE.A[p.id]='no'; if(STATE.B[p.id]===undefined)STATE.B[p.id]='no'; });
  }
  async function loadOverrides(){
    if(!SB)return;
    try{
      const m=await SB.from('morphs').select('*').eq('active',true).order('sort');
      const c=await SB.from('combos').select('*').order('sort');
      let changed=false;
      if(m.data&&m.data.length){ applyMorphRows(m.data); changed=true; }
      if(c.data&&c.data.length){ COMBOS.length=0; c.data.forEach(r=>COMBOS.push({tokens:r.tokens||[], ko:r.ko, en:r.en, vintage:!!r.vintage, risk:!!r.risk})); changed=true; }
      /* 문구(업데이트 노트·안내문)도 같이 불러옵니다. 표가 없으면 그냥 넘어갑니다. */
      if(window.StudioText && await StudioText.load(SB, SERVICE_ID, I18N)) changed=true;
      if(changed){ hasResult=false; applyLang(); }
    }catch(e){}
  }

  /* gecko-ui.js 가 화면 언어에 맞는 사전을 window.__navText 로 내줍니다.
     아직 준비 전이면 한국어로 둡니다 — 빈 글자보다는 낫습니다. */
  function navText(key){
    const d = window.__navText || {};
    return d[key] || {navPremium:'프리미엄 코드', navSub:'구독 중', navTrial:'체험판 이용중'}[key] || '';
  }

  /* ---------- 프리미엄 코드 ---------- */
  let isPrem=false, premKind=null, premExp=null;
  async function refreshPrem(){
    const btn=document.getElementById('premBtn'), pro=document.getElementById('proBtn');
    if(!SB){ if(btn)btn.style.display='none'; if(pro)pro.style.display='none'; return; }
    if(!USER){
      isPrem=false; premKind=null; premExp=null; window.__isPrem=false;
      if(btn) btn.style.display='none';
      if(pro) pro.style.display='none';
      const ab=document.getElementById('acctBtn');
      if(ab){
        ab.style.display=SHOW_ACCOUNT_UI?'':'none';
        ab.innerHTML='<i class="bi bi-person" aria-hidden="true"></i><span>'+accountLabel('login')+'</span>';
      }
      return;
    }
    if(btn)btn.style.display='';
    try{ const r=await SB.rpc('premium_status',{p_device:uid()}); const d=r.data||{};
         isPrem=!!d.active; premKind=d.kind||null; premExp=d.expires_at||null; }
    catch(e){ try{ const r2=await SB.rpc('is_premium',{p_device:uid()}); isPrem=!!r2.data; }catch(x){ isPrem=false; } }
    if(btn) btn.innerHTML = '<i class="bi bi-gem" aria-hidden="true"></i><span>'
      /* 문구는 gecko-ui.js 의 사전에서 가져옵니다. 여기 한국어를 박아 두면
         영어·일본어·중국어 페이지에서 이 버튼만 한국어로 남습니다. */
      +navText(isPrem? (premKind==='sub'?'navSub':'navTrial') : 'navPremium')+'</span>';
    // 노출 스위치 — 준비 중이면 버튼 자체를 숨김 (gecko-core.js 참고)
    if(btn && !SHOW_PREMIUM_UI) btn.style.display='none';
    window.__isPrem = isPrem;
    if(hasResult) calculate();
    const ab=document.getElementById('acctBtn');
    if(ab){
      // 노출 스위치 — 테스트 기간에는 로그인 진입 자체를 감춤 (gecko-core.js)
      ab.style.display = SHOW_ACCOUNT_UI ? '' : 'none';
      ab.innerHTML = '<i class="bi bi-person" aria-hidden="true"></i><span>'+(USER?accountLabel('account'):accountLabel('login'))+'</span>';
    }
    /* 브리딩 관리 버튼은 무료 회원에게도 보여 줍니다. 감춰 두면 무엇이 더 있는지
       알 수 없어서, 결제를 권할 자리 자체가 없어집니다. 눌러서 들어가면
       breeding-ui.js 가 요금 안내로 안내합니다. 로그인 전(위 86행)에는 그대로
       감춥니다 — 그 사람에게 먼저 필요한 것은 로그인입니다. */
    if(pro) pro.style.display = '';
    const ad=document.getElementById('adSlot'); if(ad && isPrem) ad.style.display='none';   // 프리미엄 = 광고 제거
  }
  window.openPrem=async function(){
    if(!SB){alert('백엔드(Supabase)가 아직 설정되지 않았습니다.');return;}
    await refreshUser(); await refreshPrem();
    const exp=premExp? new Date(premExp).toLocaleDateString('ko-KR') : null;
    const acct=document.getElementById('premAccount');
    if(USER){
      acct.innerHTML='<div class="acctbox"><div><b>'+esc(USER.email||'로그인됨')+'</b><div class="asub">이 계정으로 어느 기기에서든 프리미엄이 유지됩니다</div></div>'
        +'<button class="mini" id="btnLogout">로그아웃</button></div>';
      document.getElementById('btnLogout').onclick=async()=>{ await SB.auth.signOut(); USER=null; await refreshPrem(); openPrem(); };
    } else {
      acct.innerHTML='<div class="lockbox" style="text-align:left"><b>로그인하면 기기가 바뀌어도 프리미엄이 유지됩니다.</b><br>로그인 없이 코드를 쓰면 이 브라우저에서만 인정돼요.</div>'
        +'<a class="abtn" href="login.html" style="display:block;width:100%;margin:10px 0 2px;text-align:center;text-decoration:none;box-sizing:border-box">로그인 / 회원가입</a>';
    }
    document.getElementById('premStatus').textContent = isPrem
      ? ((premKind==='sub'?'구독':'체험판')+' 이용 중' + (exp? ' · '+exp+'까지' : ' · 무기한'))
      : (USER? '발급받은 일회성 코드를 입력하세요. (1인 1회)' : '프리미엄 코드는 로그인 후 사용할 수 있어요.');
    const pin=document.getElementById('premInput'), pbtn=document.querySelector('#premModal .btn-close');
    if(pin) pin.disabled=!USER;
    if(pbtn) pbtn.style.opacity=USER?'1':'.5';
    document.getElementById('premMsg').textContent=''; document.getElementById('premInput').value='';
    // 노출 스위치 (gecko-core.js) — 준비 중인 영역은 감춤
    const pkb=document.getElementById('perkBox');   if(pkb) pkb.style.display = SHOW_PREMIUM_UI? '' : 'none';
    const dnb=document.getElementById('donateBox'); if(dnb) dnb.style.display = SHOW_DONATE? '' : 'none';
    // 후원 계좌
    try{ document.getElementById('donBank').textContent=DONATE_BANK;
         document.getElementById('donAcct').textContent=DONATE_ACCT; }catch(e){}
    const dc=document.getElementById('donCopy');
    if(dc) dc.onclick=()=>{ const v=document.getElementById('donAcct').textContent.trim();
      const done=()=>{ dc.textContent='복사됨'; setTimeout(()=>dc.textContent='복사',1400); };
      if(navigator.clipboard) navigator.clipboard.writeText(v).then(done,()=>prompt('계좌번호',v));
      else prompt('계좌번호',v); };
    document.getElementById('premModal').classList.add('show');
  };
  // 로그인 시 기기에 있던 코드/데이터를 계정으로 이관
  async function migrateDevice(){
    if(!USER) return;
    try{ await SB.rpc('claim_device',{p_device:dev(), p_user:uid()}); }catch(e){}
  }
  window.closePrem=function(){ document.getElementById('premModal').classList.remove('show'); };
  window.redeemPrem=async function(){
    if(!USER){ location.href='login.html'; return; }
    const code=document.getElementById('premInput').value.trim(); const msg=document.getElementById('premMsg'); if(!code){msg.style.color='var(--warn-hi-fg)';msg.textContent='코드를 입력하세요.';return;} msg.style.color='var(--ink2)';msg.textContent='확인 중…'; try{ const r=await SB.rpc('redeem_code',{p_code:code,p_device:uid()}); const v=r.data; if(v==='ok'){ msg.style.color='var(--teal)';msg.textContent='활성화되었습니다! 🎉'; isPrem=true; refreshPrem(); setTimeout(closePrem,900);} else { msg.style.color='var(--warn-hi-fg)'; msg.textContent = v==='login_required'?'로그인 후 사용할 수 있어요.':v==='not_found'?'존재하지 않는 코드예요.':v==='revoked'?'사용이 중지된 코드예요.':v==='used'?'이미 다른 회원이 사용한 코드예요.':'사용할 수 없는 코드예요.'; } }catch(e){ msg.style.color='var(--warn-hi-fg)'; msg.textContent='오류가 발생했어요.'; } };
  document.getElementById('premModal').addEventListener('click',e=>{ if(e.target.id==='premModal') closePrem(); });

  /* ---------- 라우팅 ---------- */
  function isAdminRoute(){ return location.hash==='#admin' || /\/admin\/?$/.test(location.pathname); }
  function route(){ const on=isAdminRoute(); document.querySelector('.wrap').style.display=on?'none':''; document.querySelector('header').style.display=on?'none':''; const ar=document.getElementById('adminRoot'); ar.style.display=on?'block':'none'; if(on) renderAdmin(); }
  window.addEventListener('hashchange', route);

  /* ---------- 관리자 ----------
     관리자 기능은 https://ryangstudio.com/admin/ 으로 옮겼습니다.
     여러 서비스를 한 곳에서 관리하기 위함입니다. (docs/STUDIO.md)
     옛 주소(#admin)로 들어오는 경우를 대비해 안내만 남깁니다. */
  function renderAdmin(){
    document.getElementById('adminRoot').innerHTML =
      '<div class="admin-wrap"><div class="admin-top"><h1>🛠 관리자</h1>'
      +'<a class="admin-back" href="#">← 계산기로</a></div>'
      +'<div class="apad" style="text-align:center;line-height:1.9">'
      +'<div class="alabel">관리자 페이지가 이사했습니다</div>'
      +'<div class="asub" style="margin:6px 0 16px">여러 서비스를 한 곳에서 관리하기 위해 스튜디오로 옮겼어요.</div>'
      +'<a class="abtn" href="/admin/" style="display:inline-block;text-decoration:none">관리자 페이지 열기 →</a>'
      +'<div class="ahint" style="margin-top:14px">주소: ryangstudio.com/admin/</div>'
      +'</div></div>';
  }
  /* ---------- 초기화 ---------- */
  // breeding.html 에서 넘어온 페어링 적용
  (function(){ try{
    const raw=sessionStorage.getItem('leoPair'); if(!raw) return;
    sessionStorage.removeItem('leoPair'); const d=JSON.parse(raw);
    const put=(side,o)=>{ GENES.forEach(g=>STATE[side][g.id]='nn'); POLY.forEach(x=>STATE[side][x.id]='no');
      (o.m||[]).forEach(tk=>{ if(String(tk).indexOf('super_')===0){ const id=tk.slice(6); if(STATE[side][id]!==undefined)STATE[side][id]='mm'; return; }
        const g=GENES.filter(x=>x.id===tk)[0]; if(g){ STATE[side][g.id]= g.type==='rec'?'mm':'het'; return; }
        if(STATE[side][tk]!==undefined) STATE[side][tk]='yes'; });
      (o.h||[]).forEach(id=>{ const g=GENES.filter(x=>x.id===id)[0]; if(g&&STATE[side][g.id]==='nn') STATE[side][g.id]='het'; }); };
    put('A',d.A||{}); put('B',d.B||{});
    setTimeout(()=>{ buildParent('A'); buildParent('B'); calcAndLog();
      const r=document.querySelector('.results'); if(r) r.scrollIntoView({behavior:'smooth'}); }, 260);
  }catch(e){} })();
  route(); logVisit(); loadOverrides(); refreshUser().then(refreshPrem);
  if(SB) SB.auth.onAuthStateChange((_e,sess)=>{ USER=sess?sess.user:null; refreshPrem(); });
})();
