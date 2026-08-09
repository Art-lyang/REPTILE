/* =============================================================================
   양수 — 받는 쪽 (supabase_v65)
   -----------------------------------------------------------------------------
   양도 링크를 받은 사람이 여는 화면입니다. 흐름은 하나뿐입니다.

     주소(?t=) → 로그인 → 무엇을 받는지 확인 → 양수 → 내 개체로

   ⚠️ 로그인이 먼저입니다. peek_animal_transfer 가 익명에게 닫혀 있습니다
      (supabase_v65 에서 일부러 revoke). 미리보기에는 이름·모프·거래 금액이
      들어가는데, 링크가 어디로 굴러갈지는 보낸 사람도 모릅니다. 그래서
      '누가 봤는지 알 수 있는 상태' 를 먼저 만듭니다.

   ⚠️ 수락은 되돌릴 수 없습니다. 버튼을 누르기 전에 그 말을 보여 주고,
      한 번 더 묻습니다. 서버는 한 번 수락된 토큰을 다시 받지 않습니다.

   개체는 옮겨지는 것이 아니라 복사됩니다 — 보낸 사람의 혈통 기록이 깨지지
   않게 하려는 것입니다(care/animal-transfer.js 머리말).
   ============================================================================= */
(function () {
  'use strict';

  const C = window.CareCore;
  const I = window.CareI18n;
  const LifeStage = window.AnimalLifeStage;
  const $ = id => document.getElementById(id);
  const SB = (typeof SUPABASE_URL !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

  const S = { token: null, peek: null, user: null, busy: false };

  const SEX = { male: 'sexMale', female: 'sexFemale', unknown: 'sexUnknown' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x];
    });
  }
  function icon(n) { return '<i class="bi ' + n + '" aria-hidden="true"></i>'; }

  /* 막다른 화면 — 왜 막혔는지와 나갈 곳을 함께 둡니다. */
  function gate(ic, title, body, href, label) {
    $('body').innerHTML = '<div class="gate"><div class="pad">'
      + '<div class="gicon">' + icon(ic) + '</div>'
      + '<div class="lbl">' + esc(title) + '</div>'
      + '<div class="hint">' + esc(body) + '</div>'
      + (href ? '<a class="btn wide" style="text-decoration:none;margin-top:16px" href="'
          + esc(href) + '">' + esc(label) + '</a>' : '')
      + '</div></div>';
  }

  function chips(list) {
    if (!list || !list.length) return '';
    return list.map(t => '<span class="pchip">' + esc(t) + '</span>').join('');
  }

  function row(k, v) {
    return v == null || v === '' ? '' : '<tr><th>' + esc(k) + '</th><td>' + v + '</td></tr>';
  }

  function preview(p) {
    const sp = (C.SPECIES && C.SPECIES[p.species]) || (C.SPECIES && C.SPECIES.other) || { icon: '🦎' };
    /* 성장 단계 이름은 animal-life-stage.js 가 키만 알려 줍니다. */
    const stage = p.life_stage && LifeStage && LifeStage.labelKey
      ? I.t(LifeStage.labelKey(p.life_stage)) : null;

    return '<div class="pad">'
      + '<div class="lbl">' + icon('bi-box-arrow-in-down') + esc(I.t('rcTitle')) + '</div>'
      + '<div class="hint">' + esc(I.t('rcIntro')) + '</div>'

      + '<div class="rc-card">'
      + '<div class="rc-name">' + (sp.icon || '') + ' ' + esc(p.name || I.t('unnamed')) + '</div>'
      + '<table class="mr-tbl"><tbody>'
      + row(I.t('speciesFact'), esc(I.speciesName ? I.speciesName(p.species) : p.species || ''))
      + row(I.t('sexFact'), p.sex ? esc(I.t(SEX[p.sex] || 'sexUnknown')) : '')
      + row(I.t('rcStage'), stage ? esc(stage) : '')
      + row(I.t('hatchFact'), p.hatch_date ? esc(I.formatDate(p.hatch_date)) : '')
      + row(I.t('morph'), chips(p.morphs))
      + row(I.t('rcHets'), chips(p.hets))
      + row(I.t('rcGens'), esc(I.t('tfGensN', { n: p.gens || 3 })))
      + row(I.t('tfPrice'), p.price == null ? '' : esc(I.formatNumber(p.price)))
      + row(I.t('tfNote'), p.note ? esc(p.note) : '')
      + '</tbody></table>'
      + '</div>'

      /* 무엇이 따라오고 무엇이 안 따라오는지. 받은 뒤에 알면 늦습니다. */
      + '<div class="rc-what">' + esc(I.t('rcWhat')) + '</div>'
      + '<div class="tf-warn">' + icon('bi-exclamation-triangle') + esc(I.t('rcWarn')) + '</div>'

      + '<button class="btn wide" id="rc_accept" type="button">'
      + icon('bi-check2-circle') + esc(I.t('rcAccept')) + '</button>'
      + '</div>';
  }

  async function accept() {
    if (S.busy) return;
    S.busy = true;
    const btn = $('rc_accept');
    if (btn) btn.disabled = true;
    try {
      const r = await SB.rpc('accept_animal_transfer', { p_token: S.token });
      if (r.error) throw r.error;
      const id = r.data && r.data.animal_id;
      /* 받자마자 그 개체로 보냅니다 — 목록에서 찾게 하면 방금 받은 것이
         어느 것인지 모릅니다. */
      location.href = I.url('/care/animal.html', { id: id });
    } catch (e) {
      S.busy = false;
      if (btn) btn.disabled = false;
      gate('bi-x-octagon', I.t('rcFailedTitle'), I.friendly ? I.friendly(e) : String(e.message || e),
        I.url('/care/'), I.t('rcGoCare'));
    }
  }

  async function boot() {
    if (!SB) {
      gate('bi-plug', I.t('backendTitle'), I.t('backendBody'), I.url('/care/'), I.t('rcGoCare'));
      return;
    }

    S.token = new URLSearchParams(location.search).get('t');
    if (!S.token) {
      gate('bi-link-45deg', I.t('rcNoTokenTitle'), I.t('rcNoTokenBody'), I.url('/'), I.t('studio'));
      return;
    }

    const sess = await SB.auth.getSession();
    S.user = sess && sess.data && sess.data.session ? sess.data.session.user : null;

    if (!S.user) {
      /* 돌아올 주소를 실어 보냅니다. 로그인하고 나면 이 화면으로 돌아옵니다. */
      const next = location.pathname + location.search;
      const q = new URLSearchParams({ next: next });
      if (I.language && I.language() !== 'ko') q.set('lang', I.language());
      gate('bi-person-lock', I.t('rcLoginTitle'), I.t('rcLoginBody'),
        '/gecko/login.html?' + q.toString(), I.t('rcLoginAction'));
      return;
    }

    const r = await SB.rpc('peek_animal_transfer', { p_token: S.token });
    if (r.error) {
      gate('bi-x-octagon', I.t('rcFailedTitle'), r.error.message || '', I.url('/care/'), I.t('rcGoCare'));
      return;
    }

    const p = r.data;
    if (!p) {
      gate('bi-link-45deg', I.t('rcClosedTitle'), I.t('rcClosedBody'), I.url('/care/'), I.t('rcGoCare'));
      return;
    }
    if (p.mine) {
      /* 보낸 사람이 자기 링크를 연 경우. 개체 화면으로 돌려보냅니다. */
      gate('bi-person-check', I.t('rcMineTitle'), I.t('rcMineBody'), I.url('/care/'), I.t('rcGoCare'));
      return;
    }
    if (p.status !== 'pending') {
      gate('bi-link-45deg', I.t('rcClosedTitle'),
        p.status === 'accepted' ? I.t('rcAlreadyBody') : I.t('rcCancelledBody'),
        I.url('/care/'), I.t('rcGoCare'));
      return;
    }

    S.peek = p;
    $('body').innerHTML = preview(p);
    $('rc_accept').onclick = function () {
      if (!confirm(I.t('rcConfirm'))) return;
      accept();
    };
  }

  boot();
}());
