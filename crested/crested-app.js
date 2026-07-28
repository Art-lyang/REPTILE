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

/* =============================================================================
   관리자에서 고친 모프 값 불러오기
   -----------------------------------------------------------------------------
   표가 비어 있으면 아무것도 하지 않습니다. 즉 supabase_v4.sql 을 돌리기 전에도,
   돌린 뒤 아직 '가져오기' 를 누르지 않았을 때도 내장 데이터로 그대로 돕니다.

   덮어쓰는 것은 이름·색·사진·순서·노출 여부뿐입니다. 유전 구조(대립유전자,
   계산 규칙)는 DB 에 두지 않았습니다 — 화면에서 잘못 고치면 확률이 조용히
   틀리는데 그건 사용자가 알아챌 수 없는 오류라서요. (supabase_v4.sql 참고)

   화면은 이미 그려진 뒤에 이 코드가 돕니다. 그래서 값을 바꾼 다음 다시 그립니다.
   ============================================================================= */
(function () {
  'use strict';

  var SB = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;
  if (!SB || typeof CR_ALL_GENES !== 'function') return;

  /* null/빈 문자열은 '안 고침' 으로 봅니다. 그래야 일부 칸만 채워도 됩니다. */
  function put(target, key, val) {
    if (val === null || val === undefined || val === '') return;
    target[key] = val;
  }
  var LANGS = ['ko', 'en', 'ja', 'zh'];

  function applyGenes(rows) {
    if (!rows || !rows.length) return false;
    var byId = {};
    CR_ALL_GENES().forEach(function (g) { byId[g.id] = g; });

    rows.forEach(function (r) {
      var g = byId[r.id];
      if (!g) {
        /* 관리자에서 새로 만든 유전자. 추가 유전자 목록에 붙입니다.
           구조 필드는 DB 에 없으므로 가장 흔한 형태로 시작합니다. */
        g = { id: r.id, kind: r.kind || 'bi', type: r.type || 'incdom' };
        CR_G_EXTRA.push(g);
        byId[r.id] = g;
      }
      LANGS.forEach(function (L) {
        put(g, L, r[L]);
        put(g, 'super' + L.charAt(0).toUpperCase() + L.slice(1), r['super_' + L]);
        put(g, 'het' + L.charAt(0).toUpperCase() + L.slice(1), r['het_' + L]);
      });
      put(g, 'proof', r.proof);
      put(g, 'order', r.ord);
      put(g, 'note', r.note);
      if (r.core !== null && r.core !== undefined) g.core = !!r.core;
      if (r.color) CR_COLOR[r.id] = r.color;
      if (r.image_url) g.imageUrl = r.image_url;
      /* active=false 는 목록에서 빼는 것이 아니라 '추가 유전자' 로 내립니다.
         이미 그 유전자를 고른 사용자의 선택이 조용히 사라지면 안 됩니다. */
      if (r.active === false) g.core = false;
    });
    return true;
  }

  function applyGenos(rows) {
    if (!rows || !rows.length) return false;
    var byId = {};
    CR_ALL_GENES().forEach(function (g) { byId[g.id] = g; });
    rows.forEach(function (r) {
      var g = byId[r.gene_id];
      if (!g || !g.genos || !g.genos[r.geno]) return;   // 구조에 없는 유전형은 무시
      var t = g.genos[r.geno];
      LANGS.forEach(function (L) { put(t, L, r[L]); });
      put(t, 'token', r.token);
      put(t, 'warn', r.warn);
      if (r.health !== null && r.health !== undefined) t.health = !!r.health;
    });
    return true;
  }

  function applyTraits(rows) {
    if (!rows || !rows.length) return false;
    var byId = {};
    CR_TRAITS.forEach(function (t) { byId[t.id] = t; });
    var added = [];
    rows.forEach(function (r) {
      if (r.active === false) return;
      var t = byId[r.id];
      if (!t) { t = { id: r.id, grp: r.grp || 'base' }; added.push(t); byId[r.id] = t; }
      LANGS.forEach(function (L) { put(t, L, r[L]); });
      put(t, 'grp', r.grp);
      if (r.fake_super !== null && r.fake_super !== undefined) t.fakeSuper = !!r.fake_super;
      if (r.color) CR_COLOR[r.id] = r.color;
      if (r.image_url) t.imageUrl = r.image_url;
    });
    /* 끈 형질은 목록에서 뺍니다. 라인브리딩은 확률에 영향을 주지 않아서
       빼도 계산 결과가 달라지지 않습니다. */
    var off = {};
    rows.forEach(function (r) { if (r.active === false) off[r.id] = true; });
    for (var i = CR_TRAITS.length - 1; i >= 0; i--) {
      if (off[CR_TRAITS[i].id]) CR_TRAITS.splice(i, 1);
    }
    added.forEach(function (t) { CR_TRAITS.push(t); });
    /* ord 대로 다시 정렬 */
    var ord = {}; rows.forEach(function (r) { ord[r.id] = r.ord || 0; });
    CR_TRAITS.sort(function (a, b) { return (ord[a.id] || 0) - (ord[b.id] || 0); });
    return true;
  }

  function applyCombos(rows) {
    if (!rows || !rows.length) return false;
    CR_COMBOS.length = 0;
    rows.filter(function (r) { return r.active !== false; })
        .sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); })
        .forEach(function (r) {
          var c = { tokens: r.tokens || [] };
          LANGS.forEach(function (L) { put(c, L, r[L]); });
          put(c, 'proof', r.proof);
          put(c, 'warn', r.warn);
          CR_COMBOS.push(c);
        });
    return true;
  }

  Promise.all([
    SB.from('cr_genes').select('*').order('ord'),
    SB.from('cr_genos').select('*').order('ord'),
    SB.from('cr_traits').select('*').order('ord'),
    SB.from('cr_combos').select('*').order('ord')
  ]).then(function (res) {
    /* 표가 아직 없으면(v4 미적용) error 가 오는데, 그때는 그냥 내장 데이터로 둡니다. */
    var changed = false;
    if (!res[0].error && applyGenes(res[0].data))   changed = true;
    if (!res[1].error && applyGenos(res[1].data))   changed = true;
    if (!res[2].error && applyTraits(res[2].data))  changed = true;
    if (!res[3].error && applyCombos(res[3].data))  changed = true;
    if (!changed) return;

    /* 고른 형질은 유지한 채 화면만 다시 그립니다. */
    try {
      CR_ALL_GENES().forEach(function (g) {
        if (CR_STATE.A[g.id] === undefined) CR_STATE.A[g.id] = 'nn';
        if (CR_STATE.B[g.id] === undefined) CR_STATE.B[g.id] = 'nn';
      });
      if (typeof applyLang === 'function') applyLang();
      if (typeof hasResult !== 'undefined' && hasResult && typeof calculate === 'function') calculate();
    } catch (e) {}
  }).catch(function () { /* 못 불러와도 계산기는 그대로 동작합니다 */ });
})();
