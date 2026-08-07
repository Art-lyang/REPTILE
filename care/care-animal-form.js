(function (global) {
  'use strict';

  global.createCareAnimalForm = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const C = deps.core;
    const I = deps.i18n;
    const Photos = deps.photos;
    const LifeStage = deps.lifeStage;
    const $ = deps.element;
    const esc = deps.escapeHtml;
    const icon = deps.icon;
    const act = deps.act;

    function stageOptions(selected) {
      const current = LifeStage.normalize(selected);
      return LifeStage.STAGES.map(function (stage) {
        return '<option value="' + stage + '"' + (stage === current ? ' selected' : '') + '>'
          + esc(I.t(LifeStage.labelKey(stage))) + '</option>';
      }).join('');
    }

    function weightFields(animal, isNew) {
      const input = isNew
        ? '<div class="animal-initial-weight"><div class="lbl2"><label for="f_weight">'
          + esc(I.t('initialWeight')) + '</label></div><div class="weight-input-unit">'
          + '<input class="in" id="f_weight" type="number" step="0.1" min="0.01" max="9999.99" '
          + 'inputmode="decimal" aria-describedby="f_weight_hint" placeholder="'
          + esc(I.t('initialWeightPlaceholder')) + '"><span aria-hidden="true">g</span></div>'
          + '<div class="hint" id="f_weight_hint">' + esc(I.t('initialWeightHint')) + '</div></div>'
        : '';
      return '<fieldset class="animal-weight-register"><legend>' + esc(I.t('weightRecordSettings')) + '</legend>'
        + input + '<label class="animal-weight-public" for="f_public_weight">'
        + '<input id="f_public_weight" type="checkbox"' + (animal.public_weight ? ' checked' : '') + '>'
        + '<span><b>' + esc(I.t('showLatestWeight')) + '</b><small>'
        + esc(I.t('publicWeightHint')) + '</small></span></label></fieldset>';
    }

    function html(animal) {
      const isNew = !animal.id;
      const speciesOptions = Object.keys(C.SPECIES).map(function (key) {
        return '<option value="' + key + '"' + (animal.species === key ? ' selected' : '') + '>'
          + C.SPECIES[key].icon + ' ' + esc(I.speciesName(key)) + '</option>';
      }).join('');
      const sexOptions = [['unknown', 'sexUnknown'], ['male', 'sexMale'], ['female', 'sexFemale']]
        .map(function (option) {
          return '<option value="' + option[0] + '"'
            + ((animal.sex || 'unknown') === option[0] ? ' selected' : '') + '>'
            + esc(I.t(option[1])) + '</option>';
        }).join('');
      return '<div class="pad"><div class="lbl">' + esc(I.t(isNew ? 'addAnimal' : 'editAnimal')) + '</div>'
        + '<div class="lbl2"><label for="f_name">' + esc(I.t('name')) + '</label></div>'
        + '<input class="in" id="f_name" value="' + esc(animal.name || '') + '" placeholder="'
        + esc(I.t('animalNamePlaceholder')) + '"><div class="lbl2"><label for="f_species">'
        + esc(I.t('species')) + '</label></div><select class="in" id="f_species">' + speciesOptions + '</select>'
        + '<div class="hint">' + esc(I.t('speciesPlanHint')) + '</div><div class="row2">'
        + '<div><div class="lbl2"><label for="f_sex">' + esc(I.t('sex')) + '</label></div>'
        + '<select class="in" id="f_sex">' + sexOptions + '</select></div>'
        + '<div><div class="lbl2"><label for="f_stage">' + esc(I.t('lifeStage')) + '</label></div>'
        + '<select class="in" id="f_stage">' + stageOptions(animal.life_stage) + '</select></div></div>'
        + '<div class="hint">' + esc(I.t('lifeStageHint')) + '</div>'
        + '<div class="lbl2"><label for="f_hatch">' + esc(I.t('hatchAdoptionDate')) + '</label></div>'
        + DateField.html({ id: 'f_hatch', value: animal.hatch_date || '', max: C.today() })
        + weightFields(animal, isNew) + Photos.editorHtml(animal, A)
        + '<div class="lbl2"><label for="f_clutch">' + esc(I.t('clutchLabel')) + '</label></div>'
        + '<input class="in" id="f_clutch" maxlength="80" value="' + esc(animal.clutch_label || '')
        + '" placeholder="' + esc(I.t('clutchPlaceholder')) + '"><div class="lbl2"><label for="f_note">'
        + esc(I.t('note')) + '</label></div><textarea class="in" id="f_note">' + esc(animal.note || '') + '</textarea>'
        + '<div class="err" id="f_err"></div><div class="formbtns"><button class="btn" id="f_save">'
        + icon('bi-check-lg') + esc(I.t('save')) + '</button><button class="btn ghost" data-cancel="animal">'
        + esc(I.t('cancel')) + '</button>' + (isNew ? '' : '<button class="btn danger" data-delanimal="'
          + animal.id + '" style="margin-left:auto">' + icon('bi-trash3') + esc(I.t('delete')) + '</button>')
        + '</div></div>';
    }

    function save() {
      const name = $('f_name').value.trim();
      if (!name) { $('f_err').textContent = I.t('nameRequired'); return; }
      const hatch = $('f_hatch').value || null;
      if (hatch && hatch > C.today()) { $('f_err').textContent = I.t('futureHatchDate'); return; }
      const initialWeightValue = $('f_weight') ? $('f_weight').value.trim() : '';
      const initialWeight = initialWeightValue === '' ? null : Number(initialWeightValue);
      if (initialWeight !== null && (!(initialWeight > 0) || initialWeight >= 10000)) {
        $('f_err').textContent = I.t('errorWeight'); return;
      }
      const fields = {
        name: name, species: $('f_species').value, sex: $('f_sex').value,
        life_stage: LifeStage.normalize($('f_stage').value), hatch_date: hatch,
        clutch_label: $('f_clutch').value.trim() || null,
        note: $('f_note').value.trim() || null,
        public_weight: $('f_public_weight').checked
      };
      return act(async function () {
        const photos = await Photos.prepare();
        const row = Object.assign({}, S.editAnimal, fields, photos);
        try { await A.saveAnimal(row, initialWeight); }
        catch (error) {
          const rollback = await Photos.rollback();
          if (!rollback.ok) throw new Error(Photos.t('rollbackWarning'));
          throw error;
        }
        const cleanup = await Photos.commit(photos);
        S.editAnimal = null;
        return cleanup;
      }, function (cleanup) {
        return cleanup && cleanup.ok ? I.t('saved') : Photos.t('cleanupWarning');
      });
    }

    return Object.freeze({ html: html, save: save });
  };
}(window));
