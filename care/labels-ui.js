/* =============================================================================
   사육장 라벨 — 통 앞에 붙이는 QR 이름표
   -----------------------------------------------------------------------------
   개체가 100마리쯤 되면 통을 열기 전에 그게 누구인지부터 알아야 합니다.
   지금은 목록에서 이름을 찾아 들어가야 하는데, 통 앞에 QR 이 붙어 있으면
   찍는 즉시 그 개체 화면이 열립니다. 급여 기록이 30초에서 3초가 됩니다.

   ⚠️ QR 이 가리키는 곳은 기본이 **내 관리 페이지**입니다. 공개 프로필이
      아닙니다. 라벨은 사육장에 붙이는 것이고, 그 앞에 서는 사람은 대개
      주인입니다. 남이 찍으면 로그인 화면이 나오고 그 이상 보이지 않습니다
      (RLS 가 막습니다).

      전시·행사용으로 공개 프로필 주소를 쓸 수도 있게 두었습니다. 다만
      공개를 켠 개체만 그 주소가 열리므로, 안 켠 개체는 그 모드에서
      빠집니다 — 몇 마리가 빠졌는지 화면에 적습니다.

   ⚠️ 인쇄가 목적입니다. 화면에서 예쁜 것보다 A4 에 잘리지 않고 들어가는
      것이 먼저입니다.
   ============================================================================= */
(function () {
  'use strict';

  const C = window.CareCore;
  const I = window.CareI18n;
  const A = window.CareApp;
  const $ = id => document.getElementById(id);

  const S = { animals: [], picked: {}, mode: 'manage', size: 'md', ready: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x];
    });
  }
  function icon(n) { return '<i class="bi ' + n + '" aria-hidden="true"></i>'; }

  function gate(ic, title, body, href, label) {
    $('body').innerHTML = '<div class="gate"><div class="pad">'
      + '<div class="gicon">' + icon(ic) + '</div>'
      + '<div class="lbl">' + esc(title) + '</div>'
      + '<div class="hint">' + esc(body) + '</div>'
      + (href ? '<a class="btn wide" style="text-decoration:none;margin-top:16px" href="'
          + esc(href) + '">' + esc(label) + '</a>' : '')
      + '</div></div>';
  }

  /* QR 은 그릴 때만 라이브러리를 받아옵니다 — 고르기만 하고 나가는 사람에게는
     필요 없는 파일입니다. */
  /* 한 번 만든 QR 은 다시 만들지 않습니다. 체크를 켰다 껐다 할 때마다
     100장을 다시 계산하면 화면이 멎습니다. 여는 곳(mode)이 바뀌면 주소가
     달라지므로 열쇠에 함께 넣습니다. */
  const QR_CACHE = {};

  let qrLoading = null;
  function ensureQr() {
    if (window.qrcode) return Promise.resolve(true);
    if (qrLoading) return qrLoading;
    qrLoading = new Promise(function (done) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload = () => done(true);
      s.onerror = () => done(false);
      document.head.appendChild(s);
    });
    return qrLoading;
  }

  /* 공개 모드에서는 공개를 켠 개체만 주소가 열립니다. */
  function usable(a) {
    return S.mode === 'public' ? !!(a.is_public && a.share_token) : true;
  }

  function urlOf(a) {
    if (S.mode === 'public') {
      return location.origin + I.url('/care/p.html', { t: a.share_token });
    }
    return location.origin + I.url('/care/animal.html', { id: a.id });
  }

  function picked() {
    return S.animals.filter(a => S.picked[a.id] && usable(a));
  }

  function morphText(a) {
    const list = (a.morphs || []).concat((a.hets || []).map(h => 'het ' + h));
    return list.join(' · ');
  }

  /* ── 고르는 화면 ───────────────────────────────────────────────────────── */
  function chooser() {
    const skipped = S.mode === 'public'
      ? S.animals.filter(a => S.picked[a.id] && !usable(a)).length : 0;
    const n = picked().length;

    const rows = S.animals.map(function (a) {
      const off = !usable(a);
      const sp = (C.SPECIES && C.SPECIES[a.species]) || { icon: '🦎' };
      return '<label class="lb-pick' + (off ? ' off' : '') + '">'
        + '<input type="checkbox" data-lb-pick="' + esc(a.id) + '"'
        + (S.picked[a.id] ? ' checked' : '') + (off ? ' disabled' : '') + '>'
        + '<span class="lb-pick-name">' + (sp.icon || '') + ' ' + esc(a.name || I.t('unnamed')) + '</span>'
        + (off ? '<span class="lb-off">' + esc(I.t('lbNotPublic')) + '</span>' : '')
        + '</label>';
    }).join('');

    return '<div class="pad no-print">'
      + '<div class="lbl">' + icon('bi-tags') + esc(I.t('lbTitle')) + '</div>'
      + '<div class="hint">' + esc(I.t('lbIntro')) + '</div>'

      + '<label class="fl" for="lb_mode">' + esc(I.t('lbMode')) + '</label>'
      + '<select class="in" id="lb_mode">'
      + '<option value="manage"' + (S.mode === 'manage' ? ' selected' : '') + '>' + esc(I.t('lbModeManage')) + '</option>'
      + '<option value="public"' + (S.mode === 'public' ? ' selected' : '') + '>' + esc(I.t('lbModePublic')) + '</option>'
      + '</select>'
      + '<div class="hint">' + esc(I.t(S.mode === 'public' ? 'lbModePublicHint' : 'lbModeManageHint')) + '</div>'

      + '<label class="fl" for="lb_size">' + esc(I.t('lbSize')) + '</label>'
      + '<select class="in" id="lb_size">'
      + '<option value="sm"' + (S.size === 'sm' ? ' selected' : '') + '>' + esc(I.t('lbSizeSm')) + '</option>'
      + '<option value="md"' + (S.size === 'md' ? ' selected' : '') + '>' + esc(I.t('lbSizeMd')) + '</option>'
      + '<option value="lg"' + (S.size === 'lg' ? ' selected' : '') + '>' + esc(I.t('lbSizeLg')) + '</option>'
      + '</select>'

      + '<div class="lb-tools">'
      + '<button class="mini" id="lb_all" type="button">' + esc(I.t('lbAll')) + '</button>'
      + '<button class="mini" id="lb_none" type="button">' + esc(I.t('lbNone')) + '</button>'
      + '<span class="hint lb-count">' + esc(I.t('lbPicked', { n: n }))
      + (skipped ? ' · ' + esc(I.t('lbSkipped', { n: skipped })) : '') + '</span>'
      + '</div>'

      + '<div class="lb-picks">' + (rows || '<div class="empty">' + esc(I.t('lbNoAnimals')) + '</div>') + '</div>'

      + '<button class="btn wide" id="lb_print" type="button"' + (n ? '' : ' disabled') + '>'
      + icon('bi-printer') + esc(I.t('lbPrint')) + '</button>'
      + '<div class="hint">' + esc(I.t('lbPrintTip')) + '</div>'
      + '</div>';
  }

  /* ── 인쇄면 ────────────────────────────────────────────────────────────── */
  function sheet() {
    const list = picked();
    if (!list.length) return '';
    return '<div class="lb-sheet lb-' + S.size + '" id="lbSheet">'
      + list.map(function (a) {
        const sp = (C.SPECIES && C.SPECIES[a.species]) || { icon: '🦎' };
        const m = morphText(a);
        return '<div class="lb-card">'
          + '<div class="lb-qr" data-lb-qr="' + esc(a.id) + '"></div>'
          + '<div class="lb-info">'
          + '<div class="lb-name">' + esc(a.name || I.t('unnamed')) + '</div>'
          + '<div class="lb-sub">' + (sp.icon || '') + ' '
          + esc(I.speciesName ? I.speciesName(a.species) : a.species || '')
          + (a.hatch_date ? ' · ' + esc(I.formatDate(a.hatch_date)) : '') + '</div>'
          + (m ? '<div class="lb-morph">' + esc(m) + '</div>' : '')
          + '</div></div>';
      }).join('')
      + '</div>';
  }

  async function drawQrs() {
    const boxes = [].slice.call(document.querySelectorAll('[data-lb-qr]'));
    if (!boxes.length) return;
    const ok = await ensureQr();
    if (!ok) {
      boxes.forEach(b => { b.innerHTML = '<span class="lb-qrfail">' + esc(I.t('qrFailure')) + '</span>'; });
      return;
    }
    boxes.forEach(function (b) {
      if (b.firstChild) return;              /* 이미 그려진 것은 건드리지 않습니다 */
      const a = S.animals.filter(x => x.id === b.getAttribute('data-lb-qr'))[0];
      if (!a) return;
      const key = S.mode + '|' + a.id;
      if (!QR_CACHE[key]) {
        /* 'M' 은 흔히 쓰는 오류정정 수준입니다. 라벨은 통에 붙어 긁히므로
           한 단계 높여 'Q' 를 씁니다 — 조금 더 촘촘해지지만 잘 읽힙니다. */
        const qr = window.qrcode(0, 'Q');
        qr.addData(urlOf(a));
        qr.make();
        QR_CACHE[key] = qr.createImgTag(4, 0);
      }
      b.innerHTML = QR_CACHE[key];
    });
  }

  /* 인쇄면만 다시 그립니다. 이미 그린 QR 은 그대로 두고 새로 들어온 것만
     만듭니다 — 100마리에서 체크 하나가 100장 재생성이 되면 안 됩니다. */
  function refreshSheet() {
    const old = document.getElementById('lbSheet');
    const wrap = document.createElement('div');
    wrap.innerHTML = sheet();
    const next = wrap.firstChild;

    if (!next) { if (old) old.remove(); }
    else if (old) old.replaceWith(next);
    else document.getElementById('body').appendChild(next);

    const n = picked().length;
    const btn = $('lb_print');
    if (btn) btn.disabled = !n;
    const count = document.querySelector('.lb-count');
    if (count) {
      /* 공개 모드에서 빠진 마릿수까지 같이 고칩니다 — 장수만 고치면
         '몇 마리가 왜 빠졌는지' 가 사라져서 조용히 없어진 것이 됩니다. */
      const skipped = S.mode === 'public'
        ? S.animals.filter(a => S.picked[a.id] && !usable(a)).length : 0;
      count.textContent = I.t('lbPicked', { n: n })
        + (skipped ? ' · ' + I.t('lbSkipped', { n: skipped }) : '');
    }

    drawQrs();
  }

  function render() {
    $('body').innerHTML = chooser() + sheet();
    bind();
    drawQrs();
  }

  function bind() {
    const mode = $('lb_mode');
    if (mode) mode.onchange = function () { S.mode = mode.value; render(); };
    const size = $('lb_size');
    if (size) size.onchange = function () { S.size = size.value; render(); };

    const all = $('lb_all');
    if (all) all.onclick = function () {
      S.animals.forEach(a => { if (usable(a)) S.picked[a.id] = true; });
      render();
    };
    const none = $('lb_none');
    if (none) none.onclick = function () { S.picked = {}; render(); };

    /* 체크 하나에 화면을 통째로 다시 그리면 QR 을 전부 다시 만듭니다 —
       100마리면 한 번 누를 때 100장입니다. 목록은 그대로 두고 인쇄면과
       장수만 고칩니다. 스크롤 위치도 함께 지켜집니다. */
    [].slice.call(document.querySelectorAll('[data-lb-pick]')).forEach(function (el) {
      el.onchange = function () {
        S.picked[el.getAttribute('data-lb-pick')] = el.checked;
        refreshSheet();
      };
    });

    const print = $('lb_print');
    if (print) print.onclick = function () { window.print(); };
  }

  async function boot() {
    if (!A || !A.ready) {
      gate('bi-plug', I.t('backendTitle'), I.t('backendBody'), I.url('/care/'), I.t('backToList'));
      return;
    }
    await A.boot();
    if (!A.user) {
      const q = new URLSearchParams({ next: location.pathname + location.search });
      if (I.language && I.language() !== 'ko') q.set('lang', I.language());
      gate('bi-person-lock', I.t('loginTitle'), I.t('loginBody'),
        '/gecko/login.html?' + q.toString(), I.t('loginAction'));
      return;
    }

    try {
      S.animals = (await A.listAnimals()) || [];
    } catch (e) {
      gate('bi-x-octagon', I.t('backendTitle'), A.friendly ? A.friendly(e) : '',
        I.url('/care/'), I.t('backToList'));
      return;
    }
    /* 처음에는 전부 고른 상태로 둡니다 — 라벨을 뽑으러 온 사람은 보통
       전부 뽑습니다. 빼는 편이 고르는 것보다 빠릅니다. */
    S.animals.forEach(a => { S.picked[a.id] = true; });
    render();
  }

  boot();
}());
