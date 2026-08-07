/* 화면 훑기 — 브라우저 콘솔에 붙여넣어 쓰는 검사입니다.
   ---------------------------------------------------------------------------
   한 폭에서만 보고 고쳤다가 다른 폭에서 깨진 일이 있었습니다(계정 버튼 절대배치).
   눈으로 보는 것과 별개로, 기계가 셀 수 있는 것은 기계가 세게 합니다.

   보는 것
     · 가로 넘침        — 화면 밖으로 밀려난 요소
     · 겹침             — 헤더에서 서로 덮는 요소
     · 안 번역된 문구   — 그 언어 화면에 남은 한글(한국어 화면은 건너뜁니다)
     · 해석 안 된 키    — 사전에 없어 키 이름이 그대로 나온 것
     · 작은 터치 표적   — 44px 미만인 누를 수 있는 것
*/
(function (w) {
  'use strict';

  function rect(el) { return el.getBoundingClientRect(); }
  function visible(el) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = rect(el);
    return r.width > 0 && r.height > 0;
  }
  function overlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function findings() {
    const out = [];
    const doc = w.document.documentElement;

    /* 1) 가로 넘침. 문서 전체가 넘치는지 먼저 보고, 넘치면 범인을 찾습니다. */
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const culprits = [...w.document.querySelectorAll('*')].filter(function (el) {
        if (!visible(el)) return false;
        const r = rect(el);
        return r.right > w.innerWidth + 1 && r.width > 20;
      }).slice(0, 5).map(el => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
      out.push({ 종류: '가로넘침', 값: doc.scrollWidth + ' > ' + doc.clientWidth, 범인: culprits });
    }

    /* 2) 헤더 안에서 서로 덮는 것. 헤더는 요소가 몰려 있어 제일 자주 깨집니다. */
    const head = w.document.querySelector('header, .nav-inner');
    if (head) {
      const items = [...head.querySelectorAll('h1, .sub, button, a, select, label')].filter(visible);
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (items[i].contains(items[j]) || items[j].contains(items[i])) continue;
          if (overlap(rect(items[i]), rect(items[j]))) {
            out.push({ 종류: '헤더겹침',
              값: (items[i].id || items[i].className || items[i].tagName) + ' ↔ '
                 + (items[j].id || items[j].className || items[j].tagName) });
          }
        }
      }
    }

    /* 3) 그 언어 화면에 남은 한글. 언어 선택기의 '한국어' 항목은 뺍니다. */
    const lang = (doc.lang || 'ko').split('-')[0];
    if (lang !== 'ko') {
      const body = w.document.body.cloneNode(true);
      body.querySelectorAll('select, option, script, style, [data-care-language], .langmenu, .langpick')
        .forEach(n => n.remove());
      const hangul = (body.innerText.match(/[가-힣]{2,}/g) || []);
      const uniq = [...new Set(hangul)].slice(0, 10);
      if (uniq.length) out.push({ 종류: '안번역', 값: uniq });
    }

    /* 4) 해석 안 된 키. 사전에 없으면 키 이름이 그대로 나옵니다. */
    const keyish = (w.document.body.innerText.match(/\b[a-z][a-zA-Z]{4,}(?:Hint|Note|Title|Label|Text|Action|Body)\b/g) || []);
    if (keyish.length) out.push({ 종류: '해석안됨', 값: [...new Set(keyish)].slice(0, 10) });

    /* 5) 작은 터치 표적. 44px 은 손가락이 정확히 닿는 최소 크기입니다. */
    const small = [...w.document.querySelectorAll('button, a[href], select, input[type=checkbox]')]
      .filter(visible)
      .filter(function (el) { const r = rect(el); return r.height < 32 || r.width < 32; })
      .slice(0, 6)
      .map(el => (el.id || String(el.className).split(' ')[0] || el.tagName)
                 + ' ' + Math.round(rect(el).width) + '×' + Math.round(rect(el).height));
    if (small.length) out.push({ 종류: '작은표적', 값: small });

    return out;
  }

  w.__uiSweep = findings;
  return findings();
}(window));
