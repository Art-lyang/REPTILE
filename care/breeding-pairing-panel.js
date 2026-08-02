(function () {
  'use strict';

  // Imported browser drafts are sanitized again
  // and remain local until the breeder explicitly saves the pairing.

  window.createBreedingPairingPanel = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const D = deps.draft;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const CORES = deps.cores;
    const nameById = deps.nameById;
    const projectById = deps.projectById;
    const goalText = deps.goalText;
    const act = deps.act;
    const render = deps.render;
    const I18n = deps.i18n;

    function tabPair() {
      if (S.edit && S.edit.what === 'pair') return pairForm(S.edit.row);
      let h = '<button class="btn wide" data-new="pair" style="margin-bottom:14px">'
            + icon('bi-plus-lg') + esc(I18n.t('pairingCreate')) + '</button>';
      if (!S.pairs.length) {
        return h + '<div class="pad"><div class="empty">' + icon('bi-arrow-left-right')
          + I18n.html('pairingEmpty') + '</div></div>';
      }
      return h + S.pairs.map(p =>
        '<div class="card"><div class="info"><div class="nm">' + esc(p.name || I18n.t('unnamedPairing')) + '</div>'
        + '<div class="ms">' + esc(nameById(p.male)) + ' ♂ × ' + esc(nameById(p.female)) + ' ♀'
        + (p.target_morph ? '<br>' + I18n.html('pairingTarget', { target: p.target_morph }) : '')
        + (p.project_id ? '<br>🎯 ' + esc((projectById(p.project_id) || {}).name || '-') + ' · '
            + esc(goalText('projectStep')) + ' ' + esc(p.project_step || '-') : '')
        + (p.note ? '<br>' + esc(p.note) : '') + '</div></div>'
        + '<div class="acts"><button class="mini" data-edit="pair:' + p.id + '">'
        + icon('bi-pencil') + esc(I18n.t('edit')) + '</button></div></div>').join('');
    }

    function pairForm(p) {
      p = p || {};
      const calculation = normalizedCalculation(p.calculation || S.importDraft);
      const opt = (sel, filter) => '<option value="">' + esc(I18n.t('noSelection')) + '</option>'
        + S.animals.filter(filter).map(a => '<option value="' + a.id + '"'
          + (sel === a.id ? ' selected' : '') + '>' + esc(a.name || I18n.t('unnamed')) + '</option>').join('');
      return '<div class="pad"><div class="lbl">' + esc(I18n.t(p.id ? 'pairingEdit' : 'pairingCreate')) + '</div>'
        + calculationCard(calculation)
        + (p.project_id ? '<div class="note info"><i class="bi bi-bullseye" aria-hidden="true"></i><span><b>'
            + esc(goalText('pairingProject')) + '</b><br>' + esc((projectById(p.project_id) || {}).name || p.target_morph || '-')
            + ' · ' + esc(goalText('projectStep')) + ' ' + esc(p.project_step || 1) + '</span></div>' : '')
        + '<div class="lbl2"><label for="p_name">' + esc(I18n.t('pairingNameLabel')) + '</label></div>'
        + '<input class="in" id="p_name" value="' + esc(p.name || '') + '" placeholder="' + esc(I18n.t('pairingNamePlaceholder')) + '">'
        + '<div class="row2"><div><div class="lbl2">' + esc(I18n.t('pairingMaleLabel')) + '</div><select class="in" id="p_m" aria-label="' + esc(I18n.t('pairingMaleLabel')) + '">'
        + opt(p.male, a => a.sex !== 'female') + '</select></div>'
        + '<div><div class="lbl2">' + esc(I18n.t('pairingFemaleLabel')) + '</div><select class="in" id="p_f" aria-label="' + esc(I18n.t('pairingFemaleLabel')) + '">'
        + opt(p.female, a => a.sex !== 'male') + '</select></div></div>'
        + '<div class="hint">' + esc(I18n.t('pairingSexHint')) + '</div>'
        + '<div class="lbl2"><label for="p_target">' + esc(I18n.t('pairingTargetLabel')) + '</label></div>'
        + '<input class="in" id="p_target" value="' + esc(p.target_morph || '') + '" maxlength="120" placeholder="' + esc(I18n.t('pairingTargetPlaceholder')) + '">'
        + '<div class="lbl2"><label for="p_note">' + esc(I18n.t('pairingNoteLabel')) + '</label></div>'
        + '<textarea class="in" id="p_note" maxlength="1000">' + esc(p.note || '') + '</textarea>'
        + '<div class="err" id="p_err"></div><div class="formbtns"><button class="btn" id="p_save">'
        + icon('bi-check-lg') + esc(I18n.t('save')) + '</button><button class="btn ghost" data-cancel="1">' + esc(I18n.t('cancel')) + '</button>'
        + (p.id ? '<button class="btn danger" data-del="pair:' + p.id + '" style="margin-left:auto">'
          + icon('bi-trash3') + esc(I18n.t('delete')) + '</button>' : '') + '</div></div>';
    }

    function normalizedCalculation(value) {
      if (!value || !D) return null;
      try { return D.sanitize(value); } catch (e) { return null; }
    }

    function calculationCard(calculation) {
      if (!calculation) return '';
      const rows = calculation.results.slice(0, 5).map(r => {
        const pct = r.probability * 100;
        return '<div><b>' + (pct >= 9.95 ? pct.toFixed(0) : pct.toFixed(1)) + '%</b> '
          + esc(r.label) + '</div>';
      }).join('');
      const extra = calculation.results.length > 5
        ? '<div>' + esc(I18n.t('pairingExtraResults', { count: calculation.results.length - 5 })) + '</div>' : '';
      return '<div class="note info">' + icon('bi-calculator')
        + '<div><b>' + esc(I18n.t('pairingImportedTitle')) + '</b><div class="hint">'
        + esc(I18n.t('pairingParentA', { parent: calculation.parents.A.label })) + '<br>'
        + esc(I18n.t('pairingParentB', { parent: calculation.parents.B.label })) + '</div>'
        + rows + extra
        + '<div class="hint">' + esc(I18n.t('pairingImportedHint')) + '</div>'
        + '</div></div>';
    }

    function openCalculationAsPair(value) {
      const incoming = normalizedCalculation(value);
      if (!incoming || incoming.species !== S.species) return;
      S.importDraft = incoming;
      S.tab = 'pair';
      S.edit = { what: 'pair', row: {
        name: (incoming.parents.A.label + ' × ' + incoming.parents.B.label).slice(0, 120),
        species: incoming.species, calculation: incoming, calculated_at: incoming.calculatedAt
      } };
      try { history.replaceState(null, '', I18n.managementUrl(S.species, 'pair', { from: 'analysis' })); } catch (e) {}
      render();
    }

    function tabAnalysis() {
      if (!window.BreedingWorkspace) {
        return '<div class="pad"><div class="empty">' + esc(I18n.t('pairingAnalysisUnavailable')) + '</div></div>';
      }
      return BreedingWorkspace.html({
        species: S.species,
        language: I18n.language(),
        pairs: S.pairs,
        calculatorUrl: I18n.calculatorUrl(CORES[S.species].calc)
      });
    }

    function savePair() {
      const current = S.edit.row || {};
      const calculation = normalizedCalculation(current.calculation || S.importDraft);
      const row = Object.assign({}, S.edit.row || {}, {
        name: $('p_name').value.trim() || null,
        male: $('p_m').value || null, female: $('p_f').value || null,
        note: $('p_note').value.trim() || null,
        species: S.species,
        target_morph: $('p_target').value.trim() || null,
        project_id: current.project_id || null,
        project_step: current.project_id ? (current.project_step || 1) : null,
        calculation: calculation,
        calculated_at: calculation ? calculation.calculatedAt : (current.calculated_at || null)
      });
      return act(async () => {
        await A.saveRow('pairings', row);
        if (S.importDraft && D) D.clear();
        S.importDraft = null;
        S.edit = null;
      }, I18n.t('pairingSaved'));
    }

    return {
      tabPair: tabPair,
      tabAnalysis: tabAnalysis,
      normalizedCalculation: normalizedCalculation,
      openCalculationAsPair: openCalculationAsPair,
      savePair: savePair
    };
  };
})();
