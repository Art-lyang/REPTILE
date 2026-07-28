/* crested-app.js — 크레스티드 계산기의 백엔드 연결
   -----------------------------------------------------------------------------
   지금까지 크레스티드는 Supabase 를 아예 붙이지 않아서, 관리자 화면에 이 도구의
   접속·조합 기록이 한 줄도 쌓이지 않았습니다. 레오파드와 같은 방식으로 남깁니다.

   계산 로직은 건드리지 않습니다. 여기서는 기록만 합니다. */
(function () {
  'use strict';

  var SB = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

  if (!SB || !window.StudioAnalytics) return;

  StudioAnalytics.logVisit(SB, SERVICE_ID, LANG);

  /* id → 표시 이름. CR_ALL_GENES() 는 유전자 배열을, CR_TRAITS 는 다인자 형질을
     돌려줍니다. 둘 다에 없으면 id 를 그대로 씁니다. */
  function nameOf(id) {
    try {
      var g = CR_ALL_GENES().filter(function (x) { return x.id === id; })[0];
      if (g) return gName(g);
      var t = CR_TRAITS.filter(function (x) { return x.id === id; })[0];
      if (t) return tName(t);
    } catch (e) {}
    return id;
  }

  /* 부모 양쪽에서 고른 형질을 하나의 문자열로 만듭니다. 레오파드의 sideKey 와
     같은 역할이고, 여기서만 쓰는 형식이라 정렬해 두어 A×B 와 B×A 를 한 조합으로
     묶습니다. */
  function sideKey(side) {
    var st = CR_STATE[side], out = [];
    for (var k in st) {
      if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
      var v = st[k];
      if (!v || v === 'no' || v === 'nn' || v === 'none') continue;
      out.push(v === 'yes' ? k : k + ':' + v);
    }
    return out.sort().join('+') || 'normal';
  }

  function sideLabel(side) {
    var st = CR_STATE[side], out = [];
    for (var k in st) {
      if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
      var v = st[k];
      if (!v || v === 'no' || v === 'nn' || v === 'none') continue;
      var nm = nameOf(k);
      out.push(v === 'het' ? ('헷 ' + nm) : nm);
    }
    return out.join(' ') || '노멀';
  }

  /* calculate() 를 감싸서, 계산이 끝난 뒤에 기록만 덧붙입니다.
     원래 함수를 그대로 호출하므로 계산 결과는 달라지지 않습니다. */
  var orig = window.calculate;
  if (typeof orig === 'function') {
    window.calculate = function () {
      var r = orig.apply(this, arguments);
      try {
        var a = sideKey('A'), b = sideKey('B');
        if (!(a === 'normal' && b === 'normal')) {
          StudioAnalytics.logCombo(SB, SERVICE_ID,
            [a, b].sort().join(' × '), sideLabel('A') + ' × ' + sideLabel('B'));
        }
      } catch (e) {}
      return r;
    };
  }
})();
