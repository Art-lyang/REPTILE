/* =============================================================================
   account-btn.js — 헤더의 "로그인 / 내 정보" 버튼
   -----------------------------------------------------------------------------
   홈과 계산기 3종(크레스티드·펫테일·볼파이톤)이 같은 버튼을 씁니다.
   레오파드 게코는 이 파일을 읽지 않습니다 — 거기 #acctBtn 은 프리미엄 상태와
   묶여 있어서 gecko-app.js 의 refreshPrem() 이 직접 다룹니다. 양쪽이 같은
   버튼을 건드리면 나중에 그린 쪽이 이겨서 라벨이 오락가락합니다.

   붙이는 법 — 헤더에 이 한 줄을 두고 이 파일을 읽게 하면 끝입니다.
     <a class="blink" data-account-btn hidden></a>
   안의 아이콘과 글자는 이 파일이 채웁니다.

   세션을 확인하기 전까지는 버튼을 감춰 둡니다. 이미 로그인한 사람에게
   '로그인'이 잠깐 보였다가 '내 정보'로 바뀌는 편이 더 어색합니다.
   ============================================================================= */
(function (w, d) {
  'use strict';

  var LABELS = {
    ko: { login: '로그인', account: '내 정보' },
    en: { login: 'Log in', account: 'Account' },
    ja: { login: 'ログイン', account: 'アカウント' },
    zh: { login: '登录', account: '账户' }
  };

  /* 로그인 화면은 게코 폴더 한 곳에만 있습니다. 어느 도구에서 눌러도 같은 곳으로
     보내야 계정이 하나로 유지됩니다. 절대 경로여야 /crested/ 처럼 하위 폴더에서
     눌러도 어긋나지 않습니다. */
  var LOGIN_URL = '/gecko/login.html';

  function lang() {
    var l = (typeof w.LANG === 'string' && w.LANG) || d.documentElement.lang || 'ko';
    return LABELS[l] ? l : 'ko';
  }

  function label(key) { return LABELS[lang()][key]; }

  function client() {
    /* 페이지가 내준 클라이언트만 씁니다. 없다고 해서 직접 만들지는 않습니다.
       같은 저장소 키를 쓰는 클라이언트가 둘이 되면 supabase-js 가 경고를 내고,
       두 클라이언트가 각자 토큰을 갱신하다 서로 엇갈릴 수 있습니다.
       클라이언트가 없는 화면(홈)은 아래 storedSession() 으로 라벨만 정합니다.
       계산기들은 *-app.js 에서 window.__studioSB 로 내줍니다. */
    if (w.__studioSB) return w.__studioSB;
    return null;
  }

  /* SDK 없이 로그인 여부만 보기.
     홈(index.html)은 마케팅 페이지라 supabase-js 를 싣지 않습니다. 라벨 하나
     때문에 130KB 를 더 받게 하는 건 과해서, supabase-js 가 남겨 둔 세션만
     읽습니다. 키 이름은 sb-<프로젝트>-auth-token 형식이라 정규식으로 찾습니다.
     형식이 바뀌면 못 찾을 뿐이고, 그때는 '로그인'으로 표시됩니다 — 눌러도
     로그인 화면으로 가므로 깨지지는 않습니다. 토큰은 읽기만 하고 어디로도
     보내지 않습니다. */
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
    } catch (e) { /* 저장소가 막힌 브라우저면 로그아웃으로 봅니다. */ }
    return false;
  }

  function paint(btn, signedIn) {
    var key = signedIn ? 'account' : 'login';
    var text = label(key);
    if (btn.tagName === 'A') btn.href = LOGIN_URL;
    btn.title = text;
    btn.innerHTML = '<i class="bi ' + (signedIn ? 'bi-person-check' : 'bi-person')
      + '" aria-hidden="true"></i><span>' + text + '</span>';
    btn.hidden = false;
  }

  function boot() {
    var btns = [].slice.call(d.querySelectorAll('[data-account-btn]'));
    if (!btns.length) return;

    var sb = client();
    var signedIn = false;

    function render() { btns.forEach(function (b) { paint(b, signedIn); }); }

    if (!sb) {
      /* SDK 가 없는 페이지(홈) — 저장된 세션만 보고 한 번 그립니다. */
      signedIn = storedSession();
      render();
      return;
    }

    sb.auth.getSession().then(function (r) {
      signedIn = !!(r && r.data && r.data.session);
      render();
    }).catch(function () { signedIn = false; render(); });

    /* 다른 탭에서 로그인하거나 로그아웃하면 따라 바뀝니다. */
    try {
      sb.auth.onAuthStateChange(function (_event, session) {
        signedIn = !!session;
        render();
      });
    } catch (e) { /* 구버전 클라이언트면 최초 1회 표시로 만족합니다. */ }

    /* 언어를 바꿔도 라벨이 따라가야 합니다. 계산기들은 언어 전환에서 본문만
       다시 그리고 헤더 버튼은 건드리지 않기 때문에 여기서 직접 듣습니다.
       LANG 이 바뀐 뒤에 그려야 해서 한 박자 미룹니다. */
    d.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-lang]') : null;
      if (t) setTimeout(render, 0);
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 화면을 늦게 그리는 페이지에서 다시 붙일 수 있게 열어 둡니다. */
  w.StudioAccountBtn = { refresh: boot };
})(window, document);
