(function (w) {
  'use strict';

  const locales = Object.freeze(w.LoginI18nLocales || {});
  const supported = Object.freeze({ ko: true, en: true, zh: true, ja: true });
  const providerKeys = Object.freeze({
    email: 'providerEmail', google: 'providerGoogle', kakao: 'providerKakao', apple: 'providerApple'
  });

  function normalized(value) {
    const code = String(value || '').toLowerCase().split('-')[0];
    return supported[code] ? code : 'ko';
  }

  function query() {
    try { return new URLSearchParams(String(w.location.search || '')); }
    catch (error) { return new URLSearchParams(); }
  }

  function language() {
    const htmlLanguage = w.document && w.document.documentElement
      ? w.document.documentElement.lang : 'ko';
    return normalized(query().get('lang') || htmlLanguage);
  }

  function value(key) {
    const active = locales[language()] || locales.ko || {};
    const fallback = locales.ko || {};
    return Object.prototype.hasOwnProperty.call(active, key) ? active[key]
      : Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : key;
  }

  function escaped(input) {
    return String(input == null ? '' : input).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function formatted(key, values, escapeValues) {
    return String(value(key)).replace(/\{([a-zA-Z0-9_]+)\}/g, function (token, name) {
      if (!values || !Object.prototype.hasOwnProperty.call(values, name)) return token;
      return escapeValues ? escaped(values[name]) : String(values[name]);
    });
  }

  function t(key, values) { return formatted(key, values, false); }
  function html(key, values) { return formatted(key, values, true); }

  function url(path, params) {
    const raw = String(path || '/gecko/login.html');
    const hashIndex = raw.indexOf('#');
    const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
    const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const queryIndex = base.indexOf('?');
    const pathname = queryIndex >= 0 ? base.slice(0, queryIndex) : base;
    const search = new URLSearchParams(queryIndex >= 0 ? base.slice(queryIndex + 1) : '');
    if (language() === 'ko') search.delete('lang');
    else search.set('lang', language());
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] == null || params[key] === '') search.delete(key);
      else search.set(key, String(params[key]));
    });
    const encoded = search.toString();
    return pathname + (encoded ? '?' + encoded : '') + hash;
  }

  function safePath(raw) {
    const candidate = String(raw || '');
    if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.indexOf('\\') >= 0) return null;
    try {
      const parsed = new URL(candidate, w.location.origin);
      if (parsed.origin !== w.location.origin || parsed.pathname === '/gecko/login.html') return null;
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (error) { return null; }
  }

  function safeNextPath() { return safePath(query().get('next')); }

  function localizedPath(path, targetLanguage) {
    const safe = safePath(path);
    if (!safe) return null;
    const parsed = new URL(safe, w.location.origin);
    const nextLanguage = normalized(targetLanguage);
    if (nextLanguage === 'ko') parsed.searchParams.delete('lang');
    else parsed.searchParams.set('lang', nextLanguage);
    return parsed.pathname + parsed.search + parsed.hash;
  }

  function loginUrl(next) {
    return url('/gecko/login.html', { next: safePath(next) });
  }

  function calculatorUrl() {
    return language() === 'ko' ? '/gecko/' : '/' + language() + '/gecko/';
  }

  function formatDate(input) {
    if (!input) return '';
    try {
      const date = new Date(input);
      if (Number.isNaN(date.getTime())) return String(input);
      return new Intl.DateTimeFormat(language(), { dateStyle: 'medium' }).format(date);
    } catch (error) { return String(input); }
  }

  function formatNumber(input) {
    try { return new Intl.NumberFormat(language()).format(Number(input)); }
    catch (error) { return String(input); }
  }

  function providerName(provider) {
    const key = providerKeys[provider];
    return key ? t(key) : String(provider || '');
  }

  function friendly(error) {
    const message = String((error && error.message) || error || '');
    if (/Invalid login credentials/i.test(message)) return t('errInvalidLogin');
    if (/User already registered|already been registered/i.test(message)) return t('errAlreadyRegistered');
    if (/Password should be at least|Password should contain/i.test(message)) return t('errWeakPassword');
    if (/Unable to validate email|invalid format/i.test(message)) return t('errInvalidEmail');
    if (/Email not confirmed/i.test(message)) return t('errUnconfirmed');
    if (/rate limit|too many/i.test(message)) return t('errRateLimit');
    if (/provider is not enabled|Unsupported provider/i.test(message)) return t('errProviderDisabled');
    return t('errUnknown');
  }

  function apply(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-login-text]').forEach(function (node) {
      node.textContent = t(node.dataset.loginText);
    });
    root.querySelectorAll('[data-login-html]').forEach(function (node) {
      node.innerHTML = t(node.dataset.loginHtml);
    });
    root.querySelectorAll('[data-login-title]').forEach(function (node) {
      node.title = t(node.dataset.loginTitle);
    });
    root.querySelectorAll('[data-login-aria]').forEach(function (node) {
      node.setAttribute('aria-label', t(node.dataset.loginAria));
    });
    root.querySelectorAll('[data-login-placeholder]').forEach(function (node) {
      node.setAttribute('placeholder', t(node.dataset.loginPlaceholder));
    });
    root.querySelectorAll('[data-login-calculator-url]').forEach(function (node) {
      node.setAttribute('href', calculatorUrl());
    });
    root.querySelectorAll('[data-login-url]').forEach(function (node) {
      node.setAttribute('href', url(node.getAttribute('href')));
    });
    root.querySelectorAll('[data-login-language]').forEach(function (node) {
      node.value = language();
      if (node.dataset.loginI18nBound === '1') return;
      node.dataset.loginI18nBound = '1';
      node.addEventListener('change', function () {
        const current = new URL(w.location.href);
        const nextLanguage = normalized(node.value);
        const next = localizedPath(current.searchParams.get('next'), nextLanguage);
        if (next) current.searchParams.set('next', next);
        if (nextLanguage === 'ko') current.searchParams.delete('lang');
        else current.searchParams.set('lang', nextLanguage);
        w.location.href = current.pathname + current.search + current.hash;
      });
    });
  }

  function initialize() {
    const current = language();
    if (w.document && w.document.documentElement) {
      w.document.documentElement.lang = current === 'zh' ? 'zh-Hans' : current;
    }
    if (w.document) {
      w.document.title = t('pageTitle');
      apply(w.document);
    }
    return current;
  }

  w.LoginI18n = Object.freeze({
    language, t, html, apply, initialize, url, loginUrl, calculatorUrl,
    safeNextPath, localizedPath, formatDate, formatNumber, providerName, friendly
  });
}(window));
