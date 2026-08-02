(function (w) {
  'use strict';

  const locales = Object.freeze(w.BreedingI18nLocales || {});
  const supported = Object.freeze({ ko: true, en: true, zh: true, ja: true });

  function normalized(value) {
    const code = String(value || '').toLowerCase().split('-')[0];
    return supported[code] ? code : 'ko';
  }

  function queryLanguage() {
    const search = String((w.location && w.location.search) || '');
    const match = /(?:^|[?&])lang=([^&]+)/i.exec(search);
    try { return match ? decodeURIComponent(match[1]) : ''; }
    catch (error) { return ''; }
  }

  function language() {
    const htmlLanguage = w.document && w.document.documentElement
      ? w.document.documentElement.lang : 'ko';
    return normalized(queryLanguage() || htmlLanguage);
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

  function apply(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-bm-text]').forEach(function (node) {
      node.textContent = t(node.dataset.bmText);
    });
    root.querySelectorAll('[data-bm-title]').forEach(function (node) {
      node.title = t(node.dataset.bmTitle);
    });
    root.querySelectorAll('[data-bm-aria]').forEach(function (node) {
      node.setAttribute('aria-label', t(node.dataset.bmAria));
    });
  }

  function initialize() {
    const current = language();
    w.LANG = current;
    if (w.document && w.document.documentElement) {
      w.document.documentElement.lang = current === 'zh' ? 'zh-Hans' : current;
    }
    if (w.document) {
      w.document.title = t('pageTitle');
      apply(w.document);
    }
    return current;
  }

  function formatDate(input) {
    if (!input) return '';
    try {
      const date = new Date(String(input).length === 10 ? input + 'T00:00:00' : input);
      return Number.isNaN(date.getTime()) ? String(input)
        : new Intl.DateTimeFormat(language(), { dateStyle: 'medium' }).format(date);
    } catch (error) { return String(input); }
  }

  function speciesName(species) {
    const raw = String(species || '');
    const key = 'species' + raw.charAt(0).toUpperCase() + raw.slice(1);
    const translated = t(key);
    return translated === key ? raw : translated;
  }

  function groupName(group) {
    const suffix = { base: 'Base', pattern: 'Pattern', color: 'Color', struct: 'Struct',
      tangerine: 'Tangerine', melanistic: 'Melanistic' }[group];
    return t(suffix ? 'group' + suffix : 'groupOther');
  }

  function calculatorUrl(url) {
    return language() === 'ko' ? url : '/' + language() + String(url || '/');
  }

  function managementUrl(species, tab, params) {
    const query = ['species=' + encodeURIComponent(species || 'gecko')];
    if (language() !== 'ko') query.push('lang=' + encodeURIComponent(language()));
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] != null) query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    });
    return 'breeding.html?' + query.join('&') + (tab ? '#' + encodeURIComponent(tab) : '');
  }

  function friendly(error) {
    const message = String((error && (error.message || error.msg)) || error || '');
    const kind = w.CareApp && typeof w.CareApp.errorKey === 'function'
      ? w.CareApp.errorKey(error) : null;
    if (kind) return t('error' + kind.charAt(0).toUpperCase() + kind.slice(1));
    return message || t('errorUnknown');
  }

  w.BreedingI18n = Object.freeze({ language, t, html, apply, initialize, formatDate,
    speciesName, groupName, calculatorUrl, managementUrl, friendly });
}(window));
