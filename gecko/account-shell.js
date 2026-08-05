(function (w) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function html(options) {
    var t = options.i18n.t;
    var overview = '<div data-account-pane="overview">' + options.overview + '</div>';
    var status = '<div class="msg account-status" id="msg" role="status" aria-live="polite"></div>';
    if (options.isAdmin) return status + overview;
    return '<nav class="account-tabs" aria-label="' + esc(t('accountSettings')) + '">'
      + '<button class="account-tab on" data-account-tab="overview">' + esc(t('accountOverview')) + '</button>'
      + '<button class="account-tab" data-account-tab="profile">' + esc(t('profileSettings')) + '</button>'
      + '<button class="account-tab" data-account-tab="privacy">' + esc(t('privacySettings')) + '</button>'
      + '<button class="account-tab" data-account-tab="security">' + esc(t('securitySettings')) + '</button></nav>'
      + status + overview
      + '<div data-account-pane="profile" hidden></div>'
      + '<div data-account-pane="privacy" hidden></div>'
      + '<div data-account-pane="security" hidden></div>';
  }

  function select(root, name) {
    var valid = ['overview', 'profile', 'privacy', 'security'];
    if (valid.indexOf(name) < 0) name = 'overview';
    root.querySelectorAll('[data-account-tab]').forEach(function (button) {
      var active = button.dataset.accountTab === name;
      button.classList.toggle('on', active);
      button.setAttribute('aria-selected', String(active));
    });
    root.querySelectorAll('[data-account-pane]').forEach(function (pane) {
      pane.hidden = pane.dataset.accountPane !== name;
    });
  }

  function bind(root) {
    root.querySelectorAll('[data-account-tab]').forEach(function (button) {
      button.addEventListener('click', function () { select(root, button.dataset.accountTab); });
    });
    select(root, 'overview');
  }

  function pane(root, name) {
    return root.querySelector('[data-account-pane="' + name + '"]');
  }

  w.AccountShell = { html: html, bind: bind, select: select, pane: pane };
}(window));
