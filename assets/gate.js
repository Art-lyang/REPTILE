/* =============================================================================
   임시 접속 잠금 — 테스트 중인 화면을 가려두는 용도
   -----------------------------------------------------------------------------
   ⚠️ 이건 보안이 아닙니다. 반드시 읽고 쓰세요.

   브라우저에서 도는 코드이므로, 마음먹은 사람은 개발자도구를 열어 이 파일을
   읽고 그냥 지나갈 수 있습니다. 비밀번호를 해시로 넣은 것은 '소스 보기' 로
   평문이 바로 보이지 않게 하려는 것뿐이고, 그 이상의 뜻은 없습니다.

   그래서 이 잠금은 **가려두는 것**만 합니다. 지나가면 보이는 케어 화면의
   실제 데이터는 이 파일이 지키지 않습니다. 그건 Supabase 로그인과 RLS 정책이
   지킵니다 — 잠금을 뚫어도 남의 사육 기록은 한 줄도 나오지 않습니다.
   (supabase_v16.sql 7장)

   제대로 막아야 할 때가 오면 Cloudflare Access 를 쓰세요. 대시보드 →
   Zero Trust → Access → Applications 에서 경로에 정책을 걸면, 우리 코드가
   실행되기 전에 Cloudflare 가 막습니다. 그건 우회할 수 없습니다.

   ---------------------------------------------------------------------------
   쓰는 법
   ---------------------------------------------------------------------------
   잠그려는 페이지의 <head> 안, 다른 스크립트보다 **먼저** 넣습니다.

       <script src="/assets/gate.js"></script>

   먼저 놓아야 하는 이유 — 이 파일이 화면을 감추기 전에 페이지가 그려지면
   내용이 한 번 번쩍 보였다가 가려집니다.

   비밀번호를 바꾸려면 아래 GATE_HASH 를 새로 만들어 넣으세요.

       node -e "console.log(require('crypto').createHash('sha256')
                .update('ryangstudio-care-v1:새비번').digest('hex'))"
   ============================================================================= */
(function () {
  'use strict';

  var SALT = 'ryangstudio-care-v1';
  var GATE_HASH = 'feffb957392f2a726264df906a49891f936764e23f2990950f5813ee3507640c';
  var KEY = 'ryangGate.' + SALT;

  /* 통과 표시는 sessionStorage 에 둡니다. 탭을 닫으면 사라지므로 남의 폰을
     잠깐 빌려 보여준 뒤 그대로 열려 있는 일이 없습니다. */
  try {
    if (sessionStorage.getItem(KEY) === '1') return;
  } catch (e) { /* 사생활 보호 모드 등. 그냥 매번 물어봅니다 */ }

  /* crypto.subtle 은 HTTPS(와 localhost)에서만 있습니다. 없으면 해시를
     만들 수 없으니 통과시키지 않고 안내만 합니다 — 못 열리는 편이
     아무나 열리는 편보다 낫습니다. */
  var canHash = !!(window.crypto && window.crypto.subtle && window.TextEncoder);

  /* head 에서 도는 코드라 body 가 아직 없습니다. 스타일로 먼저 가립니다. */
  var style = document.createElement('style');
  style.textContent =
    'body{visibility:hidden!important}' +
    '#ryang-gate{position:fixed;inset:0;z-index:2147483647;visibility:visible;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'background:#f5f1e8;color:#18382f;' +
      'font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,' +
      '"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}' +
    '@media (prefers-color-scheme:dark){#ryang-gate{background:#151a17;color:#edf5ef}}' +
    '#ryang-gate .box{width:100%;max-width:320px;text-align:center}' +
    '#ryang-gate .mk{width:54px;height:54px;border-radius:16px;margin:0 auto 14px;display:block}' +
    '#ryang-gate h2{margin:0 0 6px;font-size:17px;font-weight:800;letter-spacing:-.4px}' +
    '#ryang-gate p{margin:0 0 16px;font-size:12.5px;line-height:1.6;opacity:.65}' +
    '#ryang-gate input{width:100%;padding:13px 14px;font-size:16px;font-family:inherit;' +
      'border:1.5px solid rgba(55,69,61,.22);border-radius:12px;background:#fffdf9;' +
      'color:inherit;text-align:center;letter-spacing:2px}' +
    '@media (prefers-color-scheme:dark){#ryang-gate input{background:#1d2420;' +
      'border-color:rgba(255,255,255,.18)}}' +
    '#ryang-gate button{width:100%;margin-top:9px;padding:13px;font-size:14.5px;font-weight:700;' +
      'font-family:inherit;border:none;border-radius:12px;background:#075a48;color:#fff;cursor:pointer}' +
    '@media (prefers-color-scheme:dark){#ryang-gate button{background:#3aa987;color:#0d1512}}' +
    '#ryang-gate .msg{min-height:18px;margin-top:10px;font-size:12.5px;color:#b4402a;font-weight:700}';
  (document.head || document.documentElement).appendChild(style);

  function draw() {
    var g = document.createElement('div');
    g.id = 'ryang-gate';
    g.innerHTML =
      '<div class="box">' +
      '<img class="mk" src="/assets/logo-mark-180.png" alt="">' +
      '<h2>준비 중인 화면입니다</h2>' +
      '<p>테스트 중이라 잠시 닫아 두었습니다.<br>비밀번호를 아시는 분만 들어와 주세요.</p>' +
      '<input type="password" id="ryang-gate-pw" autocomplete="off" ' +
        'autocapitalize="off" autocorrect="off" spellcheck="false" ' +
        'inputmode="text" aria-label="비밀번호">' +
      '<button type="button" id="ryang-gate-go">들어가기</button>' +
      '<div class="msg" id="ryang-gate-msg" role="alert" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(g);

    var pw = document.getElementById('ryang-gate-pw');
    var msg = document.getElementById('ryang-gate-msg');

    if (!canHash) {
      msg.textContent = '이 브라우저에서는 확인할 수 없습니다 (HTTPS 로 접속해 주세요).';
      pw.disabled = true;
      document.getElementById('ryang-gate-go').disabled = true;
      return;
    }
    pw.focus();

    function hex(buf) {
      var a = new Uint8Array(buf), s = '', i;
      for (i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
      return s;
    }

    function tryOpen() {
      var v = pw.value;
      if (!v) return;
      crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(SALT + ':' + v))
        .then(function (buf) {
          if (hex(buf) !== GATE_HASH) {
            msg.textContent = '비밀번호가 맞지 않습니다.';
            pw.value = '';
            pw.focus();
            return;
          }
          try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
          g.remove();
          style.remove();
        })
        .catch(function () { msg.textContent = '확인 중 문제가 생겼습니다. 새로고침해 주세요.'; });
    }

    document.getElementById('ryang-gate-go').addEventListener('click', tryOpen);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryOpen(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', draw);
  } else {
    draw();
  }
})();
