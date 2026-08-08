/* 이미지 검수 (supabase_v68 · v69 · v70)
   ---------------------------------------------------------------------------
   사진은 아무거나 올라올 수 있고 지금까지 아무도 보지 않았습니다. QR·링크로
   돌고 크롤러가 주워 가면 걸리는 곳이 우리 도메인입니다. 회원 데이터를 보려는
   것이 아니라 우리 페이지에서 나가는 것을 책임지기 위한 화면입니다.

   ⚠️ 목록에는 공개된 것만 옵니다(admin_photo_queue). 비공개 개체를 보려면
      '자세히' 로 한 건씩 열어야 하고, 그때마다 열람 기록이 남습니다. 목록으로
      훑는 것과 사유를 남기고 보는 것은 다릅니다.

   ⚠️ 조치는 둘로 갈립니다.
      보류    — 일반 위반. 공개·학습은 즉시 끊고, 7일 안에 회원이 고치면 됩니다.
      즉시삭제 — 성인물·도박·직접적 피해. 유예 기간 동안 우리 서버에 두는 것
                 자체가 문제라 바로 지웁니다.

   회원 쪽 조각은 care/animal-hold.js 가 그립니다. 여기서 남긴 사유가 그대로
   회원 화면의 배너 문구가 됩니다 — 그래서 사유를 대충 쓰면 안 됩니다. */
(function () {
  'use strict';

  const state = { SB: null, body: null, esc: null, rows: [], onlyHeld: false, busy: false };

  /* supabase_v68 의 animals_held_category_ck 와 같아야 합니다.
     severe 인 것은 보류가 아니라 즉시 삭제로 갑니다. */
  const CATEGORIES = [
    { id: 'adult',     label: '성인물',            severe: true },
    { id: 'gambling',  label: '도박',              severe: true },
    { id: 'illegal',   label: '위법물',            severe: true },
    { id: 'harm',      label: '직접적 피해',        severe: true },
    { id: 'unrelated', label: '개체와 무관',        severe: false },
    { id: 'copyright', label: '저작권 의심',        severe: false },
    { id: 'other',     label: '기타 약관 위반',     severe: false }
  ];

  const esc = v => state.esc(v == null ? '' : v);
  const date = v => (v ? String(v).slice(0, 10) : '—');

  function categoryLabel(id) {
    const c = CATEGORIES.filter(x => x.id === id)[0];
    return c ? c.label : (id || '—');
  }

  function photoCount(row) {
    return (row.photo_url ? 1 : 0) + ((row.photos || []).length);
  }

  /* 사진은 비공개 버킷에 있습니다. 서명 주소를 받아야 열립니다. */
  async function signed(path) {
    if (!path) return null;
    /* 저장된 값이 전체 URL 인 경우가 있습니다(옛 판). 그대로 씁니다. */
    if (/^https?:\/\//.test(path)) return path;
    const r = await state.SB.storage.from('animal-photos').createSignedUrl(path, 300);
    return r.error ? null : (r.data && r.data.signedUrl);
  }

  function card(row) {
    const held = !!row.held_at;
    const waiting = !!row.waiting;
    const n = photoCount(row);

    return '<div class="mdcard' + (held ? ' held' : '') + '" data-mdid="' + esc(row.id) + '">'
      + '<div class="mdthumb" data-mdthumb="' + esc(row.photo_url || (row.photos || [])[0] || '') + '">'
      + '<span class="mdcount">' + n + '</span></div>'
      + '<div class="mdinfo">'
      + '<div class="mdname">' + esc(row.name || '이름 없음')
      + (held ? '<span class="mdbadge' + (waiting ? ' wait' : '') + '">'
                + (waiting ? '확인 대기' : '보류 · ' + date(row.purge_after) + ' 삭제')
                + '</span>' : '')
      + '</div>'
      + '<div class="mdmeta">' + esc(row.owner_email || row.owner_nickname || '—')
      + ' · ' + esc(row.species || '') + ' · ' + date(row.created_at) + '</div>'
      + (held ? '<div class="mdreason">' + esc(categoryLabel(row.held_category)) + ' — '
                + esc(row.held_reason || '') + '</div>' : '')
      + '</div>'
      + '<div class="mdacts">'
      + '<button class="mini" data-mddetail="' + esc(row.id) + '">자세히</button>'
      + (held
          ? '<button class="mini" data-mdrelease="' + esc(row.id) + '">해제</button>'
          : '<button class="mini" data-mdhold="' + esc(row.id) + '">조치</button>')
      + '</div></div>';
  }

  function html() {
    const rows = state.rows;
    return '<div class="mdhead">'
      + '<div><b>이미지 검수</b>'
      + '<div class="asub">공개된 개체의 사진만 목록에 옵니다. 비공개는 ‘자세히’ 로 열 때만 보이고, 열람 기록이 남습니다.</div></div>'
      /* 목록은 공개된 것만 옵니다. 비공개 개체를 봐야 할 때 — 신고가 들어왔거나
         회원이 문의했을 때 — 여기로 직접 엽니다. 목록에 안 뜨는 것을 열 방법이
         없으면 '비공개는 사유가 있을 때 본다' 는 규칙이 그냥 '못 본다' 가 됩니다. */
      + '<div class="mdlookup">'
      + '<input class="ain" id="mdFind" placeholder="개체 id 로 직접 열기 (비공개 포함)">'
      + '<button class="mini" data-mdfind="1">열기</button></div>'
      + '<div class="mdfilter">'
      + '<button class="mini' + (state.onlyHeld ? '' : ' on') + '" data-mdfilter="all">전체</button>'
      + '<button class="mini' + (state.onlyHeld ? ' on' : '') + '" data-mdfilter="held">보류 중</button>'
      + '</div></div>'
      + (rows.length
          ? '<div class="mdlist">' + rows.map(card).join('') + '</div>'
          : '<div class="asub" style="padding:24px 0">검수할 사진이 없습니다.</div>');
  }

  /* 조치 대화상자. 분류를 고르면 보류인지 즉시 삭제인지가 정해집니다 —
     관리자가 매번 판단하지 않도록 분류에 묶어 둡니다. */
  function holdDialog(id, name) {
    return '<div class="mddlg" id="mdDlg"><div class="mddlg-in">'
      + '<div class="lbl">' + esc(name || '개체') + ' — 조치</div>'
      + '<div class="lbl2">분류</div>'
      + '<select class="ain" id="mdCat">'
      + CATEGORIES.map(c => '<option value="' + c.id + '"' + (c.severe ? ' data-severe="1"' : '') + '>'
          + esc(c.label) + (c.severe ? ' · 즉시 삭제' : ' · 7일 보류') + '</option>').join('')
      + '</select>'
      + '<div class="lbl2">회원에게 보일 사유</div>'
      + '<textarea class="ain" id="mdReason" rows="3" maxlength="500" '
      + 'placeholder="예) 개체와 무관한 사진으로 보입니다. 개체 사진으로 교체해 주세요."></textarea>'
      + '<div class="asub">여기 적은 문장이 회원 화면에 그대로 뜹니다. 비워 두면 분류 기본 문구가 나갑니다.</div>'
      + '<div class="mddlg-acts">'
      + '<button class="abtn" data-mdconfirm="' + esc(id) + '">적용</button>'
      + '<button class="abtn ghost" data-mdcancel="1">취소</button>'
      + '</div></div></div>';
  }

  async function load() {
    state.body.innerHTML = '<div class="asub">불러오는 중…</div>';
    const r = await state.SB.rpc('admin_photo_queue', {
      p_only_held: state.onlyHeld, p_limit: 60, p_offset: 0
    });
    if (r.error) {
      state.body.innerHTML = '<div class="aerr"><b>검수 목록을 불러오지 못했습니다.</b><br><br>'
        + '<code>supabase_v70.sql</code> 을 적용했는지 확인하세요.<br>'
        + esc(r.error.message || '') + '</div>';
      return;
    }
    state.rows = r.data || [];
    state.body.innerHTML = html();
    hydrate();
  }

  /* 썸네일은 서명 주소를 받아야 보입니다. 한 번에 여러 장이라 화면을 먼저
     그리고 나중에 채웁니다 — 서명을 기다리며 빈 화면을 보여 주지 않습니다. */
  function hydrate() {
    state.body.querySelectorAll('[data-mdthumb]').forEach(async function (el) {
      const url = await signed(el.getAttribute('data-mdthumb'));
      if (url) el.style.backgroundImage = 'url("' + url + '")';
    });
  }

  async function act(fn, okMsg) {
    if (state.busy) return;
    state.busy = true;
    try { await fn(); await load(); }
    catch (e) { alert((e && e.message) || String(e)); }
    finally { state.busy = false; }
  }

  function onClick(ev) {
    const t = ev.target.closest('button, [data-mdthumb]');
    if (!t || !state.body.contains(t)) return;
    const d = t.dataset;

    if (d.mdfilter) { state.onlyHeld = (d.mdfilter === 'held'); return load(); }

    if (d.mdfind) {
      const box = document.getElementById('mdFind');
      const id = (box.value || '').trim();
      if (!id) return;
      return openDetail(id);
    }

    if (d.mdhold) {
      const row = state.rows.filter(x => x.id === d.mdhold)[0];
      const wrap = document.createElement('div');
      wrap.innerHTML = holdDialog(d.mdhold, row && row.name);
      state.body.appendChild(wrap.firstChild);
      return;
    }
    if (d.mdcancel) { const dlg = document.getElementById('mdDlg'); if (dlg) dlg.remove(); return; }

    if (d.mdconfirm) {
      const sel = document.getElementById('mdCat');
      const cat = sel.value;
      const severe = !!(CATEGORIES.filter(c => c.id === cat)[0] || {}).severe;
      const reason = document.getElementById('mdReason').value.trim();
      const dlg = document.getElementById('mdDlg');

      if (severe && !confirm('즉시 삭제합니다. 사진은 되돌릴 수 없습니다. 계속할까요?')) return;
      if (dlg) dlg.remove();

      return act(async function () {
        const rpc = severe ? 'admin_purge_photos' : 'admin_hold_animal';
        const r = await state.SB.rpc(rpc, {
          p_animal: d.mdconfirm, p_category: cat, p_reason: reason || null
        });
        if (r.error) throw r.error;
      });
    }

    if (d.mdrelease) {
      const reason = prompt('해제 사유 (회원에게 보입니다)', '확인했습니다. 조치해 주셔서 감사합니다.');
      if (reason === null) return;
      return act(async function () {
        const r = await state.SB.rpc('admin_release_animal', {
          p_animal: d.mdrelease, p_reason: reason || null
        });
        if (r.error) throw r.error;
      });
    }

    if (d.mddetail) return openDetail(d.mddetail);
  }

  /* 한 건 열기. 목록의 '자세히' 와 위 조회창이 같은 길을 씁니다 — 어느 쪽으로
     열든 열람 사유를 묻고 기록에 남깁니다. */
  function openDetail(id) {
    const why = prompt('열람 사유를 남깁니다 (기록됩니다)', '검수');
    if (why === null) return;
    return act(async function () {
      const r = await state.SB.rpc('admin_animal_detail', { p_animal: id, p_reason: why });
      if (r.error) throw r.error;
      const a = r.data || {};
      const urls = [];
      for (const p of [a.photo_url].concat(a.photos || []).filter(Boolean)) {
        const u = await signed(p);
        if (u) urls.push(u);
      }
      if (!urls.length) { alert((a.name || '개체') + ' — 사진이 없습니다.'); return; }
      urls.forEach(u => window.open(u, '_blank', 'noopener'));
    });
  }

  async function render_(deps) {
    state.SB = deps.SB; state.body = deps.body; state.esc = deps.esc;
    if (!render_.bound) { document.addEventListener('click', onClick); render_.bound = true; }
    await load();
  }

  window.AdminModeration = { render: render_, CATEGORIES: CATEGORIES };
}());
