/* =============================================================================
   브리딩 관리 — 종을 가리지 않는 화면
   -----------------------------------------------------------------------------
       /care/breeding.html?species=crested

   ---------------------------------------------------------------------------
   왜 종을 주소로 받는가
   ---------------------------------------------------------------------------
   네 계산기 코어가 모두 최상위에서 const SERVICE_ID · LANG 을 선언합니다.
   두 개를 같은 페이지에 넣으면 'Identifier already declared' 로 페이지가
   통째로 죽습니다. 그래서 화면 안에서 종을 갈아끼울 수 없고, 주소를 보고
   코어 하나만 넣습니다. 종을 바꾸면 페이지를 다시 엽니다.

   코어마다 다른 이름(GENES vs CR_ALL_GENES())은 breeding-spec.js 가 흡수합니다.

   ---------------------------------------------------------------------------
   무엇이 종에 매여 있고 무엇이 아닌가
   ---------------------------------------------------------------------------
   개체·페어링·클러치는 **기록**입니다. 이름·성별·날짜·메모라서 종과 무관하게
   그대로 동작합니다. 종에 매인 것은 모프 체크박스와 역산뿐입니다.

   역산은 레오파드·크레스티드·팻테일에서 됩니다. 볼파이톤은 보류입니다 —
   BEL 복합처럼 대립인자가 여럿 얽힌 자리가 많아 같은 규칙으로 덮이지
   않습니다. 틀린 답을 내놓는 것보다 아직 없다고 말하는 편이 낫습니다.

   역산이 하는 일은 하나입니다: **내 개체로 이 모프에 닿는가, 아니면 뭐가
   없는가.** 확률은 계산기가 이미 계산하고, 여기서 다시 구현하면 두 곳의
   답이 갈립니다. 판정은 breeding-spec.js 의 goalCheck 가 합니다.
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

  /* 종별 코어 파일. breeding-spec.js 의 표와 짝입니다. */
  const CORES = {
    gecko:      { ko: '레오파드 게코',        src: '/gecko/gecko-core.js',       goal: true },
    crested:    { ko: '크레스티드 게코',      src: '/crested/crested-core.js',   goal: true  },
    fattail:    { ko: '아프리카 팻테일 게코', src: '/fattail/fattail-core.js',   goal: true  },
    ballpython: { ko: '볼파이톤',            src: '/ballpython/ball-core.js',   goal: false }
  };

  const S = { species: 'gecko', tab: 'animals', animals: [], pairs: [], clutches: [],
              edit: null, busy: false };
  let B = null;   // BreedSpec

  function toast(m) {
    const t = $('toast'); t.textContent = m; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }

  /* ── 불러오기 ──────────────────────────────────────────────────────── */
  async function loadAll() {
    const [animals, pairs, clutches] = await Promise.all([
      A.listAnimals(), A.listRows('pairings'), A.listRows('clutches')
    ]);
    /* 이 종의 개체만 다룹니다. 모프 체크박스가 이 종의 유전자로 그려지므로
       다른 종을 섞으면 엉뚱한 모프를 들고 있는 것처럼 보입니다. */
    S.animals = animals.filter(a => (a.species || 'leopard') === S.species);
    S.others = animals.length - S.animals.length;
    const ids = new Set(S.animals.map(a => a.id));
    S.pairs = pairs.filter(p => !p.male && !p.female || ids.has(p.male) || ids.has(p.female));
    const pids = new Set(S.pairs.map(p => p.id));
    S.clutches = clutches.filter(c => !c.pairing || pids.has(c.pairing));
  }

  async function act(fn, ok) {
    if (S.busy) return;
    S.busy = true;
    try { await fn(); await loadAll(); render(); if (ok) toast(ok); }
    catch (e) { toast(A.friendly(e)); }
    finally { S.busy = false; }
  }

  function nameById(id) {
    const a = S.animals.filter(x => x.id === id)[0];
    return a ? (a.name || '이름 없음') : '-';
  }
  function otherNote() {
    return S.others
      ? '<div class="hint">' + icon('bi-info-circle') + ' 다른 종 ' + S.others
        + '마리는 위에서 종을 바꾸거나 <a href="/care/">크리처 케어로그</a>에서 볼 수 있어요.</div>'
      : '';
  }

  /* 예전에는 색 강도가 레오파드 전용 화면에만 있어서 여기서 그쪽으로
     보내는 안내를 띄웠습니다. 이제 색 강도가 이 화면에 있고 레오파드 전용
     화면은 여기로 넘어오게 바꿨습니다 — 안내를 남겨두면 두 화면이 서로를
     가리키며 도는 꼴이 됩니다. 그래서 없앴습니다. */
  function legacyNote() { return ''; }

  /* ── 개체 ──────────────────────────────────────────────────────────── */
  function tabAnimals() {
    if (S.edit && S.edit.what === 'animal') return animalForm(S.edit.row);

    let h = '<button class="btn wide" data-new="animal" style="margin-bottom:14px">'
          + icon('bi-plus-lg') + '개체 등록</button>' + otherNote() + legacyNote();
    if (!S.animals.length) {
      return h + '<div class="pad"><div class="empty">' + icon('bi-heart')
        + esc(CORES[S.species].ko) + ' 개체가 없습니다.<br>등록하면 페어링·클러치를 관리할 수 있어요.</div></div>';
    }
    return h + S.animals.map(animalCard).join('');
  }

  function animalCard(a) {
    const vis = (a.morphs || []).map(t => B.morphName(t));
    const het = (a.hets || []).map(t => B.morphName(t));
    const combo = B.comboName(a.morphs || []);
    const sex = a.sex === 'male' ? '<span class="chip">♂ 수컷</span>'
              : a.sex === 'female' ? '<span class="chip">♀ 암컷</span>' : '';
    return '<div class="card">'
      + '<div class="thumb">' + (a.photo_url ? Photo.tag(a.photo_url, a.name || '') : '🦎') + '</div>'
      + '<div class="info"><div class="nm">' + esc(a.name || '이름 없음') + sex
      + (combo ? '<span class="chip" style="color:var(--teal);border-color:var(--teal)">' + esc(combo) + '</span>' : '')
      + '</div>'
      + '<div class="ms">' + (vis.length ? esc(vis.join(' · ')) : '모프 미입력')
      + (het.length ? '<br><span style="color:var(--eggplant)">het ' + esc(het.join(' · ')) + '</span>' : '')
      + ((a.parent_a || a.parent_b) ? '<br>부모 ' + esc(nameById(a.parent_a)) + ' × ' + esc(nameById(a.parent_b)) : '')
      /* 색 강도 — 점으로 보여줍니다. 숫자만 있으면 5점 만점인지 알기 어렵습니다. */
      + (a.color_grade
          ? '<br><span class="gdrow" title="라인브리딩 색 강도 ' + a.color_grade + '/5">'
            + '<span class="gd on"></span>'.repeat(a.color_grade)
            + '<span class="gd"></span>'.repeat(5 - a.color_grade)
            + ' 색 강도 ' + a.color_grade + '/5</span>' : '')
      + '</div></div>'
      + '<div class="acts">'
      + '<a class="mini" href="animal.html?id=' + encodeURIComponent(a.id) + '">' + icon('bi-graph-up') + '관리</a>'
      + '<button class="mini" data-edit="animal:' + a.id + '">' + icon('bi-pencil') + '수정</button>'
      + '</div></div>';
  }

  function animalForm(a) {
    a = a || { morphs: [], hets: [] };
    const isNew = !a.id;
    const sv = new Set(a.morphs || []), sh = new Set(a.hets || []);
    const popt = id => '<option value="">부모 선택 안 함</option>'
      + S.animals.filter(x => x.id !== a.id)
        .map(x => '<option value="' + x.id + '"' + (id === x.id ? ' selected' : '') + '>'
          + esc(x.name || '이름 없음') + '</option>').join('');

    /* 형질은 그룹으로 묶어 보여줍니다. 34개가 한 덩어리로 늘어서면 못 찾습니다. */
    const traits = B.traitOptions();
    const groups = {};
    traits.forEach(t => { (groups[t[2] || '기타'] = groups[t[2] || '기타'] || []).push(t); });

    return '<div class="pad">'
      + '<div class="lbl">' + (isNew ? '개체 등록' : '개체 수정') + '</div>'
      + '<div class="hint">' + esc(CORES[S.species].ko) + ' 기준으로 모프를 고릅니다.</div>'

      + '<div class="lbl2"><label for="f_name">이름 / 개체번호</label></div>'
      + '<input class="in" id="f_name" value="' + esc(a.name || '') + '">'
      + '<div class="row2">'
      + '<div><div class="lbl2"><label for="f_sex">성별</label></div><select class="in" id="f_sex">'
      + ['unknown:미상', 'male:수컷 ♂', 'female:암컷 ♀'].map(o => {
          const [v, t] = o.split(':');
          return '<option value="' + v + '"' + ((a.sex || 'unknown') === v ? ' selected' : '') + '>' + t + '</option>';
        }).join('') + '</select></div>'
      + '<div><div class="lbl2"><label for="f_hatch">해칭일 (선택)</label></div>'
      + '<input class="in" id="f_hatch" type="date" value="' + esc(a.hatch_date || '') + '"></div>'
      + '</div>'

      + '<div class="lbl2">비주얼 (발현 모프)</div><div class="tokgrid">'
      + B.visualOptions().map(t =>
          '<label class="tokchk"><input type="checkbox" class="v" value="' + esc(t[0]) + '"'
          + (sv.has(t[0]) ? ' checked' : '') + '>' + esc(t[1]) + '</label>').join('')
      + '</div>'

      + (B.hetOptions().length
          ? '<div class="lbl2">het 보유 (열성)</div><div class="tokgrid">'
            + B.hetOptions().map(t =>
                '<label class="tokchk"><input type="checkbox" class="h" value="' + esc(t[0]) + '"'
                + (sh.has(t[0]) ? ' checked' : '') + '>' + esc(t[1]) + '</label>').join('')
            + '</div>' : '')

      + (traits.length
          ? '<div class="lbl2">라인브리딩 형질</div>'
            + Object.keys(groups).map(g =>
                '<div class="hint" style="margin:8px 0 3px;font-weight:800;color:var(--ink)">' + esc(g) + '</div>'
                + '<div class="tokgrid">' + groups[g].map(t =>
                    '<label class="tokchk"><input type="checkbox" class="v" value="' + esc(t[0]) + '"'
                    + (sv.has(t[0]) ? ' checked' : '') + '>' + esc(t[1]) + '</label>').join('') + '</div>').join('')
          : '')

      + '<div class="lbl2">혈통 (선택)</div><div class="row2">'
      + '<select class="in" id="f_pa" aria-label="부">' + popt(a.parent_a) + '</select>'
      + '<select class="in" id="f_pb" aria-label="모">' + popt(a.parent_b) + '</select></div>'

      /* 색 강도 — 레오파드 전용 화면에만 있던 것을 옮겨왔습니다.
         라인브리딩은 확률이 안 나오니 '얼마나 진하게 올라왔는지' 는 결국
         눈으로 보고 적어두는 수밖에 없습니다. 그 기록입니다.
         라인브리딩 형질이 있는 종에서만 띄웁니다 — 형질이 없으면
         적을 대상 자체가 없습니다. */
      + (traits.length
          ? '<div class="lbl2"><label for="f_grade">라인브리딩 색 강도 (선택)</label></div>'
            + '<select class="in" id="f_grade">'
            + '<option value="">기록 안 함</option>'
            + [1, 2, 3, 4, 5].map(n =>
                '<option value="' + n + '"' + (a.color_grade === n ? ' selected' : '') + '>'
                + n + ' / 5</option>').join('')
            + '</select>'
            + '<div class="hint">내 눈으로 매기는 값입니다. 확률 계산에는 쓰이지 않습니다.</div>'
          : '')

      + '<div class="lbl2">사진 (선택)</div>'
      + '<div class="photorow">'
      + '<div class="photoprev" id="f_prev">'
      + (a.photo_url ? Photo.tag(a.photo_url, '') : '<span>없음</span>') + '</div>'
      + '<div class="photoside">'
      + '<label class="btn ghost sm" for="f_img">' + icon('bi-image') + '사진 고르기</label>'
      + '<input type="file" id="f_img" accept="image/*" hidden>'
      + (a.photo_url ? '<button class="mini del" id="f_imgdel">' + icon('bi-x-lg') + '사진 지우기</button>' : '')
      + '<div class="hint" id="f_imgmsg">올리기 전에 자동으로 줄입니다.</div>'
      + '</div></div>'

      + '<div class="lbl2"><label for="f_note">메모 (선택)</label></div>'
      + '<input class="in" id="f_note" value="' + esc(a.note || '') + '">'
      + '<div class="hint">' + icon('bi-shield-check')
      + ' 이 메모는 공개되지 않습니다. 공유 화면에는 개체 관리의 <b>공개 소개글</b>만 나갑니다.</div>'

      + '<div class="err" id="f_err"></div>'
      + '<div class="formbtns"><button class="btn" id="f_save">' + icon('bi-check-lg') + '저장</button>'
      + '<button class="btn ghost" data-cancel="1">취소</button>'
      + (isNew ? '' : '<button class="btn danger" data-del="animal:' + a.id + '" style="margin-left:auto">'
                    + icon('bi-trash3') + '삭제</button>')
      + '</div></div>';
  }

  /* 고른 사진은 저장을 누르기 전에 미리 올려 둡니다. 저장할 때 한꺼번에
     올리면 사진이 큰 경우 몇 초 동안 아무 반응이 없어서 두 번 누르게 됩니다.
     여기 담아뒀다가 저장할 때 주소만 실어 보냅니다. */
  let pendingPhoto;   // undefined = 안 건드림 · null = 지움 · string = 새 주소

  async function pickPhoto(file) {
    const msg = $('f_imgmsg'), prev = $('f_prev');
    if (!file) return;
    try {
      const url = await A.uploadPhoto(file, m => { if (msg) msg.textContent = m; });
      pendingPhoto = url;
      /* 방금 올렸어도 비공개 버킷이라 그냥은 안 보입니다. 서명을 받아 겁니다. */
      if (prev) { prev.innerHTML = Photo.tag(url, ''); Photo.hydrate(prev, A.sb); }
      if (msg) msg.textContent = '올렸습니다. 저장을 눌러야 반영됩니다.';
    } catch (e) {
      if (msg) msg.textContent = A.friendly(e);
    }
  }

  function saveAnimal() {
    const name = $('f_name').value.trim();
    if (!name) { $('f_err').textContent = '이름을 적어주세요.'; return; }
    const pick = c => Array.prototype.slice.call(document.querySelectorAll('.' + c + ':checked')).map(x => x.value);
    /* ⚠️ species 를 반드시 실어 보냅니다. animals.species 는 not null 인데
       save_row 안의 jsonb_populate_record 는 칼럼 기본값을 적용하지 않습니다.
       (supabase_v17.sql / v19.sql 머리말) */
    const row = Object.assign({}, S.edit.row || {}, {
      species: (S.edit.row && S.edit.row.species) || S.species,
      name: name,
      sex: $('f_sex').value || null,
      hatch_date: $('f_hatch').value || null,
      morphs: pick('v'), hets: pick('h'),
      parent_a: $('f_pa').value || null, parent_b: $('f_pb').value || null,
      note: $('f_note').value.trim() || null
    });
    /* 색 강도는 라인브리딩 형질이 있는 종에서만 칸이 뜹니다. 칸이 없을 때
       null 을 밀어 넣으면 이미 적어둔 값을 지우게 되므로 손대지 않습니다. */
    if ($('f_grade')) row.color_grade = parseInt($('f_grade').value, 10) || null;
    /* undefined 면 손대지 않습니다 — v19 이후 save_row 가 합치므로 안 보내면
       기존 사진이 그대로 남습니다. null 을 보내야 지워집니다. */
    if (pendingPhoto !== undefined) row.photo_url = pendingPhoto;
    act(async () => { await A.saveAnimal(row); S.edit = null; }, '저장했습니다');
  }

  /* ── 페어링 ────────────────────────────────────────────────────────── */
  function tabPair() {
    if (S.edit && S.edit.what === 'pair') return pairForm(S.edit.row);
    let h = '<button class="btn wide" data-new="pair" style="margin-bottom:14px">'
          + icon('bi-plus-lg') + '페어링 등록</button>';
    if (!S.pairs.length) {
      return h + '<div class="pad"><div class="empty">' + icon('bi-arrow-left-right')
        + '등록된 페어링이 없습니다.<br>수컷과 암컷을 묶어두면 클러치를 붙일 수 있어요.</div></div>';
    }
    return h + S.pairs.map(p =>
      '<div class="card"><div class="info"><div class="nm">' + esc(p.name || '이름 없는 페어링') + '</div>'
      + '<div class="ms">' + esc(nameById(p.male)) + ' ♂ × ' + esc(nameById(p.female)) + ' ♀'
      + (p.note ? '<br>' + esc(p.note) : '') + '</div></div>'
      + '<div class="acts"><button class="mini" data-edit="pair:' + p.id + '">'
      + icon('bi-pencil') + '수정</button></div></div>').join('');
  }

  function pairForm(p) {
    p = p || {};
    const opt = (sel, filter) => '<option value="">선택 안 함</option>'
      + S.animals.filter(filter).map(a => '<option value="' + a.id + '"'
        + (sel === a.id ? ' selected' : '') + '>' + esc(a.name || '이름 없음') + '</option>').join('');
    return '<div class="pad"><div class="lbl">' + (p.id ? '페어링 수정' : '페어링 등록') + '</div>'
      + '<div class="lbl2"><label for="p_name">이름</label></div>'
      + '<input class="in" id="p_name" value="' + esc(p.name || '') + '" placeholder="예) 2026 A라인">'
      + '<div class="row2">'
      + '<div><div class="lbl2">수컷</div><select class="in" id="p_m" aria-label="수컷">'
      + opt(p.male, a => a.sex !== 'female') + '</select></div>'
      + '<div><div class="lbl2">암컷</div><select class="in" id="p_f" aria-label="암컷">'
      + opt(p.female, a => a.sex !== 'male') + '</select></div></div>'
      + '<div class="hint">성별을 적어둔 개체만 각 칸에 나옵니다. 미상은 양쪽 모두에 나옵니다.</div>'
      + '<div class="lbl2"><label for="p_note">메모</label></div>'
      + '<input class="in" id="p_note" value="' + esc(p.note || '') + '">'
      + '<div class="err" id="p_err"></div>'
      + '<div class="formbtns"><button class="btn" id="p_save">' + icon('bi-check-lg') + '저장</button>'
      + '<button class="btn ghost" data-cancel="1">취소</button>'
      + (p.id ? '<button class="btn danger" data-del="pair:' + p.id + '" style="margin-left:auto">'
                + icon('bi-trash3') + '삭제</button>' : '')
      + '</div></div>';
  }

  /* ── 클러치 ────────────────────────────────────────────────────────── */
  /* 온도별 부화 소요일. 레오파드 기준값이라 다른 종에는 안내를 달리합니다. */
  function hatchDays(t) {
    t = parseFloat(t) || 28;
    if (t >= 31) return 38;
    if (t >= 29.5) return 45;
    if (t >= 28) return 55;
    if (t >= 26.5) return 68;
    return 80;
  }

  function tabClutch() {
    if (S.edit && S.edit.what === 'clutch') return clutchForm(S.edit.row);
    let h = '<button class="btn wide" data-new="clutch" style="margin-bottom:14px">'
          + icon('bi-plus-lg') + '클러치 등록</button>';
    if (!S.clutches.length) {
      return h + '<div class="pad"><div class="empty">' + icon('bi-egg')
        + '등록된 클러치가 없습니다.</div></div>';
    }
    const today = C.today();
    return h + S.clutches.map(function (c) {
      const pair = S.pairs.filter(p => p.id === c.pairing)[0];
      const left = c.expected_hatch ? C.daysBetween(today, c.expected_hatch) : null;
      return '<div class="card"><div class="thumb">🥚</div><div class="info">'
        + '<div class="nm">' + esc(pair ? (pair.name || '이름 없는 페어링') : '페어링 없음')
        + (left != null && left >= 0 ? '<span class="chip" style="color:var(--teal);border-color:var(--teal)">D-' + left + '</span>'
           : left != null ? '<span class="chip">기한 지남</span>' : '') + '</div>'
        + '<div class="ms">' + (c.laid_date ? '산란 ' + esc(c.laid_date) : '산란일 미입력')
        + (c.egg_count ? ' · ' + c.egg_count + '개' : '')
        + (c.temp ? ' · ' + c.temp + '℃' : '')
        + (c.expected_hatch ? '<br>부화 예정 ' + esc(c.expected_hatch) : '')
        + (c.note ? '<br>' + esc(c.note) : '') + '</div></div>'
        + '<div class="acts"><button class="mini" data-edit="clutch:' + c.id + '">'
        + icon('bi-pencil') + '수정</button></div></div>';
    }).join('');
  }

  function clutchForm(c) {
    c = c || {};
    return '<div class="pad"><div class="lbl">' + (c.id ? '클러치 수정' : '클러치 등록') + '</div>'
      + '<div class="lbl2">페어링</div><select class="in" id="c_p" aria-label="페어링">'
      + '<option value="">선택 안 함</option>'
      + S.pairs.map(p => '<option value="' + p.id + '"' + (c.pairing === p.id ? ' selected' : '') + '>'
          + esc(p.name || '이름 없는 페어링') + '</option>').join('') + '</select>'
      + '<div class="row2">'
      + '<div><div class="lbl2"><label for="c_laid">산란일</label></div>'
      + '<input class="in" id="c_laid" type="date" value="' + esc(c.laid_date || '') + '"></div>'
      + '<div><div class="lbl2"><label for="c_n">알 개수</label></div>'
      + '<input class="in" id="c_n" type="number" min="0" max="99" inputmode="numeric" value="'
      + esc(c.egg_count == null ? '' : c.egg_count) + '"></div></div>'
      + '<div class="lbl2"><label for="c_t">인큐베이터 온도 (℃)</label></div>'
      + '<input class="in" id="c_t" type="number" step="0.5" inputmode="decimal" value="'
      + esc(c.temp == null ? '' : c.temp) + '">'
      + (S.species === 'gecko'
          ? '<div class="hint">온도를 적으면 부화 예정일을 <b>레오파드 기준</b>으로 자동 계산합니다.</div>'
          : '<div class="hint">부화 예정일 자동 계산은 <b>레오파드 기준</b>입니다. '
            + esc(CORES[S.species].ko) + ' 는 아래에서 직접 적어주세요.</div>')
      + '<div class="lbl2"><label for="c_exp">부화 예정일</label></div>'
      + '<input class="in" id="c_exp" type="date" value="' + esc(c.expected_hatch || '') + '">'
      + '<div class="lbl2"><label for="c_note">메모</label></div>'
      + '<input class="in" id="c_note" value="' + esc(c.note || '') + '">'
      + '<div class="err" id="c_err"></div>'
      + '<div class="formbtns"><button class="btn" id="c_save">' + icon('bi-check-lg') + '저장</button>'
      + '<button class="btn ghost" data-cancel="1">취소</button>'
      + (c.id ? '<button class="btn danger" data-del="clutch:' + c.id + '" style="margin-left:auto">'
                + icon('bi-trash3') + '삭제</button>' : '')
      + '</div></div>';
  }

  /* ── 역산 ──────────────────────────────────────────────────────────────
     "이 모프를 만들 수 있나, 없다면 뭐가 없나" 만 답합니다. 확률은 계산기가
     이미 하고, 여기서 다시 구현하면 두 곳의 답이 갈립니다.

     판정은 breeding-spec.js 의 goalCheck 가 대립인자 단위로 합니다. 유전자
     단위로 보면 세이블 가진 개체가 카푸치노에 도움이 되는 것처럼 나옵니다. */
  function tabGoal() {
    if (!CORES[S.species].goal) {
      return '<div class="pad"><div class="lbl">목표 모프 역산</div>'
        + '<div class="empty" style="margin-top:12px">' + icon('bi-hourglass-split')
        + esc(CORES[S.species].ko) + ' 역산은 아직 준비 중입니다.</div>'
        + '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="'
        + esc(CORES[S.species].calc || '/') + '">' + icon('bi-calculator')
        + esc(CORES[S.species].ko) + ' 계산기에서 조합 확인</a></div>';
    }

    /* 목록 옆 배지는 '가능한가' 를 답합니다.
       처음에는 '보유 N' 으로 개체 수를 보여줬는데, 카푸치노 한 마리만 있어도
       '슈퍼카푸치노 보유 1' 이 떠서 슈퍼카푸치노를 갖고 있는 것처럼 읽혔습니다.
       숫자보다 되는지 여부가 알고 싶은 것이고, 숫자는 눌러서 보면 됩니다. */
    const opts = B.visualOptions();
    const checks = B.goalCheck(opts.map(o => o[0]), S.animals);
    const badge = {};
    checks.forEach(function (c) {
      if (c.ok) { badge[c.token] = ['ok', '가능']; return; }
      /* 하나라도 보탤 수 있으면 '일부'. 아무것도 없으면 배지를 안 답니다 —
         목록 전체에 배지가 붙으면 아무것도 구분되지 않습니다. */
      const some = c.paths.some(p => p.needs.some(n => n.holders.length));
      if (some) badge[c.token] = ['part', '일부'];
    });

    return '<div class="pad"><div class="lbl">목표 모프 역산</div>'
      + '<div class="hint">만들고 싶은 모프를 고르면 <b>내가 등록한 '
      + esc(CORES[S.species].ko) + '</b> 로 닿을 수 있는지, 없다면 무엇이 없는지 알려줍니다. '
      + '확률은 계산하지 않습니다 — 그건 계산기가 합니다.</div>'
      + otherNote()
      + '<div class="hint">등록된 개체 <b>' + S.animals.length + '마리</b></div>'
      + '<div class="tokgrid">' + opts.map(t => {
          const b = badge[t[0]];
          return '<label class="tokchk"><input type="checkbox" class="g" value="' + esc(t[0]) + '">'
            + esc(t[1])
            + (b ? '<span class="ownb ' + b[0] + '">' + b[1] + '</span>' : '') + '</label>';
        }).join('') + '</div>'
      + '<div class="formbtns"><button class="btn" id="g_run">' + icon('bi-play') + '가능한지 보기</button></div>'
      + '<div id="g_out"></div></div>';
  }

  function runGoal() {
    const tk = Array.prototype.slice.call(document.querySelectorAll('.g:checked')).map(x => x.value);
    const out = $('g_out');
    if (!tk.length) { out.innerHTML = '<div class="err">목표 모프를 하나 이상 고르세요.</div>'; return; }

    const res = B.goalCheck(tk, S.animals);
    const combo = B.comboName(tk);
    const blocked = res.filter(r => !r.ok);

    let h = '<div class="pathbox" style="margin-top:12px">'
      + '<b>목표</b><br>' + (combo ? '<span class="combotag">콤보</span>' + esc(combo) + '<br>' : '')
      + esc(res.map(r => r.name).join(' · ')) + '</div>';

    h += '<div class="note ' + (blocked.length ? 'warn' : 'good') + '">'
      + icon(blocked.length ? 'bi-exclamation-triangle' : 'bi-check2-circle')
      + '<span>' + (blocked.length
          ? '지금 개체로는 ' + blocked.length + '가지가 안 됩니다 — ' + esc(blocked.map(r => r.name).join(', '))
          : '필요한 유전자를 모두 보유하고 있습니다. 실제 확률은 계산기에서 확인하세요.')
      + '</span></div>';

    /* 항목별로 무엇이 모자란지. 경로가 여럿인 토큰(팻테일 슈퍼 스팅어 등)은
       그 중 하나라도 되면 가능이므로, 안 될 때만 모든 경로를 펼쳐 보여줍니다. */
    h += res.map(function (r) {
      if (!r.known) {
        return '<div class="pathbox" style="margin-top:8px"><b>' + esc(r.name) + '</b><br>'
          + '<span class="hint">이 종의 유전 정보에서 찾지 못한 항목입니다.</span></div>';
      }
      if (r.ok) {
        const path = r.paths.filter(p => p.ok)[0];
        return '<div class="pathbox" style="margin-top:8px">'
          + '<b>' + esc(r.name) + '</b> ' + icon('bi-check2-circle') + '<br>'
          + path.needs.map(function (n) {
              return '<span class="hint">' + esc(alleleLabel(n.allele)) + ' '
                + (n.need > 1 ? '양쪽 부모' : '한쪽 부모') + ' — 보유 '
                + n.holders.length + '마리 ('
                + esc(n.holders.slice(0, 3).map(a => a.name || '이름 없음').join(', '))
                + (n.holders.length > 3 ? ' 외' : '') + ')</span>';
            }).join('<br>') + '</div>';
      }
      return '<div class="pathbox" style="margin-top:8px">'
        + '<b>' + esc(r.name) + '</b> ' + icon('bi-x-circle') + '<br>'
        + r.paths.map(function (p, i) {
            return '<span class="hint">'
              + (r.paths.length > 1 ? '경로 ' + (i + 1) + ' — ' : '')
              + p.needs.map(function (n) {
                  /* '없음' 만 쓰면 한 마리는 있는데 두 마리가 필요한 경우가
                     아무것도 없는 것처럼 읽힙니다. 가진 수와 필요한 수를
                     같이 적습니다. */
                  return esc(alleleLabel(n.allele)) + ' '
                    + (n.need > 1 ? '양쪽 부모' : '한쪽 부모') + ' '
                    + (n.ok ? '(보유 ' + n.holders.length + ')'
                            : '<b>보유 ' + n.holders.length + ' / 필요 ' + n.need + '</b>');
                }).join(' + ')
              + '</span>';
          }).join('<br>') + '</div>';
    }).join('');

    h += '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="'
      + esc(CORES[S.species].calc) + '">' + icon('bi-calculator') + '계산기에서 확률 보기</a>';
    out.innerHTML = h;
  }

  /* 대립인자 이름. 단순 유전자는 대립인자가 곧 유전자 id 라 모프 이름이
     그대로 나오고, 유전형이 있는 자리는 'C'·'S' 같은 한 글자라 그대로 둡니다. */
  function alleleLabel(allele) {
    const n = B.morphName(allele);
    return (n && n !== allele) ? n : allele;
  }

  /* ── 그리기 ────────────────────────────────────────────────────────── */
  function render() {
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('on', t.getAttribute('data-t') === S.tab));
    $('body').innerHTML =
      ({ animals: tabAnimals, pair: tabPair, clutch: tabClutch, goal: tabGoal }[S.tab])();
    /* 사진은 비공개 버킷이라 서명 주소를 받아야 보입니다.
       다 그린 뒤 한 번에 채웁니다 (assets/photo.js). */
    Photo.hydrate($('body'), A.sb);

  }

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('button');
    if (!t) return;
    const d = t.dataset;

    if (t.classList.contains('tab')) {
      S.tab = t.getAttribute('data-t'); S.edit = null;
      try { history.replaceState(null, '', '?species=' + S.species + '#' + S.tab); } catch (e) {}
      return render();
    }
    if (d.cancel) { S.edit = null; return render(); }
    if (d.new) { S.edit = { what: d.new, row: null }; pendingPhoto = undefined; return render(); }
    if (d.edit) {
      const [what, id] = d.edit.split(':');
      const src = { animal: S.animals, pair: S.pairs, clutch: S.clutches }[what];
      S.edit = { what: what, row: src.filter(x => x.id === id)[0] };
      pendingPhoto = undefined;
      return render();
    }
    if (d.del) {
      const [what, id] = d.del.split(':');
      const label = { animal: '개체', pair: '페어링', clutch: '클러치' }[what];
      if (!confirm('이 ' + label + '을(를) 지울까요? 되돌릴 수 없습니다.')) return;
      const table = { animal: 'animals', pair: 'pairings', clutch: 'clutches' }[what];
      return act(async () => { await A.deleteRow(table, id); S.edit = null; }, '삭제했습니다');
    }
    if (t.id === 'f_imgdel') {
      pendingPhoto = null;
      const p = $('f_prev'), m = $('f_imgmsg');
      if (p) p.innerHTML = '<span>없음</span>';
      if (m) m.textContent = '저장을 눌러야 지워집니다.';
      t.remove();
      return;
    }
    if (t.id === 'f_save') return saveAnimal();
    if (t.id === 'p_save') {
      const row = Object.assign({}, S.edit.row || {}, {
        name: $('p_name').value.trim() || null,
        male: $('p_m').value || null, female: $('p_f').value || null,
        note: $('p_note').value.trim() || null
      });
      return act(async () => { await A.saveRow('pairings', row); S.edit = null; }, '저장했습니다');
    }
    if (t.id === 'c_save') {
      const temp = $('c_t').value ? Number($('c_t').value) : null;
      let exp = $('c_exp').value || null;
      /* 예정일을 안 적었고 산란일·온도가 있으면 레오파드 기준으로 채웁니다.
         다른 종은 기준값이 달라 자동 계산하지 않습니다 — 틀린 날짜가 캘린더에
         들어가는 것보다 비워두는 편이 낫습니다. */
      if (!exp && S.species === 'gecko' && $('c_laid').value && temp) {
        exp = C.addDays($('c_laid').value, hatchDays(temp));
      }
      const row = Object.assign({}, S.edit.row || {}, {
        pairing: $('c_p').value || null,
        laid_date: $('c_laid').value || null,
        egg_count: $('c_n').value ? parseInt($('c_n').value, 10) : null,
        temp: temp, expected_hatch: exp,
        note: $('c_note').value.trim() || null
      });
      return act(async () => { await A.saveRow('clutches', row); S.edit = null; }, '저장했습니다');
    }
    if (t.id === 'g_run') return runGoal();
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'f_img') { pickPhoto(ev.target.files && ev.target.files[0]); return; }
    if (ev.target.id !== 'species') return;
    /* 코어를 갈아끼울 수 없으므로 페이지를 다시 엽니다 (머리말 참고) */
    location.href = 'breeding.html?species=' + encodeURIComponent(ev.target.value) + '#' + S.tab;
  });

  /* ── 시작 ──────────────────────────────────────────────────────────── */
  function loadScript(src) {
    return new Promise(function (done, fail) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => done();
      s.onerror = () => fail(new Error(src + ' 를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
  }

  function gate(iconName, title, body, href, label) {
    $('body').innerHTML = '<div class="gate"><div class="pad">'
      + '<div class="gicon">' + icon(iconName) + '</div>'
      + '<div class="lbl">' + title + '</div><div class="hint">' + body + '</div>'
      + (href ? '<a class="btn wide" style="text-decoration:none;margin-top:16px" href="' + href + '">'
                + icon('bi-arrow-right') + label + '</a>' : '')
      + '</div></div>';
  }

  async function boot() {
    if (!A.ready) { gate('bi-plug', '백엔드가 설정되지 않았습니다', 'assets/studio-config.js 를 확인해 주세요.', '/care/', '케어로'); return; }

    const q = new URLSearchParams(location.search).get('species');
    S.species = CORES[q] ? q : 'gecko';
    const hash = (location.hash || '').replace('#', '');
    if (['animals', 'pair', 'clutch', 'goal'].indexOf(hash) >= 0) S.tab = hash;

    await A.boot();
    A.logVisit();
    if (!A.user) { gate('bi-person-lock', '로그인이 필요합니다', '브리딩 기록은 계정에 저장됩니다.', '/gecko/login.html', '로그인'); return; }
    if (!A.premium.active) { gate('bi-gem', '프리미엄 기능입니다', '개체·페어링·클러치·역산을 이용할 수 있습니다.', '/gecko/login.html', '프리미엄 코드 입력'); return; }

    /* 종 코어 → 어댑터 순서로 넣습니다. 어댑터가 코어를 보고 종을 알아냅니다. */
    try {
      await loadScript(CORES[S.species].src + '?v=13');
      await loadScript('breeding-spec.js?v=13');
    } catch (e) {
      gate('bi-exclamation-triangle', '계산기 데이터를 불러오지 못했습니다', esc(e.message), '/care/', '케어로');
      return;
    }
    B = window.BreedSpec;
    if (!B) {
      gate('bi-exclamation-triangle', '종 데이터를 읽지 못했습니다',
           esc(CORES[S.species].ko) + ' 코어에서 유전 정보를 찾지 못했습니다.', '/care/', '케어로');
      return;
    }

    $('btitle').textContent = CORES[S.species].ko + ' 브리딩';
    $('bsub').textContent = '개체 · 페어링 · 클러치를 기록합니다';
    $('species').innerHTML = Object.keys(CORES).map(k =>
      '<option value="' + k + '"' + (k === S.species ? ' selected' : '') + '>'
      + esc(CORES[k].ko) + '</option>').join('');
    $('spbar').style.display = '';
    $('tabs').style.display = '';

    try { await loadAll(); } catch (e) {
      gate('bi-exclamation-triangle', '불러오지 못했습니다', esc(A.friendly(e)), '/care/', '케어로');
      return;
    }
    render();
  }

  boot();
})();
