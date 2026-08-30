(function (global) {
  'use strict';

  const Contract = global.BreedingProjectContract;

  function esc(value) { return Contract.escapeHtml(value); }

  function html(options) {
    const result = options.result;
    const t = options.text || {};
    if (!result || !result.supported) return '<div class="empty">' + esc(t.unsupported) + '</div>';
    const progress = options.progress;
    const names = new Map((options.animals || []).map(function (animal) {
      return [animal.id, animal.name || animal.id];
    }));
    const labels = { ready: t.resultReady, review: t.resultReview, insufficient: t.resultInsufficient };
    const actionKeys = { create_pairing: 'actionCreatePairing', reselect_parents: 'actionReselect',
      await_offspring: 'actionAwaitOffspring', select_next_pairing: 'actionSelectNext',
      complete_evaluations: 'actionEvaluate', continue_selection: 'actionContinue' };
    const selectedIds = new Set(progress.assessments.filter(function (item) { return item.status === 'selected'; })
      .map(function (item) { return item.animalId; }));
    const selectedNames = progress.offspring.filter(function (animal) { return selectedIds.has(animal.id); })
      .map(function (animal) { return animal.name || animal.id; });
    const candidates = result.candidates || [];
    return '<h3>' + esc(t.roadmap) + '</h3>'
      + (candidates.length ? '<div class="bg-candidates" role="list">' + candidates.slice(0, 6).map(function (pair) {
          const caution = pair.relationshipWarnings.length ? t.relationshipWarning
            : pair.reviewReasons.length ? t.missingInfo : '';
          const lineName = pair.status !== 'insufficient' && pair.lineOutcome && pair.lineOutcome.name
            ? '<p>' + esc(t.lineOutcome) + ': <strong>' + esc(pair.lineOutcome.name) + '</strong></p>' : '';
          const lineWarning = pair.status !== 'insufficient' && pair.lineOutcome && pair.lineOutcome.warning === 'line_reset'
            ? '<p>' + esc(t.lineResetWarning) + '</p>' : '';
          return '<article class="bg-candidate" data-bg-mobile-stack role="listitem"><div><span class="bg-state '
            + esc(pair.status) + '">' + esc(labels[pair.status] || t.resultInsufficient) + '</span><b>'
            + esc(names.get(pair.parentAId) || pair.parentAId) + ' × ' + esc(names.get(pair.parentBId) || pair.parentBId)
            + '</b>' + lineName + lineWarning + (caution ? '<p>' + esc(caution) + '</p>' : '') + '</div>'
            + (pair.status === 'insufficient' ? '' : '<button class="mini" data-bg-save-pairing data-parent-a="'
              + esc(pair.parentAId) + '" data-parent-b="' + esc(pair.parentBId) + '">' + esc(t.savePairing) + '</button>')
            + '</article>';
        }).join('') + '</div>' : '<div class="bw-empty">' + esc(t.noCandidates) + '</div>')
      + '<ol class="bg-roadmap"><li>' + esc(t.stepOne) + '</li><li>' + esc(t.stepTwo) + '</li><li>'
      + esc(t.stepThree) + '</li></ol><div class="note info"><b>' + esc(t.actualProgress) + '</b><span>'
      + esc(t[actionKeys[progress.nextAction]] || t.actionContinue)
      + (selectedNames.length ? '<br>' + esc(t.selectedOffspring) + ': ' + esc(selectedNames.join(', ')) : '')
      + '</span></div>';
  }

  global.BreedingGoalResults = Object.freeze({ html: html });
})(window);
