/* =============================================================================
   개체 관리 — 한 마리만 깊게 보는 화면
   -----------------------------------------------------------------------------
   /care/ 는 여러 마리의 '오늘 할 일' 을 봅니다. 이 화면은 반대로 한 마리의
   쌓인 기록을 봅니다. 주소에 개체 id 가 들어가므로 즐겨찾기에 둘 수 있고,
   나중에 QR 라벨을 붙일 자리도 여기입니다.

       /care/animal.html?id=<개체 id>

   ---------------------------------------------------------------------------
   강아지·고양이 케어 앱에서 가져온 것
   ---------------------------------------------------------------------------
   PetNoter·DogCat·PetNote Plus·DogNote 같은 앱들이 공통으로 가진 것 중,
   파충류에 그대로 오는 것만 골랐습니다.

     · 빠른 기록   — 폼을 열지 않고 한 번 눌러 오늘 날짜로 기록.
                     적는 것이 번거로우면 결국 안 적게 됩니다.
     · 체중 곡선   — 종별 흔한 범위를 배경 띠로 함께 그립니다.
     · 기록 히트맵 — 최근 12주를 한눈에. 빠진 구간이 눈에 띕니다.
     · 종류별 마지막 — '마지막 청소가 며칠 전' 을 항상 위에 둡니다.

   가져오지 않은 것과 이유
     · 보호자 공유(DogNote) — 계정 하나에 여러 사람을 붙이는 구조가 필요합니다.
                              지금 RLS 는 user_id 하나만 봅니다. 별건입니다.
     · 비용 기록            — 사육 관리와 겹치지 않고, 받으면 지워줄 의무만 늡니다.
     · 활동량 트래커        — 파충류에 맞는 기기가 없습니다.
   ============================================================================= */
(function () {
  'use strict';

  const C = window.CareCore;
  const A = window.CareApp;
  const I = window.CareI18n;
  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x];
    });
  }
  function icon(n) { return '<i class="bi ' + n + '" aria-hidden="true"></i>'; }

  const S = { id: null, animal: null, animals: [], plans: [], records: [], weights: [],
              busy: false, range: 90, upGen: 2 };

  function toast(m) {
    const t = $('toast'); t.textContent = m; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function speciesOf(a) { return C.SPECIES[a && a.species] || C.SPECIES.other; }

  async function loadAll() {
    const [animals, plans, records, weights] = await Promise.all([
      A.listAnimals(), A.listPlans(), A.listRecords(C.addDays(C.today(), -400)), A.listWeights(S.id)
    ]);
    S.animals = animals;                       // 족보가 부모·자식을 찾을 때 씁니다
    S.animal = animals.filter(a => a.id === S.id)[0] || null;
    /* 계획·기록은 이 개체 것과 '개체 공통' 을 함께 봅니다. 랙 전체 청소는
       개체에 매여 있지 않지만 이 개체에도 해당하는 일입니다. */
    S.plans = plans.filter(p => p.animal_id === S.id || !p.animal_id);
    S.records = records.filter(r => r.animal_id === S.id);
    S.weights = weights;
  }

  async function act(fn, ok) {
    if (S.busy) return;
    S.busy = true;
    try { await fn(); await loadAll(); render(); if (ok) toast(ok); }
    catch (e) { toast(I.friendly(e)); }
    finally { S.busy = false; }
  }

  /* =============================================================================
     조각들
     ============================================================================= */

  /* 위쪽 숫자 넉 장 */
  function statCards() {
    const rate = C.completionRate(S.plans, S.records, 30, C.today());
    const streak = C.streakDays(S.records, C.today());
    const w = C.weightSummary(S.weights);
    const age = I.ageText(S.animal.hatch_date, C.today());

    const cards = [
      { v: rate.rate == null ? '–' : I.formatNumber(rate.rate) + '%', k: I.t('performance30'),
        sub: rate.due ? I.formatNumber(rate.done) + '/' + I.t('countTimes', { count: I.formatNumber(rate.due) }) : I.t('noPlan') },
      { v: streak ? I.formatNumber(streak) : '–', k: I.t('streak'), sub: streak ? I.t('streakDays') : I.t('tryToday') },
      { v: w.count ? I.formatNumber(w.latest) : '–', k: I.t('latestWeight'),
        sub: w.count ? (w.delta30 == null ? I.t('measurements', { count: I.formatNumber(w.count) })
             : (w.delta30 > 0 ? '+' : '') + I.formatNumber(w.delta30) + 'g · ' + I.t('lastThirtyDays')) : I.t('noRecords') },
      { v: age || '–', k: I.t('age'), sub: S.animal.hatch_date ? I.formatDate(S.animal.hatch_date) : I.t('hatchMissing') }
    ];
    return '<div class="grid4">' + cards.map(c =>
      '<div class="stat"><div class="v">' + esc(c.v) + '</div>'
      + '<div class="k">' + esc(c.k) + '</div>'
      + '<div class="k" style="opacity:.7;margin-top:1px">' + esc(c.sub) + '</div></div>').join('')
      + '</div>';
  }

  /* 빠른 기록 — 케어 앱들의 원탭 기록 */
  function quickBar() {
    const done = new Set(S.records.filter(r => r.done_date === C.today()).map(r => r.kind));
    return '<div class="pad"><div class="lbl">' + I.t('quickRecord') + '</div>'
      + '<div class="hint">' + I.t('quickHint') + '</div>'
      + '<div class="quick">' + C.QUICK_KINDS.map(function (k) {
          const i = C.kindInfo(k);
          const on = done.has(k);
          return '<button class="qbtn' + (on ? ' on' : '') + '" data-quick="' + k + '" '
            + 'style="' + (on ? '' : '--qc:' + i.color) + '">'
            + '<i class="bi ' + i.icon + '" aria-hidden="true"></i><span>' + esc(I.kindName(k)) + '</span></button>';
        }).join('') + '</div></div>';
  }

  /* 종류별 마지막으로 한 날 */
  function lastBar() {
    const last = C.lastDoneByKind(S.records, C.today());
    const kinds = ['feed', 'water', 'clean', 'supplement', 'shed', 'poop'];
    const rows = kinds.filter(k => last[k]).map(function (k) {
      const i = C.kindInfo(k), d = last[k];
      /* 오래된 것을 눈에 띄게 합니다. 기준은 종류마다 다릅니다 — 물은 이틀,
         청소는 열흘이 지나야 '오래됐다' 입니다. */
      const limit = { water: 2, feed: 7, clean: 10, supplement: 10, shed: 60, poop: 7 }[k] || 14;
      const old = d.ago >= limit;
      return '<div class="lastrow' + (old ? ' old' : '') + '">'
        + '<span class="kind" style="color:' + i.color + '">'
        + '<i class="bi ' + i.icon + '" aria-hidden="true"></i>' + esc(I.kindName(k)) + '</span>'
        + '<span class="lago">' + I.relativeDays(d.ago) + '</span>'
        + '<span class="ldate">' + esc(I.formatDate(d.date, { month: 'short', day: 'numeric' })) + '</span></div>';
    });
    if (!rows.length) return '';
    return '<div class="pad"><div class="lbl">' + I.t('lastDone') + '</div>'
      + '<div class="lastgrid">' + rows.join('') + '</div></div>';
  }

  /* 관찰 중인 증세. 이 화면은 '한눈에 보는 곳' 이라, 지금 보고 있는 것이
     있으면 위쪽에 있어야 합니다. 기록·해소는 케어 화면의 건강 탭에서 합니다 —
     같은 조작을 두 곳에 두면 한쪽만 고쳐집니다. */
  function openSigns() {
    const st = C.signStatus(S.records, C.today()).filter(s => s.open);
    if (!st.length) return '';
    return '<div class="pad"><div class="lbl">' + I.t('openSymptoms') + '</div>'
      + st.map(function (s) {
          const g = C.SIGNS[s.code] || {};
          return '<div class="signcard' + (g.vet ? ' vet' : '') + '" style="margin-top:10px">'
            + '<div class="sgtop"><div class="sgname">' + esc(I.signName(s.code)) + '</div>'
            + '<div class="sgdays">' + I.t('daysRunning', { count: I.formatNumber(s.days) }) + '</div></div>'
            + '<div class="sgwhat">' + esc(I.signWhat(s.code)) + '</div>'
            + (g.vet ? '<div class="sgvet">' + icon('bi-hospital') + I.t('vetRecommended') + '</div>' : '')
            + '</div>';
        }).join('')
      + '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="' + I.url('/care/#health') + '">'
      + icon('bi-clipboard-pulse') + I.t('healthAction') + '</a></div>';
  }

  /* =============================================================================
     족보
     -----------------------------------------------------------------------------
     계산은 care-core 의 buildPedigree 가 합니다. 여기서는 자리에 좌표만 붙입니다.

     SVG 가 아니라 HTML 로 그립니다. 사진을 원형으로 자르고, 이름을 줄바꿈하고,
     눌러서 그 개체로 넘어가는 것 — 셋 다 HTML 이 그냥 되는 일이고 SVG 에서는
     foreignObject 나 clipPath 를 얹어야 합니다. 세대를 잇는 선도 SVG 대신
     CSS 로 긋습니다(care.css 의 .pedlink). 좌표를 계산해 선을 그리지 않고
     세대 사이에 높이 있는 칸을 하나 두는 방식이라, 칸 수가 바뀌어도
     따라 그릴 것이 없습니다.

     ⚠️ 세대가 늘면 폭이 두 배씩 커집니다. 3세대면 조부모 4칸이라 폰에서
        넘칩니다. 가로 스크롤을 허용하되, 화면 밖으로 나가는 것이 아니라
        스크롤되는 상자 안에 가둡니다. */
  function pedigreeBlock() {
    const up = S.upGen || 2;
    const p = C.buildPedigree(S.animals, S.id, up);
    if (!p) return '';

    const hasAny = p.up.length || p.children.length;
    if (!hasAny) {
      return '<div class="pad"><div class="lbl">' + I.t('pedigree') + '</div>'
        + '<div class="empty">' + icon('bi-diagram-3')
        + I.t('pedigreeEmpty') + '</div></div>';
    }

    /* 세대별 칸 수가 2·4·8 로 늘어납니다. 카드 하나에 최소 폭을 주고
       그 배수로 전체 폭을 잡습니다. */
    const CARD = 92, GAP = 10;
    const widest = p.slots.length ? p.slots[p.slots.length - 1] : 1;
    const W = Math.max(widest * (CARD + GAP), 300);

    let rows = '';
    /* 위 세대부터 아래로 그립니다 — 화면에서 조상이 위에 있어야 읽힙니다. */
    for (let g = p.up.length - 1; g >= 0; g--) {
      const n = p.slots[g];
      const cells = [];
      for (let s = 0; s < n; s++) {
        const node = p.up[g].filter(x => x.slot === s)[0];
        cells.push(pedCell(node, g));
      }
      rows += '<div class="pedrow" style="grid-template-columns:repeat(' + n + ',1fr)">'
            + cells.join('') + '</div>'
            + '<div class="pedlink" aria-hidden="true"></div>';
    }
    /* 본인 */
    rows += '<div class="pedrow" style="grid-template-columns:1fr">'
          + pedCell({ animal: p.root, slot: 0 }, -1, true) + '</div>';

    let h = '<div class="pad"><div class="lbl">' + I.t('pedigree') + '</div>'
      + '<div class="hint">' + I.t('pedigreeKnown', {
        filled: I.formatNumber(p.known.filled), total: I.formatNumber(p.known.total)
      }) + '</div>'
      + '<div class="pedgens">' + [2, 3, 4].map(v =>
          '<button class="mode' + (up === v ? ' on' : '') + '" data-upgen="' + v + '">'
          + I.t('generation', { count: I.formatNumber(v) }) + '</button>').join('') + '</div>'
      + '<div class="pedscroll"><div class="pedtree" style="min-width:' + W + 'px">'
      + rows + '</div></div>';

    /* 근친 신호 — 족보를 그리는 가장 큰 이유입니다 */
    if (p.repeats.length) {
      h += '<div class="note warn">' + icon('bi-exclamation-triangle')
        + '<span>' + esc(I.t('repeatedAncestor', { names: p.repeats.map(r =>
          (r.name || I.t('unnamed')) + ' ' + I.t('countTimes', { count: I.formatNumber(r.count) })).join(', ')
        })) + '</span></div>';
    }
    if (p.cycles.length) {
      h += '<div class="note warn">' + icon('bi-exclamation-triangle')
        + '<span>' + esc(I.t('pedigreeCycle', { names: p.cycles.map(c => c.name || I.t('unnamed')).join(', ') })) + '</span></div>';
    }

    /* 자식 */
    if (p.children.length) {
      h += '<div class="lbl2">' + I.t('children', { count: I.formatNumber(p.children.length) }) + '</div>'
        + '<div class="pedkids">' + p.children.map(function (c) {
            return '<a class="pedkid" href="' + I.url('/care/animal.html', { id: c.animal.id }) + '">'
              + pedFace(c.animal)
              + '<div class="pedname">' + esc(c.animal.name || I.t('unnamed')) + '</div>'
              /* 족보에서 쓰는 표기 그대로 '× 짝이름'. 조사를 붙이면
                 이름 끝 받침에 따라 '와/과' 가 갈려서 틀린 쪽이 나옵니다. */
              + '<div class="pedmate">' + (c.mate ? '× ' + esc(c.mate.name || I.t('unnamed'))
                                                  : (c.mateId ? '× ' + I.t('deletedAnimal') : I.t('mateMissing')))
              + '</div></a>';
          }).join('') + '</div>';
    }
    return h + '</div>';
  }

  function pedFace(a) {
    if (!a) return '<div class="pedface none">?</div>';
    if (a.photo_url) return '<div class="pedface">' + Photo.tag(a.photo_url, '') + '</div>';
    return '<div class="pedface">' + speciesOf(a).icon + '</div>';
  }

  function pedCell(node, gen, isRoot) {
    if (!node) return '<div class="pedcell empty"></div>';
    const a = node.animal;
    /* 부모 칸은 짝수=부, 홀수=모 입니다 (buildPedigree 의 자리 규칙) */
    const role = isRoot ? '' : (node.slot % 2 === 0 ? I.t('roleFather') : I.t('roleMother'));

    if (!a) {
      return '<div class="pedcell"><div class="pedbox missing">'
        + '<div class="pedface none">?</div>'
        + '<div class="pedname">' + I.t('deletedAnimal') + '</div>'
        + (role ? '<div class="pedrole">' + role + '</div>' : '') + '</div></div>';
    }
    const cls = 'pedbox' + (isRoot ? ' root' : '') + (node.repeated ? ' repeated' : '');
    const inner = pedFace(a)
      + '<div class="pedname">' + esc(a.name || I.t('unnamed')) + '</div>'
      + (role ? '<div class="pedrole">' + role + '</div>' : '');
    return '<div class="pedcell">'
      + (isRoot
          ? '<div class="' + cls + '">' + inner + '</div>'
          : '<a class="' + cls + '" href="' + I.url('/care/animal.html', { id: a.id }) + '">' + inner + '</a>')
      + '</div>';
  }

  /* 체중 곡선. 종별로 흔한 범위를 배경 띠로 함께 그립니다 — 값 하나만 보면
     그게 큰 편인지 작은 편인지 알 수 없습니다. */
  function weightBlock() {
    const w = S.weights.slice().sort((a, b) => a.measured_on < b.measured_on ? -1 : 1);
    const sum = C.weightSummary(w);
    let h = '<div class="pad"><div class="lbl">' + I.t('weight') + '</div>';

    if (sum.count >= 2) {
      h += '<div class="wstat">'
        + '<span><b>' + I.formatNumber(sum.latest) + 'g</b>' + I.t('latest') + ' · ' + esc(I.formatDate(sum.latestOn, { month: 'short', day: 'numeric' })) + '</span>'
        + '<span>' + I.t('minMaxWeight', { min: I.formatNumber(sum.min), max: I.formatNumber(sum.max) }) + '</span>'
        + (sum.delta == null ? '' : '<span>' + I.t('totalWeightChange', { change: (sum.delta > 0 ? '+' : '') + I.formatNumber(sum.delta) }) + '</span>')
        + '</div>' + chart(w);
    } else if (sum.count === 1) {
      h += '<div class="wstat"><span><b>' + I.formatNumber(sum.latest) + 'g</b>' + esc(I.formatDate(sum.latestOn, { month: 'short', day: 'numeric' })) + '</span></div>'
        + '<div class="hint">' + I.t('graphAfterTwo') + '</div>';
    } else {
      h += '<div class="hint">' + I.t('noWeight') + '</div>';
    }

    const rng = speciesOf(S.animal).weightRange;
    h += '<div class="row2" style="margin-top:10px">'
      + '<input class="in" id="w_g" type="number" step="0.1" placeholder="' + esc(I.t('weightPlaceholder')) + '" inputmode="decimal">'
      + '<input class="in" id="w_d" type="date" value="' + C.today() + '" aria-label="' + esc(I.t('measuredDate')) + '">'
      + '</div>'
      + '<div class="hint">' + esc(I.t('speciesWeightHint', { species: I.speciesName(S.animal.species), min: rng[0], max: rng[1] })) + '</div>'
      + '<div class="err" id="w_err"></div>'
      + '<button class="btn wide" id="w_save" style="margin-top:6px">' + icon('bi-check-lg') + I.t('weightRecord') + '</button>'
      + '</div>';
    return h;
  }

  function chart(w) {
    const W = 660, H = 190, PADL = 40, PADR = 14, PADT = 18, PADB = 26;
    const vals = w.map(x => Number(x.grams));
    const rng = speciesOf(S.animal).weightRange;
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    /* 종별 범위가 값 근처면 함께 보이게 축을 넓힙니다. 범위가 값에서 아주
       멀면(어린 개체 등) 무리해서 넣지 않습니다 — 그래프가 납작해집니다. */
    if (rng[0] > lo - (hi - lo) * 2) lo = Math.min(lo, rng[0]);
    if (rng[1] < hi + (hi - lo) * 2) hi = Math.max(hi, rng[1]);
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    const span = hi - lo;

    const t0 = C.parseYmd(w[0].measured_on).getTime();
    const t1 = C.parseYmd(w[w.length - 1].measured_on).getTime();
    const dt = Math.max(1, t1 - t0);
    const X = x => PADL + (C.parseYmd(x.measured_on).getTime() - t0) / dt * (W - PADL - PADR);
    const Y = g => PADT + (1 - (Number(g) - lo) / span) * (H - PADT - PADB);

    const pts = w.map(x => [Math.round(X(x) * 10) / 10, Math.round(Y(x.grams) * 10) / 10]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    const area = line + ' L' + pts[pts.length - 1][0] + ' ' + (H - PADB) + ' L' + pts[0][0] + ' ' + (H - PADB) + ' Z';

    const bandTop = Y(Math.min(rng[1], hi)), bandBot = Y(Math.max(rng[0], lo));
    const gridVals = [lo, lo + span / 2, hi].map(v => Math.round(v * 10) / 10);

    return '<svg class="wchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="' + esc(I.t('weightChartAria', { min: gridVals[0], max: gridVals[2], count: I.formatNumber(w.length) })) + '">'
      /* 종별 범위 띠 */
      + '<rect x="' + PADL + '" y="' + bandTop + '" width="' + (W - PADL - PADR)
      + '" height="' + Math.max(0, bandBot - bandTop) + '" fill="var(--leaf)" opacity=".07"/>'
      + gridVals.map(v => '<line x1="' + PADL + '" y1="' + Y(v) + '" x2="' + (W - PADR) + '" y2="' + Y(v)
          + '" stroke="var(--hair)" stroke-width="1"/>'
          + '<text x="' + (PADL - 6) + '" y="' + (Y(v) + 4) + '" font-size="11" fill="var(--ink2)" text-anchor="end">'
          + v + '</text>').join('')
      + '<path d="' + area + '" fill="var(--teal)" opacity=".10"/>'
      + '<path d="' + line + '" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'
      + pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="var(--teal)"/>').join('')
      + '<text x="' + PADL + '" y="' + (H - 6) + '" font-size="11" fill="var(--ink2)">' + esc(w[0].measured_on.slice(2)) + '</text>'
      + '<text x="' + (W - PADR) + '" y="' + (H - 6) + '" font-size="11" fill="var(--ink2)" text-anchor="end">'
      + esc(w[w.length - 1].measured_on.slice(2)) + '</text>'
      + '</svg>';
  }

  /* 12주 히트맵 — 빠진 구간이 눈에 띄게 */
  function heatmap() {
    const days = C.dailyCounts(S.records, 84, C.today());
    /* 첫 칸이 일요일에 오도록 앞을 비웁니다. 안 맞추면 요일 줄이 어긋나
       '주말에 자주 빠진다' 같은 것이 안 보입니다. */
    const pad = days[0].weekday;
    const cells = new Array(pad).fill(null).concat(days);
    const max = Math.max(1, Math.max.apply(null, days.map(d => d.count)));

    return '<div class="pad"><div class="lbl">' + I.t('recent12Weeks') + '</div>'
      + '<div class="hint">' + I.t('heatmapHint') + '</div>'
      + '<div class="heat">' + cells.map(function (d) {
          if (!d) return '<span class="hc pad"></span>';
          const lv = d.count === 0 ? 0 : Math.min(4, Math.ceil(d.count / max * 4));
          return '<span class="hc l' + lv + '" title="' + I.formatDate(d.date) + ' · ' + I.t('countItems', { count: I.formatNumber(d.count) }) + '"></span>';
        }).join('') + '</div>'
      + '<div class="heatlg"><span>' + I.t('less') + '</span>'
      + [0, 1, 2, 3, 4].map(l => '<span class="hc l' + l + '"></span>').join('')
      + '<span>' + I.t('more') + '</span></div></div>';
  }

  /* 최근 기록 — 지울 수 있게 */
  function timeline() {
    const rows = S.records.slice()
      .sort((a, b) => a.done_date < b.done_date ? 1 : a.done_date > b.done_date ? -1 : (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 40);
    if (!rows.length) {
      return '<div class="pad"><div class="lbl">' + I.t('recentRecords') + '</div><div class="empty">'
        + icon('bi-journal') + I.t('recentRecordsEmpty') + '</div></div>';
    }
    let last = '';
    let h = '<div class="pad"><div class="lbl">' + I.t('recentRecords') + '</div><div class="tl">';
    rows.forEach(function (r) {
      if (r.done_date !== last) {
        last = r.done_date;
        const wd = I.weekdayShort(C.weekdayOf(r.done_date));
        h += '<div class="tld">' + esc(I.formatDate(r.done_date, { month: 'short', day: 'numeric' })) + ' (' + wd + ')</div>';
      }
      const i = C.kindInfo(r.kind);
      let title = r.title || r.detail || r.note || I.kindName(r.kind);
      if (r.kind === 'symptom') {
        title = (r.title === 'resolved' || r.title === '해소') ? I.t('resolved') : I.signName(r.detail);
      } else if (r.title === i.ko) {
        title = I.kindName(r.kind);
      }
      h += '<div class="tlr">'
        + '<span class="kind" style="color:' + i.color + '">'
        + '<i class="bi ' + i.icon + '" aria-hidden="true"></i>' + esc(I.kindName(r.kind)) + '</span>'
        + '<span class="tlt">' + esc(title) + '</span>'
        + '<button class="mini del" data-delrec="' + r.id + '" aria-label="' + esc(I.t('deleteRecordAria')) + '">'
        + icon('bi-x-lg') + '</button></div>';
    });
    return h + '</div></div>';
  }

  /* =============================================================================
     공유 — QR · 링크
     -----------------------------------------------------------------------------
     주인이 켜면 주소가 하나 생기고, 그 주소를 받은 사람은 로그인 없이
     '보여주기로 한 것' 만 봅니다. 무엇이 나갈지는 서버가 정합니다
     (supabase_v18.sql 의 public_animal). 여기서는 켜고 끄고 주소를 보여줄 뿐,
     내보낼 항목을 화면에서 고르지 않습니다 — 그렇게 만들면 화면을 고치다가
     실수로 내보내게 됩니다.

     ⚠️ 사진은 지금도 누구나 열 수 있는 주소에 있습니다. 공개를 꺼도 사진
        주소를 이미 받은 사람은 그 사진을 계속 볼 수 있습니다. 그래서 화면에
        그대로 적어 둡니다 — 끄면 사진까지 회수된다고 믿게 두면 안 됩니다.
     ============================================================================= */
  function shareBlock() {
    const a = S.animal;
    const on = a.is_public === true;
    const url = a.share_token
      ? location.origin + I.url('/care/p.html', { t: a.share_token }) : '';

    let h = '<div class="pad"><div class="lbl">' + I.t('shareQr') + '</div>'
      + '<div class="hint">' + I.t('shareHint') + '</div>'

      + '<div class="shareon">'
      + '<button class="sw' + (on ? ' on' : '') + '" id="sh_toggle" role="switch" '
      + 'aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(I.t('publicAria')) + '"></button>'
      + '<span class="swl">' + (on ? I.t('publicOn') : I.t('private'))
      + '<small>' + (on ? I.t('publicKnownOnly') : I.t('publicCreatesUrl')) + '</small></span></div>'

      + '<div class="lbl2"><label for="sh_note">' + I.t('publicIntro') + '</label></div>'
      + '<textarea class="in" id="sh_note" placeholder="' + esc(I.t('publicIntroPlaceholder')) + '">'
      + esc(a.public_note || '') + '</textarea>'
      /* 비공개 메모와 다른 칸이라는 것을 반드시 알려야 합니다. 같은 칸으로
         오해하면 개인 메모를 적어두고 공개하는 사고가 납니다. */
      + '<div class="hint">' + icon('bi-shield-check')
      + esc(I.t('privateMemoNotice')) + '</div>'

      + '<label class="tokchk" style="display:flex;align-items:center;gap:8px;margin:10px 0;font-size:13px">'
      + '<input type="checkbox" id="sh_breeder"' + (a.public_breeder ? ' checked' : '') + '>'
      + I.t('showBreeder') + '</label>'
      + '<div class="hint">' + I.t('breederHint') + '</div>'

      /* 링크 공유와 목록 노출은 전혀 다른 결정이라 따로 묻습니다.
         분양 상대 한 사람에게 보여주려고 켠 것이 갤러리에 함께 올라가면
         주인은 그런 선택을 한 줄도 모릅니다. */
      + '<label class="tokchk" style="display:flex;align-items:center;gap:8px;margin:12px 0 0;font-size:13px">'
      + '<input type="checkbox" id="sh_listed"' + (a.is_listed ? ' checked' : '') + '>'
      + I.t('listGallery') + '</label>'
      + '<div class="hint">' + I.t('galleryListingHint') + ' '
      + '<a href="' + I.url('/care/gallery.html') + '" target="_blank" rel="noopener">' + I.t('galleryHeader') + '</a></div>'

      + '<div class="err" id="sh_err"></div>'
      + '<button class="btn wide" id="sh_save" style="margin-top:10px">'
      + icon('bi-check-lg') + I.t('saveSharing') + '</button>';

    if (on && url) {
      h += '<div class="lbl2">' + I.t('shareUrl') + '</div>'
        + '<div class="shareurl"><input id="sh_url" value="' + esc(url) + '" readonly aria-label="' + esc(I.t('shareUrl')) + '">'
        + '<button class="btn sm" id="sh_copy">' + icon('bi-clipboard') + I.t('copy') + '</button></div>'
        + '<div class="row2" style="margin-top:8px">'
        + '<a class="btn ghost sm" href="' + esc(url) + '" target="_blank" rel="noopener" style="text-decoration:none">'
        + icon('bi-box-arrow-up-right') + I.t('open') + '</a>'
        + '<button class="btn ghost sm" id="sh_rotate">' + icon('bi-arrow-clockwise') + I.t('rotateUrl') + '</button>'
        + '</div>'
        + '<div id="sh_qr"></div>'
        + '<div class="hint" style="margin-top:12px">' + icon('bi-exclamation-triangle')
        + I.t('photoSignedUrlWarning') + '</div>'
        + '<div class="hint">' + I.t('oldUrlWarning') + '</div>';
    }
    return h + '</div>';
  }

  /* QR 은 그릴 때만 라이브러리를 받아옵니다. 공개하지 않는 사람에게는
     필요 없는 파일이라 페이지에 미리 걸어두지 않았습니다. */
  let qrLoading = null;
  function ensureQr() {
    if (window.qrcode) return Promise.resolve(true);
    if (qrLoading) return qrLoading;
    qrLoading = new Promise(function (done) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload = () => done(true);
      s.onerror = () => done(false);
      document.head.appendChild(s);
    });
    return qrLoading;
  }

  async function drawQr() {
    const box = $('sh_qr');
    if (!box || !S.animal.share_token || S.animal.is_public !== true) return;
    const url = location.origin + I.url('/care/p.html', { t: S.animal.share_token });
    const ok = await ensureQr();
    if (!ok) {
      box.innerHTML = '<div class="hint">' + I.t('qrFailure') + '</div>';
      return;
    }
    /* typeNumber 0 = 내용 길이에 맞춰 자동. 'M' 은 흔히 쓰는 오류정정 수준입니다. */
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = '<div class="qrbox">' + qr.createImgTag(5, 8)
      + '<div class="qcap">' + I.t('qrCaption') + '</div></div>';
  }

  /* 이 개체의 반복 계획 */
  function planList() {
    const mine = S.plans.filter(p => p.animal_id === S.id);
    const shared = S.plans.filter(p => !p.animal_id);
    if (!mine.length && !shared.length) {
      return '<div class="pad"><div class="lbl">' + I.t('repeatPlans') + '</div><div class="empty">'
        + icon('bi-arrow-repeat') + I.t('noAnimalPlans')
        + '<div style="margin-top:10px"><a href="' + I.url('/care/#plans') + '">' + I.t('care') + '</a></div></div></div>';
    }
    const row = p => {
      const i = C.kindInfo(p.kind), st = C.planStatus(p, C.today(),
        S.records.filter(r => r.plan_id === p.id).map(r => r.done_date));
      return '<div class="card">'
        + '<div class="thumb" style="background:' + i.color + '1a;border-color:' + i.color + '33;color:' + i.color + '">'
        + '<i class="bi ' + i.icon + '" aria-hidden="true"></i></div>'
        + '<div class="info"><div class="nm">' + esc(p.title ? I.presetTitle(p.title) : I.kindName(p.kind))
        + (p.animal_id ? '' : '<span class="chip">' + I.t('common') + '</span>') + '</div>'
        + '<div class="ms">' + esc(I.cycleLabel(p))
        + (st.due ? ' · <b style="color:var(--teal)">' + I.t('today') + '</b>' : st.next ? ' · ' + I.t('nextDate', { date: I.formatDate(st.next, { month: 'short', day: 'numeric' }) }) : '')
        + (st.overdue ? ' · <b style="color:var(--warn-fg)">' + I.t('daysOverdue', { count: I.formatNumber(st.overdue) }) + '</b>' : '')
        + '</div></div></div>';
    };
    return '<div class="pad"><div class="lbl">' + I.t('repeatPlans') + '</div>'
      + mine.map(row).join('') + shared.map(row).join('') + '</div>';
  }

  /* =============================================================================
     그리기
     ============================================================================= */
  function render() {
    const a = S.animal;
    const sp = speciesOf(a);
    $('aname').textContent = a.name || I.t('unnamed');
    $('asub').innerHTML = sp.icon + ' ' + esc(I.speciesName(a.species))
      + (a.sex === 'male' ? ' · ' + I.t('sexMale') + ' ♂' : a.sex === 'female' ? ' · ' + I.t('sexFemale') + ' ♀' : '')
      + (a.note ? ' · ' + esc(a.note) : '');

    $('body').innerHTML =
        window.CarePhotos.galleryHtml(a, sp.icon)
      + statCards()
      + openSigns()
      + quickBar()
      + lastBar()
      + weightBlock()
      + pedigreeBlock()
      + heatmap()
      + timeline()
      + planList()
      + shareBlock()
      + '<div class="hint" style="text-align:center;margin-top:18px">'
      + I.t('recordDisclaimer') + '</div>';

    /* 사진은 비공개 버킷이라 서명 주소를 받아야 보입니다 (assets/photo.js) */
    Photo.hydrate($('body'), A.sb);
    drawQr();
  }

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('button');
    if (!t) return;
    const d = t.dataset;

    if (d.carePhotoView) return window.CarePhotos.swap(t);
    if (d.quick) {
      return act(() => A.addRecord({ animal_id: S.id, kind: d.quick, title: null }),
        I.t('recorded', { name: I.kindName(d.quick) }));
    }
    if (d.delrec) return act(() => A.deleteRecord(d.delrec), I.t('removed'));
    if (d.upgen) { S.upGen = parseInt(d.upgen, 10); return render(); }

    /* ── 공유 ── */
    if (t.id === 'sh_toggle') {
      /* 화면에서만 뒤집고 저장은 아래 버튼으로 합니다. 토글이 곧 저장이면
         소개글을 적기 전에 공개돼 버립니다. */
      t.classList.toggle('on');
      t.setAttribute('aria-checked', t.classList.contains('on') ? 'true' : 'false');
      const l = t.parentNode.querySelector('.swl');
      const on = t.classList.contains('on');
      l.firstChild.textContent = on ? I.t('publicOn') : I.t('private');
      l.querySelector('small').textContent = on
        ? I.t('publicSaveNeeded') : I.t('privateSaveNeeded');
      return;
    }
    if (t.id === 'sh_save') {
      const want = $('sh_toggle').classList.contains('on');
      return act(() => A.setShare(S.id, want, $('sh_note').value, $('sh_breeder').checked, false, $('sh_listed').checked),
                 want ? I.t('madePublic') : I.t('madePrivate'));
    }
    if (t.id === 'sh_rotate') {
      if (!confirm(I.t('rotateConfirm'))) return;
      return act(() => A.setShare(S.id, true, $('sh_note').value, $('sh_breeder').checked, true, $('sh_listed').checked),
                 I.t('rotated'));
    }
    if (t.id === 'sh_copy') {
      const el = $('sh_url');
      el.select();
      const done = () => toast(I.t('copied'));
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.value).then(done, () => toast(I.t('copyFailed')));
      } else {
        /* 구형 브라우저와 일부 인앱 브라우저용. 실패해도 값은 선택돼 있어
           사용자가 직접 복사할 수 있습니다. */
        try { document.execCommand('copy'); done(); }
        catch (e) { toast(I.t('copyFailed')); }
      }
      return;
    }
    if (t.id === 'w_save') {
      const g = parseFloat($('w_g').value);
      if (!(g > 0)) { $('w_err').textContent = I.t('weightRequired'); return; }
      const rng = speciesOf(S.animal).weightRange;
      if ((g < rng[0] || g > rng[1]) &&
          !confirm(I.t('weightOutOfRange', { grams: g, species: I.speciesName(S.animal.species), min: rng[0], max: rng[1] }))) return;
      return act(() => A.saveWeight(S.id, g, $('w_d').value), I.t('weightSaved'));
    }
  });

  /* =============================================================================
     시작
     ============================================================================= */
  function gate(iconName, title, body, href, label) {
    $('body').innerHTML = '<div class="gate"><div class="pad">'
      + '<div class="gicon">' + icon(iconName) + '</div>'
      + '<div class="lbl">' + esc(title) + '</div><div class="hint">' + esc(body) + '</div>'
      + '<a class="btn wide" style="text-decoration:none;margin-top:16px" href="' + esc(I.url(href)) + '">'
      + icon('bi-arrow-right') + esc(label) + '</a></div></div>';
  }

  function loginUrl() {
    return I.url('/gecko/login.html', {
      next: location.pathname + location.search + location.hash
    });
  }

  async function boot() {
    if (!A.ready) { gate('bi-plug', I.t('backendTitle'), I.t('backendBody'), '/care/', I.t('back')); return; }

    S.id = new URLSearchParams(location.search).get('id');
    if (!S.id) { gate('bi-question-circle', I.t('animalNotFound'), I.t('animalIdMissing'), '/care/', I.t('careList')); return; }

    await A.boot();
    A.logVisit(I.language());
    if (!A.user) { gate('bi-person-lock', I.t('loginTitle'), I.t('loginBody'), loginUrl(), I.t('loginAction')); return; }
    if (!A.premium.active) { gate('bi-gem', I.t('premiumTitle'), I.t('premiumBody'), I.url('/gecko/login.html'), I.t('premiumAction')); return; }

    try {
      await loadAll();
    } catch (e) { gate('bi-exclamation-triangle', I.t('loadFailed'), I.friendly(e), '/care/', I.t('careList')); return; }

    /* 남의 개체 id 를 주소에 적어도 RLS 가 걸러 목록에 없습니다. */
    if (!S.animal) { gate('bi-question-circle', I.t('animalNotFound'), I.t('animalUnavailable'), '/care/', I.t('careList')); return; }
    render();
  }

  boot();
})();
