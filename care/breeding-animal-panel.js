(function () {
  'use strict';

  // Photo prepare/save/rollback/commit order prevents abandoned uploads after save failures.
  // Line-trait scores are observed 1–5 values, never genetic probabilities.

  window.createBreedingAnimalPanel = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const C = deps.core;
    const CarePhotos = deps.photos;
    const LineTraitScores = deps.lineTraitScores;
    const Photo = deps.photo;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const nameById = deps.nameById;
    const otherNote = deps.otherNote;
    const act = deps.act;
    const breedSpec = deps.breedSpec;
    const I18n = deps.i18n;
    const LifeStage = deps.lifeStage;

    function legacyNote() { return ''; }

    function tabAnimals() {
      if (S.edit && S.edit.what === 'animal') return animalForm(S.edit.row);
      let h = '<button class="btn wide" data-new="animal" style="margin-bottom:14px">'
            + icon('bi-plus-lg') + I18n.t('animalCreate') + '</button>' + otherNote() + legacyNote();
      if (!S.animals.length) {
        return h + '<div class="pad"><div class="empty">' + icon('bi-heart')
          + I18n.html('animalEmpty', { species: I18n.speciesName(S.species) }) + '</div></div>';
      }
      return h + S.animals.map(animalCard).join('');
    }

    function animalCard(a) {
      const B = breedSpec();
      const vis = (a.morphs || []).map(t => B.morphName(t));
      const het = (a.hets || []).map(t => B.morphName(t));
      const combo = B.comboName(a.morphs || []);
      const selectedLineTraits = B.traitOptions().filter(t => (a.morphs || []).includes(t[0]));
      const lineScores = LineTraitScores.forAnimal(a, selectedLineTraits.map(t => t[0]));
      const scoreText = selectedLineTraits.filter(t => lineScores[t[0]])
        .map(t => esc(t[1]) + ' ' + lineScores[t[0]] + '/5').join(' · ');
      const sex = a.sex === 'male' ? '<span class="chip">' + icon('bi-gender-male chip-sex') + esc(I18n.t('animalMale')) + '</span>'
                : a.sex === 'female' ? '<span class="chip">' + icon('bi-gender-female chip-sex') + esc(I18n.t('animalFemale')) + '</span>' : '';
      const stage = '<span class="chip">' + esc(I18n.t(LifeStage.labelKey(a.life_stage))) + '</span>';
      const photo = a.photo_url
        ? '<div class="thumb">' + Photo.tag(a.photo_url, a.name || '') + '</div>'
        : '<div class="thumb thumb-empty" aria-hidden="true"></div>';
      return '<div class="card">'
        + photo + '<div class="info"><div class="animal-card-heading"><span class="animal-card-name">'
        + esc(a.name || I18n.t('unnamed')) + '</span></div><div class="animal-card-meta">' + sex + stage
        + (combo ? '<span class="chip animal-card-combo">' + esc(combo) + '</span>' : '')
        + '</div><div class="ms">' + (vis.length ? esc(vis.join(' · ')) : esc(I18n.t('animalMorphMissing')))
        + (het.length ? '<br><span style="color:var(--eggplant)">het ' + esc(het.join(' · ')) + '</span>' : '')
        + ((a.parent_a || a.parent_b) ? '<br>' + I18n.html('animalParents', {
          parentA: nameById(a.parent_a), parentB: nameById(a.parent_b) }) : '')
        + (scoreText ? '<br><span class="gdrow">' + scoreText + '</span>' : '')
        + '</div></div><div class="acts">'
        + '<a class="mini" href="animal.html?id=' + encodeURIComponent(a.id) + '">' + icon('bi-graph-up') + esc(I18n.t('manage')) + '</a>'
        + '<button class="mini" data-edit="animal:' + a.id + '">' + icon('bi-pencil') + esc(I18n.t('edit')) + '</button>'
        + '</div></div>';
    }

    function animalForm(a) {
      const B = breedSpec();
      a = a || { morphs: [], hets: [] };
      const isNew = !a.id;
      const linkedClutch = Boolean(a.clutch_id);
      const sv = new Set(a.morphs || []), sh = new Set(a.hets || []);
      const popt = (id, role) => '<option value="">' + esc(I18n.t('animalParentNone')) + '</option>'
        + LifeStage.parentCandidates(S.animals, {
          id: a.id, species: a.species || S.species
        }, role)
          .map(x => '<option value="' + x.id + '"' + (id === x.id ? ' selected' : '') + '>'
            + esc(x.name || I18n.t('unnamed')) + '</option>').join('');
      const stageOptions = LifeStage.STAGES.map(stage => '<option value="' + stage + '"'
        + (LifeStage.normalize(a.life_stage) === stage ? ' selected' : '') + '>'
        + esc(I18n.t(LifeStage.labelKey(stage))) + '</option>').join('');
      const traits = B.traitOptions();
      const traitIds = traits.map(t => t[0]);
      const traitScores = LineTraitScores.forAnimal(a, traitIds.filter(id => sv.has(id)));
      const groups = {};
      traits.forEach(t => { (groups[t[2] || 'other'] = groups[t[2] || 'other'] || []).push(t); });

      return '<div class="pad"><div class="lbl">' + esc(I18n.t(isNew ? 'animalCreate' : 'animalEdit')) + '</div>'
        + '<div class="hint">' + esc(I18n.t('animalMorphBasis', { species: I18n.speciesName(S.species) })) + '</div>'
        + '<div class="lbl2"><label for="f_name">' + esc(I18n.t('animalNameLabel')) + '</label></div>'
        + '<input class="in" id="f_name" value="' + esc(a.name || '') + '">'
        + '<div class="row2"><div><div class="lbl2"><label for="f_sex">' + esc(I18n.t('animalSexLabel')) + '</label></div><select class="in" id="f_sex">'
        + [['unknown', I18n.t('animalUnknown')], ['male', I18n.t('animalMale') + ' ♂'],
          ['female', I18n.t('animalFemale') + ' ♀']].map(o => {
            return '<option value="' + o[0] + '"' + ((a.sex || 'unknown') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
          }).join('') + '</select></div>'
        + '<div><div class="lbl2"><label for="f_stage">' + esc(I18n.t('lifeStage')) + '</label></div>'
        + '<select class="in" id="f_stage">' + stageOptions + '</select></div></div>'
        + '<div class="hint">' + esc(I18n.t('lifeStageHint')) + '</div>'
        + '<div class="lbl2"><label for="f_hatch">' + esc(I18n.t('animalHatchLabel')) + '</label></div>'
        + DateField.html({ id: 'f_hatch', value: a.hatch_date || '', max: C.today() })
        + '<div class="lbl2">' + esc(I18n.t('animalVisualLabel')) + '</div><div class="tokgrid">'
        + B.visualOptions().map(t => '<label class="tokchk"><input type="checkbox" class="v" value="'
            + esc(t[0]) + '"' + (sv.has(t[0]) ? ' checked' : '') + '>' + esc(t[1]) + '</label>').join('') + '</div>'
        + (B.hetOptions().length ? '<div class="lbl2">' + esc(I18n.t('animalHetLabel')) + '</div><div class="tokgrid">'
          + B.hetOptions().map(t => '<label class="tokchk"><input type="checkbox" class="h" value="'
              + esc(t[0]) + '"' + (sh.has(t[0]) ? ' checked' : '') + '>' + esc(t[1]) + '</label>').join('') + '</div>' : '')
        + (traits.length ? '<div class="lbl2">' + esc(I18n.t('animalLineTraitsLabel')) + '</div>' + Object.keys(groups).map(g =>
            '<div class="hint" style="margin:8px 0 3px;font-weight:800;color:var(--ink)">' + esc(I18n.groupName(g)) + '</div>'
            + '<div class="tokgrid line-score-grid">' + groups[g].map(t => {
                const checked = sv.has(t[0]);
                return '<label class="tokchk line-score-row"><input type="checkbox" class="v line-trait" value="'
                  + esc(t[0]) + '"' + (checked ? ' checked' : '') + '><span>' + esc(t[1]) + '</span>'
                  + '<select class="in line-score" data-line-trait-score="' + esc(t[0]) + '" aria-label="'
                  + esc(I18n.t('animalTraitStrengthAria', { trait: t[1] })) + '"' + (checked ? '' : ' disabled') + (checked ? '' : ' hidden') + '>'
                  + '<option value="">' + esc(I18n.t('animalStrengthNone')) + '</option>' + [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"'
                    + (traitScores[t[0]] === n ? ' selected' : '') + '>' + n + ' / 5</option>').join('')
                  + '</select></label>';
              }).join('') + '</div>').join('') : '')
        + '<div class="lbl2">' + esc(I18n.t('animalPedigreeLabel')) + '</div><div class="row2">'
        + '<div><div class="lbl2"><label for="f_pa">' + esc(I18n.t('animalSireLabel')) + '</label></div>'
        + '<select class="in" id="f_pa"' + (linkedClutch ? ' disabled' : '') + '>' + popt(a.parent_a, 'sire') + '</select></div>'
        + '<div><div class="lbl2"><label for="f_pb">' + esc(I18n.t('animalDamLabel')) + '</label></div>'
        + '<select class="in" id="f_pb"' + (linkedClutch ? ' disabled' : '') + '>' + popt(a.parent_b, 'dam') + '</select></div></div>'
        + (linkedClutch ? '<div class="hatch-project">' + icon('bi-diagram-3')
          + esc(I18n.t('animalClutchLinked')) + '</div>' : '')
        + '<div class="hint">' + esc(I18n.t('animalParentHint')) + '</div>'
        + (traits.length ? '<div class="hint">' + esc(I18n.t('animalScoreHint')) + '</div>' : '')
        + CarePhotos.editorHtml(a, A)
        + '<div class="lbl2"><label for="f_note">' + esc(I18n.t('animalNoteLabel')) + '</label></div>'
        + '<input class="in" id="f_note" value="' + esc(a.note || '') + '">'
        + '<div class="hint">' + icon('bi-shield-check')
        + ' ' + I18n.html('animalPrivateNote') + '</div>'
        + '<div class="err" id="f_err"></div><div class="formbtns"><button class="btn" id="f_save">'
        + icon('bi-check-lg') + esc(I18n.t('save')) + '</button><button class="btn ghost" data-cancel="1">' + esc(I18n.t('cancel')) + '</button>'
        + (isNew ? '' : '<button class="btn danger" data-del="animal:' + a.id + '" style="margin-left:auto">'
          + icon('bi-trash3') + esc(I18n.t('delete')) + '</button>') + '</div></div>';
    }

    function saveAnimal() {
      const B = breedSpec();
      const name = $('f_name').value.trim();
      if (!name) { $('f_err').textContent = I18n.t('animalNameRequired'); return; }
      const hatch = $('f_hatch').value || null;
      if (hatch && hatch > C.today()) { $('f_err').textContent = I18n.t('animalFutureHatch'); return; }
      const parentA = $('f_pa').value || null;
      const parentB = $('f_pb').value || null;
      const child = Object.assign({}, S.edit.row || {}, {
        species: (S.edit.row && S.edit.row.species) || S.species
      });
      const parentError = LifeStage.validateParents(S.animals, child, parentA, parentB);
      if (parentError) { $('f_err').textContent = I18n.t('animalParentInvalid'); return; }
      const pick = c => Array.prototype.slice.call(document.querySelectorAll('.' + c + ':checked')).map(x => x.value);
      const selectedMorphs = pick('v');
      const lineTraitIds = new Set(B.traitOptions().map(t => t[0]));
      const selectedLineTraits = selectedMorphs.filter(id => lineTraitIds.has(id));
      const scoreValues = {};
      document.querySelectorAll('[data-line-trait-score]').forEach(function (control) {
        scoreValues[control.dataset.lineTraitScore] = control.value;
      });
      // save_row does not apply the species column default, so every animal write must send it.
      const fields = {
        species: (S.edit.row && S.edit.row.species) || S.species,
        name: name, sex: $('f_sex').value || null,
        life_stage: LifeStage.normalize($('f_stage').value), hatch_date: hatch,
        morphs: selectedMorphs, hets: pick('h'),
        line_trait_scores: LineTraitScores.fromForm(selectedLineTraits, scoreValues),
        parent_a: parentA, parent_b: parentB,
        note: $('f_note').value.trim() || null
      };
      return act(async () => {
        const photos = await CarePhotos.prepare();
        const row = Object.assign({}, S.edit.row || {}, fields, photos);
        try { await A.saveAnimal(row); }
        catch (error) {
          const rollback = await CarePhotos.rollback();
          if (!rollback.ok) throw new Error(CarePhotos.t('rollbackWarning'));
          throw error;
        }
        const cleanup = await CarePhotos.commit(photos);
        S.edit = null;
        return cleanup;
      }, cleanup => cleanup && cleanup.ok ? I18n.t('saved') : CarePhotos.t('cleanupWarning'));
    }

    return { tabAnimals: tabAnimals, saveAnimal: saveAnimal };
  };
})();
