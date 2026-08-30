/* =============================================================================
   법적 지위와 서류 — 화면
   -----------------------------------------------------------------------------
   판정은 서버가 합니다(my_animal_legal 의 docs_required · docs_ok · locked).
   여기서는 받은 것을 그리고, 누른 것을 그대로 넘길 뿐입니다.
   ============================================================================= */
(function (global) {
  'use strict';

  const L = global.AnimalLegal;

  function icon(n) { return '<i class="bi ' + n + '" aria-hidden="true"></i>'; }

  function statusOptions(I, esc, current) {
    return L.STATUSES.map(function (s) {
      return '<option value="' + s + '"' + (current === s ? ' selected' : '') + '>'
        + esc(I.t('legal_' + s)) + '</option>';
    }).join('');
  }

  function kindOptions(I, esc) {
    /* 잠금을 푸는 것과 못 푸는 것을 나눠 보여 줍니다. 섞어 두면 '수입신고필증'
       을 올리고 왜 아직 막히는지 모르게 됩니다. */
    const group = function (label, kinds) {
      return '<optgroup label="' + esc(label) + '">' + kinds.map(function (k) {
        return '<option value="' + k + '">' + esc(I.t('doc_' + k)) + '</option>';
      }).join('') + '</optgroup>';
    };
    return group(I.t('legalCoreDocs'), L.CORE_KINDS) + group(I.t('legalExtraDocs'), L.EXTRA_KINDS);
  }

  function docRow(d, I, esc) {
    const core = L.CORE_KINDS.indexOf(d.doc_kind) >= 0;
    const bits = [d.doc_number, d.issuer].filter(Boolean);
    if (d.issued_on) bits.push(I.formatDate(d.issued_on));
    if (d.expires_on) {
      bits.push(I.t(d.expired ? 'legalExpiredOn' : 'legalExpiresOn', { date: I.formatDate(d.expires_on) }));
    }
    return '<div class="lgdoc' + (d.expired ? ' expired' : '') + '">'
      + '<div class="lgdoc-main"><div class="lgdoc-kind">' + esc(I.t('doc_' + d.doc_kind))
      + (core ? '' : ' <span class="lgdoc-extra">' + esc(I.t('legalExtraTag')) + '</span>')
      + (d.expired ? ' <span class="lgdoc-expired">' + esc(I.t('legalExpired')) + '</span>' : '')
      + '</div>'
      + (bits.length ? '<div class="lgdoc-meta">' + esc(bits.join(' · ')) + '</div>' : '')
      + '</div><div class="lgdoc-acts">'
      + '<button class="mini" data-legalview="' + esc(d.file_path) + '">'
      + icon('bi-eye') + esc(I.t('view')) + '</button>'
      + '<button class="mini del" data-legalarchive="' + esc(d.id) + '">'
      + icon('bi-archive') + esc(I.t('legalArchive')) + '</button>'
      + '</div></div>';
  }

  /* 지금 상태를 한 줄로. 여기가 사람이 제일 먼저 읽는 곳입니다. */
  function banner(info, I, esc) {
    if (!info.docs_required) return '';
    if (info.docs_ok) {
      return '<div class="note ok" id="lg_state">' + icon('bi-check-circle')
        + '<span>' + esc(I.t('legalDocsOk')) + '</span></div>';
    }
    return '<div class="note warn" id="lg_state">' + icon('bi-exclamation-triangle')
      + '<span>' + esc(I.t('legalDocsMissing')) + '</span></div>';
  }

  function html(info, I, esc) {
    if (!info) return '';
    const status = info.legal_status || 'none';
    const docs = info.documents || [];

    return '<div class="pad" id="animal-legal"><div class="lbl">' + esc(I.t('legalTitle')) + '</div>'
      + '<div class="hint">' + esc(I.t('legalHint')) + '</div>'

      + banner(info, I, esc)

      + '<div class="lbl2"><label for="lg_status">' + esc(I.t('legalStatus')) + '</label></div>'
      + '<select class="in" id="lg_status"' + (info.locked ? ' data-legal-locked="1"' : '') + '>'
      + statusOptions(I, esc, status) + '</select>'
      /* 한 번 표시하면 못 되돌린다는 것을 고르기 전에 알려야 합니다. */
      + '<div class="hint">' + esc(I.t(info.locked ? 'legalLockedHint' : 'legalOneWayHint')) + '</div>'

      + '<div class="lbl2"><label for="lg_ref">' + esc(I.t('legalRef')) + '</label></div>'
      + '<input class="in" id="lg_ref" maxlength="120" value="' + esc(info.legal_ref || '') + '" placeholder="'
      + esc(I.t('legalRefPlaceholder')) + '">'
      + '<button class="mini" id="lg_save" style="margin-top:8px">' + icon('bi-check2')
      + esc(I.t('save')) + '</button>'

      + (L.isCites(status) || docs.length
          ? '<div class="lbl2" style="margin-top:16px">' + esc(I.t('legalDocuments')) + '</div>'
            + (docs.length
                ? '<div class="lgdocs">' + docs.map(d => docRow(d, I, esc)).join('') + '</div>'
                : '<div class="empty">' + icon('bi-file-earmark') + esc(I.t('legalNoDocs')) + '</div>')
            + '<details class="lgadd"><summary>' + icon('bi-plus-lg') + esc(I.t('legalAddDoc')) + '</summary>'
            + '<div class="lbl2"><label for="lg_kind">' + esc(I.t('legalDocKind')) + '</label></div>'
            + '<select class="in" id="lg_kind">' + kindOptions(I, esc) + '</select>'
            + '<div class="lbl2"><label for="lg_num">' + esc(I.t('legalDocNumber')) + '</label></div>'
            + '<input class="in" id="lg_num" maxlength="120">'
            + '<div class="lbl2"><label for="lg_issuer">' + esc(I.t('legalIssuer')) + '</label></div>'
            + '<input class="in" id="lg_issuer" maxlength="120">'
            + '<div class="row2"><div><div class="lbl2">' + esc(I.t('legalIssuedOn')) + '</div>'
            + '<input class="in" id="lg_issued" type="date"></div>'
            + '<div><div class="lbl2">' + esc(I.t('legalExpiresLabel')) + '</div>'
            + '<input class="in" id="lg_expires" type="date"></div></div>'
            + '<div class="lbl2"><label for="lg_file">' + esc(I.t('legalFile')) + '</label></div>'
            + '<input class="in" id="lg_file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp">'
            + '<div class="hint">' + esc(I.t('legalFileHint')) + '</div>'
            + '<div class="err" id="lg_err"></div>'
            + '<button class="btn" id="lg_add" style="margin-top:10px">' + icon('bi-upload')
            + esc(I.t('legalUpload')) + '</button></details>'
          : '')
      + '</div>';
  }

  global.AnimalLegalUi = { html: html, docRow: docRow, banner: banner };
}(window));
