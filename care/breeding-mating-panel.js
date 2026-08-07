(function () {
  'use strict';

  window.createBreedingMatingPanel = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const C = deps.core;
    const G = deps.matingGroups;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const act = deps.act;
    const I18n = deps.i18n;
    const nameById = deps.nameById;
    const projectById = deps.projectById;
    const pairingPanel = deps.pairingPanel;

    const RESULTS = ['introduced', 'courtship', 'copulation', 'no_copulation', 'separated', 'unknown'];
    const STATUSES = ['planning', 'active', 'paused', 'closed'];
    const STATUS_KEYS = { planning: 'matingStatusPlanning', active: 'matingStatusActive',
      paused: 'matingStatusPaused', closed: 'matingStatusClosed' };
    const RESULT_KEYS = { introduced: 'matingResultIntroduced', courtship: 'matingResultCourtship',
      copulation: 'matingResultCopulation', no_copulation: 'matingResultNoCopulation',
      separated: 'matingResultSeparated', unknown: 'matingResultUnknown' };
    const WARNING_KEYS = { direct_ancestor: 'matingWarningDirectAncestor', shared_parent: 'matingWarningSharedParent',
      shared_grandparent: 'matingWarningSharedGrandparent', shared_ancestor: 'matingWarningSharedAncestor',
      pedigree_cycle: 'matingWarningPedigreeCycle', pedigree_incomplete: 'matingWarningPedigreeIncomplete' };

    function selected(value, expected) { return value === expected ? ' selected' : ''; }
    function checked(values, value) { return values.includes(value) ? ' checked' : ''; }
    function groupById(id) { return S.groups.filter(group => group.id === id)[0] || null; }
    function eventsFor(groupId) { return S.matingEvents.filter(event => event.group_id === groupId); }
    function roster(groupId) {
      return G.lineageRoster({ groupId, pairings: S.pairs, animals: S.animals,
        planner: window.LineBreedingPlanner, generations: 3 });
    }

    function tabMating() {
      if (S.edit && S.edit.what === 'group') return groupForm(S.edit.row);
      if (S.edit && S.edit.what === 'event') return eventForm(S.edit.row);
      if (S.edit && S.edit.what === 'pair') return pairingPanel.pairForm(S.edit.row);
      let html = '<div class="mating-hero"><div><div class="lbl">' + esc(I18n.t('matingGroupCreate'))
        + '</div><p>' + esc(I18n.t('matingGroupIntro')) + '</p></div><button class="btn" data-new="group">'
        + icon('bi-diagram-3') + esc(I18n.t('matingGroupCreate')) + '</button></div>';
      html += S.groups.length ? S.groups.map(groupCard).join('')
        : '<div class="pad"><div class="empty">' + icon('bi-diagram-3') + esc(I18n.t('matingGroupEmpty')) + '</div></div>';
      html += '<section class="mating-legacy"><div class="lbl">' + esc(I18n.t('matingLegacyPairings')) + '</div>'
        + pairingPanel.tabPair({ ungroupedOnly: true }) + '</section>';
      return html;
    }

    function groupCard(group) {
      const members = roster(group.id);
      const events = eventsFor(group.id).slice(0, 4);
      const project = projectById(group.project_id);
      return '<article class="mating-card"><div class="mating-card-head"><div><span class="mating-status '
        + esc(group.status || 'active') + '">' + esc(I18n.t(STATUS_KEYS[group.status] || STATUS_KEYS.active))
        + '</span><h2>' + esc(group.name) + '</h2><p>' + esc(nameById(group.male)) + ' ♂ · '
        + esc(I18n.t('matingRatio', { count: members.length })) + '</p></div><div class="acts">'
        + '<button class="mini" data-new-event="' + group.id + '">' + icon('bi-calendar-heart')
        + esc(I18n.t('matingEventAdd')) + '</button><button class="mini" data-edit="group:' + group.id + '">'
        + icon('bi-pencil') + esc(I18n.t('edit')) + '</button></div></div>'
        + '<div class="mating-meta">' + (group.start_date ? '<span>' + icon('bi-calendar3') + esc(I18n.formatDate(group.start_date))
          + (group.end_date ? ' – ' + esc(I18n.formatDate(group.end_date)) : '') + '</span>' : '')
        + (group.target_morph ? '<span>' + icon('bi-bullseye') + esc(group.target_morph) + '</span>' : '')
        + (project ? '<span>' + icon('bi-signpost-split') + esc(project.name) + '</span>' : '') + '</div>'
        + '<div class="mating-roster">' + members.map(memberRow).join('') + '</div>'
        + '<div class="mating-events"><strong>' + esc(I18n.t('matingRecentEvents')) + '</strong>'
        + (events.length ? events.map(eventRow).join('') : '<p class="hint">' + esc(I18n.t('matingNoEvents')) + '</p>')
        + '</div></article>';
    }

    function memberRow(member) {
      const key = member.level === 'review' ? 'matingLineageReview'
        : member.level === 'incomplete' ? 'matingLineageIncomplete' : 'matingLineageClear';
      const warnings = member.warningCodes.map(code => I18n.t(WARNING_KEYS[code] || 'matingLineageReview')).join(' · ');
      return '<div class="mating-member"><span class="mating-avatar">♀</span><div><b>'
        + esc(member.femaleName || nameById(member.femaleId)) + '</b><small>' + esc(I18n.t(key))
        + (warnings ? ' · ' + esc(warnings) : '') + '</small></div><span class="lineage-dot ' + member.level
        + '" title="' + esc(I18n.t(key)) + '"></span></div>';
    }

    function eventRow(event) {
      const pairing = S.pairs.filter(pair => pair.id === event.pairing_id)[0];
      return '<button class="mating-event" data-edit="event:' + event.id + '"><time>'
        + esc(I18n.formatDate(event.occurred_on)) + '</time><span>' + esc(pairing ? nameById(pairing.female) : '-')
        + ' · ' + esc(I18n.t(RESULT_KEYS[event.result] || RESULT_KEYS.unknown)) + '</span>'
        + icon('bi-chevron-right') + '</button>';
    }

    function groupForm(group) {
      group = group || {};
      const memberIds = G.members(group.id, S.pairs, S.animals).map(member => member.femaleId);
      const candidates = G.candidates(S.animals, S.species);
      const maleOptions = candidates.males.map(id => '<option value="' + id + '"'
        + selected(group.male, id) + '>' + esc(nameById(id)) + '</option>').join('');
      const females = candidates.females.map(id => '<label class="mating-check"><input type="checkbox" name="group_female" value="'
        + id + '"' + checked(memberIds, id) + '><span>♀ ' + esc(nameById(id)) + '</span></label>').join('');
      const projectOptions = S.projects.map(project => '<option value="' + project.id + '"'
        + selected(group.project_id, project.id) + '>' + esc(project.name) + '</option>').join('');
      return '<div class="pad mating-form"><div class="lbl">' + esc(I18n.t(group.id ? 'matingGroupEdit' : 'matingGroupCreate'))
        + '</div><div class="note info">' + icon('bi-diagram-3') + '<span>' + esc(I18n.t('matingGroupIntro')) + '</span></div>'
        + field('g_name', 'matingGroupNameLabel', '<input class="in" id="g_name" maxlength="120" value="'
          + esc(group.name || '') + '" placeholder="' + esc(I18n.t('matingGroupNamePlaceholder')) + '">')
        + field('g_male', 'matingGroupMaleLabel', '<select class="in" id="g_male"' + (group.id ? ' disabled' : '')
          + '><option value="">' + esc(I18n.t('noSelection')) + '</option>' + maleOptions + '</select>')
        + '<fieldset class="mating-fieldset"><legend>' + esc(I18n.t('matingGroupFemalesLabel')) + '</legend><div class="mating-checks">'
        + females + '</div><p class="hint">' + esc(I18n.t('matingGroupFemaleHint')) + '</p></fieldset>'
        + '<div class="row2">'
        + field('g_start', 'matingGroupStartLabel',
                DateField.html({ id: 'g_start', value: group.start_date || C.today() }))
        + field('g_end', 'matingGroupEndLabel',
                DateField.html({ id: 'g_end', value: group.end_date || '' }))
        + '</div>'
        + '<div class="row2">' + field('g_status', 'matingGroupStatusLabel', '<select class="in" id="g_status">'
          + STATUSES.map(status => '<option value="' + status + '"' + selected(group.status || 'active', status) + '>'
            + esc(I18n.t(STATUS_KEYS[status])) + '</option>').join('') + '</select>')
        + field('g_project', 'matingGroupProjectLabel', '<select class="in" id="g_project"><option value="">'
          + esc(I18n.t('matingGroupNoProject')) + '</option>' + projectOptions + '</select>') + '</div>'
        + field('g_target', 'matingGroupTargetLabel', '<input class="in" id="g_target" maxlength="120" value="'
          + esc(group.target_morph || '') + '">')
        + field('g_note', 'matingGroupNoteLabel', '<textarea class="in" id="g_note" maxlength="1000">'
          + esc(group.note || '') + '</textarea>')
        + '<div class="err" id="g_err"></div><div class="formbtns"><button class="btn" id="g_save">'
        + icon('bi-check-lg') + esc(I18n.t('save')) + '</button><button class="btn ghost" data-cancel="1">'
        + esc(I18n.t('cancel')) + '</button></div></div>';
    }

    function eventForm(event) {
      event = event || {};
      const group = groupById(event.group_id);
      const members = G.members(group && group.id, S.pairs, S.animals);
      return '<div class="pad mating-form"><div class="lbl">' + esc(I18n.t(event.id ? 'matingEventEdit' : 'matingEventAdd'))
        + '</div><div class="note info">' + icon('bi-diagram-3') + '<span><b>' + esc(group ? group.name : '-')
        + '</b><br>' + esc(group ? nameById(group.male) : '-') + ' ♂</span></div>'
        + field('e_date', 'matingEventDateLabel',
                DateField.html({ id: 'e_date', value: event.occurred_on || C.today(), max: C.today() }))
        + field('e_pair', 'matingEventFemaleLabel', '<select class="in" id="e_pair">'
          + members.map(member => '<option value="' + member.pairingId + '"' + selected(event.pairing_id, member.pairingId)
            + '>' + esc(member.femaleName || nameById(member.femaleId)) + '</option>').join('') + '</select>')
        + field('e_result', 'matingEventResultLabel', '<select class="in" id="e_result">'
          + RESULTS.map(result => '<option value="' + result + '"' + selected(event.result || 'introduced', result) + '>'
            + esc(I18n.t(RESULT_KEYS[result])) + '</option>').join('') + '</select>')
        + field('e_note', 'matingEventNoteLabel', '<textarea class="in" id="e_note" maxlength="1000">'
          + esc(event.note || '') + '</textarea>')
        + '<div class="err" id="e_err"></div><div class="formbtns"><button class="btn" id="e_save">'
        + icon('bi-check-lg') + esc(I18n.t('save')) + '</button><button class="btn ghost" data-cancel="1">'
        + esc(I18n.t('cancel')) + '</button>' + (event.id ? '<button class="btn danger" data-del="event:' + event.id
          + '" style="margin-left:auto">' + icon('bi-trash3') + esc(I18n.t('delete')) + '</button>' : '') + '</div></div>';
    }

    function field(id, labelKey, control) {
      return '<div><div class="lbl2"><label for="' + id + '">' + esc(I18n.t(labelKey)) + '</label></div>' + control + '</div>';
    }

    function saveGroup() {
      const current = S.edit.row || {};
      const femaleIds = Array.from(document.querySelectorAll('input[name="group_female"]:checked')).map(input => input.value);
      const normalized = G.normalize({ species: S.species, maleId: $('g_male').value || current.male,
        femaleIds, name: $('g_name').value }, S.animals);
      if (!normalized.ok) {
        $('g_err').textContent = I18n.t(normalized.error === 'female_required'
          ? 'matingGroupFemaleRequired' : normalized.error === 'name' ? 'animalNameRequired' : 'matingGroupAdultRequired');
        return;
      }
      const projectId = $('g_project').value || null;
      const payload = { id: current.id || null, species: S.species, name: normalized.value.name,
        male: normalized.value.maleId, status: $('g_status').value, start_date: $('g_start').value || null,
        end_date: $('g_end').value || null, target_morph: $('g_target').value.trim() || null,
        project_id: projectId, project_step: projectId ? (current.project_step || 1) : null,
        note: $('g_note').value.trim() || null };
      return act(async () => { await A.saveMatingGroup(payload, normalized.value.femaleIds); S.edit = null; }, I18n.t('matingGroupSaved'));
    }

    function saveEvent() {
      const current = S.edit.row || {};
      const pair = S.pairs.filter(item => item.id === $('e_pair').value)[0];
      if (!pair || pair.group_id !== current.group_id || !$('e_date').value || $('e_date').value > C.today()) {
        $('e_err').textContent = I18n.t('errorMating');
        return;
      }
      const payload = { id: current.id, group_id: current.group_id, pairing_id: pair.id,
        occurred_on: $('e_date').value, result: $('e_result').value, note: $('e_note').value.trim() || null };
      return act(async () => { await A.saveMatingEvent(payload); S.edit = null; }, I18n.t('matingEventSaved'));
    }

    return { tabMating, saveGroup, saveEvent };
  };
}());
