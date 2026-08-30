(function (w) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function html(i18n) {
    return '<dialog class="record-dialog" id="recordDialog" aria-labelledby="recordDialogTitle">'
      + '<form method="dialog"><div class="record-dialog-head"><div id="recordDialogTitle">'
      + esc(i18n.t('memoInputTitle')) + '</div><button class="mini" value="cancel" aria-label="'
      + esc(i18n.t('close')) + '"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>'
      + '<div class="hint">' + esc(i18n.t('memoInputHint')) + '</div>'
      + '<textarea class="in" id="recordDialogText" rows="5" maxlength="500" placeholder="'
      + esc(i18n.t('memoInputPlaceholder')) + '"></textarea>'
      + '<div class="err" id="recordDialogError"></div>'
      + '<div class="formbtns"><button type="button" class="btn" id="recordDialogSave">'
      + '<i class="bi bi-check-lg" aria-hidden="true"></i>' + esc(i18n.t('recordMemo')) + '</button>'
      + '<button class="btn ghost" value="cancel">' + esc(i18n.t('cancel')) + '</button></div></form></dialog>';
  }

  function open(kind) {
    var dialog = document.getElementById('recordDialog');
    if (!dialog) return false;
    dialog.dataset.kind = kind;
    var text = document.getElementById('recordDialogText');
    var error = document.getElementById('recordDialogError');
    if (text) text.value = '';
    if (error) error.textContent = '';
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    if (text) text.focus();
    return true;
  }

  function close() {
    var dialog = document.getElementById('recordDialog');
    if (!dialog) return;
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  }

  function payload(kind, text) {
    return { kind: kind, title: null, note: String(text || '').trim() || null };
  }

  w.AnimalRecordDialog = { html: html, open: open, close: close, payload: payload };
}(window));
