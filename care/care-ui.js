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
    animals: [], plans: [], records: [], weights: [], feeds: [],
    focus: '',       // 개체 필터 ('' = 전체)
    editAnimal: null, editPlan: null, editFeed: null,
    busy: false
  };

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
         + '<i class="bi ' + i.icon + '" aria-hidden="true"></i>' + esc(i.ko) + '</span>';
  }
  function icon(name) {
    return '<i class="bi ' + name + '" aria-hidden="true"></i>';
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
    const [animals, plans, records, weights, feeds] = await Promise.all([
      A.listAnimals(), A.listPlans(), A.listRecords(from), A.listWeights(null), A.listFeeds()
    ]);
    S.animals = animals; S.plans = plans; S.records = records; S.weights = weights; S.feeds = feeds;
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
      return '<div class="pad"><div class="empty">'
        + icon('bi-calendar-plus') + '아직 반복 계획이 없습니다.<br>'
        + '<b>계획</b> 탭에서 종별 기본값을 한 번에 넣을 수 있어요.</div>'
        + '<button class="btn wide" data-go="plans" style="margin-top:14px">'
        + icon('bi-arrow-right-circle') + '계획 만들러 가기</button></div>';
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
      h += '<div class="pad"><div class="empty">'
        + icon('bi-check2-circle') + '오늘 할 일을 모두 끝냈습니다</div></div>';
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
    let sub = kindTag(p.kind) + esc(who) + ' · ' + esc(C.cycleLabel(p));
    if (isLate) sub += ' · <span class="late-t">' + st.overdue + '일 밀림</span>';
    if (p.detail) sub += '<br>' + esc(p.detail);

    return '<div class="' + cls + '">'
      + '<button class="tick' + (st.done ? ' on' : '') + '" data-tick="' + p.id + '" '
      + 'aria-label="' + esc((p.title || k.ko) + ' ' + (st.done ? '완료 취소' : '완료')) + '">'
      + (st.done ? '<i class="bi bi-check-lg" aria-hidden="true"></i>' : '') + '</button>'
      + '<div class="tinfo"><div class="tname">' + esc(p.title || k.ko) + '</div>'
      + '<div class="tsub">' + sub + '</div></div></div>';
  }

  /* =============================================================================
     개체
     ============================================================================= */
  function tabAnimals() {
    if (S.editAnimal) return animalForm(S.editAnimal);

    let h = '<button class="btn wide" data-newanimal="1" style="margin-bottom:14px">'
          + icon('bi-plus-lg') + '개체 등록</button>';
    if (!S.animals.length) {
      return h + '<div class="pad"><div class="empty">'
        + icon('bi-heart') + '등록한 개체가 없습니다.<br>'
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

    const sex = a.sex === 'male' ? '<span class="chip">♂ 수컷</span>'
              : a.sex === 'female' ? '<span class="chip">♀ 암컷</span>' : '';

    return '<div class="card">'
      + '<div class="thumb">' + (a.photo_url ? Photo.tag(a.photo_url, a.name || '') : info.icon) + '</div>'
      + '<div class="info"><div class="nm">' + esc(a.name || '이름 없음') + sex + '</div>'
      + '<div class="ms">' + esc(bits.join(' · ')) + '</div></div>'
      + '<div class="acts">'
      /* 개체 관리 화면으로. 주소에 id 가 들어가 즐겨찾기에 둘 수 있습니다. */
      + '<a class="mini" href="animal.html?id=' + encodeURIComponent(a.id) + '">'
      + icon('bi-graph-up') + '관리</a>'
      + '<button class="mini" data-editanimal="' + a.id + '">' + icon('bi-pencil') + '수정</button>'
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
      + '<div><div class="lbl2"><label for="f_sex">성별</label></div><select class="in" id="f_sex">'
      + ['unknown:미상', 'male:수컷', 'female:암컷'].map(o => {
          const [v, t] = o.split(':');
          return '<option value="' + v + '"' + ((a.sex || 'unknown') === v ? ' selected' : '') + '>' + t + '</option>';
        }).join('')
      + '</select></div>'
      /* 빈 날짜 칸은 브라우저에 따라 아무것도 안 보입니다. 눌러야 무슨 칸인지
         알 수 있다는 지적이 있어 제목을 밖에 두고 label 로 묶었습니다. */
      + '<div><div class="lbl2"><label for="f_hatch">해칭·입양일 (선택)</label></div>'
      + '<input class="in" id="f_hatch" type="date" value="' + esc(a.hatch_date || '') + '"></div>'
      + '</div>'
      + '<div class="lbl2">메모</div><textarea class="in" id="f_note">' + esc(a.note || '') + '</textarea>'
      + '<div class="err" id="f_err"></div>'
      + '<div class="formbtns"><button class="btn" id="f_save">' + icon('bi-check-lg') + '저장</button>'
      + '<button class="btn ghost" data-cancel="animal">취소</button>'
      + (isNew ? '' : '<button class="btn danger" data-delanimal="' + a.id + '" style="margin-left:auto">'
                    + icon('bi-trash3') + '삭제</button>')
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
      + '<div class="formbtns"><button class="btn" data-savew="' + a.id + '">'
      + icon('bi-check-lg') + '체중 기록</button>'
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
      + '<button class="btn wide" id="ics" style="margin-top:10px" ' + (S.plans.length ? '' : 'disabled') + '>'
      + icon('bi-calendar-check') + '캘린더 파일 받기'
      + (S.plans.length ? ' (' + S.plans.filter(p => p.is_active !== false).length + '건)' : '') + '</button></div>';

    h += '<div class="row2" style="margin-bottom:14px">'
      + '<button class="btn" data-newplan="1">' + icon('bi-plus-lg') + '계획 추가</button>'
      + '<button class="btn ghost" id="preset">' + icon('bi-magic') + '종별 기본값</button></div>';

    if (!S.plans.length) {
      return h + '<div class="pad"><div class="empty">'
        + icon('bi-arrow-repeat') + '아직 계획이 없습니다.<br>'
        + '<b>종별 기본값</b>을 누르면 흔히 쓰는 주기가 한 번에 만들어집니다.</div></div>';
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
      + '<div class="thumb" style="background:' + k.color + '1a;border-color:' + k.color + '33;color:' + k.color + '">'
      + '<i class="bi ' + k.icon + '" aria-hidden="true"></i></div>'
      + '<div class="info"><div class="nm">' + esc(p.title || k.ko)
      + (off ? '<span class="chip off">꺼짐</span>' : '') + '</div>'
      + '<div class="ms">' + esc(C.cycleLabel(p))
      + (p.time_of_day ? ' · ' + esc(String(p.time_of_day).slice(0, 5)) : ' · 종일')
      + (p.detail ? ' · ' + esc(p.detail) : '') + '</div></div>'
      + '<div class="acts"><button class="mini" data-editplan="' + p.id + '">'
      + icon('bi-pencil') + '수정</button></div></div>';
  }

  function planForm(p) {
    const isNew = !p.id;
    const mode = (p.weekdays && p.weekdays.length) ? 'week' : 'days';
    /* <option> 안에서는 아이콘 폰트가 렌더되지 않습니다. 여기만 emoji 를 씁니다. */
    const kinds = Object.keys(C.CARE_KINDS).map(k =>
      '<option value="' + k + '"' + (p.kind === k ? ' selected' : '') + '>'
      + C.CARE_KINDS[k].emoji + ' ' + esc(C.CARE_KINDS[k].ko) + '</option>').join('');
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

      /* 먹이를 연결하면 이 계획을 완료할 때 그 먹이가 1회분 줄어듭니다.
         비워두면 기록만 남고 재고는 그대로입니다. */
      + '<div class="lbl2"><label for="p_feed">쓰는 먹이 (선택)</label></div>'
      + '<select class="in" id="p_feed"><option value="">연결 안 함</option>'
      + S.feeds.filter(f => f.is_active !== false).map(f =>
          '<option value="' + f.id + '"' + (p.feed_item_id === f.id ? ' selected' : '') + '>'
          + C.feedKindInfo(f.kind).emoji + ' ' + esc(f.name) + '</option>').join('')
      + '</select>'
      + '<div class="hint">' + (S.feeds.length
          ? '연결하면 이 계획을 완료할 때 남은 양이 1회분만큼 줄어듭니다.'
          : '<b>먹이</b> 탭에서 먼저 등록하면 여기에 나옵니다.') + '</div>'

      + '<div class="lbl2">반복</div>'
      + '<div class="modes">'
      + '<button class="mode' + (mode === 'days' ? ' on' : '') + '" data-mode="days">며칠마다</button>'
      + '<button class="mode' + (mode === 'week' ? ' on' : '') + '" data-mode="week">요일 지정</button>'
      + '</div>'
      /* 자주 쓰는 주기는 버튼으로 바로 고릅니다. 숫자를 직접 적는 칸도
         남겨둡니다 — 5일·10일처럼 버튼에 없는 주기를 쓰는 사람이 있습니다. */
      + '<div id="m_days" style="display:' + (mode === 'days' ? 'block' : 'none') + '">'
      + '<div class="presets">' + [
          [1, '매일'], [2, '2일마다'], [3, '3일마다'], [4, '4일마다'],
          [7, '주 1회'], [14, '2주마다'], [30, '월 1회']
        ].map(x =>
          '<button class="preset' + (Number(p.interval_days) === x[0] ? ' on' : '') + '" '
          + 'data-preset="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>'
      + '<div class="lbl2" style="margin-top:12px"><label for="p_interval">직접 넣기 (일)</label></div>'
      + '<input class="in" id="p_interval" type="number" min="1" max="365" inputmode="numeric" '
      + 'value="' + (p.interval_days || 1) + '">'
      + '<div class="hint">시작일부터 이 간격으로 돌아옵니다.</div></div>'

      + '<div id="m_week" style="display:' + (mode === 'week' ? 'block' : 'none') + '">'
      + '<div class="wdays">' + C.WEEKDAY_KO.map((w, i) =>
          '<button class="wd' + ((p.weekdays || []).indexOf(i) >= 0 ? ' on' : '') + '" data-wd="' + i + '">' + w + '</button>').join('')
      + '</div>'
      /* 요일도 자주 쓰는 묶음을 한 번에. 파충류는 '월·목 급여' 처럼
         주 2~3회가 흔합니다. */
      + '<div class="presets">' + [
          [[1, 4], '월·목'], [[2, 5], '화·금'], [[1, 3, 5], '월·수·금'],
          [[0, 6], '주말'], [[0, 1, 2, 3, 4, 5, 6], '매일']
        ].map(x =>
          '<button class="preset" data-wdset="' + x[0].join(',') + '">' + x[1] + '</button>').join('') + '</div>'
      + '<div class="hint">누른 요일마다 돌아옵니다. 위 요일 버튼으로 직접 골라도 됩니다.</div></div>'

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
      + '<div class="formbtns"><button class="btn" id="p_save">' + icon('bi-check-lg') + '저장</button>'
      + '<button class="btn ghost" data-cancel="plan">취소</button>'
      + (isNew ? '' : '<button class="btn danger" data-delplan="' + p.id + '" style="margin-left:auto">'
                    + icon('bi-trash3') + '삭제</button>')
      + '</div></div>';
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
          + icon('bi-plus-lg') + '먹이 · 용품 등록</button>';

    if (!S.feeds.length) {
      return h + '<div class="pad"><div class="empty">' + icon('bi-box-seam')
        + '아직 등록한 먹이가 없습니다.<br>'
        + '쓰시는 사료·간식·영양제를 넣어두면 <b>언제 떨어질지</b> 알려드리고,<br>'
        + '주문할 날짜를 캘린더에도 함께 넣어드립니다.</div></div>';
    }

    if (need.length) {
      h += '<div class="sect"><h2>주문이 필요해요</h2><span class="n">' + need.length + '</span></div>';
      h += need.map(r => feedCard(r.f, r.fc)).join('');
      const rest = rows.filter(r => need.indexOf(r) < 0);
      if (rest.length) {
        h += '<div class="sect"><h2>여유 있음</h2><span class="n">' + rest.length + '</span></div>';
        h += rest.map(r => feedCard(r.f, r.fc)).join('');
      }
    } else {
      h += rows.map(r => feedCard(r.f, r.fc)).join('');
    }

    if (off.length) {
      h += '<div class="sect"><h2>안 쓰는 것</h2><span class="n">' + off.length + '</span></div>';
      h += off.map(f => feedCard(f, C.feedForecast(f, S.plans, C.today()))).join('');
    }

    h += '<div class="hint" style="text-align:center;margin-top:16px">'
      + '남은 양은 <b>계획대로 먹였을 때</b>를 기준으로 줄어듭니다. '
      + '실제와 다르면 카드에서 직접 고쳐주세요.</div>';
    return h;
  }

  function feedCard(f, fc) {
    const k = C.feedKindInfo(f.kind);
    const lv = C.FEED_LEVEL[fc.level] || C.FEED_LEVEL.ok;
    const off = f.is_active === false;
    const usedBy = S.plans.filter(p => p.feed_item_id === f.id && p.is_active !== false);

    const bits = [];
    if (f.amount_left != null) bits.push(Number(f.amount_left) + (f.unit || '') + ' 남음');
    if (fc.daysLeft != null) bits.push('약 ' + fc.daysLeft + '일치');
    else if (!usedBy.length) bits.push('연결된 급여 계획 없음');
    else if (!f.per_use) bits.push('1회분 미입력');
    if (f.expires_on) bits.push('기한 ' + f.expires_on.slice(2));

    return '<div class="feedcard' + (off ? ' off' : '') + ' lv-' + lv.tone + '">'
      + '<div class="fctop">'
      + '<span class="kind" style="color:' + k.color + '">'
      + '<i class="bi ' + k.icon + '" aria-hidden="true"></i>' + esc(k.ko) + '</span>'
      + '<span class="fclv ' + lv.tone + '">' + esc(off ? '안 씀' : lv.ko) + '</span>'
      + '</div>'
      + '<div class="fcname">' + esc(f.name)
      + (f.brand ? '<span class="fcbrand">' + esc(f.brand) + '</span>' : '') + '</div>'
      + (fc.pct == null ? '' :
          '<div class="fcbar"><span style="width:' + fc.pct + '%"></span></div>')
      + '<div class="fcsub">' + esc(bits.join(' · ')) + '</div>'
      + (fc.orderOn && !off
          ? '<div class="fcorder">' + icon('bi-calendar-event') + esc(fc.orderOn) + ' 쯤 주문'
            + (fc.emptyOn ? ' <span class="fcdim">(' + esc(fc.emptyOn) + ' 소진 예상)</span>' : '') + '</div>'
          : '')
      + '<div class="fcacts">'
      + (f.buy_url ? '<a class="mini" href="' + esc(f.buy_url) + '" target="_blank" rel="noopener noreferrer">'
                     + icon('bi-cart') + '사러 가기</a>' : '')
      + '<button class="mini" data-refill="' + f.id + '">' + icon('bi-arrow-clockwise') + '새로 채움</button>'
      + '<button class="mini" data-editfeed="' + f.id + '">' + icon('bi-pencil') + '수정</button>'
      + '</div></div>';
  }

  function feedForm(f) {
    const isNew = !f.id;
    const kinds = Object.keys(C.FEED_KINDS).map(k =>
      '<option value="' + k + '"' + (f.kind === k ? ' selected' : '') + '>'
      + C.FEED_KINDS[k].emoji + ' ' + esc(C.FEED_KINDS[k].ko) + '</option>').join('');
    const v = x => x == null ? '' : String(x);

    return '<div class="pad">'
      + '<div class="lbl">' + (isNew ? '먹이 · 용품 등록' : '수정') + '</div>'
      + '<div class="hint">실제로 쓰시는 제품을 그대로 적으면 됩니다.</div>'

      + '<div class="lbl2"><label for="fd_name">이름</label></div>'
      + '<input class="in" id="fd_name" value="' + esc(f.name || '') + '" placeholder="예) 판게아 파파야">'
      + '<div class="row2">'
      + '<div><div class="lbl2"><label for="fd_kind">종류</label></div><select class="in" id="fd_kind">' + kinds + '</select></div>'
      + '<div><div class="lbl2"><label for="fd_brand">브랜드 (선택)</label></div>'
      + '<input class="in" id="fd_brand" value="' + esc(f.brand || '') + '"></div>'
      + '</div>'

      + '<div class="lbl2">양</div>'
      + '<div class="row3">'
      + '<input class="in" id="fd_left" type="number" step="0.1" min="0" inputmode="decimal" placeholder="남은 양" value="' + esc(v(f.amount_left)) + '">'
      + '<input class="in" id="fd_full" type="number" step="0.1" min="0" inputmode="decimal" placeholder="새 것 기준" value="' + esc(v(f.amount_full)) + '">'
      + '<input class="in" id="fd_unit" placeholder="단위" value="' + esc(f.unit || 'g') + '">'
      + '</div>'
      + '<div class="hint">단위는 자유입니다 — g · ml · 마리 · 통 등. '
      + '<b>새 것 기준</b>을 적어두면 다음에 살 때 그 값으로 채웁니다.</div>'

      + '<div class="lbl2"><label for="fd_per">1회 급여량</label></div>'
      + '<input class="in" id="fd_per" type="number" step="0.1" min="0" inputmode="decimal" value="' + esc(v(f.per_use)) + '">'
      + '<div class="hint">한 번 줄 때 쓰는 양입니다. 이게 있어야 <b>언제 떨어질지</b> 계산됩니다.</div>'

      + '<div class="row2">'
      + '<div><div class="lbl2"><label for="fd_opened">개봉일 (선택)</label></div>'
      + '<input class="in" id="fd_opened" type="date" value="' + esc(f.opened_on || '') + '"></div>'
      + '<div><div class="lbl2"><label for="fd_exp">사용기한 (선택)</label></div>'
      + '<input class="in" id="fd_exp" type="date" value="' + esc(f.expires_on || '') + '"></div>'
      + '</div>'
      + '<div class="hint">개봉 후 보관기간이 짧은 제품은 그 날짜를 적어두세요. 소진보다 먼저 오면 그쪽을 먼저 알려드립니다.</div>'

      + '<div class="lbl2"><label for="fd_url">구매처 주소 (선택)</label></div>'
      + '<input class="in" id="fd_url" type="url" inputmode="url" value="' + esc(f.buy_url || '') + '" placeholder="https://">'
      + '<div class="lbl2"><label for="fd_lead">주문 후 도착까지 (일)</label></div>'
      + '<input class="in" id="fd_lead" type="number" min="0" max="90" inputmode="numeric" value="' + esc(v(f.lead_days == null ? 3 : f.lead_days)) + '">'
      + '<div class="hint">이만큼 앞당겨 알려드립니다. 소진일에 알려주면 이미 늦습니다.</div>'

      + '<div class="lbl2"><label for="fd_note">메모 (선택)</label></div>'
      + '<input class="in" id="fd_note" value="' + esc(f.note || '') + '">'

      + '<div class="lbl2"><label for="fd_active">사용</label></div>'
      + '<select class="in" id="fd_active">'
      + '<option value="1"' + (f.is_active !== false ? ' selected' : '') + '>쓰는 중</option>'
      + '<option value="0"' + (f.is_active === false ? ' selected' : '') + '>안 씀 (목록 아래로 내려감)</option>'
      + '</select>'

      + '<div class="err" id="fd_err"></div>'
      + '<div class="formbtns"><button class="btn" id="fd_save">' + icon('bi-check-lg') + '저장</button>'
      + '<button class="btn ghost" data-cancel="feed">취소</button>'
      + (isNew ? '' : '<button class="btn danger" data-delfeed="' + f.id + '" style="margin-left:auto">'
                    + icon('bi-trash3') + '삭제</button>')
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
    if (!S.animals.length) {
      return '<div class="pad"><div class="empty">' + icon('bi-heart-pulse')
        + '먼저 개체를 등록해 주세요.<br>증세는 개체별로 남깁니다.</div></div>';
    }
    /* 개체를 골라야 합니다. 어느 개체의 증세인지 모르면 기록이 쓸모없습니다. */
    if (!S.focus) {
      return '<div class="pad"><div class="lbl">증세 관찰</div>'
        + '<div class="hint">개체를 고르면 그 종에서 볼 항목이 나옵니다.</div>'
        + '<div class="empty" style="margin-top:12px">' + icon('bi-arrow-up')
        + '위 <b>개체</b> 에서 한 마리를 골라주세요.</div></div>';
    }

    const a = animalById(S.focus);
    const recs = S.records.filter(r => r.animal_id === S.focus);
    const status = C.signStatus(recs, C.today());
    const open = status.filter(s => s.open);
    const closed = status.filter(s => !s.open);
    const codes = C.signsFor(a.species);

    let h = '';

    /* 1. 지금 보고 있는 것 */
    if (open.length) {
      h += '<div class="sect"><h2>관찰 중</h2><span class="n">' + open.length + '</span></div>';
      h += open.map(function (s) {
        const g = C.SIGNS[s.code] || { ko: s.code, what: '' };
        return '<div class="signcard' + (g.vet ? ' vet' : '') + '">'
          + '<div class="sgtop"><div class="sgname">' + esc(g.ko) + '</div>'
          + '<div class="sgdays">' + s.days + '일째</div></div>'
          + '<div class="sgwhat">' + esc(g.what) + '</div>'
          + (g.vet ? '<div class="sgvet">' + icon('bi-hospital') + '수의사에게 보이시길 권합니다</div>' : '')
          + '<div class="sgfoot"><span>최초 ' + esc(s.first) + ' · 마지막 '
          + (s.ago === 0 ? '오늘' : s.ago + '일 전') + ' · ' + s.n + '회 기록</span>'
          + '<span class="sgbtns">'
          + '<button class="mini" data-sign="' + s.code + '" data-sact="again">' + icon('bi-plus-lg') + '오늘도</button>'
          + '<button class="mini" data-sign="' + s.code + '" data-sact="end">' + icon('bi-check-lg') + '해소</button>'
          + '</span></div></div>';
      }).join('');
    }

    /* 2. 기록하기 */
    h += '<div class="pad"><div class="lbl">증세 남기기</div>'
      + '<div class="hint">' + esc(a.name || '이 개체') + ' 에서 보인 것을 고르세요. '
      + '<b>진단이 아니라 관찰 기록</b>입니다 — 무엇이 보였는지와 언제부터인지만 남습니다.</div>'
      + '<div class="signgrid">' + codes.map(function (code) {
          const g = C.SIGNS[code];
          const on = open.some(s => s.code === code);
          return '<button class="sgpick' + (on ? ' on' : '') + '" data-sign="' + code + '" data-sact="new">'
            + esc(g.ko) + (g.vet ? '<i class="bi bi-hospital" aria-hidden="true" title="수의사 상담 권고"></i>' : '')
            + '</button>';
        }).join('') + '</div>'
      + '<input class="in" id="sg_note" placeholder="메모 (선택) — 며칠째인지, 어느 쪽인지 등" style="margin-top:10px">'
      + '</div>';

    /* 3. 지난 것 */
    if (closed.length) {
      h += '<div class="sect"><h2>해소된 것</h2><span class="n">' + closed.length + '</span></div>';
      h += closed.map(function (s) {
        const g = C.SIGNS[s.code] || { ko: s.code };
        return '<div class="card"><div class="info"><div class="nm">' + esc(g.ko)
          + '<span class="chip">해소</span></div>'
          + '<div class="ms">' + esc(s.first) + ' ~ ' + esc(s.last) + ' · ' + s.n + '회 기록</div></div>'
          + '<div class="acts"><button class="mini" data-sign="' + s.code + '" data-sact="again">'
          + icon('bi-arrow-counterclockwise') + '다시</button></div></div>';
      }).join('');
    }

    /* 4. 유전 관련은 계산기가 봅니다 */
    const calc = (C.SPECIES[a.species] || {}).calc;
    h += '<div class="pad"><div class="lbl">모프와 관련된 위험</div>'
      + '<div class="hint">에니그마 계열의 신경 증상, 레몬 프로스트의 종양처럼 <b>모프에 따라 알려진 위험</b>은 '
      + '태어나기 전에 확인하는 편이 낫습니다. 계산기가 교배 조합을 넣는 단계에서 알려줍니다.</div>'
      + (calc ? '<a class="btn ghost wide" style="text-decoration:none;margin-top:10px" href="' + calc + '">'
                + icon('bi-calculator') + esc((C.SPECIES[a.species] || {}).ko) + ' 계산기 열기</a>'
              : '<div class="hint">이 종은 아직 계산기가 없습니다.</div>')
      + '<div class="safety">' + esc(C.SAFETY_NOTE) + '</div></div>';

    return h;
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

    const NOTE_ICON = { warn: 'bi-exclamation-triangle', good: 'bi-check2-circle', info: 'bi-info-circle' };
    h += '<div class="pad"><div class="lbl">눈에 띄는 것</div><div style="margin-top:10px"></div>';
    h += r.notes.map(n => '<div class="note ' + n.level + '">'
      + icon(NOTE_ICON[n.level] || 'bi-info-circle') + '<span>' + esc(n.text) + '</span></div>').join('');
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

  function go(tab) {
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
    if (d.cancel === 'feed') { S.editFeed = null; return render(); }

    /* ── 먹이 ── */
    if (d.newfeed) { S.editFeed = { kind: 'staple', unit: 'g', lead_days: 3 }; return render(); }
    if (d.editfeed) { S.editFeed = S.feeds.filter(x => x.id === d.editfeed)[0]; return render(); }
    if (t.id === 'fd_save') return saveFeed();
    if (d.delfeed) {
      if (!confirm('이 먹이를 지울까요?\n연결된 급여 계획은 남고 연결만 끊깁니다.')) return;
      return act(async () => { await A.deleteFeed(d.delfeed); S.editFeed = null; }, '삭제했습니다');
    }
    if (d.refill) {
      const f = S.feeds.filter(x => x.id === d.refill)[0];
      if (!f) return;
      const def = f.amount_full != null ? String(f.amount_full) : '';
      const v = prompt('새로 채운 양을 적어주세요 (' + (f.unit || '') + ')', def);
      if (v == null) return;
      const n = parseFloat(v);
      if (!(n >= 0)) { toast('숫자를 적어주세요'); return; }
      return act(() => A.refillFeed(f.id, n), '채웠습니다');
    }

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
    /* 계획 폼의 반복 방식 토글. 그 폼이 열려 있을 때만 동작해야 합니다 —
       다른 화면에도 data-mode 가 생기면 여기서 없는 요소를 만지고 죽습니다. */
    if (d.mode && $('m_days') && $('m_week')) {
      document.querySelectorAll('.mode').forEach(m => m.classList.toggle('on', m === t));
      $('m_days').style.display = d.mode === 'days' ? 'block' : 'none';
      $('m_week').style.display = d.mode === 'week' ? 'block' : 'none';
      return;
    }
    if (d.wd !== undefined) { t.classList.toggle('on'); return; }

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
      document.querySelectorAll('.wd').forEach(b => b.classList.toggle('on', want.indexOf(b.dataset.wd) >= 0));
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
        title: end ? '해소' : '관찰', note: note || null
      }), end ? '해소로 표시했습니다' : g.ko + ' 기록됨');
    }
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

  function saveFeed() {
    const name = $('fd_name').value.trim();
    if (!name) { $('fd_err').textContent = '이름을 적어주세요.'; return; }

    const url = $('fd_url').value.trim();
    /* 주소는 http/https 만 받습니다. javascript: 같은 것을 넣어두면 나중에
       '사러 가기' 를 누르는 순간 그게 실행됩니다. */
    if (url && !/^https?:\/\//i.test(url)) {
      $('fd_err').textContent = '구매처 주소는 http:// 또는 https:// 로 시작해야 합니다.';
      return;
    }
    const num = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
    const left = num('fd_left'), full = num('fd_full'), per = num('fd_per');
    if ([left, full, per].some(v => v != null && !(v >= 0))) {
      $('fd_err').textContent = '양은 0 이상 숫자로 적어주세요.'; return;
    }
    if (per != null && per <= 0) { $('fd_err').textContent = '1회 급여량은 0보다 커야 합니다.'; return; }

    const row = Object.assign({}, S.editFeed, {
      name: name, kind: $('fd_kind').value, brand: $('fd_brand').value.trim() || null,
      unit: $('fd_unit').value.trim() || 'g',
      amount_left: left, amount_full: full, per_use: per,
      opened_on: $('fd_opened').value || null, expires_on: $('fd_exp').value || null,
      buy_url: url || null, lead_days: $('fd_lead').value,
      note: $('fd_note').value.trim() || null,
      is_active: $('fd_active').value === '1'
    });
    act(async () => { await A.saveFeed(row); S.editFeed = null; }, '저장했습니다');
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
    /* 케어 일정과 주문 안내를 한 파일에 담습니다. 파일을 두 번 받게 하면
       한쪽만 등록해두고 왜 안 울리냐고 하게 됩니다. */
    const ics = C.buildIcs(S.plans, names, location.hostname || 'ryangstudio.com', feedOrders());

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
        + '<div class="gicon">' + icon('bi-person-lock') + '</div>'
        + '<div class="lbl">로그인이 필요합니다</div>'
        + '<div class="hint">케어 기록은 계정에 저장됩니다. 기기에만 두면 폰을 바꿀 때 사라지고, '
        + '여러 기기에서 같이 볼 수도 없습니다.</div>'
        /* login.html 은 로그인 뒤 돌아올 곳을 받지 않습니다. 없는 동작을
           있는 것처럼 ?next= 를 붙이지 않고, 로그인하면 그 화면에 뜨는
           링크로 돌아오게 둡니다. */
        + '<a class="btn wide" style="text-decoration:none;margin-top:16px" '
        + 'href="/gecko/login.html">' + icon('bi-box-arrow-in-right') + '로그인 · 회원가입</a>'
        + '</div></div>';
      return;
    }

    if (!A.premium.active) {
      $('body').innerHTML = '<div class="gate"><div class="pad">'
        + '<div class="gicon">' + icon('bi-gem') + '</div>'
        + '<div class="lbl">프리미엄 기능입니다</div>'
        + '<div class="hint">개체별 급여·청소·영양제 주기 관리, 체중 추이, 주간 요약, '
        + '캘린더 알림 내보내기를 이용할 수 있습니다.</div>'
        /* 코드 입력 창은 계정 화면에 있습니다. 계산기에는 #premium 앵커가 없어
           그리로 보내면 아무 데도 도착하지 않습니다. */
        + '<a class="btn wide" style="text-decoration:none;margin-top:16px" '
        + 'href="/gecko/login.html">' + icon('bi-gem') + '프리미엄 코드 입력</a></div></div>';
      return;
    }

    /* 헤더 부제를 계정 정보로 바꿉니다. 로그인 전에는 이 도구가 무엇인지
       설명하는 문구가 들어 있고, 들어온 뒤에는 그 설명이 필요 없습니다. */
    $('who').textContent = (A.user.email || '')
      + (A.premium.kind === 'sub' ? ' · 구독' : A.premium.kind ? ' · 체험판' : '');
    $('acctBtn').style.display = '';
    $('tabs').style.display = '';
    S.tab = tabFromHash();
    await reload();
  }

  boot();
})();
