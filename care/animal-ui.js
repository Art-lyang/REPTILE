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

  const S = { id: null, animal: null, plans: [], records: [], weights: [], busy: false, range: 90 };

  function toast(m) {
    const t = $('toast'); t.textContent = m; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function speciesOf(a) { return C.SPECIES[a && a.species] || C.SPECIES.other; }

  async function loadAll() {
    const [animals, plans, records, weights] = await Promise.all([
      A.listAnimals(), A.listPlans(), A.listRecords(C.addDays(C.today(), -400)), A.listWeights(S.id)
    ]);
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
      + heatmap()
      + timeline()
      + planList()
      + '<div class="hint" style="text-align:center;margin-top:18px">'
      + '여기 숫자는 <b>적어 넣은 기록</b>을 센 것입니다. 했는데 안 적으면 안 한 것으로 나옵니다.<br>'
      + '건강 판단의 근거로 쓰지 마시고, 이상이 의심되면 수의사와 상담하세요.</div>';
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
