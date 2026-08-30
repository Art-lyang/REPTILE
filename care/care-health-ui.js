(function (w) {
  'use strict';

  function resolveAnimalId(animals, focus) {
    if (focus && animals.some(function (animal) { return animal.id === focus; })) return focus;
    return animals.length === 1 ? animals[0].id : '';
  }

  function recentRecords(options, selectedId) {
    var C = options.core, I = options.i18n, esc = options.escapeHtml;
    var animals = options.animals;
    var relevant = (options.records || []).filter(function (record) {
      return (!selectedId || record.animal_id === selectedId)
        && ['health', 'refusal', 'symptom'].indexOf(record.kind) >= 0;
    }).sort(function (a, b) {
      if (a.done_date !== b.done_date) return a.done_date < b.done_date ? 1 : -1;
      return String(a.created_at || '') < String(b.created_at || '') ? 1 : -1;
    }).slice(0, 12);
    if (!relevant.length) return '';

    return '<div class="pad"><div class="lbl">' + I.t('recentHealthRecords') + '</div><div class="tl">'
      + relevant.map(function (record) {
        var animal = animals.filter(function (row) { return row.id === record.animal_id; })[0];
        var info = C.kindInfo(record.kind);
        var label = record.kind === 'symptom' ? I.signName(record.detail) : I.kindName(record.kind);
        var detail = record.note || record.title || '';
        return '<div class="tlr"><span class="kind" style="color:' + info.color + '">'
          + '<i class="bi ' + info.icon + '" aria-hidden="true"></i>' + esc(label) + '</span>'
          + (!selectedId && animal ? '<span class="tlt"><b>' + esc(animal.name || I.t('unnamed')) + '</b></span>' : '')
          + (detail ? '<span class="tlt">' + esc(detail) + '</span>' : '')
          + '<span class="ldate">' + esc(I.formatDate(record.done_date, { month: 'short', day: 'numeric' })) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function render(options) {
    var C = options.core, I = options.i18n, esc = options.escapeHtml, icon = options.icon;
    var animals = options.animals || [];
    if (!animals.length) {
      return '<div class="pad"><div class="empty">' + icon('bi-heart-pulse')
        + I.t('healthNeedAnimal') + '</div></div>';
    }

    var selectedId = resolveAnimalId(animals, options.focus);
    if (!selectedId) {
      return recentRecords(options, '')
        + '<div class="pad"><div class="lbl">' + I.t('symptomObservation') + '</div>'
        + '<div class="hint">' + I.t('chooseAnimalForSigns') + '</div>'
        + '<div class="empty" style="margin-top:12px">' + icon('bi-arrow-up')
        + I.t('chooseAnimalAbove') + '</div></div>';
    }

    var animal = animals.filter(function (row) { return row.id === selectedId; })[0];
    var records = (options.records || []).filter(function (record) { return record.animal_id === selectedId; });
    var status = C.signStatus(records, options.today);
    var open = status.filter(function (sign) { return sign.open; });
    var closed = status.filter(function (sign) { return !sign.open; });
    var codes = C.signsFor(animal.species);
    var html = recentRecords(options, selectedId);

    if (open.length) {
      html += '<div class="sect"><h2>' + I.t('observing') + '</h2><span class="n">'
        + I.formatNumber(open.length) + '</span></div>';
      html += open.map(function (sign) {
        var info = C.SIGNS[sign.code] || {};
        return '<div class="signcard' + (info.vet ? ' vet' : '') + '"><div class="sgtop"><div class="sgname">'
          + esc(I.signName(sign.code)) + '</div><div class="sgdays">'
          + I.t('daysRunning', { count: I.formatNumber(sign.days) }) + '</div></div><div class="sgwhat">'
          + esc(I.signWhat(sign.code)) + '</div>'
          + (info.vet ? '<div class="sgvet">' + icon('bi-hospital') + I.t('vetRecommended') + '</div>' : '')
          + '<div class="sgfoot"><span>' + I.t('firstLastRecords', {
              first: I.formatDate(sign.first), last: I.formatDate(sign.last), count: I.formatNumber(sign.n)
            }) + '</span><span class="sgbtns"><button class="mini" data-sign="' + sign.code
          + '" data-sact="again">' + icon('bi-plus-lg') + I.t('againToday') + '</button>'
          + '<button class="mini" data-sign="' + sign.code + '" data-sact="end">'
          + icon('bi-check-lg') + I.t('resolved') + '</button></span></div></div>';
      }).join('');
    }

    html += '<div class="pad"><div class="lbl">' + I.t('recordSymptom') + '</div><div class="hint">'
      + esc(I.t('observationOnly', { name: animal.name || I.t('unnamed') })) + '</div><div class="signgrid">'
      + codes.map(function (code) {
          var info = C.SIGNS[code];
          var active = open.some(function (sign) { return sign.code === code; });
          return '<button class="sgpick' + (active ? ' on' : '') + '" data-sign="' + code + '" data-sact="new">'
            + esc(I.signName(code))
            + (info.vet ? '<i class="bi bi-hospital" aria-hidden="true" title="' + esc(I.t('vetAdviceTitle')) + '"></i>' : '')
            + '</button>';
        }).join('') + '</div><input class="in" id="sg_note" placeholder="'
      + esc(I.t('symptomMemoPlaceholder')) + '" style="margin-top:10px"></div>';

    if (closed.length) {
      html += '<div class="sect"><h2>' + I.t('resolvedSection') + '</h2><span class="n">'
        + I.formatNumber(closed.length) + '</span></div>';
      html += closed.map(function (sign) {
        return '<div class="card"><div class="info"><div class="nm">' + esc(I.signName(sign.code))
          + '<span class="chip">' + I.t('resolved') + '</span></div><div class="ms">'
          + I.formatDate(sign.first) + ' ~ ' + I.formatDate(sign.last) + ' · '
          + I.t('countTimes', { count: I.formatNumber(sign.n) }) + '</div></div><div class="acts">'
          + '<button class="mini" data-sign="' + sign.code + '" data-sact="again">'
          + icon('bi-plus-lg') + I.t('againToday') + '</button></div></div>';
      }).join('');
    }
    var calculator = (((C.SPECIES || {})[animal.species]) || {}).calc;
    html += '<div class="pad"><div class="lbl">' + I.t('morphRisks') + '</div>'
      + '<div class="hint">' + I.t('morphRisksHint') + '</div>'
      + (calculator ? '<a class="btn ghost wide" style="text-decoration:none;margin-top:10px" href="'
          + esc(I.calculatorUrl(calculator)) + '">' + icon('bi-calculator')
          + esc(I.t('openCalculator', { species: I.speciesName(animal.species) })) + '</a>'
        : '<div class="hint">' + I.t('noCalculator') + '</div>')
      + '<div class="safety">' + esc(I.t('safetyNote')) + '</div></div>';
    return html;
  }

  w.CareHealthUi = { resolveAnimalId: resolveAnimalId, recentRecords: recentRecords, render: render };
}(window));
