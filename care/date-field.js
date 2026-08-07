/* =============================================================================
   날짜 고르기 — 년 / 월 / 일 세 칸
   -----------------------------------------------------------------------------
   왜 <input type="date"> 를 그만 쓰는가
     브라우저마다 전혀 다르게 그립니다. iOS 사파리는 글씨를 가운데로 몰고 높이도
     달라서, 옆에 있는 다른 입력칸과 어긋난 채로 보였습니다(폭 보정을 이미 한 번
     넣었는데도 남아 있던 문제입니다). 값을 지우는 방법도 브라우저마다 다릅니다.

   왜 <select> 세 개인가
     직접 만든 휠보다 낫습니다. iOS 는 select 를 아래에서 올라오는 휠 피커로
     그려 주고, 안드로이드·데스크톱도 각자 익숙한 모양으로 그립니다. 손으로
     만들면 그 셋을 다 흉내 내야 하고, 접근성(키보드·보이스오버)까지 직접
     책임져야 합니다.

   왜 숨은 input 을 같이 두는가
     이 파일을 쓰기 전 코드는 전부 document.getElementById('w_d').value 로 값을
     읽습니다. 숨은 input 이 같은 id 로 'YYYY-MM-DD' 를 들고 있으면 읽는 쪽을
     한 줄도 고치지 않아도 됩니다. 16곳을 동시에 바꾸다 하나를 놓치는 것보다
     안전합니다.

   쓰는 법
     화면:  DateField.html({ id: 'w_d', value: C.today(), max: C.today() })
     값:    document.getElementById('w_d').value   (예전과 같음)
     넣기:  DateField.set(document, 'w_d', '2026-08-07')
     연결:  DateField.bind(document)   ← 화면을 그린 뒤 한 번
   ============================================================================= */
(function (global) {
  'use strict';

  var MIN_YEAR = 1980;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 'YYYY-MM-DD' 만 받습니다. 그 밖의 값은 빈 날짜로 봅니다 — 반쯤 맞는 값을
     억지로 읽어 엉뚱한 날짜를 보여주는 것보다 비워 두는 편이 낫습니다. */
  function parse(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  /* 그 달의 마지막 날. 2월과 윤년을 Date 에게 맡깁니다. */
  function lastDay(year, month) {
    if (!year || !month) return 31;
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function maxYear(opts) {
    var top = parse(opts && opts.max);
    return top ? top.y : new Date().getFullYear();
  }

  function options(from, to, selected, blank) {
    var out = blank ? '<option value="">' + esc(blank) + '</option>' : '';
    for (var v = from; v <= to; v += 1) {
      out += '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '</option>';
    }
    return out;
  }

  function html(opts) {
    opts = opts || {};
    var id = opts.id;
    var cur = parse(opts.value);
    var top = maxYear(opts);
    var bottom = Math.min(MIN_YEAR, top);
    var days = lastDay(cur ? cur.y : 0, cur ? cur.m : 0);
    var labels = opts.labels || { year: '년', month: '월', day: '일' };
    var aria = opts.aria ? ' aria-label="' + esc(opts.aria) + '"' : '';

    return '<div class="datefield" data-datefield="' + esc(id) + '"' + aria + '>'
      + '<span class="datepart"><select class="in" data-part="y">'
      + options(bottom, top, cur ? cur.y : 0, '----') + '</select>'
      + '<i>' + esc(labels.year) + '</i></span>'
      + '<span class="datepart"><select class="in" data-part="m">'
      + options(1, 12, cur ? cur.m : 0, '--') + '</select>'
      + '<i>' + esc(labels.month) + '</i></span>'
      + '<span class="datepart"><select class="in" data-part="d">'
      + options(1, days, cur ? cur.d : 0, '--') + '</select>'
      + '<i>' + esc(labels.day) + '</i></span>'
      /* 값을 들고 있는 칸. 읽는 쪽은 예전처럼 이 id 를 봅니다.
         attrs 는 예전 input 에 붙어 있던 표식을 그대로 옮기는 자리입니다
         (예: data-hatch-preview — breeding-events.js 가 이걸 보고 미리보기를
         다시 그립니다). 표식이 사라지면 그 연결이 조용히 끊깁니다. */
      + '<input type="hidden" id="' + esc(id) + '" value="' + esc(cur ? opts.value : '') + '"'
      + (opts.max ? ' data-max="' + esc(opts.max) + '"' : '')
      + (opts.min ? ' data-min="' + esc(opts.min) + '"' : '')
      + (opts.attrs ? ' ' + opts.attrs : '') + '>'
      + '</div>';
  }

  function parts(box) {
    return {
      y: box.querySelector('[data-part="y"]'),
      m: box.querySelector('[data-part="m"]'),
      d: box.querySelector('[data-part="d"]'),
      out: box.querySelector('input[type="hidden"]')
    };
  }

  /* 3월 31일을 고른 뒤 2월로 바꾸면 31일이 남습니다. 없는 날짜가 만들어지지
     않도록 일 목록을 다시 그리고, 넘치면 그 달의 마지막 날로 당깁니다. */
  function syncDays(p) {
    var y = +p.y.value, m = +p.m.value;
    if (!m) return;
    var last = lastDay(y || new Date().getFullYear(), m);
    var want = +p.d.value;
    if (p.d.options.length - 1 !== last) {
      p.d.innerHTML = '<option value="">--</option>' + options(1, last, Math.min(want, last), null).replace(/^<option value="">.*?<\/option>/, '');
      p.d.value = want ? String(Math.min(want, last)) : '';
    } else if (want > last) {
      p.d.value = String(last);
    }
  }

  function clamp(box, p) {
    var value = p.out.value;
    if (!value) return;
    var max = p.out.getAttribute('data-max'), min = p.out.getAttribute('data-min');
    /* 문자열 비교로 충분합니다 — YYYY-MM-DD 는 사전순이 곧 날짜순입니다. */
    if (max && value > max) { set(box, null, max); return; }
    if (min && value < min) { set(box, null, min); }
  }

  function collect(box) {
    var p = parts(box);
    syncDays(p);
    var y = p.y.value, m = p.m.value, d = p.d.value;
    /* 셋 다 골라야 날짜입니다. 하나라도 비면 '고르는 중' 이라 빈 값으로 둡니다. */
    p.out.value = (y && m && d) ? (y + '-' + pad(+m) + '-' + pad(+d)) : '';
    clamp(box, p);
    return p.out.value;
  }

  function set(root, id, value) {
    var box = id
      ? (root || document).querySelector('[data-datefield="' + id + '"]')
      : root;
    if (!box) return;
    var p = parts(box), cur = parse(value);
    p.y.value = cur ? String(cur.y) : '';
    p.m.value = cur ? String(cur.m) : '';
    syncDays(p);
    p.d.value = cur ? String(cur.d) : '';
    p.out.value = cur ? value : '';
  }

  /* 연결은 문서에 리스너 하나로 끝냅니다.
     -------------------------------------------------------------------------
     화면을 그리는 곳이 네 파일에 흩어져 있어서, 그릴 때마다 bind 를 부르게 하면
     한 곳만 빠뜨려도 그 화면의 날짜만 조용히 동작하지 않습니다. 위임으로 두면
     나중에 새 화면을 만들어도 아무것도 부르지 않아도 됩니다.

     처음 값은 html() 이 이미 숨은 칸에 넣어 두므로 시작할 때 할 일이 없습니다. */
  function onChange(ev) {
    var part = ev.target;
    if (!part || !part.getAttribute || !part.getAttribute('data-part')) return;
    var box = part.closest ? part.closest('[data-datefield]') : null;
    if (!box) return;
    collect(box);
    /* 예전 input[type=date] 의 change 를 듣고 있던 코드가 그대로 동작하도록
       숨은 칸에서도 change 를 한 번 냅니다(예: data-hatch-preview). */
    try {
      parts(box).out.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* 구형 브라우저면 값만 맞으면 됩니다. */ }
  }

  if (global.document && !global.__dateFieldBound) {
    global.__dateFieldBound = true;
    global.document.addEventListener('change', onChange, true);
  }

  global.DateField = {
    html: html, set: set,
    /* 시험에서 쓰라고 열어 둡니다. */
    lastDay: lastDay, parse: parse, collect: collect, MIN_YEAR: MIN_YEAR
  };
})(window);
