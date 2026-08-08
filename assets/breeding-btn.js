/* =============================================================================
   breeding-btn.js — 헤더의 "브리딩 관리에 저장" 버튼
   -----------------------------------------------------------------------------
   레오파드 계산기에만 이 버튼이 있었습니다. 크레스티드·볼파이톤·팻테일은
   브리딩 관리가 네 종 모두 되는데도(care/breeding-ui.js 의 CORES) 계산기에서
   거기로 가는 길이 없었습니다. 계산기를 돌려 놓고 그 결과를 개체로 남기려면
   주소를 직접 쳐야 했다는 뜻입니다.

   붙이는 법 — 헤더에 이 한 줄을 두고 이 파일을 읽게 하면 끝입니다.
     <a class="blink" data-breeding-btn data-species="crested" hidden></a>

   레오파드(gecko)는 이 파일을 쓰지 않습니다. 거기 #proBtn 은 프리미엄 상태와
   묶여 gecko-app.js 의 refreshPrem() 이 직접 다루고, 양쪽이 같은 버튼을
   건드리면 나중에 그린 쪽이 이겨서 표시가 오락가락합니다.

   로그인한 사람에게만 보입니다. 프리미엄인지까지는 보지 않습니다 —
   브리딩 화면이 무료 회원에게 요금 안내를 제대로 띄우기 때문입니다
   (care/breeding-ui.js 의 boot()). 여기서 미리 숨기면 무엇이 더 열리는지
   알 방법이 없어집니다.
   ============================================================================= */
(function (w, d) {
  'use strict';

  var LABELS = {
    ko: '브리딩 관리에 저장',
    en: 'Save to Breeding',
    ja: 'ブリーディング管理に保存',
    zh: '保存到繁育管理'
  };

  var BREEDING_URL = '/care/breeding.html';

  function lang() {
    var l = (typeof w.LANG === 'string' && w.LANG) || d.documentElement.lang || 'ko';
    return LABELS[l] ? l : 'ko';
  }

  function client() {
    /* 페이지가 내준 클라이언트만 씁니다 — account-btn.js 와 같은 이유입니다.
       같은 저장소 키를 쓰는 클라이언트가 둘이 되면 토큰 갱신이 엇갈립니다. */
    return w.__studioSB || null;
  }

  /* SDK 없이 로그인 여부만. account-btn.js 와 같은 방식입니다. */
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

  function paint(btn, signedIn) {
    if (!signedIn) { btn.hidden = true; return; }
    var species = btn.getAttribute('data-species') || 'gecko';
    var l = lang();
    var url = BREEDING_URL + '?species=' + encodeURIComponent(species)
      + (l === 'ko' ? '' : '&lang=' + encodeURIComponent(l));
    var text = LABELS[l];
    if (btn.tagName === 'A') btn.href = url;
    btn.title = text;
    btn.innerHTML = '<i class="bi bi-journal-check" aria-hidden="true"></i><span>'
      + text + '</span>';
    btn.hidden = false;
  }

  function boot() {
    var btns = [].slice.call(d.querySelectorAll('[data-breeding-btn]'));
    if (!btns.length) return;

    var sb = client();
    var signedIn = false;
    function render() { btns.forEach(function (b) { paint(b, signedIn); }); }

    if (!sb) { signedIn = storedSession(); render(); return; }

    sb.auth.getSession().then(function (r) {
      signedIn = !!(r && r.data && r.data.session);
      render();
    }).catch(function () { signedIn = false; render(); });

    try {
      sb.auth.onAuthStateChange(function (_event, session) {
        signedIn = !!session;
        render();
      });
    } catch (e) { /* 구버전 클라이언트면 최초 1회로 만족합니다. */ }

    /* 언어를 바꾸면 라벨과 주소가 함께 따라가야 합니다. LANG 이 바뀐 뒤에
       그려야 해서 한 박자 미룹니다. */
    d.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-lang]') : null;
      if (t) setTimeout(render, 0);
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  w.StudioBreedingBtn = { refresh: boot };
})(window, document);
