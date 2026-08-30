/* 사업자 인증 관리 (supabase_v60)
   ---------------------------------------------------------------------------
   신청을 심사하고, 신청 없이 직접 등록하기도 합니다.

   사업자등록번호를 화면에 그대로 띄웁니다. 관리자가 국세청 조회창에 붙여넣어
   대조하는 것이 이 화면의 목적이라, 가리면 할 일을 못 합니다. 대신 이 탭은
   최고관리자 전용이고, 공개 화면으로는 상호명과 로고만 나갑니다(v60).

   회원 탭(admin-members.js)과 같은 모양으로 떼어 두었습니다 — 그래야
   _harness-business.html 로 확인할 수 있습니다. */
(function () {
  'use strict';

  const state = { SB: null, body: null, esc: null, rows: [], filter: 'pending', busy: false };

  const STATUS = {
    pending:  { label: '심사 중', cls: 'wait' },
    approved: { label: '승인됨',  cls: 'ok' },
    rejected: { label: '반려됨',  cls: 'no' },
  };

  const escape = value => state.esc(value == null ? '' : value);

  function date(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('ko-KR'); }
    catch (error) { return String(value); }
  }

  /* 123-45-67890 으로 되돌려 보여 줍니다. 저장은 숫자만 하지만, 관리자가
     눈으로 대조할 때는 구분선이 있어야 자릿수를 셀 수 있습니다. */
  function bizNumber(value) {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    if (digits.length !== 10) return digits || '—';
    return digits.slice(0, 3) + '-' + digits.slice(3, 5) + '-' + digits.slice(5);
  }

  function counts() {
    return state.rows.reduce(function (acc, row) {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
  }

  function logoCell(row) {
    if (!row.logo_url) return '<div class="ab-logo none">로고 없음</div>';
    /* 로고 버킷은 공개라 주소를 그대로 씁니다. 실패 처리는 bind() 에서 붙입니다 —
       onerror 속성으로 적으면 script-src 의 'unsafe-inline' 에 기대게 되고,
       나중에 그걸 떼는 순간 조용히 안 돌게 됩니다. */
    return '<img class="ab-logo" data-biz-logo src="' + escape(row.logo_url) + '" alt="'
      + escape(row.biz_name) + ' 로고" loading="lazy">';
  }

  function card(row) {
    const meta = STATUS[row.status] || STATUS.pending;
    return `<article class="ab-card" data-biz-id="${escape(row.user_id)}">
      <div class="ab-head">
        ${logoCell(row)}
        <div class="ab-who">
          <b>${escape(row.biz_name)}</b>
          <p>${escape(row.email || '(이메일 없음)')}${row.nickname ? ' · @' + escape(row.nickname) : ''}</p>
        </div>
        <span class="ab-status ${meta.cls}">${escape(meta.label)}</span>
      </div>
      <dl class="ab-meta">
        <div><dt>사업자등록번호</dt><dd><code>${escape(bizNumber(row.biz_number))}</code></dd></div>
        <div><dt>신청일</dt><dd>${escape(date(row.applied_at))}</dd></div>
        <div><dt>처리일</dt><dd>${escape(date(row.decided_at))}</dd></div>
      </dl>
      ${row.note ? `<p class="ab-note">${escape(row.note)}</p>` : ''}
      <div class="ab-actions">
        ${row.status === 'approved' ? '' : `<button type="button" class="mini go" data-biz-approve="${escape(row.user_id)}">승인</button>`}
        ${row.status === 'rejected' ? '' : `<button type="button" class="mini" data-biz-reject="${escape(row.user_id)}">반려</button>`}
        <button type="button" class="mini del" data-biz-remove="${escape(row.user_id)}">기록 삭제</button>
      </div>
    </article>`;
  }

  function visibleRows() {
    if (state.filter === 'all') return state.rows;
    return state.rows.filter(row => row.status === state.filter);
  }

  function render() {
    const n = counts();
    const rows = visibleRows();
    const tab = (key, label) => `<button class="atab${state.filter === key ? ' on' : ''}"
      data-biz-filter="${key}">${label}</button>`;
    state.body.innerHTML = `<section class="ab-shell">
      <div class="ab-titlebar">
        <div><h2>사업자 인증</h2>
        <p>승인하면 공개 화면에서 브리더명 옆에 로고와 인증 표시가 붙습니다.
           사업자등록번호는 공개되지 않습니다.</p></div>
      </div>
      <div class="ab-stats">
        <div class="ab-stat wait"><b>${n.pending || 0}</b><span>심사 중</span></div>
        <div class="ab-stat ok"><b>${n.approved || 0}</b><span>승인됨</span></div>
        <div class="ab-stat no"><b>${n.rejected || 0}</b><span>반려됨</span></div>
      </div>
      <div class="ab-filter">
        ${tab('pending', '심사 중')}${tab('approved', '승인됨')}${tab('rejected', '반려됨')}${tab('all', '전체')}
      </div>
      <div class="ab-list">${rows.length
        ? rows.map(card).join('')
        : '<div class="ab-empty">이 조건에 해당하는 신청이 없습니다.</div>'}</div>

      <details class="ab-add">
        <summary>신청 없이 직접 등록</summary>
        <p>오프라인으로 확인한 업체를 넣을 때 씁니다. 회원 ID 는 회원 탭에서 복사하세요.
           이미 기록이 있으면 덮어씁니다.</p>
        <div class="ab-add-grid">
          <label>회원 ID (UUID)<input class="ain" id="abUser" placeholder="00000000-0000-0000-0000-000000000000"></label>
          <label>상호명<input class="ain" id="abName" placeholder="예: 량스튜디오"></label>
          <label>사업자등록번호<input class="ain" id="abNumber" inputmode="numeric" placeholder="123-45-67890"></label>
          <label>로고 주소 (선택)<input class="ain" id="abLogo" placeholder="breeder-logos 버킷 주소"></label>
        </div>
        <button type="button" class="abtn" id="abSave">등록</button>
      </details>
    </section>`;
    bind();
  }

  function bind() {
    state.body.querySelectorAll('[data-biz-logo]').forEach(img => {
      const fail = () => {
        const box = document.createElement('div');
        box.className = 'ab-logo none';
        box.textContent = '불러오기 실패';
        if (img.parentNode) img.replaceWith(box);
      };
      img.addEventListener('error', fail);
      /* 이미 실패한 뒤에 이 코드가 붙는 경우가 있습니다(캐시된 404). 그때는
         error 가 다시 오지 않으니 지금 상태를 직접 봅니다. */
      if (img.complete && img.naturalWidth === 0) fail();
    });
    state.body.querySelectorAll('[data-biz-filter]').forEach(button => {
      button.onclick = () => { state.filter = button.dataset.bizFilter; render(); };
    });
    state.body.querySelectorAll('[data-biz-approve]').forEach(button => {
      button.onclick = () => decide(button.dataset.bizApprove, 'approved');
    });
    state.body.querySelectorAll('[data-biz-reject]').forEach(button => {
      button.onclick = () => decide(button.dataset.bizReject, 'rejected');
    });
    state.body.querySelectorAll('[data-biz-remove]').forEach(button => {
      button.onclick = () => decide(button.dataset.bizRemove, 'none');
    });
    const save = document.getElementById('abSave');
    if (save) save.onclick = addDirect;
  }

  function findRow(userId) {
    return state.rows.filter(row => row.user_id === userId)[0] || null;
  }

  async function decide(userId, status) {
    if (state.busy) return;
    const row = findRow(userId);
    const who = (row && (row.biz_name || row.email)) || userId;
    let note = null;
    if (status === 'rejected') {
      /* 반려는 신청자에게 그대로 보입니다. 이유를 안 적으면 왜 안 됐는지
         물어보는 문의가 그대로 돌아옵니다. */
      note = window.prompt(who + ' 님의 신청을 반려합니다.\n사유를 적어 주세요 (신청자에게 보입니다).', '');
      if (note === null) return;
      if (!String(note).trim()) { window.alert('반려 사유를 적어 주세요.'); return; }
    } else if (status === 'none') {
      if (!window.confirm(who + ' 님의 사업자 인증 기록을 삭제할까요?\n되돌릴 수 없습니다.')) return;
    } else if (!window.confirm(who + ' 님의 사업자 인증을 승인할까요?')) {
      return;
    }
    state.busy = true;
    try {
      const result = await state.SB.rpc('admin_decide_business',
        { p_target: userId, p_status: status, p_note: note });
      if (result.error) throw result.error;
      await load();
    } catch (error) {
      window.alert('처리하지 못했습니다.\n' + (error.message || error.code || ''));
    } finally {
      state.busy = false;
    }
  }

  async function addDirect() {
    if (state.busy) return;
    const value = id => String((document.getElementById(id) || {}).value || '').trim();
    const user = value('abUser');
    /* 서버도 확인하지만, UUID 오타는 여기서 잡는 편이 낫습니다 — 서버까지
       갔다 오면 '회원을 찾을 수 없다' 는 답만 오고 오타인지 미가입인지
       구별이 안 됩니다. */
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user)) {
      window.alert('회원 ID 형식이 올바르지 않습니다. 회원 탭에서 복사해 주세요.');
      return;
    }
    if (String(value('abNumber')).replace(/[^0-9]/g, '').length !== 10) {
      window.alert('사업자등록번호는 숫자 10자리입니다.');
      return;
    }
    state.busy = true;
    try {
      const result = await state.SB.rpc('admin_upsert_business', {
        p_target: user, p_name: value('abName'), p_number: value('abNumber'),
        p_logo: value('abLogo') || null, p_status: 'approved',
      });
      if (result.error) throw result.error;
      await load();
    } catch (error) {
      window.alert('등록하지 못했습니다.\n' + (error.message || error.code || ''));
    } finally {
      state.busy = false;
    }
  }

  async function load() {
    state.body.innerHTML = '<div class="asub">불러오는 중…</div>';
    const result = await state.SB.rpc('admin_business_list');
    if (result.error) {
      state.body.innerHTML = '<div class="aerr"><b>사업자 인증 목록을 불러오지 못했습니다.</b><br><br>'
        + '<code>' + escape(result.error.code || result.error.message || '') + '</code><br><br>'
        + 'supabase_v60.sql 을 적용했는지 확인하세요.</div>';
      return;
    }
    state.rows = result.data || [];
    /* 처음 열면 할 일(심사 중)부터 보여 줍니다. 심사할 게 없으면 전체를
       보여 줘야 빈 화면 앞에서 '고장인가' 하지 않습니다. */
    if (state.filter === 'pending' && !state.rows.some(row => row.status === 'pending')) {
      state.filter = 'all';
    }
    render();
  }

  async function render_(options) {
    Object.assign(state, options);
    await load();
  }

  window.AdminBusiness = { render: render_ };
}());
