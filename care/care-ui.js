/* =============================================================================
   케어 화면 그리기
   -----------------------------------------------------------------------------
   care-core.js 가 계산하고 care-app.js 가 읽고 쓴 것을 화면에 올립니다.
   여기에는 계산이 없습니다 — 날짜나 주기를 여기서 다시 세면 두 곳이 갈라집니다.
   ============================================================================= */
(function () {
  'use strict';

  const C = window.CareCore;
  const A = window.CareApp;
  const I = window.CareI18n;
  const R = window.CareRoutine;
  const CareTodayUi = window.CareTodayUi;
  const CarePlanUi = window.CarePlanUi;
  const CareHealthUi = window.CareHealthUi;
  const CarePhotos = window.CarePhotos;
  const LifeStage = window.AnimalLifeStage;
  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x];
    });
  }

  /* ── 상태 ─────────────────────────────────────────────────────────────
     화면이 쓰는 값은 전부 여기 모읍니다. 서버에서 받은 것을 여기 넣고,
     바뀌면 다시 받아 넣은 뒤 render() 를 부릅니다. 화면 요소에 값을
     숨겨두지 않습니다 — 그러면 어디가 진짜인지 알 수 없게 됩니다. */
  const S = {
    tab: 'today',
    animals: [], plans: [], records: [], weights: [], feeds: [], streak: 0,
    focus: '',       // 개체 필터 ('' = 전체)
    editAnimal: null, editPlan: null, editFeed: null,
    busy: false
  };
  const AnimalForm = window.createCareAnimalForm({
    state: S, app: A, core: C, i18n: I, photos: CarePhotos, lifeStage: LifeStage,
    element: $, escapeHtml: esc, icon: icon, act: act
  });

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }

  /* 종류 표시 — 계산기 칩이 색 점을 쓰는 자리에 같은 색의 아이콘을 둡니다. */
  function kindTag(k) {
    const i = C.kindInfo(k);
    return '<span class="kind" style="color:' + i.color + '">'
         + '<i class="bi ' + i.icon + '" aria-hidden="true"></i>' + esc(I.kindName(k)) + '</span>';
  }
  function icon(name) {
    return '<i class="bi ' + name + '" aria-hidden="true"></i>';
  }

  /* ── 무료 한도 ─────────────────────────────────────────────────────────
     활성 = 수정·계획 지정·알림이 되는 개체입니다. 무료로 내려온 사람은 10마리만
     활성이고, 나머지는 보기와 삭제만 됩니다.

     quota.active 가 없으면(v54 적용 전, 또는 조회 실패) 전부 활성으로 봅니다.
     화면이 잠기는 쪽으로 틀리면 멀쩡한 사람이 자기 기록을 못 고칩니다. */
  function quota() { return S.quota || { premium: true, active: null, known: false }; }
  function isActiveAnimal(id) {
    const q = quota();
    if (q.premium || !q.active) return true;
    return q.active.indexOf(id) >= 0;
  }
  function overLimit() {
    const q = quota();
    return !q.premium && q.active ? Math.max(0, S.animals.length - q.active.length) : 0;
  }

  function animalById(id) { return S.animals.filter(a => a.id === id)[0] || null; }
  function animalName(id) { const a = animalById(id); return a ? (a.name || I.t('unnamed')) : null; }
  function speciesOf(a) { return C.SPECIES[a && a.species] || C.SPECIES.other; }
  function speciesName(a) { return I.speciesName((a && a.species) || 'other'); }
  function planName(p) { return p.title ? I.presetTitle(p.title) : I.kindName(p.kind); }
  function loginUrl() {
    return I.url('/gecko/login.html', {
      next: location.pathname + location.search + location.hash
    });
  }

  /* ── 데이터 불러오기 ──────────────────────────────────────────────────
     기록은 90일치만 받습니다. 화면에서 쓰는 것은 오늘 상태와 주간 요약뿐이라
     그 이상은 받아봐야 쓰지 않습니다. '마지막으로 청소한 날' 을 되짚는 데
     여유를 두려고 7일이 아니라 90일로 잡았습니다. */
  async function loadAll() {
    const from = C.addDays(C.today(), -90);
    const [animals, plans, records, weights, feeds, streak, quota] = await Promise.all([
      A.listAnimals(), A.listPlans(), A.listRecords(from), A.listWeights(null), A.listFeeds(),
      A.routineStreak(), A.careQuota()
    ]);
    S.animals = animals; S.plans = plans; S.records = records; S.weights = weights; S.feeds = feeds;
    S.streak = streak; S.quota = quota;
    window.CareAnimalEditRoute.activate(S, CarePhotos, A, location, history);
  }

  /* 캘린더에 넣을 주문 안내. 계산은 core 가 합니다. */
  function feedOrders() {
    return S.feeds.filter(f => f.is_active !== false).map(function (f) {
      const fc = C.feedForecast(f, S.plans, C.today());
      if (!fc.orderOn) return null;
      return { id: f.id, name: f.name + (f.brand ? ' (' + f.brand + ')' : ''),
               orderOn: fc.orderOn, emptyOn: fc.emptyOn, buyUrl: f.buy_url };
    }).filter(Boolean);
  }

  async function reload() {
    try { await loadAll(); render(); }
    catch (e) { toast(I.friendly(e)); }
  }

  /* 서버를 건드리는 동작 공통 껍데기. 연타로 같은 요청이 두 번 나가는 것을
     막고, 실패하면 화면을 되돌립니다. */
  async function act(fn, okMsg) {
    if (S.busy) return;
    S.busy = true;
    try {
      const result = await fn();
      await loadAll();
      render();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(result) : okMsg);
      return result;
    } catch (e) {
      toast(I.friendly(e));
      render();
    } finally {
      S.busy = false;
    }
  }

  /* =============================================================================
     오늘
     ============================================================================= */
  function doneDatesFor(planId) {
    return S.records.filter(r => r.plan_id === planId).map(r => r.done_date);
  }

  function tabToday() {
    const day = C.today();
    const routinePlans = S.plans.filter(p => p.is_active !== false);
    const plans = routinePlans
                         .filter(p => !S.focus || p.animal_id === S.focus || !p.animal_id);
    return CareTodayUi.render({
      plans: plans, routinePlans: routinePlans, records: S.records, day: day, streak: S.streak,
      core: C, routine: R, i18n: I, escapeHtml: esc, icon: icon,
      animalName: animalName, planName: planName, kindTag: kindTag
    });
  }

  /* =============================================================================
     개체
     ============================================================================= */
  function tabAnimals() {
    if (S.editAnimal) return animalForm(S.editAnimal);

    const q = quota();
    let h = '';

    /* 남은 자리를 미리 알려 줍니다. 다 채우고 나서 "안 됩니다" 라고 하는 것보다
       채워 가는 동안 보이는 편이 낫습니다.

       무료는 늘 보여 줍니다 — 10마리는 금방 차고, 결제를 권할 자리이기도 합니다.
       유료(50마리)는 8할을 넘겼을 때만 띄웁니다. 3/50 을 매번 보여 주면
       알려 주는 게 아니라 거슬리기만 합니다. */
    const over = overLimit();
    const nearFull = q.limit > 0 && S.animals.length >= Math.ceil(q.limit * 0.8);
    if (q.known && (!q.premium || nearFull)) {
      const full = q.limit > 0 && S.animals.length >= q.limit;
      h += '<div class="quotabar' + (over || full ? ' over' : '') + '">'
        + '<div><b>' + esc(I.t('freeQuotaTitle', {
            used: I.formatNumber(S.animals.length), limit: I.formatNumber(q.limit),
          })) + '</b>'
        + '<div class="quotahint">' + esc(
            over ? I.t('freeQuotaOver', { count: I.formatNumber(over) })
              : full ? I.t('quotaFull', { limit: I.formatNumber(q.limit) })
                /* 관리자가 따로 올려 준 회원은 무료·유료 기본 설명이 맞지
                   않습니다. 10마리라고 적혀 있는데 30마리를 쓰고 있으면
                   문의가 옵니다. */
                : q.custom ? I.t('quotaCustomHint', { limit: I.formatNumber(q.limit) })
                  : q.premium ? I.t('quotaPremiumHint', { limit: I.formatNumber(q.limit) })
                    : I.t('freeQuotaHint', { limit: I.formatNumber(q.limit) })
          ) + '</div></div>'
        /* 유료는 더 권할 것이 없으니 결제 안내를 붙이지 않습니다.

           예전에는 로그인 화면으로 보냈습니다. 여기까지 온 사람은 이미 로그인한
           상태라, 눌러 봐야 자기 계정 화면만 나오고 무엇이 더 열리는지는 알 수
           없었습니다. */
        + (q.premium ? ''
          : '<a class="mini" href="' + esc(I.url('/pricing.html')) + '">'
            + icon('bi-gem') + esc(I.t('premiumAction')) + '</a>')
        + '</div>';
    }

    h += '<button class="btn wide" data-newanimal="1" style="margin-bottom:14px">'
       + icon('bi-plus-lg') + I.t('addAnimal') + '</button>';
    if (!S.animals.length) {
      return h + '<div class="pad"><div class="empty">'
        + icon('bi-heart') + I.t('noAnimalsTitle') + '<br>' + I.t('noAnimalsBody') + '</div></div>';
    }

    /* 종별로 묶어 보여줍니다. 여러 종을 키우면 한 줄로 늘어놓았을 때
       어느 것이 무엇인지 알아보기 어렵습니다. */
    const bySp = {};
    S.animals.forEach(a => { (bySp[a.species] = bySp[a.species] || []).push(a); });

    Object.keys(bySp).forEach(function (sp) {
      const info = C.SPECIES[sp] || C.SPECIES.other;
      h += '<div class="sect"><h2>' + info.icon + ' ' + esc(I.speciesName(sp)) + '</h2>'
         + '<span class="n">' + bySp[sp].length + '</span></div>';
      h += bySp[sp].map(animalCard).join('');
    });
    return h;
  }

  function animalCard(a) {
    const info = speciesOf(a);
    const w = S.weights.filter(x => x.animal_id === a.id).sort((x, y) => x.measured_on < y.measured_on ? -1 : 1);
    const last = w.length ? w[w.length - 1] : null;
    const nPlans = S.plans.filter(p => p.animal_id === a.id && p.is_active !== false).length;

    const bits = [];
    if (last) bits.push(Number(last.grams) + 'g · ' + last.measured_on.slice(5));
    bits.push(I.t('countPlans', { count: I.formatNumber(nPlans) }));
    if (a.hatch_date) bits.push(I.t('hatchDate', { date: I.formatDate(a.hatch_date) }));

    const sex = a.sex === 'male' ? '<span class="chip">' + icon('bi-gender-male chip-sex') + I.t('sexMale') + '</span>'
              : a.sex === 'female' ? '<span class="chip">' + icon('bi-gender-female chip-sex') + I.t('sexFemale') + '</span>' : '';
    const stage = '<span class="chip">' + esc(I.t(LifeStage.labelKey(a.life_stage))) + '</span>';

    /* 무료 한도를 넘어 잠긴 개체. 왜 잠겼는지 보이지 않으면 고장으로 읽힙니다.
       삭제는 되고 수정만 막히므로, 수정 자리에 '활성으로 바꾸기' 를 둡니다. */
    const locked = !isActiveAnimal(a.id);
    const acts = locked
      ? '<button class="mini" data-slotanimal="' + a.id + '">'
        + icon('bi-arrow-up-circle') + esc(I.t('freeSlotActivate')) + '</button>'
      : '<button class="mini" data-editanimal="' + a.id + '">' + icon('bi-pencil') + I.t('edit') + '</button>';

    return '<div class="card' + (locked ? ' card-locked' : '') + '">'
      + '<div class="thumb">' + (a.photo_url ? Photo.tag(a.photo_url, a.name || '') : info.icon) + '</div>'
      + '<div class="info"><div class="nm">' + esc(a.name || I.t('unnamed')) + sex + stage
      + (locked ? '<span class="chip chip-locked">' + icon('bi-lock') + esc(I.t('freeSlotLocked')) + '</span>' : '')
      + '</div>'
      + '<div class="ms">' + esc(bits.join(' · '))
      + (locked ? '<br><span class="lockedwhy">' + esc(I.t('freeSlotLockedWhy')) + '</span>' : '')
      + '</div></div>'
      + '<div class="acts">'
      /* 개체 관리 화면으로. 주소에 id 가 들어가 즐겨찾기에 둘 수 있습니다. */
      + '<a class="mini" href="' + esc(I.url('animal.html?id=' + encodeURIComponent(a.id))) + '">'
      + icon('bi-graph-up') + I.t('manage') + '</a>'
      + acts
      + '</div></div>'
      + (S.focus === a.id ? weightPanel(a) : '');
  }

  function animalForm(a) {
    return AnimalForm.html(a);
  }

  /* ── 체중 ─────────────────────────────────────────────────────────── */
  function weightPanel(a) {
    const w = S.weights.filter(x => x.animal_id === a.id)
                       .sort((x, y) => {
                         if (x.measured_on !== y.measured_on) return x.measured_on < y.measured_on ? -1 : 1;
                         const left = x.measured_at || x.created_at || '';
                         const right = y.measured_at || y.created_at || '';
                         return left < right ? -1 : left > right ? 1 : 0;
                       });
    const rng = speciesOf(a).weightRange;

    let head = '';
    if (w.length) {
      const last = Number(w[w.length - 1].grams);
      const first = Number(w[0].grams);
      const d = Math.round((last - first) * 10) / 10;
      head = '<div class="wstat"><span><b>' + last + 'g</b> ' + I.t('latest') + '</span>'
           + (w.length >= 2 ? '<span>' + (d >= 0 ? '+' : '') + d + 'g · ' + I.t('measurements', { count: I.formatNumber(w.length) }) + '</span>' : '')
           + '</div>';
    }

    return '<div class="pad">'
      + '<div class="lbl">' + esc(a.name || I.t('unnamed')) + ' · ' + I.t('weight') + '</div>'
      + head + sparkline(w)
      + '<div class="row2" style="margin-top:8px">'
      + '<input class="in" id="w_g" type="number" step="0.1" min="' + rng[0] + '" max="' + rng[1] + '" placeholder="' + esc(I.t('weightPlaceholder')) + '" inputmode="decimal">'
      + DateField.html({ id: 'w_d', value: C.today(), max: C.today(), aria: I.t('measuredDate') })
      + '</div>'
      + '<div class="hint">' + I.t('weightSameDayHint') + '</div>'
      + '<div class="err" id="w_err"></div>'
      + '<div class="formbtns"><button class="btn" data-savew="' + a.id + '">'
      + icon('bi-check-lg') + I.t('weightRecord') + '</button>'
      + '<button class="btn ghost" data-weigh="">' + I.t('close') + '</button></div>'
      + '</div>';
  }

  /* 체중 추이 꺾은선. 라이브러리를 쓰지 않고 SVG 를 직접 그립니다 —
     점 몇 개를 잇는 데 외부 파일을 하나 더 받아올 이유가 없습니다. */
  function sparkline(w) {
    if (w.length < 2) {
      return '<div class="hint">' + I.t('graphAfterTwo') + '</div>';
    }
    const W = 640, H = 150, PAD = 26;
    const vals = w.map(x => Number(x.grams));
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1) { lo -= 1; hi += 1; }          // 값이 거의 같으면 납작해집니다
    const span = hi - lo;

    const pt = (x, index) => {
      const px = PAD + index / Math.max(1, w.length - 1) * (W - PAD * 2);
      const py = PAD + (1 - (Number(x.grams) - lo) / span) * (H - PAD * 2);
      return [Math.round(px * 10) / 10, Math.round(py * 10) / 10];
    };
    const pts = w.map(pt);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    const area = line + ' L' + pts[pts.length - 1][0] + ' ' + (H - PAD) + ' L' + pts[0][0] + ' ' + (H - PAD) + ' Z';

    return '<svg class="wchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="' + esc(I.t('weightChartAria', { min: lo, max: hi, count: I.formatNumber(w.length) })) + '">'
      + '<path d="' + area + '" fill="var(--teal)" opacity=".10"/>'
      + '<path d="' + line + '" fill="none" stroke="var(--teal)" stroke-width="2.5" '
      + 'stroke-linejoin="round" stroke-linecap="round"/>'
      + pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="var(--teal)"/>').join('')
      + '<text x="' + PAD + '" y="14" font-size="12" fill="var(--ink2)">' + hi + 'g</text>'
      + '<text x="' + PAD + '" y="' + (H - 6) + '" font-size="12" fill="var(--ink2)">' + lo + 'g</text>'
      + '</svg>';
  }

  /* =============================================================================
     계획
     ============================================================================= */
  function tabPlans() {
    return CarePlanUi.render({
      plans: S.plans, animals: S.animals, feeds: S.feeds, editPlan: S.editPlan,
      calendarOrderCount: feedOrders().length,
      core: C, routine: R, i18n: I, escapeHtml: esc, icon: icon,
      speciesOf: speciesOf, planName: planName
    });
  }

  /* =============================================================================
     먹이 · 용품
     -----------------------------------------------------------------------------
     쓰는 사람이 자기가 먹이는 것을 직접 등록합니다. 우리가 제품 목록을 들고
     있지 않습니다 — 브랜드도 유통도 바뀌고, 목록을 가지는 순간 그게 틀린 채로
     남습니다.

     남은 양과 급여 계획을 알면 언제 떨어질지 나오고, 그 날짜를 캘린더에
     '주문' 일정으로 내보냅니다. 케어 일정과 같은 방식입니다.
     ============================================================================= */
  function tabFeed() {
    if (S.editFeed) return feedForm(S.editFeed);

    const active = S.feeds.filter(f => f.is_active !== false);
    const off = S.feeds.filter(f => f.is_active === false);
    const rows = active.map(f => ({ f: f, fc: C.feedForecast(f, S.plans, C.today()) }));
    /* 급한 것부터. 넉넉한 것은 아래로 내려도 아무도 아쉬워하지 않습니다. */
    const ORDER = { out: 0, expired: 1, now: 2, expiring: 3, soon: 4, ok: 5 };
    rows.sort((a, b) => (ORDER[a.fc.level] - ORDER[b.fc.level])
      || ((a.fc.daysLeft == null ? 9e9 : a.fc.daysLeft) - (b.fc.daysLeft == null ? 9e9 : b.fc.daysLeft)));

    const need = rows.filter(r => ['out', 'now', 'expired', 'expiring'].indexOf(r.fc.level) >= 0);

    let h = '<button class="btn wide" data-newfeed="1" style="margin-bottom:14px">'
          + icon('bi-plus-lg') + I.t('addFeed') + '</button>';

    if (!S.feeds.length) {
      return h + '<div class="pad"><div class="empty">' + icon('bi-box-seam')
        + I.t('feedEmptyTitle') + '<br>' + I.t('feedEmptyBody') + '</div></div>';
    }

    if (need.length) {
      h += '<div class="sect"><h2>' + I.t('orderNeeded') + '</h2><span class="n">' + need.length + '</span></div>';
      h += need.map(r => feedCard(r.f, r.fc)).join('');
      const rest = rows.filter(r => need.indexOf(r) < 0);
      if (rest.length) {
        h += '<div class="sect"><h2>' + I.t('enough') + '</h2><span class="n">' + rest.length + '</span></div>';
        h += rest.map(r => feedCard(r.f, r.fc)).join('');
      }
    } else {
      h += rows.map(r => feedCard(r.f, r.fc)).join('');
    }

    if (off.length) {
      h += '<div class="sect"><h2>' + I.t('unused') + '</h2><span class="n">' + off.length + '</span></div>';
      h += off.map(f => feedCard(f, C.feedForecast(f, S.plans, C.today()))).join('');
    }

    h += '<div class="hint" style="text-align:center;margin-top:16px">'
      + I.t('feedEstimateHint') + '</div>';
    return h;
  }

  function feedCard(f, fc) {
    const k = C.feedKindInfo(f.kind);
    const lv = C.FEED_LEVEL[fc.level] || C.FEED_LEVEL.ok;
    const off = f.is_active === false;
    const usedBy = S.plans.filter(p => p.feed_item_id === f.id && p.is_active !== false);

    const bits = [];
    if (f.amount_left != null) bits.push(I.t('remainingAmount', { amount: I.formatNumber(f.amount_left), unit: f.unit || '' }));
    if (fc.daysLeft != null) bits.push(I.t('aboutDaysLeft', { count: I.formatNumber(fc.daysLeft) }));
    else if (!usedBy.length) bits.push(I.t('noLinkedPlan'));
    else if (!f.per_use) bits.push(I.t('missingPerUse'));
    if (f.expires_on) bits.push(I.t('expires', { date: I.formatDate(f.expires_on) }));

    return '<div class="feedcard' + (off ? ' off' : '') + ' lv-' + lv.tone + '">'
      + '<div class="fctop">'
      + '<span class="kind" style="color:' + k.color + '">'
      + '<i class="bi ' + k.icon + '" aria-hidden="true"></i>' + esc(I.feedKindName(f.kind)) + '</span>'
      + '<span class="fclv ' + lv.tone + '">' + esc(off ? I.t('notUsed') : I.feedLevelName(fc.level)) + '</span>'
      + '</div>'
      + '<div class="fcname">' + esc(f.name)
      + (f.brand ? '<span class="fcbrand">' + esc(f.brand) + '</span>' : '') + '</div>'
      + (fc.pct == null ? '' :
          '<div class="fcbar"><span style="width:' + fc.pct + '%"></span></div>')
      + '<div class="fcsub">' + esc(bits.join(' · ')) + '</div>'
      + (fc.orderOn && !off
          ? '<div class="fcorder">' + icon('bi-calendar-event') + esc(I.t('orderAround', { date: I.formatDate(fc.orderOn) }))
            + (fc.emptyOn ? ' <span class="fcdim">' + esc(I.t('expectedEmpty', { date: I.formatDate(fc.emptyOn) })) + '</span>' : '') + '</div>'
          : '')
      + '<div class="fcacts">'
      + (f.buy_url ? '<a class="mini" href="' + esc(f.buy_url) + '" target="_blank" rel="noopener noreferrer">'
                     + icon('bi-cart') + I.t('buy') + '</a>' : '')
      + '<button class="mini" data-refill="' + f.id + '">' + icon('bi-arrow-clockwise') + I.t('refill') + '</button>'
      + '<button class="mini" data-editfeed="' + f.id + '">' + icon('bi-pencil') + I.t('edit') + '</button>'
      + '</div></div>';
  }

  function feedForm(f) {
    const isNew = !f.id;
    const kinds = Object.keys(C.FEED_KINDS).map(k =>
      '<option value="' + k + '"' + (f.kind === k ? ' selected' : '') + '>'
      + C.FEED_KINDS[k].emoji + ' ' + esc(I.feedKindName(k)) + '</option>').join('');
    const v = x => x == null ? '' : String(x);

    return '<div class="pad">'
      + '<div class="lbl">' + I.t(isNew ? 'addFeed' : 'editFeed') + '</div>'
      + '<div class="hint">' + I.t('feedFormHint') + '</div>'

      + '<div class="lbl2"><label for="fd_name">' + I.t('name') + '</label></div>'
      + '<input class="in" id="fd_name" value="' + esc(f.name || '') + '" placeholder="' + esc(I.t('planNamePlaceholder')) + '">'
      + '<div class="row2">'
      + '<div><div class="lbl2"><label for="fd_kind">' + I.t('type') + '</label></div><select class="in" id="fd_kind">' + kinds + '</select></div>'
      + '<div><div class="lbl2"><label for="fd_brand">' + I.t('brand') + '</label></div>'
      + '<input class="in" id="fd_brand" value="' + esc(f.brand || '') + '"></div>'
      + '</div>'

      + '<div class="lbl2">' + I.t('amount') + '</div>'
      + '<div class="row3">'
      + '<input class="in" id="fd_left" type="number" step="0.1" min="0" inputmode="decimal" placeholder="' + esc(I.t('amountLeft')) + '" value="' + esc(v(f.amount_left)) + '">'
      + '<input class="in" id="fd_full" type="number" step="0.1" min="0" inputmode="decimal" placeholder="' + esc(I.t('amountFull')) + '" value="' + esc(v(f.amount_full)) + '">'
      + '<input class="in" id="fd_unit" placeholder="' + esc(I.t('unit')) + '" value="' + esc(f.unit || 'g') + '">'
      + '</div>'
      + '<div class="hint">' + I.t('amountUnitHint') + '</div>'

      + '<div class="lbl2"><label for="fd_per">' + I.t('perUse') + '</label></div>'
      + '<input class="in" id="fd_per" type="number" step="0.1" min="0" inputmode="decimal" value="' + esc(v(f.per_use)) + '">'
      + '<div class="hint">' + I.t('perUseHint') + '</div>'

      + '<div class="row2">'
      + '<div><div class="lbl2"><label for="fd_opened">' + I.t('openedDate') + '</label></div>'
      + DateField.html({ id: 'fd_opened', value: f.opened_on || '' }) + '</div>'
      + '<div><div class="lbl2"><label for="fd_exp">' + I.t('expiryDate') + '</label></div>'
      + DateField.html({ id: 'fd_exp', value: f.expires_on || '' }) + '</div>'
      + '</div>'
      + '<div class="hint">' + I.t('expiryHint') + '</div>'

      + '<div class="lbl2"><label for="fd_url">' + I.t('buyUrl') + '</label></div>'
      + '<input class="in" id="fd_url" type="url" inputmode="url" value="' + esc(f.buy_url || '') + '" placeholder="https://">'
      + '<div class="lbl2"><label for="fd_lead">' + I.t('arrivalDays') + '</label></div>'
      + '<input class="in" id="fd_lead" type="number" min="0" max="90" inputmode="numeric" value="' + esc(v(f.lead_days == null ? 3 : f.lead_days)) + '">'
      + '<div class="hint">' + I.t('arrivalHint') + '</div>'

      + '<div class="lbl2"><label for="fd_note">' + I.t('optionalNote') + '</label></div>'
      + '<input class="in" id="fd_note" value="' + esc(f.note || '') + '">'

      + '<div class="lbl2"><label for="fd_active">' + I.t('use') + '</label></div>'
      + '<select class="in" id="fd_active">'
      + '<option value="1"' + (f.is_active !== false ? ' selected' : '') + '>' + I.t('using') + '</option>'
      + '<option value="0"' + (f.is_active === false ? ' selected' : '') + '>' + I.t('notUsing') + '</option>'
      + '</select>'

      + '<div class="err" id="fd_err"></div>'
      + '<div class="formbtns"><button class="btn" id="fd_save">' + icon('bi-check-lg') + I.t('save') + '</button>'
      + '<button class="btn ghost" data-cancel="feed">' + I.t('cancel') + '</button>'
      + (isNew ? '' : '<button class="btn danger" data-delfeed="' + f.id + '" style="margin-left:auto">'
                    + icon('bi-trash3') + I.t('delete') + '</button>')
      + '</div></div>';
  }

  /* =============================================================================
     건강 — 증세 관찰
     -----------------------------------------------------------------------------
     루틴 케어(급여·청소)와 성격이 다릅니다. 저건 '할 일' 이고 이건 '본 것'
     입니다. 주기가 없고, 해소될 때까지 이어지며, 수의사에게 보여줄 자료가
     됩니다. 그래서 탭을 나눴습니다.

     ⚠️ 여기서 병명을 말하지 않습니다. 무엇이 보였는지와 언제부터인지만
        남깁니다. care-core.js 의 SIGNS 머리말에 이유가 있습니다.
     ============================================================================= */
  function tabHealth() {
    const resolved = CareHealthUi.resolveAnimalId(S.animals, S.focus);
    if (resolved && !S.focus && S.animals.length === 1) S.focus = resolved;
    return CareHealthUi.render({
      animals: S.animals, focus: S.focus, records: S.records, today: C.today(),
      core: C, i18n: I, escapeHtml: esc, icon: icon
    });
  }

  /* =============================================================================
     요약
     ============================================================================= */
  function tabReport() {
    const target = S.focus ? animalById(S.focus) : null;
    const recs = S.focus ? S.records.filter(r => r.animal_id === S.focus) : S.records;
    /* 개체를 안 고르면 null 을 넘겨 체중 이야기를 빼게 합니다. 빈 배열을 넘기면
       '체중 기록이 없다'고 판단해, 매주 재고 있는 사람에게도 안내가 뜹니다. */
    const wts  = S.focus ? S.weights.filter(w => w.animal_id === S.focus) : null;
    const r = C.weeklySummary(recs, wts, C.today());

    let h = '<div class="pad">'
      + '<div class="lbl">' + I.t('recentSevenDays') + (target ? ' · ' + esc(target.name || I.t('unnamed')) : ' · ' + I.t('whole')) + '</div>'
      + '<div class="hint">' + I.formatDate(r.start) + ' ~ ' + I.formatDate(r.end) + '</div>'
      + '<div class="grid4">'
      + stat(r.feed, I.t('kindFeed')) + stat(r.water, I.t('kindWater')) + stat(r.clean, I.t('kindClean')) + stat(r.supplement, I.t('kindSupplement'))
      + '</div>';

    if (S.focus) {
      h += '<div class="grid4"><div class="stat"><div class="v">' + I.formatNumber(r.weighIns) + '</div><div class="k">' + I.t('weightMeasurements') + '</div></div>'
        + '<div class="stat"><div class="v">' + (r.weightDelta == null ? '–' : (r.weightDelta > 0 ? '+' : '') + r.weightDelta)
        + '</div><div class="k">' + I.t('weightChange') + '</div></div></div>';
    } else {
      h += '<div class="hint">' + I.t('chooseForWeightReport') + '</div>';
    }
    h += '</div>';

    const NOTE_ICON = { warn: 'bi-exclamation-triangle', good: 'bi-check2-circle', info: 'bi-info-circle' };
    h += '<div class="pad"><div class="lbl">' + I.t('noteworthy') + '</div><div style="margin-top:10px"></div>';
    h += r.notes.map(n => '<div class="note ' + n.level + '">'
      + icon(NOTE_ICON[n.level] || 'bi-info-circle') + '<span>' + esc(I.summaryNote(n)) + '</span></div>').join('');
    h += '<div class="safety">' + esc(I.t('safetyNote')) + '</div></div>';
    return h;
  }

  function stat(v, k) {
    return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
  }

  /* =============================================================================
     그리기 · 이벤트
     ============================================================================= */
  function render() {
    /* 개체 필터 */
    const sel = $('focus');
    if (sel) {
      sel.innerHTML = '<option value="">' + I.t('allAnimals') + '</option>' + S.animals.map(a =>
        '<option value="' + a.id + '"' + (S.focus === a.id ? ' selected' : '') + '>'
        + speciesOf(a).icon + ' ' + esc(a.name || I.t('unnamed')) + '</option>').join('');
      $('focusbar').style.display = S.animals.length ? '' : 'none';
    }

    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('on', t.getAttribute('data-t') === S.tab));

    $('body').innerHTML =
      ({ today: tabToday, animals: tabAnimals, plans: tabPlans,
         feed: tabFeed, health: tabHealth, report: tabReport }[S.tab])();
    /* 사진은 비공개 버킷이라 서명 주소를 받아야 보입니다.
       다 그린 뒤 한 번에 채웁니다 (assets/photo.js). */
    Photo.hydrate($('body'), A.sb);

  }

  async function go(tab) {
    if (S.editAnimal) await CarePhotos.cancel();
    S.tab = tab; S.editAnimal = null; S.editPlan = null; S.editFeed = null;
    /* 주소에 남겨 둡니다. 개체 관리 화면에서 /care/#health 로 보내는 링크가
       실제로 그 탭을 열게 하려면 이게 있어야 합니다. 뒤로 가기도 자연스러워집니다. */
    try { history.replaceState(null, '', '#' + tab); } catch (e) {}
    render();
  }

  const TABS = ['today', 'animals', 'plans', 'feed', 'health', 'report'];
  function tabFromHash() {
    const h = (location.hash || '').replace('#', '');
    return TABS.indexOf(h) >= 0 ? h : 'today';
  }

  /* 화면을 다시 그릴 때마다 요소가 새로 만들어지므로, 각 버튼에 리스너를 달지
     않고 문서 하나에서 받아 처리합니다. */
  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('button, [data-go]');
    if (!t) return;
    const d = t.dataset;

    if (t.classList.contains('tab')) return go(t.getAttribute('data-t'));
    if (d.go) return go(d.go);
    if (d.carePhotoRemove) {
      CarePhotos.remove(d.carePhotoRemove);
      CarePhotos.refresh(document, A.sb);
      return;
    }

    /* ── 오늘 ── */
    if (d.tick) {
      const p = S.plans.filter(x => x.id === d.tick)[0];
      if (!p) return;
      const done = doneDatesFor(p.id).indexOf(C.today()) >= 0;
      return act(() => done ? A.undoPlan(p) : A.completePlan(p), done ? I.t('undoneToast') : I.t('completedToast'));
    }

    /* ── 개체 ── */
    if (d.newanimal) {
      S.editAnimal = { species: 'leopard', sex: 'unknown' };
      CarePhotos.begin(S.editAnimal, A);
      return render();
    }
    if (d.editanimal) {
      S.editAnimal = animalById(d.editanimal);
      CarePhotos.begin(S.editAnimal, A);
      return render();
    }
    /* 잠긴 개체를 활성 자리로 올립니다. 자리가 다 찼으면 서버가 거절하고,
       그때는 다른 개체를 먼저 내리라고 알려 줍니다. */
    if (d.slotanimal) {
      return act(function () { return A.setAnimalSlot(d.slotanimal, true); },
        I.t('freeSlotActivated'));
    }
    if (d.cancel === 'animal') {
      return CarePhotos.cancel().then(function () {
        S.editAnimal = null;
        render();
      });
    }
    if (d.cancel === 'plan') { S.editPlan = null; return render(); }
    if (d.cancel === 'feed') { S.editFeed = null; return render(); }

    /* ── 먹이 ── */
    if (d.newfeed) { S.editFeed = { kind: 'staple', unit: 'g', lead_days: 3 }; return render(); }
    if (d.editfeed) { S.editFeed = S.feeds.filter(x => x.id === d.editfeed)[0]; return render(); }
    if (t.id === 'fd_save') return saveFeed();
    if (d.delfeed) {
      if (!confirm(I.t('feedDeleteConfirm'))) return;
      return act(async () => { await A.deleteFeed(d.delfeed); S.editFeed = null; }, I.t('deleted'));
    }
    if (d.refill) {
      const f = S.feeds.filter(x => x.id === d.refill)[0];
      if (!f) return;
      const def = f.amount_full != null ? String(f.amount_full) : '';
      const v = prompt(I.t('refillPrompt', { unit: f.unit || '' }), def);
      if (v == null) return;
      const n = parseFloat(v);
      if (!(n >= 0)) { toast(I.t('numberRequired')); return; }
      return act(() => A.refillFeed(f.id, n), I.t('refilled'));
    }

    if (t.id === 'f_save') return AnimalForm.save();

    if (d.delanimal) {
      if (!confirm(I.t('animalDeleteConfirm'))) return;
      const animal = animalById(d.delanimal);
      return act(async () => {
        await A.deleteAnimal(d.delanimal);
        await CarePhotos.cancel();
        const cleanup = await CarePhotos.deleteAnimalPhotos(animal, A);
        S.editAnimal = null;
        S.focus = '';
        return cleanup;
      }, cleanup => cleanup && cleanup.ok ? I.t('deleted') : CarePhotos.t('cleanupWarning'));
    }

    /* 체중 패널 열기·닫기 — 개체 필터와 같은 값을 씁니다 */
    if (d.weigh !== undefined) { S.focus = (S.focus === d.weigh) ? '' : d.weigh; return render(); }
    if (d.savew) return saveWeight(d.savew);

    /* ── 계획 ── */
    if (d.newplan) { S.editPlan = { kind: 'feed', interval_days: 1, start_date: C.today(), animal_id: S.focus || null }; return render(); }
    if (d.editplan) { S.editPlan = S.plans.filter(x => x.id === d.editplan)[0]; return render(); }
    if (t.id === 'p_save') return savePlan();
    if (d.delplan) {
      if (!confirm(I.t('planDeleteConfirm'))) return;
      return act(async () => { await A.deletePlan(d.delplan); S.editPlan = null; }, I.t('deleted'));
    }
    /* 계획 폼의 반복 방식 토글. 그 폼이 열려 있을 때만 동작해야 합니다 —
       다른 화면에도 data-mode 가 생기면 여기서 없는 요소를 만지고 죽습니다. */
    if (d.mode && document.querySelector('.repeat-panel')) {
      document.querySelectorAll('.mode').forEach(function (mode) {
        const active = mode === t;
        mode.classList.toggle('on', active);
        mode.setAttribute('aria-pressed', String(active));
      });
      document.querySelectorAll('.repeat-panel').forEach(function (panel) {
        panel.hidden = panel.id !== 'm_' + d.mode;
      });
      return;
    }
    if (d.wd !== undefined) {
      t.classList.toggle('on');
      t.setAttribute('aria-pressed', String(t.classList.contains('on')));
      return;
    }
    if (d.weeklyTarget !== undefined) {
      const target = parseInt(d.weeklyTarget, 10);
      $('p_weekly_target').value = String(target);
      document.querySelectorAll('.weekly-target').forEach(function (button) {
        const active = button === t;
        button.classList.toggle('on', active);
        button.setAttribute('aria-pressed', String(active));
      });
      document.querySelectorAll('.weekly-target-preview i').forEach(function (dot, index) {
        dot.classList.toggle('on', index < target);
      });
      const copy = document.querySelector('.weekly-target-copy');
      if (copy) copy.textContent = I.t('weeklyTargetCount', { count: I.formatNumber(target) });
      return;
    }

    /* 주기 프리셋 — 누르면 숫자 칸에 넣고 그 버튼만 켜둡니다. 숫자만 바꾸고
       버튼은 그대로 두면 어떤 게 골라진 건지 알 수 없습니다. */
    if (d.preset) {
      const el = $('p_interval');
      if (el) el.value = d.preset;
      t.parentNode.querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b === t));
      return;
    }
    /* 요일 묶음 — 해당 요일만 켭니다 (더하는 게 아니라 갈아끼웁니다) */
    if (d.wdset !== undefined) {
      const want = d.wdset.split(',');
      document.querySelectorAll('.wd').forEach(function (button) {
        const active = want.indexOf(button.dataset.wd) >= 0;
        button.classList.toggle('on', active);
        button.setAttribute('aria-pressed', String(active));
      });
      t.parentNode.querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b === t));
      return;
    }
    if (t.id === 'preset') return addPreset();
    if (t.id === 'ics') return exportIcs();

    /* ── 증세 ── */
    if (d.sign) {
      const g = C.SIGNS[d.sign];
      if (!g || !S.focus) return;
      const noteEl = $('sg_note');
      const note = noteEl ? noteEl.value.trim() : '';
      const end = d.sact === 'end';
      return act(() => A.addRecord({
        animal_id: S.focus, kind: 'symptom', detail: d.sign,
        title: end ? 'resolved' : 'observing', note: note || null
      }), end ? I.t('symptomResolved') : I.t('recorded', { name: I.signName(d.sign) }));
    }
  });

  document.addEventListener('change', async function (ev) {
    if (ev.target.id === 'focus') { S.focus = ev.target.value; render(); }
    const slot = ev.target.dataset && ev.target.dataset.carePhotoPick;
    if (slot) {
      try {
        const selected = await CarePhotos.select(slot, ev.target.files && ev.target.files[0]);
        if (selected) CarePhotos.refresh(document, A.sb);
      } catch (e) {
        toast(I.friendly(e));
      } finally {
        ev.target.value = '';
      }
    }
  });

  /* ── 저장 동작 ────────────────────────────────────────────────────── */
  function saveWeight(animalId) {
    const g = parseFloat($('w_g').value);
    const a = animalById(animalId);
    const rng = speciesOf(a).weightRange;
    if (!(g > 0)) { $('w_err').textContent = I.t('weightRequired'); return; }
    /* 범위 밖이면 막지 않고 물어봅니다. 실제로 그만한 개체가 있을 수 있고,
       막아버리면 기록할 방법이 없어집니다. 자릿수 실수만 걸러내는 것이 목적입니다. */
    if (g < rng[0] || g > rng[1]) {
      if (!confirm(I.t('weightOutOfRange', { grams: g, species: speciesName(a), min: rng[0], max: rng[1] }))) return;
    }
    act(() => A.saveWeight(animalId, g, $('w_d').value), I.t('weightSaved'));
  }

  function saveFeed() {
    const name = $('fd_name').value.trim();
    if (!name) { $('fd_err').textContent = I.t('nameRequired'); return; }

    const url = $('fd_url').value.trim();
    /* 주소는 http/https 만 받습니다. javascript: 같은 것을 넣어두면 나중에
       '사러 가기' 를 누르는 순간 그게 실행됩니다. */
    if (url && !/^https?:\/\//i.test(url)) {
      $('fd_err').textContent = I.t('urlRequired');
      return;
    }
    const num = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
    const left = num('fd_left'), full = num('fd_full'), per = num('fd_per');
    if ([left, full, per].some(v => v != null && !(v >= 0))) {
      $('fd_err').textContent = I.t('nonnegativeAmount'); return;
    }
    if (per != null && per <= 0) { $('fd_err').textContent = I.t('perUsePositive'); return; }

    const row = Object.assign({}, S.editFeed, {
      name: name, kind: $('fd_kind').value, brand: $('fd_brand').value.trim() || null,
      unit: $('fd_unit').value.trim() || 'g',
      amount_left: left, amount_full: full, per_use: per,
      opened_on: $('fd_opened').value || null, expires_on: $('fd_exp').value || null,
      buy_url: url || null, lead_days: $('fd_lead').value,
      note: $('fd_note').value.trim() || null,
      is_active: $('fd_active').value === '1'
    });
    act(async () => { await A.saveFeed(row); S.editFeed = null; }, I.t('saved'));
  }

  function savePlan() {
    const p = S.editPlan;
    const activeMode = document.querySelector('.mode.on');
    const mode = activeMode ? activeMode.dataset.mode : 'days';
    const weekMode = mode === 'week';
    const targetMode = mode === 'target';
    const wd = weekMode
      ? Array.prototype.slice.call(document.querySelectorAll('.wd.on')).map(b => +b.dataset.wd)
      : [];
    if (weekMode && !wd.length) { $('p_err').textContent = I.t('weekdayRequired'); return; }

    const iv = parseInt($('p_interval').value, 10);
    if (mode === 'days' && (!iv || iv < 1 || iv > 365)) { $('p_err').textContent = I.t('intervalRequired'); return; }
    const weeklyTarget = targetMode ? parseInt($('p_weekly_target').value, 10) : null;
    if (targetMode && (!weeklyTarget || weeklyTarget < 1 || weeklyTarget > 7)) {
      $('p_err').textContent = I.t('weeklyTargetRequired'); return;
    }

    const row = {
      id: p.id,
      animal_id: $('p_animal').value || null,
      kind: $('p_kind').value,
      title: I.canonicalPresetTitle($('p_title').value.trim()) || null,
      detail: I.canonicalPlanDetail($('p_detail').value.trim()) || null,
      feed_item_id: $('p_feed').value || null,
      interval_days: mode === 'days' ? iv : null,
      weekdays: weekMode ? wd : null,
      weekly_target: targetMode ? weeklyTarget : null,
      start_date: $('p_start').value || C.today(),
      time_of_day: $('p_time').value || null,
      is_active: $('p_active').value === '1'
    };
    act(async () => { await A.savePlan(row); S.editPlan = null; }, I.t('saved'));
  }

  /* 종별 기본 계획 한 번에 넣기.
     이미 같은 이름의 계획이 있으면 건너뜁니다 — 두 번 눌러서 같은 것이
     두 개씩 생기면 오늘 할 일이 전부 겹쳐 보입니다. */
  function addPreset() {
    if (!S.animals.length) { toast(I.t('presetNeedAnimal')); return; }
    const target = S.focus ? [animalById(S.focus)] : S.animals;
    const rows = [];
    target.forEach(function (a) {
      const has = S.plans.filter(p => p.animal_id === a.id).map(p => I.canonicalPresetTitle(p.title));
      speciesOf(a).plans.forEach(function (t) {
        if (has.indexOf(t.title) >= 0) return;
        rows.push({
          animal_id: a.id, kind: t.kind, title: t.title, detail: t.detail || null,
          interval_days: t.interval_days || null,
          weekdays: t.weekdays || null,
          start_date: C.today(), is_active: true
        });
      });
    });
    if (!rows.length) { toast(I.t('presetExists')); return; }
    const who = S.focus ? (animalById(S.focus).name || I.t('unnamed')) : I.t('allAnimals');
    if (!confirm(I.t('presetConfirm', { name: who, count: I.formatNumber(rows.length) }))) return;
    act(() => A.addPlans(rows), I.t('presetAdded', { count: I.formatNumber(rows.length) }));
  }

  /* 캘린더 파일 내려받기. 서버를 거치지 않고 브라우저에서 바로 만듭니다. */
  function exportIcs() {
    const names = {};
    S.animals.forEach(a => { names[a.id] = a.name || I.t('unnamed'); });
    /* 케어 일정과 주문 안내를 한 파일에 담습니다. 파일을 두 번 받게 하면
       한쪽만 등록해두고 왜 안 울리냐고 하게 됩니다. */
    const ics = C.buildIcs(S.plans, names, location.hostname || 'ryangstudio.com', feedOrders(), {
      language: I.language().toUpperCase(),
      calendarName: I.t('calendarName'),
      kindName: I.kindName,
      planTitle: I.presetTitle,
      planDetail: I.planDetail,
      orderTitle: name => I.t('calendarOrderTitle', { name: name }),
      orderDescription: date => I.t('calendarOrderDescription', { date: I.formatDate(date) }),
      orderCategory: I.t('calendarOrderCategory')
    });

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'care-' + C.today() + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    /* 곧바로 지우면 사파리에서 내려받기가 취소되는 일이 있습니다. */
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(I.t('calendarDownloaded'));
  }

  /* =============================================================================
     시작
     ============================================================================= */
  async function boot() {
    if (!A.ready) {
      $('body').innerHTML = '<div class="gate"><div class="pad">' + I.t('backendTitle') + '<br>'
        + I.t('backendBody') + '</div></div>';
      return;
    }
    await A.boot();
    A.logVisit(I.language());

    if (!A.user) {
      $('body').innerHTML = '<div class="gate"><div class="pad">'
        + '<div class="gicon">' + icon('bi-person-lock') + '</div>'
        + '<div class="lbl">' + I.t('loginTitle') + '</div>'
        + '<div class="hint">' + I.t('loginBody') + '</div>'
        + '<a class="btn wide" style="text-decoration:none;margin-top:16px" '
        + 'href="' + loginUrl() + '">' + icon('bi-box-arrow-in-right') + I.t('loginAction') + '</a>'
        + '</div></div>';
      return;
    }

    /* 예전에는 여기서 프리미엄이 아니면 통째로 막았습니다. 그러면 써 보지도
       못한 사람에게 결제를 권하는 셈이라, 무료도 들어오게 바꿨습니다.
       무료는 개체 10마리까지 쓰고, 브리딩 관리 같은 브리더용 기능만 잠깁니다.
       한도를 실제로 지키는 곳은 DB 입니다(supabase_v54.sql). */

    /* 헤더 부제를 계정 정보로 바꿉니다. 로그인 전에는 이 도구가 무엇인지
       설명하는 문구가 들어 있고, 들어온 뒤에는 그 설명이 필요 없습니다. */
    $('who').textContent = (A.user.email || '')
      + (A.premium.kind === 'sub' ? ' · ' + I.t('subscription')
        : A.premium.kind === 'trial' ? ' · ' + I.t('trial')
          : A.premium.kind ? ' · ' + I.t('premiumAccess') : '');
    $('acctBtn').style.display = '';
    $('tabs').style.display = '';
    S.tab = tabFromHash();
    await reload();
  }

  boot();
})();
