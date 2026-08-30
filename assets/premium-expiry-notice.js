/* 이용 기한이 얼마 안 남았을 때 알려 주는 작은 안내.
   ---------------------------------------------------------------------------
   기간제로 쓰던 사람이 어느 날 갑자기 잠긴 개체를 보게 되는 것이 제일 나쁩니다.
   미리 알면 연장하든 정리하든 고를 수 있습니다.

   왜 파일 하나에 문구까지 넣었나
     이 안내가 떠야 하는 화면이 셋인데(계산기·케어로그·계정) 저마다 다른 번역
     체계를 씁니다(gecko 자체 사전 / CareI18n / LoginLocale). 셋을 다 붙이면
     부르는 쪽마다 어댑터가 필요해서, 언어 코드만 받고 문구는 여기서 갖습니다.
     스타일도 같은 이유로 이 파일이 넣습니다 — 파일 하나만 읽으면 끝납니다.

   '오늘 더이상 안보기'
     날짜를 저장합니다. 영구히 끄지 않는 이유는, 남은 날이 줄어들수록 더 알아야
     하는 소식이기 때문입니다. 오늘 봤으면 오늘은 그만 보고, 내일 다시 봅니다. */
(function (w) {
  'use strict';

  var KEY = 'ryang-premium-expiry-hidden';   // 값: 'YYYY-MM-DD'
  var DAYS = 10;

  var COPY = {
    ko: {
      title: '이용 기한이 얼마 남지 않았습니다',
      body: '{days}일 뒤인 {date}에 프리미엄 이용이 끝납니다.',
      last: '오늘이 프리미엄 이용 마지막 날입니다.',
      what: '기한이 지나면 기록은 지워지지 않지만, 무료 범위를 넘는 개체는 보기와 삭제만 됩니다.',
      hide: '오늘 더이상 안보기', close: '닫기', more: '요금 안내',
    },
    en: {
      title: 'Your access ends soon',
      body: 'Premium ends on {date}, {days} days from now.',
      last: 'Today is the last day of your premium access.',
      what: 'Your records are not deleted, but animals beyond the free limit can only be viewed and deleted.',
      hide: 'Do not show again today', close: 'Close', more: 'Plans',
    },
    ja: {
      title: 'ご利用期限が近づいています',
      body: '{days}日後の{date}にプレミアムのご利用が終了します。',
      last: '本日がプレミアム利用の最終日です。',
      what: '期限が過ぎても記録は消えませんが、無料範囲を超える個体は閲覧と削除のみになります。',
      hide: '今日はもう表示しない', close: '閉じる', more: '料金案内',
    },
    zh: {
      title: '您的使用期限即将到期',
      body: '高级功能将于 {days} 天后（{date}）到期。',
      last: '今天是高级功能的最后一天。',
      what: '记录不会删除，但超出免费范围的个体将只能查看和删除。',
      hide: '今天不再显示', close: '关闭', more: '价格说明',
    },
  };

  var CSS = [
    /* width 를 함께 줍니다. max-width 만 두면 position:fixed 상자가 글자 폭에
       맞춰 쪼그라들어, 한 글자씩 세로로 늘어선 기둥이 됩니다. */
    '.pxn{position:fixed;right:14px;bottom:14px;z-index:9999;',
    'width:min(340px,calc(100vw - 28px));box-sizing:border-box;',
    'background:var(--card,#fff);color:var(--ink,#26221d);border:1px solid var(--hair,rgba(0,0,0,.1));',
    'border-radius:14px;padding:14px 15px;box-shadow:0 10px 34px rgba(0,0,0,.18);',
    'font-size:13px;line-height:1.65;font-family:inherit}',
    '.pxn b{display:block;font-size:13.5px;margin-bottom:5px}',
    '.pxn p{margin:0 0 8px}',
    '.pxn .pxn-what{font-size:11.5px;color:var(--ink2,#8a8375)}',
    '.pxn-foot{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:10px}',
    '.pxn-foot label{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink2,#8a8375);cursor:pointer}',
    '.pxn-foot input{width:15px;height:15px;accent-color:var(--teal,#0e7c7b)}',
    /* 닫기는 오른쪽 끝에 둡니다. 체크와 붙어 있으면 체크하려다 닫습니다. */
    '.pxn-foot .pxn-x{margin-left:auto;border:0;border-radius:9px;padding:7px 12px;',
    'background:var(--card2,#f4f1e9);color:inherit;font:inherit;font-size:12px;font-weight:700;cursor:pointer}',
    '.pxn a.pxn-more{color:var(--teal,#0e7c7b);font-weight:700;text-decoration:none;font-size:12px}',
    '@media (max-width:430px){.pxn{left:14px;right:14px;bottom:12px;max-width:none}}',
  ].join('');

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* 남은 날은 '날짜' 단위로 셉니다. 시각까지 보면 23시간 남았을 때 0일이 되어
     '오늘이 마지막' 이라고 하는데, 실제로는 내일 낮까지 쓸 수 있습니다. */
  function daysLeft(expiresAt) {
    var end = new Date(expiresAt);
    if (isNaN(end.getTime())) return null;
    var a = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    var n = new Date();
    var b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((a - b) / 86400000);
  }

  function hiddenToday() {
    try { return w.localStorage.getItem(KEY) === today(); } catch (e) { return false; }
  }

  function normalized(lang) {
    var code = String(lang || 'ko').toLowerCase().split('-')[0];
    return COPY[code] ? code : 'ko';
  }

  /* prem 은 premium_status 가 돌려준 그대로입니다.
     안 띄우는 경우를 먼저 걸러냅니다 — 띄울 이유보다 안 띄울 이유가 많습니다. */
  function shouldShow(prem) {
    if (!prem || !prem.active || !prem.expires_at) return false;   // 무기한·무료
    var left = daysLeft(prem.expires_at);
    if (left === null || left < 0 || left > DAYS) return false;
    return !hiddenToday();
  }

  function show(prem, lang) {
    if (!shouldShow(prem)) return null;
    var t = COPY[normalized(lang)];
    var left = daysLeft(prem.expires_at);
    var when = new Date(prem.expires_at).toLocaleDateString(
      { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[normalized(lang)]);

    if (!w.document.getElementById('pxnStyle')) {
      var style = w.document.createElement('style');
      style.id = 'pxnStyle';
      style.textContent = CSS;
      w.document.head.appendChild(style);
    }

    var box = w.document.createElement('div');
    box.className = 'pxn';
    box.setAttribute('role', 'status');
    var msg = left <= 0 ? t.last
      : t.body.replace('{days}', String(left)).replace('{date}', when);
    box.innerHTML = '<b></b><p></p><p class="pxn-what"></p>'
      + '<div class="pxn-foot"><label><input type="checkbox"><span></span></label>'
      + '<a class="pxn-more" href="/pricing.html' + (normalized(lang) === 'ko' ? '' : '?lang=' + normalized(lang)) + '"></a>'
      + '<button type="button" class="pxn-x"></button></div>';
    /* 문구는 textContent 로 넣습니다. 날짜 형식이 지역마다 달라 무엇이 들어올지
       우리가 다 알지 못합니다. */
    box.querySelector('b').textContent = t.title;
    box.querySelector('p').textContent = msg;
    box.querySelector('.pxn-what').textContent = t.what;
    box.querySelector('.pxn-foot span').textContent = t.hide;
    box.querySelector('.pxn-more').textContent = t.more;
    box.querySelector('.pxn-x').textContent = t.close;

    function close() {
      if (box.querySelector('input').checked) {
        try { w.localStorage.setItem(KEY, today()); } catch (e) { /* 사생활 보호 모드 */ }
      }
      if (box.parentNode) box.parentNode.removeChild(box);
    }
    box.querySelector('.pxn-x').onclick = close;
    /* Esc 로도 닫힙니다. 체크를 안 했으면 다음에 또 뜹니다 — 그게 맞습니다. */
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    w.document.body.appendChild(box);
    return box;
  }

  w.PremiumExpiryNotice = {
    show: show, shouldShow: shouldShow, daysLeft: daysLeft, DAYS: DAYS, KEY: KEY, COPY: COPY,
  };
}(window));
