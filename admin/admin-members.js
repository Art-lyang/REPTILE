(function () {
  'use strict';

  const { SUPPORTED, COPY, assertDictionaryParity } = window.AdminMemberI18n;

  const state = {
    SB: null, body: null, adminUser: null, esc: null, download: null,
    lang: 'ko', rows: [], query: '', status: 'all', tier: 'all', busy: false, limits: {},
  };
  let actionController = null;
  /* {count} 같은 자리를 값으로 바꿔 줍니다. 넘기지 않으면 예전과 똑같이
     문구를 그대로 돌려줍니다 — 기존 호출부는 손대지 않아도 됩니다. */
  const t = (key, values) => {
    const text = COPY[state.lang][key] || COPY.ko[key] || key;
    if (!values) return text;
    return String(text).replace(/\{(\w+)\}/g, (whole, name) =>
      (Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole));
  };
  const escape = value => state.esc(value == null ? '' : value);

  function detectLanguage() {
    const query = new URLSearchParams(location.search).get('lang');
    const saved = localStorage.getItem('ryang-admin-lang');
    const browser = (navigator.language || 'ko').split('-')[0].toLowerCase();
    return [query, saved, browser, 'ko'].find(value => SUPPORTED.includes(value)) || 'ko';
  }

  function date(value, withTime) {
    if (!value) return t('unknown');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t('unknown');
    const locale = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[state.lang];
    return new Intl.DateTimeFormat(locale, withTime
      ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(parsed);
  }

  function filteredRows() {
    const query = state.query.trim().toLowerCase();
    return state.rows.filter(member => {
      if (state.status !== 'all' && member.account_status !== state.status) return false;
      if (state.tier === 'admin' && !member.is_admin) return false;
      if (state.tier !== 'all' && state.tier !== 'admin' && member.tier !== state.tier) return false;
      if (!query) return true;
      return [member.email, member.name, member.nickname, member.phone]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }

  function statCard(number, label, tone) {
    return `<div class="mm-stat ${tone || ''}"><strong>${number}</strong><span>${escape(label)}</span></div>`;
  }

  function badges(member) {
    const status = member.account_status === 'restricted' ? 'restricted' : 'active';
    let html = `<span class="mm-badge ${status}">${escape(t(status))}</span>`;
    html += `<span class="mm-badge ${member.tier === 'premium' ? 'premium' : 'general'}">${escape(t(member.tier || 'general'))}</span>`;
    if (member.is_admin) html += `<span class="mm-badge admin">${escape(t('admins'))} · ${escape(member.admin_role || '')}</span>`;
    return html;
  }

  function consent(member) {
    const items = [];
    if (member.agree_mkt_email) items.push(t('email'));
    if (member.agree_mkt_sms) items.push(t('sms'));
    if (member.agree_third) items.push(t('thirdParty'));
    return items.length ? items.join(' · ') : t('unknown');
  }

  function sourceLabel(source) {
    const key = {
      admin_trial: 'sourceAdminTrial', admin_timed: 'sourceAdminTimed',
      admin_permanent: 'sourceAdminPermanent', admin_legacy: 'sourceAdminLegacy',
      payment: 'sourcePayment', subscription: 'sourceSubscription', premium_code: 'sourcePremiumCode',
    }[source];
    return key ? t(key) : source || t('unknown');
  }

  function actions(member) {
    const isSelf = member.user_id === state.adminUser.id;
    if (member.is_admin || isSelf) {
      return `<div class="mm-protected"><b>${escape(t('protected'))}</b><span>${escape(isSelf ? t('protectSelf') : t('protectAdmin'))}</span></div>`;
    }
    const tierAction = member.tier === 'premium' ? 'general' : 'premium';
    return `<div class="mm-actions" aria-label="${escape(t('manage'))}">
      <button type="button" class="mini" data-member-action="set_tier" data-tier="${tierAction}" data-id="${member.user_id}">
        ${escape(t(tierAction === 'premium' ? 'grantPremium' : 'makeGeneral'))}
      </button>
      <button type="button" class="mini" data-member-action="${member.account_status === 'restricted' ? 'restore' : 'restrict'}" data-id="${member.user_id}">
        ${escape(t(member.account_status === 'restricted' ? 'restore' : 'restrict'))}
      </button>
      <button type="button" class="mini del" data-member-action="delete" data-id="${member.user_id}">${escape(t('delete'))}</button>
    </div>`;
  }

  /* 개체 상한.
     -------------------------------------------------------------------------
     기본은 무료 10 / 유료 50 입니다(supabase_v54·v55). 여기서 정한 값은 그
     회원에게만 적용되고, 비우면 기본값으로 돌아갑니다.

     100 이 위쪽 끝인 이유는 사진 용량입니다 — 무료 요금제 스토리지가 1GB 라,
     100마리씩 쓰는 회원이 열댓 명이면 요금제를 올려야 합니다. 무제한으로 두면
     그 판단을 할 기회 없이 넘어갑니다. */
  function limitBox(member) {
    if (member.is_admin || member.user_id === state.adminUser.id) return '';
    const current = state.limits[member.user_id];
    const base = member.tier === 'premium' ? 50 : 10;
    return `<div class="mm-limit">
      <label for="lim-${member.user_id}">${escape(t('animalLimit'))}</label>
      <input class="ain" id="lim-${member.user_id}" type="number" min="1" max="100"
        inputmode="numeric" placeholder="${escape(t('animalLimitDefault', { count: base }))}"
        value="${current == null ? '' : current}" data-limit-input="${member.user_id}">
      <button type="button" class="mini" data-limit-save="${member.user_id}">${escape(t('save'))}</button>
      <p>${escape(current == null
        ? t('animalLimitHintDefault', { count: base })
        : t('animalLimitHintCustom', { count: current }))}</p>
    </div>`;
  }

  /* 닉네임 변경 이력과 횟수 초기화 (supabase_v59)
     -------------------------------------------------------------------------
     이력을 '지우기' 가 아니라 기준 시각을 옮기는 방식으로 초기화합니다. 지우면
     왜 초기화했는지도 같이 사라지고, 분양받는 쪽이 보는 공개 이력에도 구멍이
     납니다. */
  function nicknameBox(member) {
    const entry = state.nicknames[member.user_id];
    const used = (entry && entry.used) || 0;
    const items = (entry && entry.items) || [];
    const rows = items.length
      ? items.map(item => `<li><span>${escape(date(item.at, true))}</span>
          <b>${escape(item.from || '—')} → ${escape(item.to || '—')}</b>
          <em>${escape(t('nickKind' + (item.kind === 'user' ? 'User' : item.kind === 'admin' ? 'Admin' : 'Auto')))}</em></li>`).join('')
      : `<li class="mm-nick-empty">${escape(t('nickHistoryEmpty'))}</li>`;
    return `<details class="mm-nick">
      <summary>${escape(t('nickHistory'))} <span>${escape(t('nickUsed', { used: used, limit: 2 }))}</span></summary>
      <ul>${rows}</ul>
      <button type="button" class="mini" data-nick-reset="${member.user_id}"${used ? '' : ' disabled'}>${escape(t('nickReset'))}</button>
    </details>`;
  }

  function memberCard(member) {
    const providers = (member.providers || []).join(' · ') || t('unknown');
    const premiumMeta = member.tier === 'premium'
      ? `<div><dt>${escape(t('premiumUntil'))}</dt><dd>${escape(member.premium_until ? date(member.premium_until) : t('unlimited'))}</dd></div>
         <div><dt>${escape(t('source'))}</dt><dd>${escape(sourceLabel(member.premium_source))}</dd></div>` : '';
    return `<article class="mm-card" data-member-id="${member.user_id}">
      <div class="mm-card-head"><div><b>${escape(member.email || t('unknown'))}</b>
        <p>${escape(member.name || t('unknown'))}${member.nickname ? ` · @${escape(member.nickname)}` : ''}</p></div>
        <div class="mm-badges">${badges(member)}</div></div>
      <dl class="mm-meta">
        <div><dt>${escape(t('contact'))}</dt><dd>${escape(member.phone || t('unknown'))}</dd></div>
        <div><dt>${escape(t('providers'))}</dt><dd>${escape(providers)}</dd></div>
        <div><dt>${escape(t('joined'))}</dt><dd>${escape(date(member.created_at))}</dd></div>
        <div><dt>${escape(t('lastLogin'))}</dt><dd>${escape(member.last_sign_in_at ? date(member.last_sign_in_at, true) : t('noLogin'))}</dd></div>
        <div><dt>${escape(t('verified'))}</dt><dd>${escape(member.email_confirmed_at ? date(member.email_confirmed_at) : t('notVerified'))}</dd></div>
        <div><dt>${escape(t('consent'))}</dt><dd>${escape(consent(member))}</dd></div>
        ${premiumMeta}
      </dl>
      ${actions(member)}
      ${limitBox(member)}
      ${nicknameBox(member)}
    </article>`;
  }

  function renderContent() {
    const rows = filteredRows();
    const restrictedCount = state.rows.filter(row => row.account_status === 'restricted').length;
    const premiumCount = state.rows.filter(row => row.tier === 'premium').length;
    const adminCount = state.rows.filter(row => row.is_admin).length;
    state.body.innerHTML = `<section class="mm-shell">
      <div class="mm-titlebar"><div><h2>${escape(t('title'))}</h2><p>${escape(t('description'))}</p></div>
        <label class="mm-lang"><span>${escape(t('language'))}</span><select id="mmLang">
          ${SUPPORTED.map(locale => `<option value="${locale}"${locale === state.lang ? ' selected' : ''}>${locale.toUpperCase()}</option>`).join('')}
        </select></label></div>
      <div class="mm-stats">
        ${statCard(state.rows.length, t('members'))}${statCard(premiumCount, t('premium'), 'premium')}
        ${statCard(restrictedCount, t('restricted'), 'restricted')}${statCard(adminCount, t('admins'), 'admin')}
      </div>
      <div class="mm-tools">
        <input class="ain" id="mmSearch" value="${escape(state.query)}" placeholder="${escape(t('search'))}">
        <select class="ain" id="mmStatus" aria-label="${escape(t('status'))}">
          <option value="all">${escape(t('statusAll'))}</option><option value="active"${state.status === 'active' ? ' selected' : ''}>${escape(t('active'))}</option>
          <option value="restricted"${state.status === 'restricted' ? ' selected' : ''}>${escape(t('restricted'))}</option>
        </select>
        <select class="ain" id="mmTier" aria-label="${escape(t('tier'))}">
          <option value="all">${escape(t('tierAll'))}</option><option value="general"${state.tier === 'general' ? ' selected' : ''}>${escape(t('general'))}</option>
          <option value="premium"${state.tier === 'premium' ? ' selected' : ''}>${escape(t('premium'))}</option><option value="admin"${state.tier === 'admin' ? ' selected' : ''}>${escape(t('admins'))}</option>
        </select>
        <button class="abtn sm ghost" type="button" id="mmRefresh">${escape(t('refresh'))}</button>
        <button class="abtn sm ghost" type="button" id="mmExport">${escape(t('export'))}</button>
      </div>
      <p class="mm-count">${rows.length} / ${state.rows.length}</p>
      <div class="mm-list">${rows.length ? rows.map(memberCard).join('') : `<div class="mm-empty">${escape(t('empty'))}</div>`}</div>
      <dialog class="mm-dialog" id="mmDialog"><form method="dialog" id="mmActionForm">
        <input type="hidden" name="memberId"><input type="hidden" name="action"><input type="hidden" name="tier">
        <div class="mm-dialog-head"><h3>${escape(t('actionTitle'))}</h3><button type="button" data-dialog-close aria-label="${escape(t('cancel'))}">×</button></div>
        <p><b>${escape(t('target'))}</b> <span id="mmTarget"></span></p>
        <div class="mm-premium-fields" id="mmPremiumFields" hidden>
          <label><span>${escape(t('premiumGrantType'))}</span><select class="ain" name="grantType">
            <option value="trial">${escape(t('trialGrant'))}</option>
            <option value="timed">${escape(t('timedGrant'))}</option>
            <option value="permanent">${escape(t('permanentGrant'))}</option>
          </select></label>
          <label id="mmDurationField"><span>${escape(t('durationDays'))}</span>
            <input class="ain" name="durationDays" type="number" min="1" max="3650" step="1" value="7" inputmode="numeric">
            <small>${escape(t('durationRange'))}</small>
          </label>
          <p class="mm-expiry" id="mmExpectedExpiry"></p>
        </div>
        <label><span>${escape(t('reason'))}</span><textarea class="ain" name="reason" required minlength="2" maxlength="500" placeholder="${escape(t('reasonHint'))}"></textarea></label>
        <div id="mmDeleteFields" hidden><label><span>${escape(t('deleteConfirm'))}</span>
          <input class="ain" name="confirmEmail" autocomplete="off" placeholder="${escape(t('deleteHint'))}"></label></div>
        <p class="mm-note" id="mmNote"></p><p class="aerr" id="mmActionMessage"></p>
        <div class="mm-dialog-actions"><button class="abtn sm ghost" type="button" data-dialog-close>${escape(t('cancel'))}</button>
          <button class="abtn sm" id="mmSubmit" value="default">${escape(t('apply'))}</button></div>
      </form></dialog>
    </section>`;
    bind();
  }

  function findMember(id) { return state.rows.find(member => member.user_id === id); }

  function renderResults() {
    const rows = filteredRows();
    const count = state.body.querySelector('.mm-count');
    const list = state.body.querySelector('.mm-list');
    if (count) count.textContent = `${rows.length} / ${state.rows.length}`;
    if (list) list.innerHTML = rows.length ? rows.map(memberCard).join('') : `<div class="mm-empty">${escape(t('empty'))}</div>`;
    bindCards();
  }

  /* 카드 안 버튼 배선. 목록은 두 곳에서 다시 그려집니다(전체 렌더 / 검색 결과).
     양쪽에 같은 배선을 적어 두면 한쪽만 고치는 일이 생기고, 그러면 검색한
     뒤에는 버튼이 죽습니다. */
  function bindCards() {
    state.body.querySelectorAll('[data-member-action]').forEach(button => {
      button.onclick = () => actionController.open(button);
    });
    state.body.querySelectorAll('[data-limit-save]').forEach(button => {
      button.onclick = () => saveLimit(button.dataset.limitSave);
    });
    state.body.querySelectorAll('[data-nick-reset]').forEach(button => {
      button.onclick = () => resetNickname(button.dataset.nickReset);
    });
  }

  function exportCsv() {
    const rows = filteredRows();
    const quote = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
    const fields = ['email', 'name', 'nickname', 'phone', 'account_status', 'tier', 'providers', 'created_at', 'last_sign_in_at', 'email_confirmed_at'];
    const lines = [fields.join(',')].concat(rows.map(member => fields.map(field =>
      quote(field === 'providers' ? (member.providers || []).join('|') : member[field])).join(',')));
    state.download('members.csv', `\ufeff${lines.join('\n')}`);
  }

  function bind() {
    document.getElementById('mmLang').onchange = event => {
      state.lang = event.target.value; localStorage.setItem('ryang-admin-lang', state.lang); renderContent();
    };
    document.getElementById('mmSearch').oninput = event => { state.query = event.target.value; renderResults(); };
    document.getElementById('mmStatus').onchange = event => { state.status = event.target.value; renderResults(); };
    document.getElementById('mmTier').onchange = event => { state.tier = event.target.value; renderResults(); };
    document.getElementById('mmRefresh').onclick = load;
    document.getElementById('mmExport').onclick = exportCsv;
    bindCards();
    state.body.querySelectorAll('[data-dialog-close]').forEach(button => {
      button.onclick = () => document.getElementById('mmDialog').close();
    });
    actionController.bind();
  }

  async function load() {
    state.body.innerHTML = `<div class="mm-loading">${escape(t('loading'))}</div>`;
    /* 조정된 상한은 따로 받아 옵니다. admin_list_members 의 반환 모양을 바꾸려면
       함수를 지웠다 다시 만들어야 해서, 짧은 목록 하나를 더 받는 편이 낫습니다
       (대부분의 회원은 조정이 없습니다). */
    const [result, limits, nicknames] = await Promise.all([
      state.SB.rpc('admin_list_members'),
      state.SB.rpc('admin_animal_limits'),
      state.SB.rpc('admin_nickname_changes'),
    ]);
    if (result.error) {
      state.body.innerHTML = `<div class="aerr mm-error"><b>${escape(t('loadError'))}</b><p>${escape(result.error.code || '')}</p></div>`;
      return;
    }
    state.rows = result.data || [];
    /* v58 을 적용하기 전이면 함수가 없습니다. 그때는 조정이 없는 것으로 두고
       화면은 그대로 뜹니다 — 상한 칸만 기본값으로 보입니다. */
    state.limits = (!limits.error && limits.data) || {};
    /* v59 를 적용하기 전이면 함수가 없습니다. 이력이 비어 보일 뿐 회원 목록은
       그대로 떠야 합니다 — 안내 한 칸 때문에 관리 화면 전체가 막히면 안 됩니다. */
    state.nicknames = (!nicknames.error && nicknames.data) || {};
    renderContent();
  }

  async function resetNickname(userId) {
    if (state.busy) return;
    const member = findMember(userId);
    if (!window.confirm(t('nickResetConfirm', { name: (member && (member.nickname || member.email)) || '' }))) return;
    state.busy = true;
    try {
      const result = await state.SB.rpc('admin_reset_nickname_changes', { p_target: userId });
      if (result.error) throw result.error;
      await load();
    } catch (error) {
      window.alert(t('nickResetFailed') + '\n' + (error.message || error.code || ''));
    } finally {
      state.busy = false;
    }
  }

  async function saveLimit(userId) {
    const input = state.body.querySelector(`[data-limit-input="${userId}"]`);
    if (!input || state.busy) return;
    const raw = String(input.value || '').trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 100)) {
      window.alert(t('animalLimitRange'));
      return;
    }
    state.busy = true;
    try {
      const result = await state.SB.rpc('admin_set_animal_limit', { p_target: userId, p_limit: value });
      if (result.error) throw result.error;
      await load();
    } catch (error) {
      window.alert(t('animalLimitFailed') + '\n' + (error.message || error.code || ''));
    } finally {
      state.busy = false;
    }
  }

  async function render(options) {
    Object.assign(state, options);
    state.lang = detectLanguage();
    actionController = window.AdminMemberActions.create({ state, t, date, findMember, reload: load });
    await load();
  }

  window.AdminMembers = { render, assertDictionaryParity };
}());
