/* ball-app.js — 볼파이톤 계산기의 백엔드 연결
   -----------------------------------------------------------------------------
   계산 로직은 건드리지 않습니다. 여기서는 기록만 합니다.
     · 접속(visits) · 조합(combo_queries) 로그  → 관리자 화면의 도구별 통계
     · 업데이트 노트/안내 문구(ui_texts·update_notes) 불러오기

   ※ 크레스티드에는 관리자에서 고친 모프 값을 불러오는 코드(cr_genes …)가 더
     있습니다. 볼파이톤은 아직 admin 화면과 bp_* 테이블을 만들지 않았으므로 그
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

  /* 부모 한쪽에서 고른 형질을 하나의 문자열로 만듭니다. 정렬해 두어
     A×B 와 B×A 를 한 조합으로 묶습니다. */
  function sideKey(side) {
    var out = [];
    BP_ALL_GENES().forEach(function (g) {
      if (bpIsIdle(g, side)) return;
      out.push(g.id + ':' + BP_STATE[side][g.id]);
    });
    BP_TRAITS.forEach(function (t) {
      if (BP_STATE[side][t.id] === 'yes') out.push(t.id);
    });
    return out.sort().join('+') || 'normal';
  }

  /* 사람이 읽는 이름. 다대립 자리는 유전형 이름('모하비 팬텀')으로 적습니다. */
  function sideLabel(side) {
    var out = [];
    BP_ALL_GENES().forEach(function (g) {
      if (bpIsIdle(g, side)) return;
      var st = BP_STATE[side][g.id];
      if (g.kind === 'multi') { out.push(bpGenoInfo(g, st).name || gName(g)); return; }
      if (g.type === 'rec')    { out.push(st === 'het' ? gHet(g) : gName(g)); return; }
      if (g.type === 'incdom') { out.push(st === 'het' ? gName(g) : gSuper(g)); return; }
      out.push(gName(g) + (st === 'mm' ? '(2카피)' : ''));
    });
    BP_TRAITS.forEach(function (t) {
      if (BP_STATE[side][t.id] === 'yes') out.push(tName(t));
    });
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
      /* 통계 목록은 관리자가 보는 것이라 항상 한국어로 남깁니다.
         보는 사람의 화면 언어대로 남기면 목록에 한·영·일이 섞여 뭐가 뭔지 알아볼 수
         없습니다. 이름을 만드는 동안만 LANG 을 잠시 바꿔놓습니다. */
          var _l = LANG; LANG = 'ko';
          var lab = sideLabel('A') + ' × ' + sideLabel('B');
          LANG = _l;
          StudioAnalytics.logCombo(SB, SERVICE_ID, [a, b].sort().join(' × '), lab);
        }
      } catch (e) {}
      return r;
    };
  }
})();
