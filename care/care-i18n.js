(function (w) {
  'use strict';

  const locales = Object.freeze(w.CareI18nLocales || {});
  const supported = Object.freeze({ ko: true, en: true, zh: true, ja: true });
  const speciesKeys = Object.freeze({
    leopard: 'speciesLeopard', crested: 'speciesCrested', fattail: 'speciesFattail',
    pygmy: 'speciesPygmy', other: 'speciesOther'
  });
  const kindKeys = Object.freeze({
    feed: 'kindFeed', water: 'kindWater', clean: 'kindClean', bedding: 'kindBedding',
    supplement: 'kindSupplement', weigh: 'kindWeigh', health: 'kindHealth', custom: 'kindCustom',
    symptom: 'kindSymptom', shed: 'kindShed', poop: 'kindPoop', refusal: 'kindRefusal',
    memo: 'kindMemo', behavior: 'kindBehavior'
  });
  const feedKindKeys = Object.freeze({
    staple: 'feedKindStaple', treat: 'feedKindTreat', special: 'feedKindSpecial',
    supplement: 'feedKindSupplement', substrate: 'feedKindSubstrate', other: 'feedKindOther'
  });
  const signKeys = Object.freeze({
    floppy_tail: 'signFloppyTail', kinked_tail: 'signKinkedTail', autotomy: 'signAutotomy',
    wobble: 'signWobble', stargazing: 'signStargazing', stereotypy: 'signStereotypy',
    shed_stuck: 'signShedStuck', abscess: 'signAbscess', mouth: 'signMouth', resp: 'signResp',
    prolapse: 'signProlapse', bone: 'signBone', eye: 'signEye', bloat: 'signBloat',
    skin: 'signSkin', appetite: 'signAppetite'
  });
  const presetKeys = Object.freeze({
    '급여': 'presetFeeding', '칼슘 더스팅': 'presetCalcium', '비타민': 'presetVitamin',
    '물 교체': 'presetWater', '스팟 청소': 'presetSpotClean', '전체 청소': 'presetFullClean',
    '체중 측정': 'presetWeight', 'CGD 급여': 'presetCgd', '곤충 급여': 'presetInsects',
    '분무 · 물 교체': 'presetMistWater', '간식 · 견과': 'presetTreatNuts',
    '바닥재 교체': 'presetBedding', '청소': 'presetClean'
  });
  const presetDetailKeys = Object.freeze({
    '성체 기준. 유체는 매일': 'presetDetailAdultJuvenile'
  });
  const summaryKeys = Object.freeze({
    empty: 'summaryEmpty', weightDown: 'summaryWeightDown', weightSparse: 'summaryWeightSparse',
    noFeed: 'summaryNoFeed', waterSparse: 'summaryWaterSparse', cleanSparse: 'summaryCleanSparse',
    balanced: 'summaryBalanced'
  });

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
    root.querySelectorAll('[data-care-text]').forEach(function (node) {
      node.textContent = t(node.dataset.careText);
    });
    root.querySelectorAll('[data-care-title]').forEach(function (node) {
      node.title = t(node.dataset.careTitle);
    });
    root.querySelectorAll('[data-care-aria]').forEach(function (node) {
      node.setAttribute('aria-label', t(node.dataset.careAria));
    });
    root.querySelectorAll('[data-care-placeholder]').forEach(function (node) {
      node.setAttribute('placeholder', t(node.dataset.carePlaceholder));
    });
    root.querySelectorAll('[data-care-content]').forEach(function (node) {
      node.setAttribute('content', t(node.dataset.careContent));
    });
    root.querySelectorAll('[data-care-url]').forEach(function (node) {
      node.setAttribute('href', url(node.getAttribute('href')));
    });
    root.querySelectorAll('[data-care-language]').forEach(function (node) {
      node.value = language();
      if (node.dataset.careLanguageBound === 'true') return;
      node.dataset.careLanguageBound = 'true';
      node.addEventListener('change', function () {
        const current = new URL(w.location.href);
        const next = normalized(node.value);
        if (next === 'ko') current.searchParams.delete('lang');
        else current.searchParams.set('lang', next);
        w.location.assign(current.pathname + current.search + current.hash);
      });
    });
  }

  function initialize(titleKey) {
    const current = language();
    w.LANG = current;
    if (w.document && w.document.documentElement) {
      w.document.documentElement.lang = current === 'zh' ? 'zh-Hans' : current;
    }
    if (w.document) {
      w.document.title = t(titleKey || 'pageTitle');
      apply(w.document);
    }
    return current;
  }

  function url(path, params) {
    const raw = String(path || '/care/');
    const hashIndex = raw.indexOf('#');
    const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
    const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const queryIndex = base.indexOf('?');
    const pathname = queryIndex >= 0 ? base.slice(0, queryIndex) : base;
    const search = new URLSearchParams(queryIndex >= 0 ? base.slice(queryIndex + 1) : '');
    if (language() !== 'ko') search.set('lang', language());
    else search.delete('lang');
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] == null || params[key] === '') search.delete(key);
      else search.set(key, String(params[key]));
    });
    const encoded = search.toString();
    return pathname + (encoded ? '?' + encoded : '') + hash;
  }

  function formatDate(input, options) {
    if (!input) return '';
    try {
      const date = new Date(String(input).length === 10 ? input + 'T00:00:00' : input);
      if (Number.isNaN(date.getTime())) return String(input);
      return new Intl.DateTimeFormat(language(), options || { dateStyle: 'medium' }).format(date);
    } catch (error) { return String(input); }
  }

  function formatNumber(input, options) {
    try { return new Intl.NumberFormat(language(), options || {}).format(Number(input)); }
    catch (error) { return String(input); }
  }

  function speciesName(code) { return t(speciesKeys[code] || 'speciesOther'); }
  function kindName(code) { return t(kindKeys[code] || 'kindCustom'); }
  function feedKindName(code) { return t(feedKindKeys[code] || 'feedKindOther'); }
  function signName(code) { return t(signKeys[code] || 'signUnknown', { code: code || '' }); }
  function signWhat(code) {
    const key = signKeys[code];
    return key ? t(key + 'What') : '';
  }
  function feedLevelName(code) {
    const suffix = { ok: 'Enough', soon: 'OrderSoon', now: 'OrderNow', out: 'Out',
      expiring: 'Expiring', expired: 'Expired' }[code] || 'Enough';
    return t('feedLevel' + suffix);
  }

  function weekdayShort(index) {
    const names = value('weekdays');
    return Array.isArray(names) ? names[index] : String(index);
  }

  function cycleLabel(plan) {
    if (Array.isArray(plan && plan.weekdays) && plan.weekdays.length) {
      const sorted = plan.weekdays.slice().sort(function (a, b) { return a - b; });
      if (sorted.length === 7) return t('cycleDaily');
      return t('cycleWeekdays', { days: sorted.map(weekdayShort).join(' · ') });
    }
    const days = parseInt(plan && plan.interval_days, 10) || 1;
    if (days === 1) return t('cycleDaily');
    if (days === 7) return t('cycleWeekly');
    if (days === 30) return t('cycleEvery30Days');
    return t('cycleEveryDays', { count: formatNumber(days) });
  }

  function ageText(hatchDate, endDate) {
    if (!hatchDate) return '';
    const start = new Date(hatchDate + 'T00:00:00');
    const end = new Date((endDate || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000);
    if (!Number.isFinite(days) || days < 0) return '';
    if (days < 60) return t('ageDays', { count: formatNumber(days) });
    const months = Math.floor(days / 30.4375);
    if (months < 24) return t('ageMonths', { count: formatNumber(months) });
    const years = Math.floor(months / 12), rest = months % 12;
    return rest ? t('ageYearsMonths', { years: formatNumber(years), months: formatNumber(rest) })
      : t('ageYears', { count: formatNumber(years) });
  }

  function relativeDays(days) {
    return Number(days) === 0 ? t('today') : t('daysAgo', { count: formatNumber(days) });
  }

  function canonicalPresetTitle(title) {
    const raw = String(title || '');
    for (const canonical of Object.keys(presetKeys)) {
      const key = presetKeys[canonical];
      if (raw === canonical) return canonical;
      for (const code of Object.keys(locales)) {
        if (locales[code] && locales[code][key] === raw) return canonical;
      }
    }
    return raw;
  }

  function presetTitle(title) {
    const key = presetKeys[canonicalPresetTitle(title)];
    return key ? t(key) : String(title || '');
  }

  function canonicalPlanDetail(detail) {
    const raw = String(detail || '');
    for (const canonical of Object.keys(presetDetailKeys)) {
      const key = presetDetailKeys[canonical];
      if (raw === canonical) return canonical;
      for (const code of Object.keys(locales)) {
        if (locales[code] && locales[code][key] === raw) return canonical;
      }
    }
    return raw;
  }

  function planDetail(detail) {
    const key = presetDetailKeys[canonicalPlanDetail(detail)];
    return key ? t(key) : String(detail || '');
  }

  function summaryNote(note) {
    if (!note) return '';
    const key = summaryKeys[note.code];
    return key ? t(key, note.values || {}) : String(note.text || '');
  }

  function calculatorUrl(path) {
    const raw = String(path || '/');
    return language() === 'ko' ? raw : '/' + language() + raw;
  }

  function friendly(error) {
    const key = w.CareApp && typeof w.CareApp.errorKey === 'function'
      ? w.CareApp.errorKey(error) : null;
    if (key) return t('error' + key.charAt(0).toUpperCase() + key.slice(1));
    const message = String((error && (error.message || error.msg)) || error || '');
    return message || t('errorUnknown');
  }

  w.CareI18n = Object.freeze({ language, t, html, apply, initialize, url, formatDate,
    formatNumber, speciesName, kindName, feedKindName, signName, signWhat, feedLevelName,
    weekdayShort, cycleLabel, ageText, relativeDays, presetTitle, canonicalPresetTitle,
    planDetail, canonicalPlanDetail, summaryNote, calculatorUrl,
    friendly });
}(window));
