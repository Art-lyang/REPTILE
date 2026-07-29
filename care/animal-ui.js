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
    catch (e) { toast(A.friendly(e)); }
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
    const age = C.ageText(S.animal.hatch_date, C.today());

    const cards = [
      { v: rate.rate == null ? '–' : rate.rate + '%', k: '30일 수행률',
        sub: rate.due ? rate.done + '/' + rate.due + '회' : '계획 없음' },
      { v: streak || '–', k: '연속 기록', sub: streak ? '일째' : '오늘 남겨보세요' },
      { v: w.count ? w.latest : '–', k: '최근 체중',
        sub: w.count ? (w.delta30 == null ? w.count + '회 측정'
             : (w.delta30 > 0 ? '+' : '') + w.delta30 + 'g · 30일') : '기록 없음' },
      { v: age || '–', k: '나이', sub: S.animal.hatch_date || '해칭일 미입력' }
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
    return '<div class="pad"><div class="lbl">빠른 기록</div>'
      + '<div class="hint">누르면 오늘 날짜로 바로 남습니다. 잘못 눌렀으면 아래 최근 기록에서 지우세요.</div>'
      + '<div class="quick">' + C.QUICK_KINDS.map(function (k) {
          const i = C.kindInfo(k);
          const on = done.has(k);
          return '<button class="qbtn' + (on ? ' on' : '') + '" data-quick="' + k + '" '
            + 'style="' + (on ? '' : '--qc:' + i.color) + '">'
            + '<i class="bi ' + i.icon + '" aria-hidden="true"></i><span>' + esc(i.ko) + '</span></button>';
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
        + '<i class="bi ' + i.icon + '" aria-hidden="true"></i>' + esc(i.ko) + '</span>'
        + '<span class="lago">' + (d.ago === 0 ? '오늘' : d.ago + '일 전') + '</span>'
        + '<span class="ldate">' + esc(d.date.slice(5)) + '</span></div>';
    });
    if (!rows.length) return '';
    return '<div class="pad"><div class="lbl">마지막으로 한 날</div>'
      + '<div class="lastgrid">' + rows.join('') + '</div></div>';
  }

  /* 관찰 중인 증세. 이 화면은 '한눈에 보는 곳' 이라, 지금 보고 있는 것이
     있으면 위쪽에 있어야 합니다. 기록·해소는 케어 화면의 건강 탭에서 합니다 —
     같은 조작을 두 곳에 두면 한쪽만 고쳐집니다. */
  function openSigns() {
    const st = C.signStatus(S.records, C.today()).filter(s => s.open);
    if (!st.length) return '';
    return '<div class="pad"><div class="lbl">관찰 중인 증세</div>'
      + st.map(function (s) {
          const g = C.SIGNS[s.code] || { ko: s.code, what: '' };
          return '<div class="signcard' + (g.vet ? ' vet' : '') + '" style="margin-top:10px">'
            + '<div class="sgtop"><div class="sgname">' + esc(g.ko) + '</div>'
            + '<div class="sgdays">' + s.days + '일째</div></div>'
            + '<div class="sgwhat">' + esc(g.what) + '</div>'
            + (g.vet ? '<div class="sgvet">' + icon('bi-hospital') + '수의사에게 보이시길 권합니다</div>' : '')
            + '</div>';
        }).join('')
      + '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="/care/#health">'
      + icon('bi-clipboard-pulse') + '건강 탭에서 기록·해소하기</a></div>';
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
      return '<div class="pad"><div class="lbl">족보</div>'
        + '<div class="empty">' + icon('bi-diagram-3')
        + '부모나 자식이 등록되어 있지 않습니다.<br>'
        + '개체를 수정해 <b>혈통</b>을 지정하면 여기에 이어집니다.</div></div>';
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

    let h = '<div class="pad"><div class="lbl">족보</div>'
      + '<div class="hint">등록된 혈통만 그립니다 — '
      + p.known.filled + '/' + p.known.total + '칸이 채워져 있습니다. '
      + '빈 자리는 <b>모른다</b>는 뜻이지 없다는 뜻이 아닙니다.</div>'
      + '<div class="pedgens">' + [2, 3, 4].map(v =>
          '<button class="mode' + (up === v ? ' on' : '') + '" data-upgen="' + v + '">'
          + v + '대</button>').join('') + '</div>'
      + '<div class="pedscroll"><div class="pedtree" style="min-width:' + W + 'px">'
      + rows + '</div></div>';

    /* 근친 신호 — 족보를 그리는 가장 큰 이유입니다 */
    if (p.repeats.length) {
      h += '<div class="note warn">' + icon('bi-exclamation-triangle')
        + '<span>같은 조상이 양쪽 혈통에 나옵니다 — '
        + p.repeats.map(r => esc(r.name) + ' ' + r.count + '회').join(', ')
        + '. 근친 정도를 판단할 때 참고하세요.</span></div>';
    }
    if (p.cycles.length) {
      h += '<div class="note warn">' + icon('bi-exclamation-triangle')
        + '<span>혈통이 자기 자신으로 돌아옵니다 ('
        + p.cycles.map(c => esc(c.name)).join(', ')
        + '). 부모 지정을 잘못한 것으로 보입니다 — 개체 수정에서 확인해 주세요.</span></div>';
    }

    /* 자식 */
    if (p.children.length) {
      h += '<div class="lbl2">자식 ' + p.children.length + '마리</div>'
        + '<div class="pedkids">' + p.children.map(function (c) {
            return '<a class="pedkid" href="animal.html?id=' + encodeURIComponent(c.animal.id) + '">'
              + pedFace(c.animal)
              + '<div class="pedname">' + esc(c.animal.name || '이름 없음') + '</div>'
              /* 족보에서 쓰는 표기 그대로 '× 짝이름'. 조사를 붙이면
                 이름 끝 받침에 따라 '와/과' 가 갈려서 틀린 쪽이 나옵니다. */
              + '<div class="pedmate">' + (c.mate ? '× ' + esc(c.mate.name || '이름 없음')
                                                  : (c.mateId ? '× 지워진 개체' : '짝 미등록'))
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
    const role = isRoot ? '' : (node.slot % 2 === 0 ? '부' : '모');

    if (!a) {
      return '<div class="pedcell"><div class="pedbox missing">'
        + '<div class="pedface none">?</div>'
        + '<div class="pedname">지워진 개체</div>'
        + (role ? '<div class="pedrole">' + role + '</div>' : '') + '</div></div>';
    }
    const cls = 'pedbox' + (isRoot ? ' root' : '') + (node.repeated ? ' repeated' : '');
    const inner = pedFace(a)
      + '<div class="pedname">' + esc(a.name || '이름 없음') + '</div>'
      + (role ? '<div class="pedrole">' + role + '</div>' : '');
    return '<div class="pedcell">'
      + (isRoot
          ? '<div class="' + cls + '">' + inner + '</div>'
          : '<a class="' + cls + '" href="animal.html?id=' + encodeURIComponent(a.id) + '">' + inner + '</a>')
      + '</div>';
  }

  /* 체중 곡선. 종별로 흔한 범위를 배경 띠로 함께 그립니다 — 값 하나만 보면
     그게 큰 편인지 작은 편인지 알 수 없습니다. */
  function weightBlock() {
    const w = S.weights.slice().sort((a, b) => a.measured_on < b.measured_on ? -1 : 1);
    const sum = C.weightSummary(w);
    let h = '<div class="pad"><div class="lbl">체중</div>';

    if (sum.count >= 2) {
      h += '<div class="wstat">'
        + '<span><b>' + sum.latest + 'g</b>최근 · ' + esc(sum.latestOn.slice(5)) + '</span>'
        + '<span>최저 ' + sum.min + ' · 최고 ' + sum.max + 'g</span>'
        + (sum.delta == null ? '' : '<span>전체 ' + (sum.delta > 0 ? '+' : '') + sum.delta + 'g</span>')
        + '</div>' + chart(w);
    } else if (sum.count === 1) {
      h += '<div class="wstat"><span><b>' + sum.latest + 'g</b>' + esc(sum.latestOn.slice(5)) + '</span></div>'
        + '<div class="hint">두 번 이상 재면 그래프가 그려집니다.</div>';
    } else {
      h += '<div class="hint">아직 체중 기록이 없습니다.</div>';
    }

    const rng = speciesOf(S.animal).weightRange;
    h += '<div class="row2" style="margin-top:10px">'
      + '<input class="in" id="w_g" type="number" step="0.1" placeholder="무게 (g)" inputmode="decimal">'
      + '<input class="in" id="w_d" type="date" value="' + C.today() + '" aria-label="측정일">'
      + '</div>'
      + '<div class="hint">' + esc(speciesOf(S.animal).ko) + ' 는 보통 '
      + rng[0] + '~' + rng[1] + 'g 범위입니다. 같은 날 다시 재면 덮어씁니다.</div>'
      + '<div class="err" id="w_err"></div>'
      + '<button class="btn wide" id="w_save" style="margin-top:6px">' + icon('bi-check-lg') + '체중 기록</button>'
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
      + 'aria-label="체중 ' + gridVals[0] + 'g 에서 ' + gridVals[2] + 'g 사이 ' + w.length + '회 측정">'
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

    return '<div class="pad"><div class="lbl">최근 12주</div>'
      + '<div class="hint">칸 하나가 하루입니다. 진할수록 그날 남긴 기록이 많습니다.</div>'
      + '<div class="heat">' + cells.map(function (d) {
          if (!d) return '<span class="hc pad"></span>';
          const lv = d.count === 0 ? 0 : Math.min(4, Math.ceil(d.count / max * 4));
          return '<span class="hc l' + lv + '" title="' + d.date + ' · ' + d.count + '건"></span>';
        }).join('') + '</div>'
      + '<div class="heatlg"><span>적음</span>'
      + [0, 1, 2, 3, 4].map(l => '<span class="hc l' + l + '"></span>').join('')
      + '<span>많음</span></div></div>';
  }

  /* 최근 기록 — 지울 수 있게 */
  function timeline() {
    const rows = S.records.slice()
      .sort((a, b) => a.done_date < b.done_date ? 1 : a.done_date > b.done_date ? -1 : (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 40);
    if (!rows.length) {
      return '<div class="pad"><div class="lbl">최근 기록</div><div class="empty">'
        + icon('bi-journal') + '아직 기록이 없습니다.<br>위 <b>빠른 기록</b>을 눌러 오늘부터 남겨보세요.</div></div>';
    }
    let last = '';
    let h = '<div class="pad"><div class="lbl">최근 기록</div><div class="tl">';
    rows.forEach(function (r) {
      if (r.done_date !== last) {
        last = r.done_date;
        const wd = C.WEEKDAY_KO[C.weekdayOf(r.done_date)];
        h += '<div class="tld">' + esc(r.done_date.slice(5).replace('-', '. ')) + ' (' + wd + ')</div>';
      }
      const i = C.kindInfo(r.kind);
      h += '<div class="tlr">'
        + '<span class="kind" style="color:' + i.color + '">'
        + '<i class="bi ' + i.icon + '" aria-hidden="true"></i>' + esc(i.ko) + '</span>'
        + '<span class="tlt">' + esc(r.title || r.detail || r.note || '') + '</span>'
        + '<button class="mini del" data-delrec="' + r.id + '" aria-label="이 기록 지우기">'
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
      ? location.origin + '/care/p.html?t=' + encodeURIComponent(a.share_token) : '';

    let h = '<div class="pad"><div class="lbl">공유 · QR</div>'
      + '<div class="hint">주소나 QR 을 받은 사람이 이 개체를 볼 수 있습니다. '
      + '분양·판매 기능이 아니라 <b>보여주기 위한 페이지</b>입니다.</div>'

      + '<div class="shareon">'
      + '<button class="sw' + (on ? ' on' : '') + '" id="sh_toggle" role="switch" '
      + 'aria-checked="' + (on ? 'true' : 'false') + '" aria-label="공개"></button>'
      + '<span class="swl">' + (on ? '공개 중' : '비공개')
      + '<small>' + (on ? '주소를 아는 사람만 볼 수 있습니다 (검색에는 안 뜹니다)'
                        : '켜면 공유 주소가 만들어집니다') + '</small></span></div>'

      + '<div class="lbl2"><label for="sh_note">공개 소개글</label></div>'
      + '<textarea class="in" id="sh_note" placeholder="이 개체를 소개하는 글 (선택)">'
      + esc(a.public_note || '') + '</textarea>'
      /* 비공개 메모와 다른 칸이라는 것을 반드시 알려야 합니다. 같은 칸으로
         오해하면 개인 메모를 적어두고 공개하는 사고가 납니다. */
      + '<div class="hint">' + icon('bi-shield-check')
      + ' 개체 정보의 <b>메모</b>는 공개되지 않습니다. 공개 화면에는 이 칸만 나갑니다.</div>'

      + '<label class="tokchk" style="display:flex;align-items:center;gap:8px;margin:10px 0;font-size:13px">'
      + '<input type="checkbox" id="sh_breeder"' + (a.public_breeder ? ' checked' : '') + '>'
      + '내 닉네임을 브리더로 표시</label>'
      + '<div class="hint">계정에 닉네임을 적어두었을 때만 나옵니다. 이메일은 어떤 경우에도 나가지 않습니다.</div>'

      /* 링크 공유와 목록 노출은 전혀 다른 결정이라 따로 묻습니다.
         분양 상대 한 사람에게 보여주려고 켠 것이 갤러리에 함께 올라가면
         주인은 그런 선택을 한 줄도 모릅니다. */
      + '<label class="tokchk" style="display:flex;align-items:center;gap:8px;margin:12px 0 0;font-size:13px">'
      + '<input type="checkbox" id="sh_listed"' + (a.is_listed ? ' checked' : '') + '>'
      + '<b>다른 집사들의 개체</b> 목록에도 올리기</label>'
      + '<div class="hint">끄면 <b>주소를 아는 사람만</b> 볼 수 있습니다. 켜면 '
      + '<a href="/care/gallery.html" target="_blank" rel="noopener">공개 목록</a>에서 누구나 찾아볼 수 있습니다.</div>'

      + '<div class="err" id="sh_err"></div>'
      + '<button class="btn wide" id="sh_save" style="margin-top:10px">'
      + icon('bi-check-lg') + '공개 설정 저장</button>';

    if (on && url) {
      h += '<div class="lbl2">공유 주소</div>'
        + '<div class="shareurl"><input id="sh_url" value="' + esc(url) + '" readonly aria-label="공유 주소">'
        + '<button class="btn sm" id="sh_copy">' + icon('bi-clipboard') + '복사</button></div>'
        + '<div class="row2" style="margin-top:8px">'
        + '<a class="btn ghost sm" href="' + esc(url) + '" target="_blank" rel="noopener" style="text-decoration:none">'
        + icon('bi-box-arrow-up-right') + '열어보기</a>'
        + '<button class="btn ghost sm" id="sh_rotate">' + icon('bi-arrow-clockwise') + '주소 새로 만들기</button>'
        + '</div>'
        + '<div id="sh_qr"></div>'
        + '<div class="hint" style="margin-top:12px">' + icon('bi-exclamation-triangle')
        + ' 사진은 공개를 꺼도 <b>이미 사진 주소를 받은 사람은 계속 볼 수 있습니다.</b> '
        + '완전히 막으려면 개체에서 사진을 바꾸거나 지우세요.</div>'
        + '<div class="hint">주소를 새로 만들면 <b>이전 주소는 즉시 열리지 않습니다.</b> '
        + '이미 나눠준 QR 도 함께 죽습니다.</div>';
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
    const url = location.origin + '/care/p.html?t=' + encodeURIComponent(S.animal.share_token);
    const ok = await ensureQr();
    if (!ok) {
      box.innerHTML = '<div class="hint">QR 을 만들지 못했습니다. 위 주소를 복사해 쓰세요.</div>';
      return;
    }
    /* typeNumber 0 = 내용 길이에 맞춰 자동. 'M' 은 흔히 쓰는 오류정정 수준입니다. */
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = '<div class="qrbox">' + qr.createImgTag(5, 8)
      + '<div class="qcap">이 QR 을 찍으면 위 주소가 열립니다</div></div>';
  }

  /* 이 개체의 반복 계획 */
  function planList() {
    const mine = S.plans.filter(p => p.animal_id === S.id);
    const shared = S.plans.filter(p => !p.animal_id);
    if (!mine.length && !shared.length) {
      return '<div class="pad"><div class="lbl">반복 계획</div><div class="empty">'
        + icon('bi-arrow-repeat') + '이 개체에 걸린 계획이 없습니다.<br>'
        + '<a href="/care/#plans">케어 화면</a>에서 종별 기본값을 넣을 수 있어요.</div></div>';
    }
    const row = p => {
      const i = C.kindInfo(p.kind), st = C.planStatus(p, C.today(),
        S.records.filter(r => r.plan_id === p.id).map(r => r.done_date));
      return '<div class="card">'
        + '<div class="thumb" style="background:' + i.color + '1a;border-color:' + i.color + '33;color:' + i.color + '">'
        + '<i class="bi ' + i.icon + '" aria-hidden="true"></i></div>'
        + '<div class="info"><div class="nm">' + esc(p.title || i.ko)
        + (p.animal_id ? '' : '<span class="chip">공통</span>') + '</div>'
        + '<div class="ms">' + esc(C.cycleLabel(p))
        + (st.due ? ' · <b style="color:var(--teal)">오늘</b>' : st.next ? ' · 다음 ' + esc(st.next.slice(5)) : '')
        + (st.overdue ? ' · <b style="color:var(--warn-fg)">' + st.overdue + '일 밀림</b>' : '')
        + '</div></div></div>';
    };
    return '<div class="pad"><div class="lbl">반복 계획</div>'
      + mine.map(row).join('') + shared.map(row).join('') + '</div>';
  }

  /* =============================================================================
     그리기
     ============================================================================= */
  function render() {
    const a = S.animal;
    const sp = speciesOf(a);
    $('aname').textContent = a.name || '이름 없음';
    $('asub').innerHTML = sp.icon + ' ' + esc(sp.ko)
      + (a.sex === 'male' ? ' · 수컷 ♂' : a.sex === 'female' ? ' · 암컷 ♀' : '')
      + (a.note ? ' · ' + esc(a.note) : '');

    $('body').innerHTML =
        statCards()
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
      + '여기 숫자는 <b>적어 넣은 기록</b>을 센 것입니다. 했는데 안 적으면 안 한 것으로 나옵니다.<br>'
      + '건강 판단의 근거로 쓰지 마시고, 이상이 의심되면 수의사와 상담하세요.</div>';

    /* 사진은 비공개 버킷이라 서명 주소를 받아야 보입니다 (assets/photo.js) */
    Photo.hydrate($('body'), A.sb);
    drawQr();
  }

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('button');
    if (!t) return;
    const d = t.dataset;

    if (d.quick) {
      const i = C.kindInfo(d.quick);
      return act(() => A.addRecord({ animal_id: S.id, kind: d.quick, title: i.ko }), i.ko + ' 기록됨');
    }
    if (d.delrec) return act(() => A.deleteRecord(d.delrec), '지웠습니다');
    if (d.upgen) { S.upGen = parseInt(d.upgen, 10); return render(); }

    /* ── 공유 ── */
    if (t.id === 'sh_toggle') {
      /* 화면에서만 뒤집고 저장은 아래 버튼으로 합니다. 토글이 곧 저장이면
         소개글을 적기 전에 공개돼 버립니다. */
      t.classList.toggle('on');
      t.setAttribute('aria-checked', t.classList.contains('on') ? 'true' : 'false');
      const l = t.parentNode.querySelector('.swl');
      const on = t.classList.contains('on');
      l.firstChild.textContent = on ? '공개 중' : '비공개';
      l.querySelector('small').textContent = on
        ? '아래 저장을 눌러야 실제로 공개됩니다'
        : '아래 저장을 눌러야 실제로 닫힙니다';
      return;
    }
    if (t.id === 'sh_save') {
      const want = $('sh_toggle').classList.contains('on');
      return act(() => A.setShare(S.id, want, $('sh_note').value, $('sh_breeder').checked, false, $('sh_listed').checked),
                 want ? '공개했습니다' : '비공개로 바꿨습니다');
    }
    if (t.id === 'sh_rotate') {
      if (!confirm('주소를 새로 만들면 이전 주소와 이미 나눠준 QR 이 즉시 열리지 않습니다.\n계속할까요?')) return;
      return act(() => A.setShare(S.id, true, $('sh_note').value, $('sh_breeder').checked, true, $('sh_listed').checked),
                 '새 주소를 만들었습니다');
    }
    if (t.id === 'sh_copy') {
      const el = $('sh_url');
      el.select();
      const done = () => toast('주소를 복사했습니다');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.value).then(done, () => toast('복사하지 못했습니다. 길게 눌러 복사해 주세요.'));
      } else {
        /* 구형 브라우저와 일부 인앱 브라우저용. 실패해도 값은 선택돼 있어
           사용자가 직접 복사할 수 있습니다. */
        try { document.execCommand('copy'); done(); }
        catch (e) { toast('복사하지 못했습니다. 길게 눌러 복사해 주세요.'); }
      }
      return;
    }
    if (t.id === 'w_save') {
      const g = parseFloat($('w_g').value);
      if (!(g > 0)) { $('w_err').textContent = '무게를 적어주세요.'; return; }
      const rng = speciesOf(S.animal).weightRange;
      if ((g < rng[0] || g > rng[1]) &&
          !confirm(g + 'g 은 ' + speciesOf(S.animal).ko + ' 기준(' + rng[0] + '~' + rng[1] + 'g)을 벗어납니다.\n그대로 기록할까요?')) return;
      return act(() => A.saveWeight(S.id, g, $('w_d').value), '체중을 기록했습니다');
    }
  });

  /* =============================================================================
     시작
     ============================================================================= */
  function gate(iconName, title, body, href, label) {
    $('body').innerHTML = '<div class="gate"><div class="pad">'
      + '<div class="gicon">' + icon(iconName) + '</div>'
      + '<div class="lbl">' + title + '</div><div class="hint">' + body + '</div>'
      + '<a class="btn wide" style="text-decoration:none;margin-top:16px" href="' + href + '">'
      + icon('bi-arrow-right') + label + '</a></div></div>';
  }

  async function boot() {
    if (!A.ready) { gate('bi-plug', '백엔드가 설정되지 않았습니다', 'assets/studio-config.js 를 확인해 주세요.', '/care/', '돌아가기'); return; }

    S.id = new URLSearchParams(location.search).get('id');
    if (!S.id) { gate('bi-question-circle', '개체를 찾을 수 없습니다', '주소에 개체 번호가 없습니다.', '/care/', '케어 목록으로'); return; }

    await A.boot();
    A.logVisit();
    if (!A.user) { gate('bi-person-lock', '로그인이 필요합니다', '케어 기록은 계정에 저장됩니다.', '/gecko/login.html', '로그인'); return; }
    if (!A.premium.active) { gate('bi-gem', '프리미엄 기능입니다', '개체별 기록과 통계를 볼 수 있습니다.', '/gecko/login.html', '프리미엄 코드 입력'); return; }

    try {
      await loadAll();
    } catch (e) { gate('bi-exclamation-triangle', '불러오지 못했습니다', esc(A.friendly(e)), '/care/', '케어 목록으로'); return; }

    /* 남의 개체 id 를 주소에 적어도 RLS 가 걸러 목록에 없습니다. */
    if (!S.animal) { gate('bi-question-circle', '개체를 찾을 수 없습니다', '지워졌거나 내 개체가 아닙니다.', '/care/', '케어 목록으로'); return; }
    render();
  }

  boot();
})();
