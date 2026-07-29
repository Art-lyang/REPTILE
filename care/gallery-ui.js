/* =============================================================================
   공개 개체 목록 (갤러리)
   -----------------------------------------------------------------------------
   계산기 하단의 '다른 집사들의 개체 구경하기' 가 여기로 옵니다.
   로그인 없이 누구나 봅니다.

   주인이 **목록에 올리기를 따로 켠** 개체만 나옵니다. 링크로만 공유하려던
   개체는 여기 없습니다 (supabase_v18.sql 의 is_public / is_listed).

   여기서도 animals 표에 직접 붙지 않습니다. public_animals() 가 돌려준 것만
   그립니다 — 무엇을 내보낼지는 서버가 정합니다.
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

  let species = '';
  let busy = false;

  function card(a) {
    const sp = C.SPECIES[a.species] || C.SPECIES.other;
    const sex = a.sex === 'male' ? '♂' : a.sex === 'female' ? '♀' : '';
    const morphs = (a.morphs || []).slice(0, 3);
    return '<a class="gcard" href="p.html?t=' + encodeURIComponent(a.token) + '">'
      + '<div class="gphoto">'
      + (a.photo ? '<img src="' + esc(a.photo) + '" alt="" loading="lazy">'
                 : '<span class="gnone">' + sp.icon + '</span>')
      + '</div>'
      + '<div class="ginfo">'
      + '<div class="gname">' + esc(a.name || '이름 없음')
      + (sex ? ' <span class="gsex">' + sex + '</span>' : '') + '</div>'
      + '<div class="gsp">' + sp.icon + ' ' + esc(sp.ko) + '</div>'
      + (morphs.length ? '<div class="gmorphs">' + morphs.map(m => '<span>' + esc(m) + '</span>').join('')
          + ((a.morphs || []).length > 3 ? '<span class="gmore">+' + ((a.morphs || []).length - 3) + '</span>' : '')
          + '</div>' : '')
      + '</div></a>';
  }

  async function load() {
    if (!SB) {
      $('body').innerHTML = '<div class="empty">' + icon('bi-plug') + '백엔드가 설정되지 않았습니다.</div>';
      return;
    }
    if (busy) return;
    busy = true;
    $('body').innerHTML = '<div class="empty">불러오는 중…</div>';
    try {
      const r = await SB.rpc('public_animals', { p_species: species || null, p_limit: 48, p_offset: 0 });
      if (r.error) throw r.error;
      const list = r.data || [];
      if (!list.length) {
        $('body').innerHTML = '<div class="pad"><div class="empty">' + icon('bi-binoculars')
          + '아직 공개된 개체가 없습니다.<br>'
          + '<b>크리처 케어로그</b>에서 개체를 공개하면 여기에 함께 보입니다.</div>'
          + '<a class="btn wide" style="text-decoration:none;margin-top:12px" href="/care/">'
          + icon('bi-clipboard-heart') + '크리처 케어로그 열기</a></div>';
      } else {
        $('body').innerHTML = '<div class="ggrid">' + list.map(card).join('') + '</div>'
          + '<div class="hint" style="text-align:center;margin-top:16px">'
          + '주인이 공개하기로 한 개체만 보입니다. 사육 기록·체중 같은 개인 기록은 포함되지 않습니다.</div>';
      }
    } catch (e) {
      $('body').innerHTML = '<div class="empty">' + icon('bi-exclamation-triangle')
        + '불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</div>';
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('.tab[data-sp]');
    if (!t) return;
    document.querySelectorAll('.tab[data-sp]').forEach(b => b.classList.toggle('on', b === t));
    species = t.dataset.sp;
    load();
  });

  load();
})();
