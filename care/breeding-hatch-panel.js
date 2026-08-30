(function () {
  'use strict';

  window.createBreedingHatchPanel = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const C = deps.core;
    const CarePhotos = deps.photos;
    const H = deps.hatchOutcomes;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const act = deps.act;
    const render = deps.render;
    const toast = deps.toast;
    const I18n = deps.i18n;
    const nameById = deps.nameById;

    function pairFor(clutch) {
      return S.pairs.filter(pair => pair.id === clutch.pairing)[0] || null;
    }

    function groupFor(pair) {
      return pair && pair.group_id
        ? S.groups.filter(group => group.id === pair.group_id)[0] || null : null;
    }

    function offspringFor(clutch) {
      return S.animals.filter(animal => animal.clutch_id === clutch.id);
    }

    function pairLabel(pair) {
      if (!pair) return I18n.t('hatchNoPair');
      const group = groupFor(pair);
      return group ? group.name + ' · ' + nameById(pair.female)
        : (pair.name || I18n.t('unnamedPairing'));
    }

    function statusText(status) {
      return I18n.t({
        incubating: 'hatchStatusIncubating', partially_hatched: 'hatchStatusPartial',
        hatched: 'hatchStatusHatched', failed: 'hatchStatusFailed', closed: 'hatchStatusClosed'
      }[status] || 'hatchStatusIncubating');
    }

    function summaryCard(clutch) {
      const summary = H.summary(clutch, offspringFor(clutch).length);
      const total = Math.max(1, summary.eggCount);
      const segments = [
        ['fertile', Number(clutch.fertile_count) || 0],
        ['infertile', Number(clutch.infertile_count) || 0],
        ['stopped', Number(clutch.stopped_count) || 0],
        ['hatched', summary.hatchedCount], ['unknown', summary.unknownCount]
      ].filter(item => item[1] > 0).map(item => '<span class="' + item[0]
        + '" style="width:' + Math.min(100, item[1] / total * 100) + '%"></span>').join('');
      return '<div class="hatch-summary"><div class="hatch-summary-head"><span class="hatch-status '
        + esc(summary.status) + '">' + esc(statusText(summary.status)) + '</span><span>'
        + esc(I18n.t('hatchRegistered', { registered: summary.registeredCount, hatched: summary.hatchedCount }))
        + '</span></div><div class="hatch-progress" aria-hidden="true">' + segments + '</div>'
        + '<div class="hatch-summary-foot"><span>' + esc(I18n.t('hatchKnown', {
          known: summary.knownCount, total: summary.eggCount })) + '</span><button class="mini" data-hatch="'
        + esc(clutch.id) + '">' + icon('bi-egg-fried') + esc(I18n.t('hatchManage')) + '</button></div></div>';
    }

    function countField(id, key, value) {
      return '<label class="hatch-count ' + id + '" for="h_' + id + '"><span>'
        + esc(I18n.t(key)) + '</span><input id="h_' + id
        + '" data-hatch-preview type="number" min="0" max="99" inputmode="numeric" value="'
        + esc(value == null ? 0 : value) + '"></label>';
    }

    function timeline(clutch, pair, offspring) {
      const items = [];
      S.matingEvents.filter(event => pair && event.pairing_id === pair.id).forEach(event => {
        const resultKey = { introduced: 'matingResultIntroduced', courtship: 'matingResultCourtship',
          copulation: 'matingResultCopulation', no_copulation: 'matingResultNoCopulation',
          separated: 'matingResultSeparated', unknown: 'matingResultUnknown' }[event.result] || 'matingResultUnknown';
        items.push({ date: event.occurred_on, icon: 'bi-hearts', title: I18n.t('hatchTimelineMating'),
          detail: I18n.t(resultKey) });
      });
      if (clutch.laid_date) items.push({ date: clutch.laid_date, icon: 'bi-egg', title: I18n.t('hatchTimelineLaid'),
        detail: I18n.t('clutchEggCount', { count: clutch.egg_count || 0 }) });
      if (clutch.expected_hatch) items.push({ date: clutch.expected_hatch, icon: 'bi-calendar-event',
        title: I18n.t('hatchTimelineExpected'), detail: '' });
      if (clutch.actual_hatch_date) items.push({ date: clutch.actual_hatch_date, icon: 'bi-stars',
        title: I18n.t('hatchTimelineHatched'), detail: I18n.t('hatchCount', { count: clutch.hatched_count || 0 }) });
      offspring.forEach(animal => items.push({ date: animal.hatch_date, icon: 'bi-heart-fill',
        title: I18n.t('hatchTimelineOffspring'), detail: animal.name || I18n.t('unnamed') }));
      items.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      return '<div class="hatch-timeline">' + items.map(item => '<div class="hatch-time-item"><span class="hatch-time-dot">'
        + icon(item.icon) + '</span><time>' + esc(item.date ? I18n.formatDate(item.date) : '-') + '</time><div><b>'
        + esc(item.title) + '</b>' + (item.detail ? '<small>' + esc(item.detail) + '</small>' : '')
        + '</div></div>').join('') + '</div>';
    }

    function form(clutch) {
      const pair = pairFor(clutch);
      const group = groupFor(pair);
      const offspring = offspringFor(clutch);
      const summary = H.summary(clutch, offspring.length);
      return '<div class="hatch-sheet"><div class="hatch-hero"><div><span class="hatch-eyebrow">'
        + esc(I18n.t('hatchOutcomeTitle')) + '</span><h2>' + esc(pairLabel(pair)) + '</h2><p>'
        + esc(I18n.t('hatchOutcomeIntro')) + '</p></div><span class="hatch-status ' + esc(summary.status) + '">'
        + esc(statusText(summary.status)) + '</span></div><section class="hatch-section"><h3>'
        + esc(I18n.t('hatchEggStatus')) + '</h3><div class="hatch-count-grid">'
        + countField('fertile', 'hatchFertile', clutch.fertile_count)
        + countField('infertile', 'hatchInfertile', clutch.infertile_count)
        + countField('stopped', 'hatchStopped', clutch.stopped_count)
        + countField('hatched', 'hatchHatched', clutch.hatched_count)
        + '</div><div class="hatch-unknown"><span>' + esc(I18n.t('hatchUnknown')) + '</span><strong id="h_unknown">'
        + summary.unknownCount + '</strong><small>' + esc(I18n.t('hatchTotalEggs', { count: summary.eggCount }))
        + '</small></div><div class="lbl2"><label for="h_date">' + esc(I18n.t('hatchActualDate'))
        + '</label></div>'
        + DateField.html({ id: 'h_date', value: clutch.actual_hatch_date || '', max: C.today(),
                           attrs: 'data-hatch-preview' })
        + '<label class="hatch-close"><input id="h_closed"'
        + ' type="checkbox" data-hatch-preview' + (clutch.outcome_closed ? ' checked' : '') + '><span><b>'
        + esc(I18n.t('hatchClosed')) + '</b><small>' + esc(I18n.t('hatchClosedHint'))
        + '</small></span></label><div class="err" id="h_err"></div><div class="formbtns"><button class="btn" id="h_save">'
        + icon('bi-check-lg') + esc(I18n.t('hatchSave')) + '</button><button class="btn ghost" data-cancel="1">'
        + esc(I18n.t('cancel')) + '</button></div></section><section class="hatch-section"><div class="hatch-section-head"><div><h3>'
        + esc(I18n.t('hatchOffspringTitle')) + '</h3><p>' + esc(I18n.t('hatchRegistrationRemaining', {
          count: summary.registrationRemaining })) + '</p></div><button class="btn" data-register-offspring="' + esc(clutch.id) + '"'
        + (!pair || summary.registrationRemaining < 1 ? ' disabled' : '') + '>' + icon('bi-plus-lg')
        + esc(I18n.t('hatchRegister')) + '</button></div>'
        + (pair && pair.project_id ? '<div class="hatch-project">' + icon('bi-diagram-3')
          + esc(I18n.t('hatchProjectAuto')) + '</div>' : '')
        + (offspring.length ? '<div class="hatch-offspring">' + offspring.map(animal => '<a href="animal.html?id='
          + encodeURIComponent(animal.id) + '"><span>' + (animal.photo_url ? deps.photo.tag(animal.photo_url, animal.name || '') : '🦎')
          + '</span><b>' + esc(animal.name || I18n.t('unnamed')) + '</b><small>'
          + esc(animal.hatch_date ? I18n.formatDate(animal.hatch_date) : '-') + '</small></a>').join('') + '</div>'
          : '<div class="empty compact">' + esc(I18n.t('hatchNoOffspring')) + '</div>')
        + '</section><section class="hatch-section"><h3>' + esc(I18n.t('hatchTimeline')) + '</h3>'
        + timeline(clutch, pair, offspring) + '</section></div>';
    }

    function currentInput(clutch) {
      return H.normalize({ eggCount: clutch.egg_count, fertile: $('h_fertile').value,
        infertile: $('h_infertile').value, stopped: $('h_stopped').value, hatched: $('h_hatched').value,
        actualHatchDate: $('h_date').value || null, laidDate: clutch.laid_date,
        closed: $('h_closed').checked });
    }

    function refreshPreview() {
      if (!S.edit || S.edit.what !== 'hatch') return;
      const result = currentInput(S.edit.row);
      $('h_unknown').textContent = result.ok ? result.value.unknown_count : '–';
    }

    function save() {
      const clutch = S.edit.row;
      const result = currentInput(clutch);
      if (!result.ok) {
        $('h_err').textContent = I18n.t(result.error === 'count' ? 'hatchCountError' : 'hatchDateError');
        return;
      }
      const payload = Object.assign({}, result.value);
      delete payload.unknown_count;
      delete payload.outcome_status;
      return act(async () => { await A.saveClutchOutcome(clutch.id, payload); S.edit = null; }, I18n.t('hatchSaved'));
    }

    function beginOffspring(clutchId) {
      const clutch = S.clutches.filter(item => item.id === clutchId)[0];
      const pair = pairFor(clutch || {});
      if (!clutch || !pair) return toast(I18n.t('hatchNoPair'));
      const offspring = offspringFor(clutch);
      const summary = H.summary(clutch, offspring.length);
      if (summary.registrationRemaining < 1) return toast(I18n.t('hatchRegisterLimit'));
      const draft = H.offspringDraft({ clutch, pairing: pair, group: groupFor(pair), nextNumber: offspring.length + 1 });
      S.tab = 'animals';
      S.edit = { what: 'animal', row: draft };
      CarePhotos.begin(draft, A);
      try { history.replaceState(null, '', I18n.managementUrl(S.species, 'animals')); } catch (error) {}
      render();
    }

    return { summaryCard, form, save, beginOffspring, refreshPreview };
  };
})();
