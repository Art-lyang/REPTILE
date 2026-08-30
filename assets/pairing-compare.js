(function (w) {
  'use strict';

  var COPY = w.PairingCompareText;
  if (!COPY) throw new Error('PairingCompareText is required');
  var DOMAIN = w.PairingCompareMetrics;
  if (!DOMAIN) throw new Error('PairingCompareMetrics is required');
  var isNormal = DOMAIN.isNormal;
  var metrics = DOMAIN.metrics;
  var normalized = DOMAIN.normalized;
  var sanitize = DOMAIN.sanitize;
  var snapshotKey = DOMAIN.snapshotKey;
  var entries = [];
  var current = null;
  var currentLanguage = 'ko';
  var renderedLanguage = '';
  var goal = '';
  var sequence = 0;

  function language(value) {
    var key = String(value || 'ko').toLowerCase().split('-')[0];
    return COPY[key] ? key : 'ko';
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function goals() {
    var seen = {};
    var values = [];
    entries.forEach(function (entry) {
      entry.snapshot.results.forEach(function (result) {
        var key = normalized(result.label);
        if (!seen[key] && !isNormal(result.label)) {
          seen[key] = true;
          values.push(result.label);
        }
      });
    });
    if (!values.length && entries.length) values.push(entries[0].snapshot.results[0].label);
    return values;
  }
  function ensureGoal() {
    var options = goals();
    if (!options.some(function (label) { return normalized(label) === normalized(goal); })) {
      goal = options[0] || '';
    }
  }
  function add(input) {
    var snapshot = sanitize(input);
    var key = snapshotKey(snapshot);
    if (entries.some(function (entry) { return entry.key === key; })) return { status: 'duplicate' };
    if (entries.length >= 3) return { status: 'full' };
    sequence += 1;
    entries.push({ id: sequence, key: key, snapshot: snapshot });
    ensureGoal();
    return { status: 'added' };
  }
  function remove(id) {
    entries = entries.filter(function (entry) { return entry.id !== Number(id); });
    ensureGoal();
  }
  function clear() {
    entries = [];
    goal = '';
  }
  function setGoal(value) {
    var match = goals().find(function (label) { return normalized(label) === normalized(value); });
    if (match) goal = match;
  }
  function percent(value, key) {
    return new Intl.NumberFormat(
      { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[key],
      { style: 'percent', maximumFractionDigits: 1 }
    ).format(value);
  }
  function card(entry, index, text, key, best) {
    var snapshot = entry.snapshot;
    var value = metrics(snapshot, goal);
    var topResult = snapshot.results.find(function (result) {
      return !isNormal(result.label);
    }) || snapshot.results[0];
    var stage = value.visualProbability > 0 ? text.now
      : value.carrierProbability > 0 ? text.next : text.none;
    var lines = value.lineLabels.length ? value.lineLabels.join(' · ') : text.noLine;
    return '<article class="pc-card' + (best ? ' is-best' : '') + '">'
      + '<div class="pc-cardhead"><span>' + esc(text.pairing + ' ' + String.fromCharCode(65 + index)) + '</span>'
      + (best ? '<b>' + esc(text.best) + '</b>' : '')
      + '<button type="button" data-pc-remove="' + entry.id + '" aria-label="' + esc(text.remove) + '">×</button></div>'
      + '<h4>' + esc(snapshot.parents.A.label) + ' <i>×</i> ' + esc(snapshot.parents.B.label) + '</h4>'
      + '<div class="pc-hero"><span>' + esc(text.visual) + '</span><strong>'
      + esc(percent(value.visualProbability, key)) + '</strong></div>'
      + '<dl><div><dt>' + esc(text.carrier) + '</dt><dd>' + esc(percent(value.carrierProbability, key)) + '</dd></div>'
      + '<div><dt>' + esc(text.warning) + '</dt><dd>' + value.warningCount + '</dd></div>'
      + '<div><dt>' + esc(text.stage) + '</dt><dd>' + esc(stage) + '</dd></div>'
      + '<div><dt>' + esc(text.line) + '</dt><dd>' + esc(lines) + '</dd></div></dl>'
      + '<p><span>' + esc(text.top) + '</span>' + esc(topResult.label) + ' · '
      + esc(percent(topResult.probability, key)) + '</p></article>';
  }
  function html(input, lang) {
    current = sanitize(input);
    var nextLanguage = language(lang);
    if (renderedLanguage && renderedLanguage !== nextLanguage && entries.length) clear();
    renderedLanguage = nextLanguage;
    currentLanguage = nextLanguage;
    ensureGoal();
    var text = COPY[currentLanguage];
    var key = snapshotKey(current);
    var duplicate = entries.some(function (entry) { return entry.key === key; });
    var buttonText = duplicate ? text.added : entries.length >= 3 ? text.full : text.add;
    var options = goals().map(function (label) {
      return '<option' + (normalized(label) === normalized(goal) ? ' selected' : '') + '>'
        + esc(label) + '</option>';
    }).join('');
    var highest = entries.reduce(function (max, entry) {
      return Math.max(max, metrics(entry.snapshot, goal).visualProbability);
    }, 0);
    var cards = entries.map(function (entry, index) {
      var chance = metrics(entry.snapshot, goal).visualProbability;
      return card(entry, index, text, currentLanguage, entries.length > 1 && highest > 0 && chance === highest);
    }).join('');
    return '<section class="pc-compare" data-pairing-compare aria-labelledby="pcTitle">'
      + '<div class="pc-head"><div><h3 id="pcTitle">' + esc(text.title) + '</h3><p>' + esc(text.hint) + '</p></div>'
      + '<span class="pc-count">' + entries.length + '/3</span></div>'
      + '<div class="pc-actions"><button type="button" data-pc-add'
      + (duplicate || entries.length >= 3 ? ' disabled' : '') + '><i class="bi bi-columns-gap" aria-hidden="true"></i>'
      + esc(buttonText) + '</button>' + (entries.length ? '<button type="button" data-pc-clear>'
      + esc(text.clear) + '</button>' : '') + '</div>'
      + (!entries.length ? '<p class="pc-empty">' + esc(text.empty) + '</p>'
        : '<label class="pc-target"><span>' + esc(text.target) + '</span><select data-pc-goal>'
          + options + '</select></label><div class="pc-grid">' + cards + '</div>'
          + (entries.length === 1 ? '<p class="pc-more">' + esc(text.oneMore) + '</p>' : '')
          + '<p class="pc-session">' + esc(text.session) + '</p>')
      + '</section>';
  }
  function refresh(root) {
    var prior = root.querySelector('[data-pairing-compare]');
    if (!prior || !current) return;
    var shell = document.createElement('div');
    shell.innerHTML = html(current, currentLanguage);
    prior.replaceWith(shell.firstElementChild);
    bind(root);
  }
  function bind(root) {
    var section = root && root.querySelector ? root.querySelector('[data-pairing-compare]') : null;
    if (!section || section.dataset.bound === '1') return;
    section.dataset.bound = '1';
    var addButton = section.querySelector('[data-pc-add]');
    if (addButton) addButton.addEventListener('click', function () { add(current); refresh(root); });
    var clearButton = section.querySelector('[data-pc-clear]');
    if (clearButton) clearButton.addEventListener('click', function () { clear(); refresh(root); });
    var select = section.querySelector('[data-pc-goal]');
    if (select) select.addEventListener('change', function () { setGoal(select.value); refresh(root); });
    section.querySelectorAll('[data-pc-remove]').forEach(function (button) {
      button.addEventListener('click', function () { remove(button.dataset.pcRemove); refresh(root); });
    });
  }
  function state() {
    return { entries: entries.map(function (entry) { return entry.snapshot; }), goal: goal };
  }

  w.PairingCompare = {
    add: add, clear: clear, html: html, bind: bind, metrics: metrics, setGoal: setGoal, state: state
  };
})(window);
