/* =============================================================================
   signup-cta.js — "회원가입" 버튼과 하루 한 번 안내
   -----------------------------------------------------------------------------
   가입을 열어 놓고도 들어올 문이 로그인 화면 안에만 있었습니다. 홈에도,
   계산기에도 '회원가입' 이라는 글자가 없어서, 계산기만 쓰고 나가는 사람은
   케어로그와 브리딩 관리가 있다는 사실 자체를 모릅니다.

   붙이는 법
     헤더 버튼 —  <a class="blink" data-signup-btn hidden></a>
     하루 한 번 안내 —  <script src="/assets/signup-cta.js" data-nudge></script>
                        (data-nudge 가 있는 페이지에서만 뜹니다)

   로그인한 사람에게는 둘 다 나오지 않습니다.

   ⚠️ 안내는 하루에 한 번입니다. 계산기를 여러 번 여는 사람에게 매번 띄우면
      그건 안내가 아니라 방해가 됩니다. 기준은 기기의 날짜이고, 저장은
      localStorage 한 칸입니다 — 서버로 가는 것은 없습니다.
   ============================================================================= */
(function (w, d) {
  'use strict';

  var T = {
    ko: {
      btn: '회원가입',
      title: '계산기는 로그인 없이 계속 무료입니다',
      body: '회원가입하면 <b>생물 케어 스케줄 관리</b>와 <b>브리딩 관리</b>를 함께 쓸 수 있어요.',
      f1: '급여·물·청소·영양제 주기를 정해두면 오늘 할 일로 뜨고, 캘린더로 내보내 폰에서 알림을 받습니다.',
      f2: '개체와 혈통을 등록해 페어링·클러치·체중을 기록하고, 계산기 결과를 그대로 개체로 남깁니다.',
      note: '등록한 기록은 본인에게만 보입니다. 공개는 개체별로 직접 켜야 시작됩니다.',
      go: '회원가입',
      close: '나중에'
    },
    en: {
      btn: 'Sign up',
      title: 'The calculator stays free, no account needed',
      body: 'An account adds <b>Creature Care Scheduler</b> and <b>Breeding Manager</b>.',
      f1: 'Set feeding, water, cleaning and supplement cycles — they show up as today’s tasks, and export to your phone’s calendar.',
      f2: 'Register animals and lineage, track pairings, clutches and weight, and save a calculation straight onto an animal.',
      note: 'Your records are visible only to you. Publishing starts only when you turn it on for a specific animal.',
      go: 'Create an account',
      close: 'Later'
    },
    ja: {
      btn: '会員登録',
      title: '計算機はログインなしでも無料のままです',
      body: '会員登録すると<b>生き物ケア スケジュール管理</b>と<b>ブリーディング管理</b>も使えます。',
      f1: '給餌・水・掃除・サプリの周期を決めておくと今日のタスクとして表示され、カレンダーに書き出してスマホで通知を受け取れます。',
      f2: '個体と血統を登録してペアリング・クラッチ・体重を記録し、計算結果をそのまま個体として残せます。',
      note: '登録した記録はご本人にだけ表示されます。公開は個体ごとにご自身でオンにしたときだけ始まります。',
      go: '会員登録',
      close: 'あとで'
    },
    zh: {
      btn: '注册',
      title: '计算器无需登录，始终免费',
      body: '注册后还能使用<b>生物护理日程管理</b>与<b>繁育管理</b>。',
      f1: '设定喂食、换水、清洁与营养品的周期后会显示为今日待办，并可导出到手机日历接收提醒。',
      f2: '登记个体与血统，记录配对、产卵与体重，并把计算结果直接保存为个体。',
      note: '您登记的记录仅您本人可见。只有您为某个个体手动开启后才会公开。',
      go: '注册',
      close: '稍后'
    }
  };

  var LOGIN_URL = '/gecko/login.html';
  var SEEN_KEY = 'rsSignupNudge';

  function lang() {
    var l = (typeof w.LANG === 'string' && w.LANG) || d.documentElement.lang || 'ko';
    l = String(l).slice(0, 2);
    return T[l] ? l : 'ko';
  }

  function t() { return T[lang()]; }

  function signupUrl() {
    var l = lang();
    return LOGIN_URL + '?mode=signup' + (l === 'ko' ? '' : '&lang=' + encodeURIComponent(l))
      + '&next=' + encodeURIComponent(location.pathname + location.search);
  }

  /* 가입이 닫혀 있으면 아무것도 하지 않습니다. 스위치를 다시 잠갔을 때
     버튼만 남아 있으면 눌러도 로그인 화면이 뜹니다. */
  function open() {
    return (typeof w.SIGNUPS_ENABLED === 'undefined') || !!w.SIGNUPS_ENABLED;
  }

  function client() { return w.__studioSB || null; }

  /* 깔때기 계측(supabase_v76). '몇 명이 왔나' 만 알면 이 서비스의 값을
     말할 수 없습니다. 안내를 본 사람 → 누른 사람 → 실제로 가입한 사람이
     이어져야 어디서 새는지가 보입니다.
     기기 식별값만 갑니다 — 이메일도 IP 도 보내지 않습니다. */
  function track(event) {
    try {
      var a = w.StudioAnalytics;
      if (a && a.logFunnel) a.logFunnel(client(), event, w.SERVICE_ID || null);
    } catch (e) { /* 통계 한 줄 때문에 화면이 멈추면 안 됩니다. */ }
  }

  function storedSession() {
    try {
      for (var i = 0; i < w.localStorage.length; i++) {
        var k = w.localStorage.key(i);
        if (!/^sb-.*-auth-token$/.test(k)) continue;
        var v = JSON.parse(w.localStorage.getItem(k) || 'null');
        if (!v || !v.access_token) continue;
        if (v.expires_at && Number(v.expires_at) * 1000 < Date.now()) continue;
        return true;
      }
    } catch (e) { /* 저장소가 막혔으면 로그아웃으로 봅니다. */ }
    return false;
  }

  function today() {
    var n = new Date();
    return n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate();
  }

  function seenToday() {
    try { return w.localStorage.getItem(SEEN_KEY) === today(); } catch (e) { return true; }
  }

  function markSeen() {
    try { w.localStorage.setItem(SEEN_KEY, today()); } catch (e) { /* 무시 */ }
  }

  /* ---------- 헤더 버튼 ---------- */
  function paintButtons(signedIn) {
    var btns = [].slice.call(d.querySelectorAll('[data-signup-btn]'));
    btns.forEach(function (b) {
      if (signedIn || !open()) { b.hidden = true; return; }
      var text = t().btn;
      if (b.tagName === 'A') b.href = signupUrl();
      b.title = text;
      b.innerHTML = '<i class="bi bi-person-plus" aria-hidden="true"></i><span>' + text + '</span>';
      b.hidden = false;
      if (!b.__tracked) {
        b.__tracked = true;
        b.addEventListener('click', function () { track('signup_click'); });
      }
    });
  }

  /* ---------- 하루 한 번 안내 ---------- */
  var STYLE = '.sgn-wrap{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;'
    + 'justify-content:center;padding:18px;background:rgba(0,0,0,.42)}'
    + '.sgn{background:var(--card,#fff);color:var(--ink,#1c1a17);border-radius:18px;'
    + 'max-width:400px;width:100%;padding:20px 19px 17px;box-shadow:0 18px 50px rgba(0,0,0,.24);'
    + 'font-size:13.5px;line-height:1.7;max-height:86vh;overflow:auto}'
    + '.sgn h3{margin:0 0 8px;font-size:16px;font-weight:850;word-break:keep-all}'
    + '.sgn p{margin:0 0 12px;word-break:keep-all}'
    + '.sgn ul{margin:0 0 12px;padding:0;list-style:none}'
    + '.sgn li{display:flex;gap:9px;padding:7px 0;font-size:12.5px;color:var(--ink2,#6b655c);'
    + 'word-break:keep-all;line-height:1.65}'
    + '.sgn li b{color:var(--ink,#1c1a17)}'
    + '.sgn .sgn-ic{flex:0 0 auto;font-size:15px;line-height:1.4}'
    + '.sgn .sgn-note{font-size:11.5px;color:var(--ink2,#6b655c);border-top:1px solid var(--hair,#e3ded2);'
    + 'padding-top:10px;margin:0 0 14px;word-break:keep-all}'
    + '.sgn-acts{display:flex;gap:8px}'
    + '.sgn-acts a,.sgn-acts button{flex:1;min-height:44px;border-radius:12px;font-size:14px;'
    + 'font-weight:800;font-family:inherit;cursor:pointer;display:flex;align-items:center;'
    + 'justify-content:center;text-decoration:none;border:1px solid var(--hair,#e3ded2)}'
    + '.sgn-acts .sgn-go{background:var(--teal,#0d6d59);border-color:var(--teal,#0d6d59);color:#fff;flex:1.4}'
    + '.sgn-acts .sgn-no{background:transparent;color:var(--ink2,#6b655c)}';

  function showNudge() {
    var x = t();
    var style = d.createElement('style');
    style.textContent = STYLE;
    d.head.appendChild(style);

    var wrap = d.createElement('div');
    wrap.className = 'sgn-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = '<div class="sgn">'
      + '<h3>' + x.title + '</h3>'
      + '<p>' + x.body + '</p>'
      + '<ul>'
      + '<li><span class="sgn-ic">📋</span><span>' + x.f1 + '</span></li>'
      + '<li><span class="sgn-ic">🧬</span><span>' + x.f2 + '</span></li>'
      + '</ul>'
      + '<p class="sgn-note">' + x.note + '</p>'
      + '<div class="sgn-acts">'
      + '<button type="button" class="sgn-no">' + x.close + '</button>'
      + '<a class="sgn-go" href="' + signupUrl() + '">' + x.go + '</a>'
      + '</div></div>';

    function close() { wrap.remove(); d.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }

    wrap.querySelector('.sgn-no').onclick = close;
    /* 바깥을 눌러도 닫힙니다. 닫는 길이 하나뿐이면 갇힌 느낌이 납니다. */
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    d.addEventListener('keydown', onKey);

    wrap.querySelector('.sgn-go').addEventListener('click', function () { track('nudge_click'); });

    d.body.appendChild(wrap);
    markSeen();
    track('nudge_shown');
  }

  function wantsNudge() {
    var me = d.currentScript || d.querySelector('script[src*="signup-cta.js"]');
    return !!(me && me.hasAttribute('data-nudge'));
  }

  var nudgeOn = wantsNudge();

  function run(signedIn) {
    paintButtons(signedIn);
    if (signedIn || !open() || !nudgeOn || seenToday()) return;
    /* 화면이 자리를 잡은 뒤에 띄웁니다. 뜨자마자 겹치면 계산기를 보러 온
       사람에게 먼저 보이는 것이 안내가 됩니다. */
    w.setTimeout(function () { if (!seenToday()) showNudge(); }, 1600);
  }

  function boot() {
    var sb = client();
    if (!sb) { run(storedSession()); return; }

    sb.auth.getSession().then(function (r) {
      run(!!(r && r.data && r.data.session));
    }).catch(function () { run(false); });

    try {
      sb.auth.onAuthStateChange(function (_e, session) { paintButtons(!!session); });
    } catch (e) { /* 구버전이면 최초 1회로 만족합니다. */ }

    d.addEventListener('click', function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('[data-lang]') : null;
      if (el) w.setTimeout(function () { paintButtons(false); }, 0);
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  w.StudioSignupCta = { refresh: boot, show: showNudge };
})(window, document);
