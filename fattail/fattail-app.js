/* fattail-app.js — 펫테일 계산기의 백엔드 연결
   -----------------------------------------------------------------------------
   계산 로직은 건드리지 않습니다. 여기서는 기록만 합니다.
     · 접속(visits) · 조합(combo_queries) 로그  → 관리자 화면의 도구별 통계
     · 업데이트 노트/안내 문구(ui_texts·update_notes) 불러오기

   ※ 크레스티드에는 관리자에서 고친 모프 값을 불러오는 코드(cr_genes …)가 더
     있습니다. 펫테일은 아직 admin 화면과 ft_* 테이블을 만들지 않았으므로 그
     부분은 넣지 않았습니다. admin 작업을 할 때 crested-app.js 의 두 번째 블록을
     그대로 옮겨오면 됩니다. */
(function () {
  'use strict';

  var SB = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

  if (!SB) return;

  if (window.StudioAnalytics) StudioAnalytics.logVisit(SB, SERVICE_ID, LANG);

  /* 문구(업데이트 노트·안내문) — 표가 없거나 비어 있으면 코드의 기본 문구를 씁니다. */
  if (window.StudioText && typeof I18N !== 'undefined') {
    StudioText.load(SB, SERVICE_ID, I18N).then(function (changed) {
      if (changed && typeof applyLang === 'function') applyLang();
    });
  }

  if (!window.StudioAnalytics) return;

  /* id → 표시 이름 */
  function nameOf(id) {
    try {
      var g = FT_ALL_GENES().filter(function (x) { return x.id === id; })[0];
      if (g) return gName(g);
      var t = FT_TRAITS.filter(function (x) { return x.id === id; })[0];
      if (t) return tName(t);
    } catch (e) {}
    return id;
  }

  /* 부모 양쪽에서 고른 형질을 하나의 문자열로 만듭니다. 정렬해 두어
     A×B 와 B×A 를 한 조합으로 묶습니다. */
  function sideKey(side) {
    var st = FT_STATE[side], out = [];
    for (var k in st) {
      if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
      var v = st[k];
      if (!v || v === 'no' || v === 'nn' || v === 'none') continue;
      out.push(v === 'yes' ? k : k + ':' + v);
    }
    return out.sort().join('+') || 'normal';
  }

  function sideLabel(side) {
    var st = FT_STATE[side], out = [];
    for (var k in st) {
      if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
      var v = st[k];
      if (!v || v === 'no' || v === 'nn' || v === 'none') continue;
      var nm = nameOf(k);
      /* 다대립 자리(패턴리스·스팅어)는 유전형 키까지 같이 남깁니다 */
      out.push(v === 'het' ? ('헷 ' + nm) : (v === 'yes' || v === 'mm') ? nm : (nm + '(' + v + ')'));
    }
    return out.join(' ') || '노멀';
  }

  /* calculate() 를 감싸서, 계산이 끝난 뒤에 기록만 덧붙입니다. */
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
