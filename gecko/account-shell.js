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
    /* 관리자에게도 프로필 칸은 줍니다. 동의·보안 설정은 여전히 안 보여 주지만,
       닉네임은 관리자도 한 명의 이용자로서 갖는 것이라 바꿀 길이 있어야 합니다 —
       개체를 공개하면 그 닉네임이 브리더명으로 그대로 나갑니다. */
    if (options.isAdmin) {
      return '<nav class="account-tabs" aria-label="' + esc(t('accountSettings')) + '">'
        + '<button class="account-tab on" data-account-tab="overview">' + esc(t('accountOverview')) + '</button>'
        + '<button class="account-tab" data-account-tab="profile">' + esc(t('profileSettings')) + '</button></nav>'
        + status + overview
        + '<div data-account-pane="profile" hidden></div>';
    }
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
