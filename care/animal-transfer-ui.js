/* =============================================================================
   양도 — 화면 (보내는 쪽)
   -----------------------------------------------------------------------------
   상태는 셋뿐입니다.

     아직   — 세대 수·메모·금액을 정하고 링크를 만듭니다
     대기   — 링크와 QR 을 보여 주고, 취소할 수 있습니다
     완료   — 언제 누구에게 갔는지. 이 개체는 이제 읽기 전용입니다

   ⚠️ '되돌릴 수 없다' 를 만들기 전에 말합니다. 수락한 뒤에 알려 주면 그건
      통보지 안내가 아닙니다.
   ============================================================================= */
(function (global) {
  'use strict';

  function icon(name) { return '<i class="bi ' + name + '" aria-hidden="true"></i>'; }

  function html(tr, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    const locked = !!(ctx.animal && ctx.animal.transferred_at);

    /* 이미 넘긴 개체 — 폼을 보여 줄 이유가 없습니다. */
    if (locked || (tr && tr.status === 'accepted')) {
      const at = (tr && tr.accepted_at) || (ctx.animal && ctx.animal.transferred_at);
      return '<div class="pad tf-done">'
        + '<div class="lbl">' + icon('bi-box-arrow-right') + esc(I.t('tfTitle')) + '</div>'
        + '<div class="tf-badge">' + esc(I.t('tfDone')) + '</div>'
        + (at ? '<div class="hint">' + esc(I.t('tfDoneAt', { date: I.formatDate(at) })) + '</div>' : '')
        + '<div class="hint">' + esc(I.t('tfLocked')) + '</div>'
        + '</div>';
    }

    /* 대기 중 — 링크와 QR */
    if (tr && tr.status === 'pending') {
      const link = global.AnimalTransfer.linkOf(tr.token, I);
      return '<details class="pad tf-wrap" id="tfBox" open>'
        + '<summary><span class="lbl">' + icon('bi-box-arrow-right') + esc(I.t('tfTitle')) + '</span>'
        + '<span class="tf-sum">' + esc(I.t('tfPending')) + '</span></summary>'
        + '<div class="hint">' + esc(I.t('tfLinkHint')) + '</div>'
        + '<div class="tf-link">'
        + '<input class="in" id="tf_link" readonly value="' + esc(link) + '">'
        + '<button class="mini" id="tf_copy" type="button">' + esc(I.t('tfCopy')) + '</button>'
        + '</div>'
        + '<div class="tf-qr" id="tf_qr"></div>'
        + (tr.note ? '<div class="hint">' + esc(I.t('tfNote')) + ' — ' + esc(tr.note) + '</div>' : '')
        + '<div class="tf-acts">'
        + '<button class="btn ghost" id="tf_cancel" type="button">'
        + icon('bi-x-circle') + esc(I.t('tfCancel')) + '</button>'
        + '</div></details>';
    }

    /* 아직 — 만들기 폼 */
    const gens = [1, 2, 3, 4, 5, 6].map(function (n) {
      return '<option value="' + n + '"' + (n === 3 ? ' selected' : '') + '>'
        + esc(I.t('tfGensN', { n: n })) + '</option>';
    }).join('');

    return '<details class="pad tf-wrap" id="tfBox">'
      + '<summary><span class="lbl">' + icon('bi-box-arrow-right') + esc(I.t('tfTitle')) + '</span></summary>'
      + '<div class="hint">' + esc(I.t('tfIntro')) + '</div>'

      + '<label class="fl" for="tf_gens">' + esc(I.t('tfGens')) + '</label>'
      + '<select class="in" id="tf_gens">' + gens + '</select>'
      + '<div class="hint">' + esc(I.t('tfGensHint')) + '</div>'

      + '<label class="fl" for="tf_note">' + esc(I.t('tfNote')) + '</label>'
      + '<textarea class="in" id="tf_note" rows="2" maxlength="300"></textarea>'

      + '<label class="fl" for="tf_price">' + esc(I.t('tfPrice')) + '</label>'
      + '<input class="in" id="tf_price" inputmode="numeric" placeholder="' + esc(I.t('tfPricePh')) + '">'
      + '<div class="hint">' + esc(I.t('tfPriceHint')) + '</div>'

      /* 만들기 전에 말합니다. 만든 뒤에 말하면 통보입니다. */
      + '<div class="tf-warn">' + icon('bi-exclamation-triangle') + esc(I.t('tfWarn')) + '</div>'

      + '<div class="tf-acts">'
      + '<button class="btn" id="tf_create" type="button">'
      + icon('bi-link-45deg') + esc(I.t('tfCreate')) + '</button>'
      + '</div></details>';
  }

  /* QR 은 대기 중일 때만, 그릴 때만 받아옵니다. */
  async function drawQr(tr, ctx) {
    const box = document.getElementById('tf_qr');
    if (!box || !tr || tr.status !== 'pending') return;
    const I = ctx.i18n;
    const ok = await ctx.ensureQr();
    if (!ok) { box.innerHTML = '<div class="hint">' + ctx.esc(I.t('qrFailure')) + '</div>'; return; }
    const qr = global.qrcode(0, 'M');
    qr.addData(global.AnimalTransfer.linkOf(tr.token, I));
    qr.make();
    box.innerHTML = '<div class="qrbox">' + qr.createImgTag(5, 8)
      + '<div class="qcap">' + ctx.esc(I.t('tfQrCaption')) + '</div></div>';
  }

  global.AnimalTransferUi = { html: html, drawQr: drawQr };
}(window));
