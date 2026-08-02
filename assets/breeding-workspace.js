(function (w) {
  'use strict';

  var TEXT = w.BreedingWorkspaceText;
  var STORE = w.CalculationHistoryStore;
  var METRICS = w.PairingCompareMetrics;
  if (!TEXT || !STORE || !METRICS || !w.BreedingDraft) {
    throw new Error('BreedingWorkspace dependencies are required');
  }
  var config = {};
  var entries = [];
  var activeKey = '';
  var compareKeys = [];
  var target = '';
  var eggCount = 2;
  var handlers = {};

  function lang(value) {
    var key = String(value || 'ko').toLowerCase().split('-')[0];
    return TEXT[key] ? key : 'ko';
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function locale(key) {
    return { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[key];
  }
  function percent(value, key) {
    return new Intl.NumberFormat(locale(key), { style: 'percent', maximumFractionDigits: 1 }).format(value);
  }
  function number(value, key) {
    return new Intl.NumberFormat(locale(key), { maximumFractionDigits: 1 }).format(value);
  }
  function clutchStatistics(probability, size) {
    var chance = Math.min(1, Math.max(0, Number(probability) || 0));
    var count = Math.min(99, Math.max(1, Math.round(Number(size) || 2)));
    return { expected: chance * count, atLeastOne: 1 - Math.pow(1 - chance, count) };
  }
  function topResult(snapshot) {
    return snapshot.results.find(function (result) { return !METRICS.isNormal(result.label); })
      || snapshot.results[0];
  }
  function collect(options) {
    var seen = {};
    var list = STORE.list(options.species, options.language);
    list.recent.concat(list.favorites).forEach(function (item) {
      if (seen[item.key]) return;
      seen[item.key] = true;
      entries.push({
        key: item.key, snapshot: item.snapshot, favorite: item.favorite,
        local: true, source: item.favorite ? 'favorite' : 'recent', name: ''
      });
    });
    (Array.isArray(options.pairs) ? options.pairs : []).slice(0, 24).forEach(function (pair) {
      if (!pair || !pair.calculation) return;
      var snapshot;
      try { snapshot = w.BreedingDraft.sanitize(pair.calculation); } catch (error) { return; }
      if (snapshot.species !== options.species) return;
      var fingerprint = STORE.fingerprint(snapshot);
      var existing = entries.find(function (entry) {
        return STORE.fingerprint(entry.snapshot) === fingerprint;
      });
      if (existing) {
        existing.name = String(pair.name || '');
        existing.source = 'saved';
        return;
      }
      entries.push({
        key: 'saved|' + String(pair.id || entries.length), snapshot: snapshot,
        favorite: false, local: false, source: 'saved', name: String(pair.name || '')
      });
    });
    entries = entries.slice(0, 24);
  }
  function syncState() {
    var keys = entries.map(function (entry) { return entry.key; });
    if (keys.indexOf(activeKey) < 0) activeKey = keys[0] || '';
    compareKeys = compareKeys.filter(function (key) { return keys.indexOf(key) >= 0; }).slice(0, 3);
    if (!compareKeys.length) compareKeys = keys.slice(0, 2);
    var goals = goalLabels();
    if (!goals.some(function (label) { return METRICS.normalized(label) === METRICS.normalized(target); })) {
      target = goals[0] || '';
    }
  }
  function goalLabels() {
    var seen = {};
    var labels = [];
    entries.filter(function (entry) { return compareKeys.indexOf(entry.key) >= 0; })
      .forEach(function (entry) {
        entry.snapshot.results.forEach(function (result) {
          var key = METRICS.normalized(result.label);
          if (!seen[key] && !METRICS.isNormal(result.label)) {
            seen[key] = true;
            labels.push(result.label);
          }
        });
      });
    return labels;
  }
  function historyCard(entry, text, key) {
    var top = topResult(entry.snapshot);
    var compared = compareKeys.indexOf(entry.key) >= 0;
    var source = entry.source === 'saved' ? (entry.name || text.saved)
      : entry.source === 'favorite' ? text.favorite : text.recent;
    return '<article class="bw-record' + (entry.key === activeKey ? ' on' : '') + '">'
      + '<button class="bw-record-main" type="button" data-bw-active="' + esc(entry.key) + '">'
      + '<span class="bw-source">' + esc(source) + '</span><b>'
      + esc(entry.snapshot.parents.A.label) + ' <i>×</i> ' + esc(entry.snapshot.parents.B.label) + '</b>'
      + '<small>' + esc(text.top) + ' · ' + esc(top.label) + ' · ' + esc(percent(top.probability, key)) + '</small></button>'
      + '<div class="bw-record-actions">'
      + (entry.local ? '<button type="button" data-bw-favorite="' + esc(entry.key) + '" aria-label="'
        + esc(entry.favorite ? text.removeFavorite : text.addFavorite) + '" aria-pressed="' + entry.favorite + '">'
        + '<i class="bi ' + (entry.favorite ? 'bi-star-fill' : 'bi-star') + '" aria-hidden="true"></i></button>' : '')
      + '<button type="button" data-bw-compare="' + esc(entry.key) + '" aria-label="'
      + esc(compared ? text.removeCompare : text.addCompare) + '" aria-pressed="' + compared + '">'
      + '<i class="bi bi-columns-gap" aria-hidden="true"></i></button>'
      + '<button type="button" data-bw-export="' + esc(entry.key) + '"><i class="bi bi-image" aria-hidden="true"></i> '
      + esc(text.exportImage) + '</button>'
      + '<button type="button" data-bw-import="' + esc(entry.key) + '">' + esc(text.importPair) + '</button></div></article>';
  }
  function downloadImage(entry, text, key) {
    if (!entry || !document.createElement) return;
    var snapshot = entry.snapshot;
    var rows = snapshot.results.slice(0, 10);
    var width = 900;
    var rowHeight = 66;
    var height = 238 + rows.length * rowHeight;
    var canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    var context = canvas.getContext('2d');
    if (!context) return;
    context.scale(2, 2);
    context.fillStyle = '#f5f1e8';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#086850';
    context.fillRect(0, 0, width, 126);
    context.fillStyle = 'rgba(255,255,255,.08)';
    context.beginPath();
    context.arc(820, 20, 112, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255,255,255,.12)';
    context.lineWidth = 28;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = '800 30px "Pretendard Variable", sans-serif';
    context.fillText(text.imageTitle, 42, 51);
    context.font = '600 17px "Pretendard Variable", sans-serif';
    context.fillText(snapshot.parents.A.label + '  ×  ' + snapshot.parents.B.label, 42, 91, 760);
    context.fillStyle = '#173f35';
    context.font = '800 18px "Pretendard Variable", sans-serif';
    context.fillText(text.top, 42, 169);
    rows.forEach(function (result, index) {
      var y = 194 + index * rowHeight;
      context.fillStyle = index % 2 ? '#ffffff' : '#fbfaf6';
      context.fillRect(32, y, width - 64, rowHeight - 8);
      context.fillStyle = '#086850';
      context.font = '800 17px "Pretendard Variable", sans-serif';
      context.fillText(percent(result.probability, key), 50, y + 35);
      context.fillStyle = '#173f35';
      context.font = '700 17px "Pretendard Variable", sans-serif';
      context.fillText(result.label, 160, y + 35, 680);
    });
    context.fillStyle = '#7e766a';
    context.font = '500 13px "Pretendard Variable", sans-serif';
    context.fillText('ryangstudio.com', 42, height - 22);
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var link = document.createElement('a');
      var url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'breeding-analysis.png';
      link.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
  }
  function clutchPanel(entry, text, key) {
    if (!entry) return '';
    var presets = [2, 4, 6].map(function (size) {
      return '<button type="button" data-bw-eggs="' + size + '" aria-pressed="' + (eggCount === size) + '">'
        + esc(text.eggs(size)) + '</button>';
    }).join('');
    var rows = entry.snapshot.results.slice(0, 8).map(function (result) {
      var stats = clutchStatistics(result.probability, eggCount);
      return '<div class="bw-clutch-row"><b>' + esc(result.label) + '</b><span>'
        + esc(text.expected) + ' ' + esc(number(stats.expected, key)) + esc(text.hatchlings) + '</span><span>'
        + esc(text.atLeast) + ' ' + esc(percent(stats.atLeastOne, key)) + '</span></div>';
    }).join('');
    return '<section class="bw-panel"><div class="bw-panel-head"><h3>' + esc(text.clutch)
      + '</h3><p>' + esc(text.clutchHint) + '</p></div><div class="bw-eggs">' + presets
      + '<input data-bw-egg-input type="number" min="1" max="99" value="' + eggCount + '"></div>'
      + '<div class="bw-clutch-list">' + rows + '</div><p class="bw-note">' + esc(text.disclaimer) + '</p></section>';
  }
  function comparePanel(text, key) {
    var chosen = entries.filter(function (entry) { return compareKeys.indexOf(entry.key) >= 0; });
    var goals = goalLabels();
    var options = goals.map(function (label) {
      return '<option' + (METRICS.normalized(label) === METRICS.normalized(target) ? ' selected' : '') + '>'
        + esc(label) + '</option>';
    }).join('');
    var cards = chosen.map(function (entry) {
      var values = METRICS.metrics(entry.snapshot, target);
      return '<article class="bw-compare-card"><b>' + esc(entry.snapshot.parents.A.label) + ' <i>×</i> '
        + esc(entry.snapshot.parents.B.label) + '</b><dl><div><dt>' + esc(text.visual) + '</dt><dd>'
        + esc(percent(values.visualProbability, key)) + '</dd></div><div><dt>' + esc(text.carrier) + '</dt><dd>'
        + esc(percent(values.carrierProbability, key)) + '</dd></div><div><dt>' + esc(text.warning) + '</dt><dd>'
        + values.warningCount + '</dd></div><div><dt>' + esc(text.line) + '</dt><dd>'
        + esc(values.lineLabels.join(' · ') || text.noLine) + '</dd></div></dl></article>';
    }).join('');
    return '<section class="bw-panel"><div class="bw-panel-head"><h3>' + esc(text.comparison)
      + '</h3><p>' + esc(text.comparisonHint) + '</p></div>'
      + (goals.length ? '<label class="bw-target"><span>' + esc(text.target)
        + '</span><select data-bw-target>' + options + '</select></label>' : '')
      + (chosen.length >= 2 ? '<div class="bw-compare-grid">' + cards + '</div>'
        : '<div class="bw-empty">' + esc(text.needTwo) + '</div>') + '</section>';
  }
  function html(options) {
    config = options || {};
    config.language = lang(config.language);
    entries = [];
    collect(config);
    syncState();
    var text = TEXT[config.language];
    if (!entries.length) {
      return '<section class="bw-workspace" data-breeding-workspace><div class="bw-intro"><h2>'
        + esc(text.title) + '</h2><p>' + esc(text.hint) + '</p></div><div class="bw-empty">'
        + esc(text.empty) + '<a href="' + esc(config.calculatorUrl || '/') + '">' + esc(text.calculator) + '</a></div></section>';
    }
    var active = entries.find(function (entry) { return entry.key === activeKey; });
    return '<section class="bw-workspace" data-breeding-workspace><div class="bw-intro"><h2>'
      + esc(text.title) + '</h2><p>' + esc(text.hint) + '</p></div><section class="bw-archive">'
      + '<div class="bw-panel-head"><h3>' + esc(text.archive) + '</h3><p>' + esc(text.archiveHint)
      + '</p></div><div class="bw-records">' + entries.map(function (entry) {
        return historyCard(entry, text, config.language);
      }).join('') + '</div><p class="bw-note">' + esc(text.maxCompare) + '</p></section><div class="bw-grid">'
      + clutchPanel(active, text, config.language) + comparePanel(text, config.language) + '</div></section>';
  }
  function byKey(key) {
    return entries.find(function (entry) { return entry.key === String(key); });
  }
  function refresh(root) {
    var old = root.querySelector('[data-breeding-workspace]');
    if (!old) return;
    var shell = document.createElement('div');
    shell.innerHTML = html(config);
    old.replaceWith(shell.firstElementChild);
    bind(root, handlers);
  }
  function bind(root, nextHandlers) {
    var section = root && root.querySelector ? root.querySelector('[data-breeding-workspace]') : null;
    if (!section || section.dataset.bound === '1') return;
    handlers = nextHandlers || handlers;
    section.dataset.bound = '1';
    section.querySelectorAll('[data-bw-active]').forEach(function (button) {
      button.addEventListener('click', function () { activeKey = button.dataset.bwActive; refresh(root); });
    });
    section.querySelectorAll('[data-bw-favorite]').forEach(function (button) {
      button.addEventListener('click', function () { STORE.toggleFavorite(button.dataset.bwFavorite); refresh(root); });
    });
    section.querySelectorAll('[data-bw-compare]').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.dataset.bwCompare;
        if (compareKeys.indexOf(key) >= 0) compareKeys = compareKeys.filter(function (item) { return item !== key; });
        else if (compareKeys.length < 3) compareKeys.push(key);
        refresh(root);
      });
    });
    section.querySelectorAll('[data-bw-import]').forEach(function (button) {
      button.addEventListener('click', function () {
        var entry = byKey(button.dataset.bwImport);
        if (entry && typeof handlers.onImport === 'function') handlers.onImport(entry.snapshot);
      });
    });
    section.querySelectorAll('[data-bw-export]').forEach(function (button) {
      button.addEventListener('click', function () {
        downloadImage(byKey(button.dataset.bwExport), TEXT[config.language], config.language);
      });
    });
    section.querySelectorAll('[data-bw-eggs]').forEach(function (button) {
      button.addEventListener('click', function () { eggCount = Number(button.dataset.bwEggs); refresh(root); });
    });
    var eggInput = section.querySelector('[data-bw-egg-input]');
    if (eggInput) eggInput.addEventListener('change', function () {
      eggCount = Math.min(99, Math.max(1, Math.round(Number(eggInput.value) || 2))); refresh(root);
    });
    var targetSelect = section.querySelector('[data-bw-target]');
    if (targetSelect) targetSelect.addEventListener('change', function () { target = targetSelect.value; refresh(root); });
  }

  w.BreedingWorkspace = { clutchStatistics: clutchStatistics, html: html, bind: bind };
})(window);
