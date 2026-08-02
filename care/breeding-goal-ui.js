(function () {
  'use strict';

  const Contract = window.BreedingProjectContract;
  let current = {};

  function locale() {
    const raw = String((document.documentElement && document.documentElement.lang) || 'ko').toLowerCase();
    if (raw.indexOf('zh') === 0) return 'zh';
    if (raw.indexOf('ja') === 0) return 'ja';
    if (raw.indexOf('en') === 0) return 'en';
    return 'ko';
  }

  function text() {
    const dictionary = window.BreedingGoalText || {};
    return dictionary[locale()] || dictionary.ko || {};
  }

  function esc(value) { return Contract.escapeHtml(value); }

  function safeProjects(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(function (safe, row) {
      try { safe.push(Contract.sanitizeProject(row)); } catch (error) {}
      return safe;
    }, []);
  }

  function statusLabel(status, t) {
    return t['status' + status.charAt(0).toUpperCase() + status.slice(1)] || status;
  }

  function formattedDate(value) {
    if (!value) return '';
    try {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? ''
        : new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(date);
    } catch (error) { return ''; }
  }

  function traitOptions(selected) {
    const t = text();
    return '<option value="">' + esc(t.selectTrait) + '</option>'
      + (current.traits || []).map(function (trait) {
        return '<option value="' + esc(trait[0]) + '"' + (trait[0] === selected ? ' selected' : '') + '>'
          + esc(trait[1]) + '</option>';
      }).join('');
  }

  function scoreOptions(selected) {
    return [1, 2, 3, 4, 5].map(function (score) {
      return '<option value="' + score + '"' + (score === selected ? ' selected' : '') + '>'
        + score + ' / 5</option>';
    }).join('');
  }

  function projectCards() {
    const t = text();
    const projects = safeProjects(current.projects);
    if (!projects.length) return '<div class="bw-empty">' + esc(t.noProjects) + '</div>';
    return '<div class="bg-project-list" role="list">' + projects.map(function (project) {
      const mode = project.target.mode === 'cross' ? t.modeCross : t.modeLineFix;
      const updated = formattedDate(project.updated_at);
      return '<article class="bg-project" role="listitem" data-bg-project="' + esc(project.id) + '">'
        + '<div><span class="bg-state">' + esc(statusLabel(project.status, t)) + '</span>'
        + '<h4>' + esc(project.name) + '</h4><p>' + esc(mode) + (updated ? ' · ' + esc(updated) : '') + '</p></div>'
        + '<div class="bg-project-actions"><select class="in" data-bg-status aria-label="' + esc(statusLabel(project.status, t)) + '">'
        + ['draft', 'active', 'complete', 'archived'].map(function (status) {
          return '<option value="' + status + '"' + (status === project.status ? ' selected' : '') + '>'
            + esc(statusLabel(status, t)) + '</option>';
        }).join('') + '</select><button class="mini" data-bg-analyze>' + esc(t.analyze) + '</button>'
        + '<button class="mini" data-bg-delete>' + esc(t.deleteProject) + '</button></div></article>';
    }).join('') + '</div>';
  }

  function linePanel() {
    const t = text();
    if (!current.supported) {
      return '<div class="bg-line" id="bg-line-panel" role="tabpanel"><div class="empty">'
        + esc(t.unsupported) + '</div></div>';
    }
    return '<div class="bg-line" id="bg-line-panel" role="tabpanel">'
      + '<div class="bg-create" data-bg-mobile-stack><div><label for="bg-name">' + esc(t.projectName) + '</label>'
      + '<input class="in" id="bg-name" maxlength="120" placeholder="' + esc(t.namePlaceholder) + '"></div>'
      + '<div><label for="bg-kind">' + esc(t.modeLine) + '</label><select class="in" id="bg-kind">'
      + '<option value="line_fix">' + esc(t.modeLineFix) + '</option><option value="cross">' + esc(t.modeCross) + '</option>'
      + '</select></div><div class="bg-target"><label for="bg-trait-a">' + esc(t.targetTrait) + '</label>'
      + '<select class="in" id="bg-trait-a">' + traitOptions('') + '</select><label for="bg-score-a">' + esc(t.targetScore) + '</label>'
      + '<select class="in" id="bg-score-a">' + scoreOptions(3) + '</select></div>'
      + '<div class="bg-target" id="bg-target-b" hidden><label for="bg-trait-b">' + esc(t.targetTrait) + '</label>'
      + '<select class="in" id="bg-trait-b">' + traitOptions('') + '</select><label for="bg-score-b">' + esc(t.targetScore) + '</label>'
      + '<select class="in" id="bg-score-b">' + scoreOptions(3) + '</select></div>'
      + '<p class="hint">' + esc(t.observed) + '</p><button class="btn" data-bg-create>' + esc(t.createProject) + '</button>'
      + '<div class="err" data-bg-error role="status" aria-live="polite"></div></div>'
      + '<section class="bg-projects"><h3>' + esc(t.projectList) + '</h3>' + projectCards() + '</section>'
      + '<section class="bg-result" data-bg-result role="status" aria-live="polite"></section></div>';
  }

  function html(options) {
    current = Object.assign({}, options || {});
    current.projects = safeProjects(current.projects);
    current.supported = !!(window.LineBreedingPlanner
      && typeof window.LineBreedingPlanner.supportsSpecies === 'function'
      && window.LineBreedingPlanner.supportsSpecies(current.species)
      && Array.isArray(current.traits) && current.traits.length > 0);
    const t = text();
    const line = current.mode === 'line';
    return '<div class="bg-goal"><div class="bg-modes" role="tablist">'
      + '<button role="tab" data-goal-mode="genetic" aria-selected="' + (!line) + '">' + esc(t.modeGenetic) + '</button>'
      + '<button role="tab" data-goal-mode="line" aria-selected="' + line + '">' + esc(t.modeLine) + '</button></div>'
      + '<div class="bg-genetic" id="bg-genetic-panel" role="tabpanel"' + (line ? ' hidden' : '') + '>'
      + (current.geneticHtml || '') + '</div><div class="bg-line-host"' + (line ? '' : ' hidden') + '>' + linePanel() + '</div></div>';
  }

  function projectByElement(element) {
    const card = element.closest('[data-bg-project]');
    const id = card && card.dataset.bgProject;
    return safeProjects(current.projects).find(project => project.id === id);
  }

  function renderRoadmap(project, root) {
    const t = text();
    const output = root.querySelector('[data-bg-result]');
    let result;
    try { result = window.LineBreedingPlanner.roadmap({ project: project, animals: current.animals || [] }); }
    catch (error) { output.innerHTML = '<div class="note warn">' + esc(t.missingInfo) + '</div>'; return; }
    if (!result.supported) { output.innerHTML = '<div class="empty">' + esc(t.unsupported) + '</div>'; return; }
    const names = new Map((current.animals || []).map(animal => [animal.id, animal.name || animal.id]));
    const labels = { ready: t.resultReady, review: t.resultReview, insufficient: t.resultInsufficient };
    const candidates = result.candidates || [];
    const progress = window.BreedingProjectFlow.projectState(project, current.pairings || [], current.animals || []);
    const actionKeys = { create_pairing: 'actionCreatePairing', reselect_parents: 'actionReselect',
      await_offspring: 'actionAwaitOffspring', select_next_pairing: 'actionSelectNext',
      complete_evaluations: 'actionEvaluate', continue_selection: 'actionContinue' };
    const selectedIds = new Set(progress.assessments.filter(item => item.status === 'selected')
      .map(item => item.animalId));
    const selectedNames = progress.offspring.filter(animal => selectedIds.has(animal.id))
      .map(animal => animal.name || animal.id);
    current.activeProject = project;
    output.innerHTML = '<h3>' + esc(t.roadmap) + '</h3>'
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

  function switchMode(root, mode, handlers) {
    root.querySelectorAll('[data-goal-mode]').forEach(function (tab) {
      tab.setAttribute('aria-selected', String(tab.dataset.goalMode === mode));
    });
    root.querySelector('.bg-genetic').hidden = mode !== 'genetic';
    root.querySelector('.bg-line-host').hidden = mode !== 'line';
    current.mode = mode;
    if (handlers.onModeChange) handlers.onModeChange(mode);
  }

  function bind(root, handlers) {
    const host = root.querySelector('.bg-goal');
    if (!host) return;
    host.addEventListener('click', async function (event) {
      const tab = event.target.closest('[data-goal-mode]');
      if (tab) { switchMode(host, tab.dataset.goalMode, handlers); return; }
      if (event.target.closest('[data-bg-create]')) {
        const mode = host.querySelector('#bg-kind').value;
        const traits = [{ id: host.querySelector('#bg-trait-a').value,
          targetScore: Number(host.querySelector('#bg-score-a').value) }];
        if (mode === 'cross') traits.push({ id: host.querySelector('#bg-trait-b').value,
          targetScore: Number(host.querySelector('#bg-score-b').value) });
        try {
          const project = Contract.sanitizeProject({ species: current.species,
            name: host.querySelector('#bg-name').value, target: { version: 1, mode: mode, traits: traits }, status: 'active' });
          await handlers.createProject(project);
        } catch (error) { host.querySelector('[data-bg-error]').textContent = text().missingInfo; }
        return;
      }
      const analyze = event.target.closest('[data-bg-analyze]');
      if (analyze) { renderRoadmap(projectByElement(analyze), host); return; }
      const savePairing = event.target.closest('[data-bg-save-pairing]');
      if (savePairing) {
        await handlers.pairCandidate(current.activeProject, {
          parentAId: savePairing.dataset.parentA, parentBId: savePairing.dataset.parentB });
        return;
      }
      const remove = event.target.closest('[data-bg-delete]');
      if (remove && confirm(text().deleteProject + '?')) await handlers.deleteProject(projectByElement(remove));
    });
    host.addEventListener('change', async function (event) {
      if (event.target.id === 'bg-kind') {
        host.querySelector('#bg-target-b').hidden = event.target.value !== 'cross';
        return;
      }
      if (event.target.matches('[data-bg-status]')) {
        const project = projectByElement(event.target);
        try { await handlers.updateProject(project, { status: event.target.value }); }
        catch (error) { host.querySelector('[data-bg-error]').textContent = text().conflictReload; }
      }
    });
    host.querySelector('.bg-modes').addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const next = current.mode === 'line' ? 'genetic' : 'line';
      switchMode(host, next, handlers);
      host.querySelector('[data-goal-mode="' + next + '"]').focus();
    });
  }

  window.BreedingGoalUI = Object.freeze({ html: html, render: html, bind: bind,
    t: function (key) { return text()[key] || key; } });
}());
