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
      + '<div class="lbl">열 수 없는 주소입니다</div>'
      + '<div class="hint">' + esc(msg) + '</div>'
      + '<a class="btn ghost wide" style="text-decoration:none;margin-top:16px" href="/">'
      + icon('bi-house') + '량 스튜디오</a></div></div>';
  }

  /* 모프 토큰은 계산기가 이름을 붙입니다. 이 화면은 계산기 데이터를 읽지
     않으므로 토큰을 그대로 보여줍니다 — 잘못된 이름을 지어내는 것보다
     원래 값을 보여주는 편이 낫습니다. */
  function chips(list, cls) {
    if (!list || !list.length) return '';
    return list.map(t => '<span class="pchip' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>').join('');
  }

  function photoStrip(a) {
    const all = [].concat(a.photo_url ? [a.photo_url] : [], a.photos || [])
      .filter((v, i, arr) => v && arr.indexOf(v) === i);
    if (!all.length) {
      const sp = C.SPECIES[a.species] || C.SPECIES.other;
      return '<div class="pnophoto">' + sp.icon + '</div>';
    }
    if (all.length === 1) {
      return '<div class="pphoto">' + Photo.tag(all[0], a.name || '개체') + '</div>';
    }
    return '<div class="pphoto">' + Photo.tag(all[0], a.name || '개체') + '</div>'
      + '<div class="pthumbs">' + all.slice(1).map((u, i) =>
          '<button class="pth" aria-label="사진 ' + (i + 2) + '">'
          + Photo.tag(u, '') + '</button>').join('') + '</div>';
  }

  function parentRow(side, p) {
    if (!p) return '';
    const label = side === 'a' ? '부' : '모';
    const body = '<div class="nm">' + esc(p.name || '이름 없음') + '</div>'
      + '<div class="ms">' + (chips(p.morphs) || '<span class="ms">모프 정보 없음</span>')
      + chips(p.hets, 'het') + '</div>';
    return '<div class="card">'
      + '<div class="pside">' + label + '</div>'
      + '<div class="info">' + body + '</div>'
      + (p.token
          ? '<div class="acts"><a class="mini" href="p.html?t=' + encodeURIComponent(p.token) + '">'
            + icon('bi-arrow-right') + '보기</a></div>'
          : '')
      + '</div>';
  }

  function render(a) {
    const sp = C.SPECIES[a.species] || C.SPECIES.other;
    const age = C.ageText(a.hatch_date, C.today());
    const sex = a.sex === 'male' ? '수컷 ♂' : a.sex === 'female' ? '암컷 ♀' : null;

    document.title = (a.name || '개체') + ' · 개체 프로필';

    const facts = [
      ['종', sp.icon + ' ' + sp.ko],
      ['성별', sex],
      ['해칭일', a.hatch_date],
      ['나이', age]
    ].filter(f => f[1]);

    let h = '<div class="phead">' + photoStrip(a) + '</div>';

    h += '<div class="pad"><div class="ptitle">' + esc(a.name || '이름 없음') + '</div>'
      + (a.breeder ? '<div class="pbreeder">' + icon('bi-person-badge') + esc(a.breeder) + '</div>' : '')
      + '<div class="pfacts">' + facts.map(f =>
          '<div><span class="pk">' + esc(f[0]) + '</span><span class="pv">' + esc(f[1]) + '</span></div>').join('')
      + '</div>';

    if ((a.morphs && a.morphs.length) || (a.hets && a.hets.length)) {
      h += '<div class="lbl2">모프</div><div class="pchips">'
        + (chips(a.morphs) || '<span class="ms">등록된 모프 없음</span>')
        + chips(a.hets, 'het') + '</div>';
    }
    if (a.note) {
      h += '<div class="lbl2">소개</div><div class="pnote">' + esc(a.note) + '</div>';
    }
    h += '</div>';

    const pa = a.parents && a.parents.a, pb = a.parents && a.parents.b;
    if (pa || pb) {
      h += '<div class="pad"><div class="lbl">부모</div>'
        + parentRow('a', pa) + parentRow('b', pb) + '</div>';
    }

    h += '<div class="pad" style="text-align:center">'
      + '<div class="hint">이 페이지는 개체의 주인이 공유한 것입니다. '
      + '사육 기록·체중 같은 개인 기록은 포함되지 않습니다.</div>'
      + '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="/care/">'
      + icon('bi-clipboard-heart') + '나도 크리처 케어로그 시작하기</a></div>';

    $('body').innerHTML = h;
    /* 익명 방문자도 서명을 받습니다 — 공개된 개체에 붙은 사진이면
       읽기 정책이 허용합니다 (supabase_v25.sql ap_read). 공개를 끄면
       그 순간부터 서명이 안 나옵니다. */
    Photo.hydrate($('body'), SB);
  }

  /* 작은 사진을 누르면 큰 자리와 바꿉니다. 라이트박스를 따로 만들지 않은 것은
     이 화면이 링크 하나로 열리는 가벼운 곳이라서입니다. */
  document.addEventListener('click', function (ev) {
    const b = ev.target.closest('.pth');
    if (!b) return;
    const main = document.querySelector('.pphoto img');
    const thumb = b.querySelector('img');
    if (!main || !thumb) return;
    const cur = main.getAttribute('src');
    main.setAttribute('src', thumb.getAttribute('src'));
    thumb.setAttribute('src', cur);
  });

  (async function boot() {
    if (!SB) { notFound('백엔드가 설정되지 않았습니다.'); return; }
    const t = new URLSearchParams(location.search).get('t');
    if (!t) { notFound('주소에 개체 정보가 없습니다.'); return; }

    let data = null;
    try {
      const r = await SB.rpc('public_animal', { p_token: t });
      if (r.error) throw r.error;
      data = r.data;
    } catch (e) {
      notFound('불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
      return;
    }

    /* 없는 주소와 닫힌 주소를 구분해서 알려주지 않습니다. 구분해 주면
       "이 토큰은 존재하지만 비공개" 라는 정보를 흘리게 됩니다. */
    if (!data) {
      notFound('주소가 잘못됐거나, 주인이 공개를 끝냈습니다.');
      return;
    }
    render(data);
  })();
})();
