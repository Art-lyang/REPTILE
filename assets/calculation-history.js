(function (w) {
  'use strict';

  var COPY = w.CalculationHistoryText;
  var STORE = w.CalculationHistoryStore;
  if (!COPY || !STORE) throw new Error('CalculationHistory dependencies are required');
  var activeTab = 'recent';
  var current = null;
  var currentSpecies = '';
  var currentLanguage = 'ko';
  var handlers = {};

  function language(value) {
    var key = String(value || 'ko').toLowerCase().split('-')[0];
    return COPY[key] ? key : 'ko';
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function isNormal(label) {
    if (w.PairingCompareMetrics) return w.PairingCompareMetrics.isNormal(label);
    return /^(normal|노멀|普通|ノーマル)$/i.test(String(label || '').trim());
  }
  function percent(value, key) {
    return new Intl.NumberFormat(
      { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[key],
      { style: 'percent', maximumFractionDigits: 1 }
    ).format(value);
  }
  function card(entry, text, key, currentKey) {
    var snapshot = entry.snapshot;
    var top = snapshot.results.find(function (result) {
      return !isNormal(result.label);
    }) || snapshot.results[0];
    var favoriteLabel = entry.favorite ? text.removeFavorite : text.addFavorite;
    return '<article class="ch-card' + (entry.key === currentKey ? ' is-current' : '') + '">'
      + '<button type="button" class="ch-favorite" data-ch-favorite="' + esc(entry.key) + '"'
      + ' aria-label="' + esc(favoriteLabel) + '" aria-pressed="' + (entry.favorite ? 'true' : 'false') + '">'
      + '<i class="bi ' + (entry.favorite ? 'bi-star-fill' : 'bi-star') + '" aria-hidden="true"></i></button>'
      + '<div class="ch-cardbody"><div class="ch-pair">'
      + esc(snapshot.parents.A.label) + ' <i>×</i> ' + esc(snapshot.parents.B.label)
      + (entry.key === currentKey ? '<span>' + esc(text.current) + '</span>' : '') + '</div>'
      + '<p><span>' + esc(text.top) + '</span>' + esc(top.label) + ' · '
      + esc(percent(top.probability, key)) + '</p></div>'
      + '<button type="button" class="ch-load" data-ch-load="' + esc(entry.key) + '">'
      + '<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>' + esc(text.load) + '</button>'
      + '</article>';
  }
  function record(input, lang) {
    current = w.BreedingDraft.sanitize(input);
    currentSpecies = current.species;
    currentLanguage = language(lang);
    return STORE.record(current, currentLanguage);
  }
  function html(input, lang, species) {
    current = input ? w.BreedingDraft.sanitize(input) : null;
    currentSpecies = current ? current.species : String(species || currentSpecies || '');
    currentLanguage = language(lang);
    var text = COPY[currentLanguage];
    var history = STORE.list(currentSpecies, currentLanguage);
    if (!current && !history.recent.length && !history.favorites.length) return '';
    var items = activeTab === 'favorites' ? history.favorites : history.recent;
    var currentKey = current ? STORE.entryKey(current, currentLanguage) : '';
    var empty = activeTab === 'favorites' ? text.emptyFavorites : text.emptyRecent;
    return '<section class="ch-history" data-calculation-history aria-labelledby="chTitle">'
      + '<div class="ch-head"><div><h3 id="chTitle"><i class="bi bi-journal-bookmark" aria-hidden="true"></i>'
      + esc(text.title) + '</h3><p>' + esc(text.hint) + '</p></div>'
      + (current ? '<button type="button" class="ch-swap" data-ch-swap><i class="bi bi-arrow-left-right" aria-hidden="true"></i>'
        + esc(text.swap) + '</button>' : '') + '</div>'
      + '<div class="ch-tabs" role="tablist">'
      + '<button type="button" role="tab" data-ch-tab="recent" aria-selected="' + (activeTab === 'recent') + '">'
      + esc(text.recent) + '<b>' + history.recent.length + '</b></button>'
      + '<button type="button" role="tab" data-ch-tab="favorites" aria-selected="' + (activeTab === 'favorites') + '">'
      + esc(text.favorites) + '<b>' + history.favorites.length + '</b></button></div>'
      + (items.length ? '<div class="ch-list">' + items.map(function (entry) {
        return card(entry, text, currentLanguage, currentKey);
      }).join('') + '</div>' : '<p class="ch-empty">' + esc(empty) + '</p>')
      + '<p class="ch-stored"><i class="bi bi-device-ssd" aria-hidden="true"></i>' + esc(text.stored) + '</p>'
      + '</section>';
  }
  function refresh(root) {
    var prior = root.querySelector('[data-calculation-history]');
    if (!prior || !currentSpecies) return;
    var shell = document.createElement('div');
    shell.innerHTML = html(current, currentLanguage, currentSpecies);
    prior.replaceWith(shell.firstElementChild);
    bind(root, handlers);
  }
  function bind(root, nextHandlers) {
    var section = root && root.querySelector ? root.querySelector('[data-calculation-history]') : null;
    if (!section || section.dataset.bound === '1') return;
    handlers = nextHandlers || handlers;
    section.dataset.bound = '1';
    var swap = section.querySelector('[data-ch-swap]');
    if (swap) swap.addEventListener('click', function () {
      if (typeof handlers.onSwap === 'function') handlers.onSwap();
    });
    section.querySelectorAll('[data-ch-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        activeTab = button.dataset.chTab === 'favorites' ? 'favorites' : 'recent';
        refresh(root);
      });
    });
    section.querySelectorAll('[data-ch-favorite]').forEach(function (button) {
      button.addEventListener('click', function () {
        STORE.toggleFavorite(button.dataset.chFavorite);
        refresh(root);
      });
    });
    section.querySelectorAll('[data-ch-load]').forEach(function (button) {
      button.addEventListener('click', function () {
        var entry = STORE.get(button.dataset.chLoad);
        if (entry && typeof handlers.onLoad === 'function') handlers.onLoad(entry.snapshot);
      });
    });
  }

  w.CalculationHistory = { record: record, html: html, bind: bind };
})(window);
