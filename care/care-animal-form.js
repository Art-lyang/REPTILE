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

    /* 자식이 걸려 있으면 종·성별·성장 단계를 잠급니다.
       셋 다 부모 자격을 이루는 값이라, 하나만 바꿔도 자식과의 연결이 어긋납니다
       (레오파드 새끼의 어미가 '기타' 가 되거나, 어미가 수컷이 되는 식으로).
       잠그기만 하고 이유를 안 적으면 고장으로 읽히므로 자식 이름을 함께 적습니다. */
    function parentLock(animal, kids) {
      if (!animal.id || !kids || !kids.length) return null;
      /* 자식이 요구하는 값. 종은 자식의 종이고, 부로 걸렸으면 성체 수컷,
         모로 걸렸으면 성체 암컷입니다(supabase_v37.sql). */
      const asSire = kids.some(k => k.parent_a === animal.id);
      return {
        names: kids.map(k => k.name || I.t('unnamed')).join(', '),
        species: kids[0].species || animal.species,
        sex: asSire ? 'male' : 'female',
        stage: 'adult'
      };
    }

    /* 잠그되, 맞는 값으로 바꾸는 길은 열어 둡니다.
       -------------------------------------------------------------------------
       처음에는 세 칸을 통째로 disabled 로 두었습니다. 그랬더니 이미 틀어져 있던
       개체를 바로잡을 수도 없게 됐습니다 — 레오파드 새끼의 어미가 '기타' 로
       앉아 있었는데, 그걸 고치려고 열면 종 칸이 잠겨 있었습니다.

       서버는 그렇게까지 막지 않습니다. supabase_v63.sql 은 '자식과 안 맞는
       값' 만 거절하지, 맞는 값으로 되돌리는 것은 통과시킵니다. 화면이 서버보다
       엄격하면 고칠 방법이 사라집니다.

       그래서 지금 값과 '자식이 요구하는 값' 둘만 남깁니다. 드리프트는 여전히
       막히고, 되돌리기는 한 번에 됩니다. */
    function lockedOptions(all, current, required) {
      return all.filter(o => o.value === current || o.value === required);
    }

    function html(animal, kids) {
      const isNew = !animal.id;
      const lock = parentLock(animal, kids);
      const opt = function (value, label, selected) {
        return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + label + '</option>';
      };

      let speciesList = Object.keys(C.SPECIES).map(function (key) {
        return { value: key, label: C.SPECIES[key].icon + ' ' + esc(I.speciesName(key)) };
      });
      let sexList = [['unknown', 'sexUnknown'], ['male', 'sexMale'], ['female', 'sexFemale']]
        .map(function (o) { return { value: o[0], label: esc(I.t(o[1])) }; });
      let stageList = LifeStage.STAGES.map(function (s) {
        return { value: s, label: esc(I.t(LifeStage.labelKey(s))) };
      });

      if (lock) {
        speciesList = lockedOptions(speciesList, animal.species, lock.species);
        sexList = lockedOptions(sexList, animal.sex || 'unknown', lock.sex);
        stageList = lockedOptions(stageList, LifeStage.normalize(animal.life_stage), lock.stage);
      }

      const speciesOptions = speciesList
        .map(o => opt(o.value, o.label, animal.species === o.value)).join('');
      const sexOptions = sexList
        .map(o => opt(o.value, o.label, (animal.sex || 'unknown') === o.value)).join('');
      const stageOpts = stageList
        .map(o => opt(o.value, o.label, LifeStage.normalize(animal.life_stage) === o.value)).join('');
      return '<div class="pad"><div class="lbl">' + esc(I.t(isNew ? 'addAnimal' : 'editAnimal')) + '</div>'
        + '<div class="lbl2"><label for="f_name">' + esc(I.t('name')) + '</label></div>'
        + '<input class="in" id="f_name" value="' + esc(animal.name || '') + '" placeholder="'
        + esc(I.t('animalNamePlaceholder')) + '"><div class="lbl2"><label for="f_species">'
        + esc(I.t('species')) + '</label></div><select class="in" id="f_species">'
        + speciesOptions + '</select>'
        + '<div class="hint">' + esc(I.t('speciesPlanHint')) + '</div><div class="row2">'
        + '<div><div class="lbl2"><label for="f_sex">' + esc(I.t('sex')) + '</label></div>'
        + '<select class="in" id="f_sex">' + sexOptions + '</select></div>'
        + '<div><div class="lbl2"><label for="f_stage">' + esc(I.t('lifeStage')) + '</label></div>'
        + '<select class="in" id="f_stage">' + stageOpts + '</select></div></div>'
        + (lock
            ? '<div class="note warn" id="f_parentlock"><i class="bi bi-diagram-3" aria-hidden="true"></i>'
              + '<span>' + esc(I.t('parentLockedHint', {
                  names: lock.names,
                  species: I.speciesName(lock.species),
                  sex: I.t(lock.sex === 'male' ? 'sexMale' : 'sexFemale')
                })) + '</span></div>'
            : '<div class="hint">' + esc(I.t('lifeStageHint')) + '</div>')
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
