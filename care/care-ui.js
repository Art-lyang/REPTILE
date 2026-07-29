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
    animals: [], plans: [], records: [], weights: [],
    focus: '',       // 개체 필터 ('' = 전체)
    editAnimal: null, editPlan: null,
    busy: false
  };

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }

  function animalById(id) { return S.animals.filter(a => a.id === id)[0] || null; }
  function animalName(id) { const a = animalById(id); return a ? (a.name || '이름 없음') : null; }
  function speciesOf(a) { return C.SPECIES[a && a.species] || C.SPECIES.other; }

  /* ── 데이터 불러오기 ──────────────────────────────────────────────────
     기록은 90일치만 받습니다. 화면에서 쓰는 것은 오늘 상태와 주간 요약뿐이라
     그 이상은 받아봐야 쓰지 않습니다. '마지막으로 청소한 날' 을 되짚는 데
     여유를 두려고 7일이 아니라 90일로 잡았습니다. */
  async function loadAll() {
    const from = C.addDays(C.today(), -90);
    const [animals, plans, records, weights] = await Promise.all([
      A.listAnimals(), A.listPlans(), A.listRecords(from), A.listWeights(null)
    ]);
    S.animals = animals; S.plans = plans; S.records = records; S.weights = weights;
  }

  async function reload() {
    try { await loadAll(); render(); }
    catch (e) { toast(A.friendly(e)); }
  }

  /* 서버를 건드리는 동작 공통 껍데기. 연타로 같은 요청이 두 번 나가는 것을
     막고, 실패하면 화면을 되돌립니다. */
  async function act(fn, okMsg) {
    if (S.busy) return;
    S.busy = true;
    try {
      await fn();
      await loadAll();
      render();
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(A.friendly(e));
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
    const plans = S.plans.filter(p => p.is_active !== false)
                         .filter(p => !S.focus || p.animal_id === S.focus || !p.animal_id);

    if (!S.plans.length) {
      return '<div class="pad"><div class="empty">아직 반복 계획이 없습니다.<br>'
        + '<b>계획</b> 탭에서 종별 기본값을 한 번에 넣을 수 있어요.</div>'
        + '<button class="btn wide" data-go="plans">계획 만들러 가기</button></div>';
    }

    const rows = plans.map(p => ({ p: p, st: C.planStatus(p, day, doneDatesFor(p.id)) }));
    const late = rows.filter(r => r.st.overdue > 0 && !r.st.done);
    const now  = rows.filter(r => r.st.due && !r.st.done && r.st.overdue === 0);
    const did  = rows.filter(r => r.st.done);

    let h = '';
    const dayName = C.WEEKDAY_KO[C.weekdayOf(day)];
    h += '<div class="pad"><div class="lbl">' + day.slice(5).replace('-', '월 ') + '일 (' + dayName + ')</div>'
       + '<div class="hint">오늘 할 일 ' + (late.length + now.length) + '건'
       + (did.length ? ' · 완료 ' + did.length + '건' : '') + '</div></div>';

    if (late.length) {
      h += '<div class="sect"><h2>밀린 것</h2><span class="n">' + late.length + '</span></div>';
      h += late.map(r => taskRow(r, true)).join('');
    }
    if (now.length) {
      h += '<div class="sect"><h2>오늘</h2><span class="n">' + now.length + '</span></div>';
      h += now.map(r => taskRow(r, false)).join('');
    }
    if (!late.length && !now.length) {
      h += '<div class="pad"><div class="empty">오늘 할 일을 모두 끝냈습니다 👏</div></div>';
    }
    if (did.length) {
      h += '<div class="sect"><h2>완료</h2><span class="n">' + did.length + '</span></div>';
      h += did.map(r => taskRow(r, false)).join('');
    }
    return h;
  }

  function taskRow(r, isLate) {
    const p = r.p, st = r.st, k = C.kindInfo(p.kind);
    const who = p.animal_id ? animalName(p.animal_id) : '전체';
    const cls = 'task' + (st.done ? ' did' : (isLate ? ' late' : ''));
    let sub = '<span class="chip k" style="background:' + k.color + '">' + esc(k.ko) + '</span>'
            + esc(who) + ' · ' + esc(C.cycleLabel(p));
    if (isLate) sub += ' · <span class="late-t">' + st.overdue + '일 밀림</span>';
    if (p.detail) sub += '<br>' + esc(p.detail);

    return '<div class="' + cls + '">'
      + '<button class="tick' + (st.done ? ' on' : '') + '" data-tick="' + p.id + '" '
      + 'aria-label="' + esc((p.title || k.ko) + ' ' + (st.done ? '완료 취소' : '완료')) + '">'
      + (st.done ? '✓' : '') + '</button>'
      + '<div class="tinfo"><div class="tname">' + esc(p.title || k.ko) + '</div>'
      + '<div class="tsub">' + sub + '</div></div></div>';
  }

  /* =============================================================================
     개체
     ============================================================================= */
  function tabAnimals() {
    if (S.editAnimal) return animalForm(S.editAnimal);

    let h = '<button class="btn wide" data-newanimal="1" style="margin-bottom:12px">＋ 개체 등록</button>';
    if (!S.animals.length) {
      return h + '<div class="pad"><div class="empty">등록한 개체가 없습니다.<br>'
        + '브리딩 관리에 등록한 개체가 있다면 로그인 상태에서 여기에도 함께 보입니다.</div></div>';
    }

    /* 종별로 묶어 보여줍니다. 여러 종을 키우면 한 줄로 늘어놓았을 때
       어느 것이 무엇인지 알아보기 어렵습니다. */
    const bySp = {};
    S.animals.forEach(a => { (bySp[a.species] = bySp[a.species] || []).push(a); });

    Object.keys(bySp).forEach(function (sp) {
      const info = C.SPECIES[sp] || C.SPECIES.other;
      h += '<div class="sect"><h2>' + info.icon + ' ' + esc(info.ko) + '</h2>'
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
    bits.push('계획 ' + nPlans + '개');
    if (a.hatch_date) bits.push('해칭 ' + a.hatch_date);

    return '<div class="card">'
      + '<div class="thumb">' + (a.photo_url ? '<img src="' + esc(a.photo_url) + '" alt="">' : info.icon) + '</div>'
      + '<div class="info"><div class="nm">' + esc(a.name || '이름 없음')
      + (a.sex === 'male' ? ' <span class="chip">♂</span>' : a.sex === 'female' ? ' <span class="chip">♀</span>' : '')
      + '</div><div class="ms">' + esc(bits.join(' · ')) + '</div></div>'
      + '<div class="acts">'
      + '<button class="mini" data-weigh="' + a.id + '">체중</button>'
      + '<button class="mini" data-editanimal="' + a.id + '">수정</button>'
      + '</div></div>'
      + (S.focus === a.id ? weightPanel(a) : '');
  }

  function animalForm(a) {
    const isNew = !a.id;
    const spOpts = Object.keys(C.SPECIES).map(k =>
      '<option value="' + k + '"' + (a.species === k ? ' selected' : '') + '>'
      + C.SPECIES[k].icon + ' ' + esc(C.SPECIES[k].ko) + '</option>').join('');

    return '<div class="pad">'
      + '<div class="lbl">' + (isNew ? '개체 등록' : '개체 수정') + '</div>'
      + '<div class="lbl2">이름</div><input class="in" id="f_name" value="' + esc(a.name || '') + '" placeholder="예) 노랑이">'
      + '<div class="lbl2">종</div><select class="in" id="f_species">' + spOpts + '</select>'
      + '<div class="hint">종을 고르면 그 종에 흔히 쓰는 케어 계획을 한 번에 만들 수 있습니다.</div>'
      + '<div class="row2">'
      + '<div><div class="lbl2">성별</div><select class="in" id="f_sex">'
      + ['unknown:미상', 'male:수컷', 'female:암컷'].map(o => {
          const [v, t] = o.split(':');
          return '<option value="' + v + '"' + ((a.sex || 'unknown') === v ? ' selected' : '') + '>' + t + '</option>';
        }).join('')
      + '</select></div>'
      + '<div><div class="lbl2">해칭·입양일</div><input class="in" id="f_hatch" type="date" value="' + esc(a.hatch_date || '') + '"></div>'
      + '</div>'
      + '<div class="lbl2">메모</div><textarea class="in" id="f_note">' + esc(a.note || '') + '</textarea>'
      + '<div class="err" id="f_err"></div>'
      + '<div class="formbtns"><button class="btn" id="f_save">저장</button>'
      + '<button class="btn ghost" data-cancel="animal">취소</button>'
      + (isNew ? '' : '<button class="btn ghost" data-delanimal="' + a.id + '" style="margin-left:auto;color:var(--warn-fg)">삭제</button>')
      + '</div></div>';
  }

  /* ── 체중 ─────────────────────────────────────────────────────────── */
  function weightPanel(a) {
    const w = S.weights.filter(x => x.animal_id === a.id)
                       .sort((x, y) => x.measured_on < y.measured_on ? -1 : 1);
    const rng = speciesOf(a).weightRange;

    let head = '';
    if (w.length) {
      const last = Number(w[w.length - 1].grams);
      const first = Number(w[0].grams);
      const d = Math.round((last - first) * 10) / 10;
      head = '<div class="wstat"><span><b>' + last + 'g</b> 최근</span>'
           + (w.length >= 2 ? '<span>' + (d >= 0 ? '+' : '') + d + 'g · ' + w.length + '회 측정</span>' : '')
           + '</div>';
    }

    return '<div class="pad">'
      + '<div class="lbl">' + esc(a.name || '이름 없음') + ' 체중</div>'
      + head + sparkline(w)
      + '<div class="row2" style="margin-top:8px">'
      + '<input class="in" id="w_g" type="number" step="0.1" min="' + rng[0] + '" max="' + rng[1] + '" placeholder="무게 (g)" inputmode="decimal">'
      + '<input class="in" id="w_d" type="date" value="' + C.today() + '">'
      + '</div>'
      + '<div class="hint">같은 날 다시 재면 덮어씁니다. 하루에 값이 둘이면 증감이 무엇을 뜻하는지 알 수 없어서입니다.</div>'
      + '<div class="err" id="w_err"></div>'
      + '<div class="formbtns"><button class="btn" data-savew="' + a.id + '">체중 기록</button>'
      + '<button class="btn ghost" data-weigh="">닫기</button></div>'
      + '</div>';
  }

  /* 체중 추이 꺾은선. 라이브러리를 쓰지 않고 SVG 를 직접 그립니다 —
     점 몇 개를 잇는 데 외부 파일을 하나 더 받아올 이유가 없습니다. */
  function sparkline(w) {
    if (w.length < 2) {
      return '<div class="hint">두 번 이상 재면 그래프가 그려집니다.</div>';
    }
    const W = 640, H = 150, PAD = 26;
    const vals = w.map(x => Number(x.grams));
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1) { lo -= 1; hi += 1; }          // 값이 거의 같으면 납작해집니다
    const span = hi - lo;

    const t0 = C.parseYmd(w[0].measured_on).getTime();
    const t1 = C.parseYmd(w[w.length - 1].measured_on).getTime();
    const dt = Math.max(1, t1 - t0);

    const pt = x => {
      const px = PAD + (C.parseYmd(x.measured_on).getTime() - t0) / dt * (W - PAD * 2);
      const py = PAD + (1 - (Number(x.grams) - lo) / span) * (H - PAD * 2);
      return [Math.round(px * 10) / 10, Math.round(py * 10) / 10];
    };
    const pts = w.map(pt);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    const area = line + ' L' + pts[pts.length - 1][0] + ' ' + (H - PAD) + ' L' + pts[0][0] + ' ' + (H - PAD) + ' Z';

    return '<svg class="wchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="체중 ' + lo + 'g 에서 ' + hi + 'g 사이 ' + w.length + '회 측정">'
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
    if (S.editPlan) return planForm(S.editPlan);

    let h = '<div class="pad"><div class="lbl">캘린더로 내보내기</div>'
      + '<div class="hint">파일을 받아 폰에서 열면 구글·애플·삼성 캘린더에 반복 일정으로 들어갑니다. '
      + '그 뒤로는 캘린더가 알아서 알림을 울려 줍니다 — 이 화면을 열어두지 않아도 됩니다.</div>'
      + '<button class="btn wide" id="ics" ' + (S.plans.length ? '' : 'disabled') + '>📅 캘린더 파일 받기'
      + (S.plans.length ? ' (' + S.plans.filter(p => p.is_active !== false).length + '건)' : '') + '</button></div>';

    h += '<div class="row2" style="margin-bottom:12px">'
      + '<button class="btn" data-newplan="1">＋ 계획 추가</button>'
      + '<button class="btn ghost" id="preset">종별 기본값 넣기</button></div>';

    if (!S.plans.length) {
      return h + '<div class="pad"><div class="empty">아직 계획이 없습니다.<br>'
        + '<b>종별 기본값 넣기</b>를 누르면 흔히 쓰는 주기가 한 번에 만들어집니다.</div></div>';
    }

    /* 개체별로 묶습니다. 공통 계획을 맨 위에 둡니다. */
    const groups = [{ id: '', label: '🏠 전체 공통' }].concat(
      S.animals.map(a => ({ id: a.id, label: (speciesOf(a).icon + ' ' + (a.name || '이름 없음')) })));

    groups.forEach(function (g) {
      const list = S.plans.filter(p => (p.animal_id || '') === g.id);
      if (!list.length) return;
      h += '<div class="sect"><h2>' + esc(g.label) + '</h2><span class="n">' + list.length + '</span></div>';
      h += list.map(planCard).join('');
    });
    return h;
  }

  function planCard(p) {
    const k = C.kindInfo(p.kind);
    const off = p.is_active === false;
    return '<div class="card"' + (off ? ' style="opacity:.5"' : '') + '>'
      + '<div class="thumb" style="background:' + k.color + '22">' + k.icon + '</div>'
      + '<div class="info"><div class="nm">' + esc(p.title || k.ko)
      + (off ? ' <span class="chip off">꺼짐</span>' : '') + '</div>'
      + '<div class="ms">' + esc(C.cycleLabel(p))
      + (p.time_of_day ? ' · ' + esc(String(p.time_of_day).slice(0, 5)) : ' · 종일')
      + (p.detail ? ' · ' + esc(p.detail) : '') + '</div></div>'
      + '<div class="acts"><button class="mini" data-editplan="' + p.id + '">수정</button></div></div>';
  }

  function planForm(p) {
    const isNew = !p.id;
    const mode = (p.weekdays && p.weekdays.length) ? 'week' : 'days';
    const kinds = Object.keys(C.CARE_KINDS).map(k =>
      '<option value="' + k + '"' + (p.kind === k ? ' selected' : '') + '>'
      + C.CARE_KINDS[k].icon + ' ' + esc(C.CARE_KINDS[k].ko) + '</option>').join('');
    const aOpts = '<option value="">🏠 전체 공통</option>' + S.animals.map(a =>
      '<option value="' + a.id + '"' + (p.animal_id === a.id ? ' selected' : '') + '>'
      + speciesOf(a).icon + ' ' + esc(a.name || '이름 없음') + '</option>').join('');

    return '<div class="pad">'
      + '<div class="lbl">' + (isNew ? '계획 추가' : '계획 수정') + '</div>'
      + '<div class="row2">'
      + '<div><div class="lbl2">종류</div><select class="in" id="p_kind">' + kinds + '</select></div>'
      + '<div><div class="lbl2">대상</div><select class="in" id="p_animal">' + aOpts + '</select></div>'
      + '</div>'
      + '<div class="lbl2">이름</div><input class="in" id="p_title" value="' + esc(p.title || '') + '" placeholder="예) 칼슘 더스팅">'
      + '<div class="lbl2">메모 (먹이 종류, 영양제 이름 등)</div>'
      + '<input class="in" id="p_detail" value="' + esc(p.detail || '') + '">'

      + '<div class="lbl2">반복</div>'
      + '<div class="modes">'
      + '<button class="mode' + (mode === 'days' ? ' on' : '') + '" data-mode="days">며칠마다</button>'
      + '<button class="mode' + (mode === 'week' ? ' on' : '') + '" data-mode="week">요일 지정</button>'
      + '</div>'
      + '<div id="m_days" style="display:' + (mode === 'days' ? 'block' : 'none') + '">'
      + '<input class="in" id="p_interval" type="number" min="1" max="365" inputmode="numeric" '
      + 'value="' + (p.interval_days || 1) + '" placeholder="며칠마다">'
      + '<div class="hint">1 = 매일, 3 = 3일마다, 30 = 30일마다</div></div>'
      + '<div id="m_week" style="display:' + (mode === 'week' ? 'block' : 'none') + '">'
      + '<div class="wdays">' + C.WEEKDAY_KO.map((w, i) =>
          '<button class="wd' + ((p.weekdays || []).indexOf(i) >= 0 ? ' on' : '') + '" data-wd="' + i + '">' + w + '</button>').join('')
      + '</div></div>'

      + '<div class="row2">'
      + '<div><div class="lbl2">시작일</div><input class="in" id="p_start" type="date" value="' + esc(p.start_date || C.today()) + '"></div>'
      + '<div><div class="lbl2">알림 시각</div><input class="in" id="p_time" type="time" value="' + esc(p.time_of_day ? String(p.time_of_day).slice(0, 5) : '') + '"></div>'
      + '</div>'
      + '<div class="hint">시각을 비우면 종일 일정으로 넣고 아침 9시에 알림이 옵니다. '
      + '반복 날짜는 <b>시작일</b>부터 셉니다 — 늦게 해도 다음 날짜는 밀리지 않습니다.</div>'

      + '<div class="lbl2">사용</div>'
      + '<select class="in" id="p_active">'
      + '<option value="1"' + (p.is_active !== false ? ' selected' : '') + '>켜짐</option>'
      + '<option value="0"' + (p.is_active === false ? ' selected' : '') + '>꺼짐 (오늘 할 일·캘린더에서 빠짐)</option>'
      + '</select>'
      + '<div class="err" id="p_err"></div>'
      + '<div class="formbtns"><button class="btn" id="p_save">저장</button>'
      + '<button class="btn ghost" data-cancel="plan">취소</button>'
      + (isNew ? '' : '<button class="btn ghost" data-delplan="' + p.id + '" style="margin-left:auto;color:var(--warn-fg)">삭제</button>')
      + '</div></div>';
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
      + '<div class="lbl">최근 7일' + (target ? ' · ' + esc(target.name || '이름 없음') : ' · 전체') + '</div>'
      + '<div class="hint">' + r.start + ' ~ ' + r.end + '</div>'
      + '<div class="grid4">'
      + stat(r.feed, '급여') + stat(r.water, '물') + stat(r.clean, '청소') + stat(r.supplement, '영양제')
      + '</div>';

    if (S.focus) {
      h += '<div class="grid4"><div class="stat"><div class="v">' + r.weighIns + '</div><div class="k">체중 측정</div></div>'
        + '<div class="stat"><div class="v">' + (r.weightDelta == null ? '–' : (r.weightDelta > 0 ? '+' : '') + r.weightDelta)
        + '</div><div class="k">체중 증감(g)</div></div></div>';
    } else {
      h += '<div class="hint">개체를 고르면 체중 변화도 함께 봅니다. (위 <b>개체</b> 선택)</div>';
    }
    h += '</div>';

    h += '<div class="pad"><div class="lbl">눈에 띄는 것</div>';
    h += r.notes.map(n => '<div class="note ' + n.level + '">' + esc(n.text) + '</div>').join('');
    h += '<div class="safety">' + esc(C.SAFETY_NOTE) + '</div></div>';
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
      sel.innerHTML = '<option value="">전체 개체</option>' + S.animals.map(a =>
        '<option value="' + a.id + '"' + (S.focus === a.id ? ' selected' : '') + '>'
        + speciesOf(a).icon + ' ' + esc(a.name || '이름 없음') + '</option>').join('');
      sel.style.display = S.animals.length ? '' : 'none';
    }

    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('on', t.getAttribute('data-t') === S.tab));

    $('body').innerHTML =
      ({ today: tabToday, animals: tabAnimals, plans: tabPlans, report: tabReport }[S.tab])();
  }

  function go(tab) { S.tab = tab; S.editAnimal = null; S.editPlan = null; render(); }

  /* 화면을 다시 그릴 때마다 요소가 새로 만들어지므로, 각 버튼에 리스너를 달지
     않고 문서 하나에서 받아 처리합니다. */
  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('button, [data-go]');
    if (!t) return;
    const d = t.dataset;

    if (t.classList.contains('tab')) return go(t.getAttribute('data-t'));
    if (d.go) return go(d.go);

    /* ── 오늘 ── */
    if (d.tick) {
      const p = S.plans.filter(x => x.id === d.tick)[0];
      if (!p) return;
      const done = doneDatesFor(p.id).indexOf(C.today()) >= 0;
      return act(() => done ? A.undoPlan(p) : A.completePlan(p), done ? '취소했습니다' : '완료!');
    }

    /* ── 개체 ── */
    if (d.newanimal) { S.editAnimal = { species: 'leopard', sex: 'unknown' }; return render(); }
    if (d.editanimal) { S.editAnimal = animalById(d.editanimal); return render(); }
    if (d.cancel === 'animal') { S.editAnimal = null; return render(); }
    if (d.cancel === 'plan') { S.editPlan = null; return render(); }

    if (t.id === 'f_save') return saveAnimal();

    if (d.delanimal) {
      if (!confirm('이 개체와 그에 딸린 케어·체중 기록이 모두 지워집니다. 되돌릴 수 없습니다.\n계속할까요?')) return;
      return act(async () => { await A.deleteAnimal(d.delanimal); S.editAnimal = null; S.focus = ''; }, '삭제했습니다');
    }

    /* 체중 패널 열기·닫기 — 개체 필터와 같은 값을 씁니다 */
    if (d.weigh !== undefined) { S.focus = (S.focus === d.weigh) ? '' : d.weigh; return render(); }
    if (d.savew) return saveWeight(d.savew);

    /* ── 계획 ── */
    if (d.newplan) { S.editPlan = { kind: 'feed', interval_days: 1, start_date: C.today(), animal_id: S.focus || null }; return render(); }
    if (d.editplan) { S.editPlan = S.plans.filter(x => x.id === d.editplan)[0]; return render(); }
    if (t.id === 'p_save') return savePlan();
    if (d.delplan) {
      if (!confirm('이 계획을 지울까요? 이미 남긴 완료 기록은 그대로 둡니다.')) return;
      return act(async () => { await A.deletePlan(d.delplan); S.editPlan = null; }, '삭제했습니다');
    }
    if (d.mode) {
      document.querySelectorAll('.mode').forEach(m => m.classList.toggle('on', m === t));
      $('m_days').style.display = d.mode === 'days' ? 'block' : 'none';
      $('m_week').style.display = d.mode === 'week' ? 'block' : 'none';
      return;
    }
    if (d.wd !== undefined) { t.classList.toggle('on'); return; }
    if (t.id === 'preset') return addPreset();
    if (t.id === 'ics') return exportIcs();
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'focus') { S.focus = ev.target.value; render(); }
  });

  /* ── 저장 동작 ────────────────────────────────────────────────────── */
  function saveAnimal() {
    const name = $('f_name').value.trim();
    if (!name) { $('f_err').textContent = '이름을 적어주세요.'; return; }
    const row = Object.assign({}, S.editAnimal, {
      name: name,
      species: $('f_species').value,
      sex: $('f_sex').value,
      hatch_date: $('f_hatch').value || null,
      note: $('f_note').value.trim() || null
    });
    act(async () => { await A.saveAnimal(row); S.editAnimal = null; }, '저장했습니다');
  }

  function saveWeight(animalId) {
    const g = parseFloat($('w_g').value);
    const a = animalById(animalId);
    const rng = speciesOf(a).weightRange;
    if (!(g > 0)) { $('w_err').textContent = '무게를 적어주세요.'; return; }
    /* 범위 밖이면 막지 않고 물어봅니다. 실제로 그만한 개체가 있을 수 있고,
       막아버리면 기록할 방법이 없어집니다. 자릿수 실수만 걸러내는 것이 목적입니다. */
    if (g < rng[0] || g > rng[1]) {
      if (!confirm(g + 'g 은 ' + speciesOf(a).ko + ' 기준(' + rng[0] + '~' + rng[1] + 'g)을 벗어납니다.\n그대로 기록할까요?')) return;
    }
    act(() => A.saveWeight(animalId, g, $('w_d').value), '체중을 기록했습니다');
  }

  function savePlan() {
    const p = S.editPlan;
    const weekMode = document.querySelector('.mode.on') && document.querySelector('.mode.on').dataset.mode === 'week';
    const wd = weekMode
      ? Array.prototype.slice.call(document.querySelectorAll('.wd.on')).map(b => +b.dataset.wd)
      : [];
    if (weekMode && !wd.length) { $('p_err').textContent = '요일을 하나 이상 골라주세요.'; return; }

    const iv = parseInt($('p_interval').value, 10);
    if (!weekMode && (!iv || iv < 1 || iv > 365)) { $('p_err').textContent = '며칠마다인지 1~365 사이로 적어주세요.'; return; }

    const row = {
      id: p.id,
      animal_id: $('p_animal').value || null,
      kind: $('p_kind').value,
      title: $('p_title').value.trim() || null,
      detail: $('p_detail').value.trim() || null,
      interval_days: weekMode ? null : iv,
      weekdays: weekMode ? wd : null,
      start_date: $('p_start').value || C.today(),
      time_of_day: $('p_time').value || null,
      is_active: $('p_active').value === '1'
    };
    act(async () => { await A.savePlan(row); S.editPlan = null; }, '저장했습니다');
  }

  /* 종별 기본 계획 한 번에 넣기.
     이미 같은 이름의 계획이 있으면 건너뜁니다 — 두 번 눌러서 같은 것이
     두 개씩 생기면 오늘 할 일이 전부 겹쳐 보입니다. */
  function addPreset() {
    if (!S.animals.length) { toast('먼저 개체를 등록해 주세요'); return; }
    const target = S.focus ? [animalById(S.focus)] : S.animals;
    const rows = [];
    target.forEach(function (a) {
      const has = S.plans.filter(p => p.animal_id === a.id).map(p => p.title);
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
    if (!rows.length) { toast('이미 다 들어가 있습니다'); return; }
    const who = S.focus ? (animalById(S.focus).name || '이 개체') : '전체 개체';
    if (!confirm(who + '에 기본 계획 ' + rows.length + '건을 넣습니다.\n주기는 나중에 개체에 맞게 고치세요.')) return;
    act(() => A.addPlans(rows), rows.length + '건 넣었습니다');
  }

  /* 캘린더 파일 내려받기. 서버를 거치지 않고 브라우저에서 바로 만듭니다. */
  function exportIcs() {
    const names = {};
    S.animals.forEach(a => { names[a.id] = a.name || '이름 없음'; });
    const ics = C.buildIcs(S.plans, names, location.hostname || 'ryangstudio.com');

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
    toast('받은 파일을 열면 캘린더에 들어갑니다');
  }

  /* =============================================================================
     시작
     ============================================================================= */
  async function boot() {
    if (!A.ready) {
      $('body').innerHTML = '<div class="gate"><div class="pad">백엔드가 설정되지 않았습니다.<br>'
        + 'assets/studio-config.js 를 확인해 주세요.</div></div>';
      return;
    }
    await A.boot();
    A.logVisit();

    if (!A.user) {
      $('body').innerHTML = '<div class="gate"><div class="pad">'
        + '<div class="lbl">로그인이 필요합니다</div>'
        + '<div class="hint">케어 기록은 계정에 저장됩니다. 기기에만 두면 폰을 바꿀 때 사라지고, '
        + '여러 기기에서 같이 볼 수도 없습니다.</div>'
        /* login.html 은 로그인 뒤 돌아올 곳을 받지 않습니다. 없는 동작을
           있는 것처럼 ?next= 를 붙이지 않고, 로그인하면 그 화면에 뜨는
           링크로 돌아오게 둡니다. */
        + '<a class="btn wide" style="display:block;text-decoration:none;margin-top:14px" '
        + 'href="/gecko/login.html">로그인 · 회원가입</a>'
        + '</div></div>';
      return;
    }

    if (!A.premium.active) {
      $('body').innerHTML = '<div class="gate"><div class="pad">'
        + '<div class="lbl">프리미엄 기능입니다</div>'
        + '<div class="hint">개체별 급여·청소·영양제 주기 관리, 체중 추이, 주간 요약, '
        + '캘린더 알림 내보내기를 이용할 수 있습니다.</div>'
        /* 코드 입력 창은 계정 화면에 있습니다. 계산기에는 #premium 앵커가 없어
           그리로 보내면 아무 데도 도착하지 않습니다. */
        + '<a class="btn wide" style="display:block;text-decoration:none;margin-top:14px" '
        + 'href="/gecko/login.html">프리미엄 코드 입력</a></div></div>';
      return;
    }

    $('who').textContent = (A.user.email || '')
      + (A.premium.kind === 'sub' ? ' · 구독' : A.premium.kind ? ' · 체험판' : '');
    $('tabs').style.display = '';
    $('focus').style.display = '';
    await reload();
  }

  boot();
})();
