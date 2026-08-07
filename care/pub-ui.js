/* =============================================================================
   개체 공개 프로필 — 링크를 받은 사람이 보는 화면
   -----------------------------------------------------------------------------
   로그인하지 않은 남이 봅니다. 그래서 이 파일은 다른 케어 화면과 규칙이
   다릅니다.

     · 로그인·프리미엄을 묻지 않습니다.
     · 가진 데이터가 public_animal() 이 돌려준 것뿐입니다. animals 표에
       직접 붙지 않습니다 — 붙을 수도 없습니다(RLS 가 막습니다).
     · 사육 기록·체중·증세는 아예 받아오지 않습니다. 이 화면의 관심사가
       아니고, 받아오지 않는 것이 새지 않게 하는 가장 확실한 방법입니다.

   무엇을 보여줄지는 서버가 정합니다 (supabase_v18.sql 의 public_animal).
   여기서는 받은 것만 그립니다. 화면에서 거르는 방식으로 만들면, 언젠가
   화면을 고치다가 실수로 내보내게 됩니다.
   ============================================================================= */
(function () {
  'use strict';

  const C = window.CareCore;
  const I = window.CareI18n;
  const Cards = window.PublicAnimalCards;
  const WeightChart = window.PublicWeightChart;
  const $ = id => document.getElementById(id);
  const SB = (typeof SUPABASE_URL !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x];
    });
  }
  function icon(n) { return '<i class="bi ' + n + '" aria-hidden="true"></i>'; }

  function notFound(msg) {
    $('body').innerHTML = '<div class="gate"><div class="pad">'
      + '<div class="gicon">' + icon('bi-link-45deg') + '</div>'
      + '<div class="lbl">' + I.t('invalidShareTitle') + '</div>'
      + '<div class="hint">' + esc(msg) + '</div>'
      + '<a class="btn ghost wide" style="text-decoration:none;margin-top:16px" href="' + I.url('/') + '">'
      + icon('bi-house') + I.t('studio') + '</a></div></div>';
  }

  /* 모프 토큰은 계산기가 이름을 붙입니다. 이 화면은 계산기 데이터를 읽지
     않으므로 토큰을 그대로 보여줍니다 — 잘못된 이름을 지어내는 것보다
     원래 값을 보여주는 편이 낫습니다. */
  function chips(list, cls) {
    if (!list || !list.length) return '';
    return list.map(t => '<span class="pchip' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>').join('');
  }

  function photoStrip(a) {
    const sp = C.SPECIES[a.species] || C.SPECIES.other;
    return window.CarePhotos.stripHtml(a, sp.icon);
  }

  function parentRow(side, p) {
    if (!p) return '';
    const label = side === 'a' ? I.t('parentFather') : I.t('parentMother');
    const body = '<div class="nm">' + esc(p.name || I.t('unnamed')) + '</div>'
      + '<div class="ms">' + (chips(p.morphs) || '<span class="ms">' + I.t('morphInfoMissing') + '</span>')
      + chips(p.hets, 'het') + '</div>';
    return '<div class="card parent-card">'
      + '<div class="pside">' + label + '</div>'
      + (p.photo ? '<div class="pparent-photo">' + Photo.tag(p.photo, p.name || '') + '</div>' : '')
      + '<div class="info">' + body + '</div>'
      + (p.token
          ? '<div class="acts"><a class="mini" href="' + I.url('/care/p.html', { t: p.token }) + '">'
            + icon('bi-arrow-right') + I.t('view') + '</a></div>'
          : '')
      + '</div>';
  }

  function breederCards(list, token) {
    if (!list || !list.length) return '';
    return '<div class="pad"><div class="breeder-more"><div><div class="lbl">' + I.t('breederAnimals')
      + '</div><div class="hint">' + I.t('breederPreviewHint') + '</div></div>'
      + '<a class="mini" href="' + I.url('/care/breeder.html', { t: token }) + '">'
      + I.t('breederProfileLink') + ' ' + icon('bi-arrow-right') + '</a></div>'
      + Cards.grid(list.slice(0, 4)) + '</div>';
  }

  function render(a, related, token, badge) {
    const sp = C.SPECIES[a.species] || C.SPECIES.other;
    const age = I.ageText(a.hatch_date, C.today());
    const sex = a.sex === 'male' ? I.t('sexMale') + ' ♂' : a.sex === 'female' ? I.t('sexFemale') + ' ♀' : null;

    document.title = (a.name || I.t('animal')) + ' · ' + I.t('profile');

    const facts = [
      [I.t('speciesFact'), sp.icon + ' ' + I.speciesName(a.species)],
      [I.t('sexFact'), sex],
      [I.t('lifeStage'), a.life_stage ? I.t(window.AnimalLifeStage.labelKey(a.life_stage)) : null],
      [I.t('hatchFact'), a.hatch_date ? I.formatDate(a.hatch_date) : null],
      [I.t('ageFact'), age],
      [I.t('clutchFact'), a.clutch || null],
      [I.t('latestWeightFact'), a.latest_weight
        ? I.formatNumber(a.latest_weight.grams) + 'g · ' + I.formatDate(a.latest_weight.measured_on) : null]
    ].filter(f => f[1]);

    let h = '<div class="phead">' + photoStrip(a) + '</div>';

    h += '<div class="pad"><div class="ptitle">' + esc(a.name || I.t('unnamed')) + '</div>'
      + (a.breeder ? '<a class="pbreeder' + (badge && badge.verified ? ' verified' : '') + '" href="'
        + I.url('/care/breeder.html', { t: token }) + '">'
        /* 인증된 업체면 로고가 사람 아이콘 자리를 대신합니다. 로고를 이름 뒤에
           덧붙이면 줄이 길어져 좁은 화면에서 이름이 잘립니다. */
        + (badge && badge.image
            ? '<img class="pbizlogo" src="' + esc(badge.image) + '" alt="">'
            : icon('bi-person-badge'))
        + esc(a.breeder)
        /* 파란 표시는 승인된 곳에만. 이미지가 있다고 확인된 것이 되면
           인증 표시가 아무 뜻도 없어집니다. */
        + (badge && badge.verified ? '<i class="bi bi-patch-check-fill pbizmark" title="'
            + esc(I.t('bizVerifiedTitle', { name: badge.biz_name })) + '"></i>' : '')
        + ' ' + icon('bi-chevron-right') + '</a>' : '')
      + '<div class="pfacts">' + facts.map(f =>
          '<div><span class="pk">' + esc(f[0]) + '</span><span class="pv">' + esc(f[1]) + '</span></div>').join('')
      + '</div>';

    if ((a.morphs && a.morphs.length) || (a.hets && a.hets.length)) {
      h += '<div class="lbl2">' + I.t('morph') + '</div><div class="pchips">'
        + (chips(a.morphs) || '<span class="ms">' + I.t('noMorph') + '</span>')
        + chips(a.hets, 'het') + '</div>';
    }
    if (a.note) {
      h += '<div class="lbl2">' + I.t('introduction') + '</div><div class="pnote">' + esc(a.note) + '</div>';
    }
    h += '</div>';

    const pa = a.parents && a.parents.a, pb = a.parents && a.parents.b;
    if (pa || pb) {
      h += '<div class="pad"><div class="lbl">' + I.t('parents') + '</div>'
        + parentRow('a', pa) + parentRow('b', pb) + '</div>';
    }

    h += WeightChart.html(a.weight_history, I, esc);
    h += breederCards(related, token);
    h += '<div class="pad" style="text-align:center">'
      + '<div class="hint">' + I.t('publicOwnerNotice') + '</div>'
      + '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="' + I.url('/care/') + '">'
      + icon('bi-clipboard-heart') + I.t('startCare') + '</a>'
      + '<a class="btn ghost wide" style="text-decoration:none;margin-top:8px" href="' + I.url('/') + '">'
      + icon('bi-house') + I.t('studioHome') + '</a></div>';

    $('body').innerHTML = h;
    /* 익명 방문자도 서명을 받습니다 — 공개된 개체에 붙은 사진이면
       읽기 정책이 허용합니다 (supabase_v25.sql ap_read). 공개를 끄면
       그 순간부터 서명이 안 나옵니다. */
    Photo.hydrate($('body'), SB);
    WeightChart.mount($('body'), a.weight_history);
  }

  /* 작은 사진을 누르면 큰 자리와 바꿉니다. 라이트박스를 따로 만들지 않은 것은
     이 화면이 링크 하나로 열리는 가벼운 곳이라서입니다. */
  document.addEventListener('click', function (ev) {
    const b = ev.target.closest('.pth');
    if (!b) return;
    window.CarePhotos.swap(b);
  });

  (async function boot() {
    if (!SB) { notFound(I.t('shareBackendMissing')); return; }
    const t = new URLSearchParams(location.search).get('t');
    if (!t) { notFound(I.t('shareTokenMissing')); return; }

    let data = null;
    try {
      const r = await SB.rpc('public_animal', { p_token: t });
      if (r.error) throw r.error;
      data = r.data;
    } catch (e) {
      notFound(I.t('shareLoadError'));
      return;
    }

    /* 없는 주소와 닫힌 주소를 구분해서 알려주지 않습니다. 구분해 주면
       "이 토큰은 존재하지만 비공개" 라는 정보를 흘리게 됩니다. */
    if (!data) {
      notFound(I.t('shareClosed'));
      return;
    }
    let related = [];
    /* 사업자 인증 배지. 승인된 경우에만 상호명과 로고가 옵니다(supabase_v60).
       v60 적용 전에는 함수가 없어 오류가 나는데, 그때는 배지 없이 그리면
       됩니다 — 배지 하나 때문에 개체 카드 전체가 안 뜨면 안 됩니다. */
    let badge = null;
    if (data.breeder) {
      try {
        const b = await SB.rpc('public_breeder_badge', { p_token: t });
        /* image 나 verified 중 하나만 있어도 그릴 것이 있습니다 — 인증 없이
           프로필 이미지만 올린 브리더가 대부분일 것입니다(supabase_v62). */
        if (!b.error && b.data && (b.data.image || b.data.verified)) badge = b.data;
      } catch (e) { /* 배지는 없어도 됩니다 */ }
      try {
        const r = await SB.rpc('public_breeder_profile', {
          p_token: t, p_species: null, p_limit: 8, p_offset: 0
        });
        if (!r.error && r.data) {
          related = (r.data.animals || []).filter(function (animal) { return animal.token !== t; });
        }
      } catch (e) {
        console.warn('Related public animal cards could not be loaded.');
      }
    }
    render(data, related, t, badge);
  })();
})();
