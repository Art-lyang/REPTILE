(function () {
  'use strict';

  // Photo prepare/save/rollback/commit order prevents abandoned uploads after save failures.
  // Line-trait scores are observed 1–5 values, never genetic probabilities.

  window.createBreedingAnimalPanel = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const CarePhotos = deps.photos;
    const LineTraitScores = deps.lineTraitScores;
    const Photo = deps.photo;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const CORES = deps.cores;
    const nameById = deps.nameById;
    const otherNote = deps.otherNote;
    const act = deps.act;
    const breedSpec = deps.breedSpec;

    function legacyNote() { return ''; }

    function tabAnimals() {
      if (S.edit && S.edit.what === 'animal') return animalForm(S.edit.row);
      let h = '<button class="btn wide" data-new="animal" style="margin-bottom:14px">'
            + icon('bi-plus-lg') + '개체 등록</button>' + otherNote() + legacyNote();
      if (!S.animals.length) {
        return h + '<div class="pad"><div class="empty">' + icon('bi-heart')
          + esc(CORES[S.species].ko) + ' 개체가 없습니다.<br>등록하면 페어링·클러치를 관리할 수 있어요.</div></div>';
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
      const sex = a.sex === 'male' ? '<span class="chip">♂ 수컷</span>'
                : a.sex === 'female' ? '<span class="chip">♀ 암컷</span>' : '';
      return '<div class="card">'
        + '<div class="thumb">' + (a.photo_url ? Photo.tag(a.photo_url, a.name || '') : '🦎') + '</div>'
        + '<div class="info"><div class="nm">' + esc(a.name || '이름 없음') + sex
        + (combo ? '<span class="chip" style="color:var(--teal);border-color:var(--teal)">' + esc(combo) + '</span>' : '')
        + '</div><div class="ms">' + (vis.length ? esc(vis.join(' · ')) : '모프 미입력')
        + (het.length ? '<br><span style="color:var(--eggplant)">het ' + esc(het.join(' · ')) + '</span>' : '')
        + ((a.parent_a || a.parent_b) ? '<br>부모 ' + esc(nameById(a.parent_a)) + ' × ' + esc(nameById(a.parent_b)) : '')
        + (scoreText ? '<br><span class="gdrow">' + scoreText + '</span>' : '')
        + '</div></div><div class="acts">'
        + '<a class="mini" href="animal.html?id=' + encodeURIComponent(a.id) + '">' + icon('bi-graph-up') + '관리</a>'
        + '<button class="mini" data-edit="animal:' + a.id + '">' + icon('bi-pencil') + '수정</button>'
        + '</div></div>';
    }

    function animalForm(a) {
      const B = breedSpec();
      a = a || { morphs: [], hets: [] };
      const isNew = !a.id;
      const sv = new Set(a.morphs || []), sh = new Set(a.hets || []);
      const popt = id => '<option value="">부모 선택 안 함</option>'
        + S.animals.filter(x => x.id !== a.id)
          .map(x => '<option value="' + x.id + '"' + (id === x.id ? ' selected' : '') + '>'
            + esc(x.name || '이름 없음') + '</option>').join('');
      const traits = B.traitOptions();
      const traitIds = traits.map(t => t[0]);
      const traitScores = LineTraitScores.forAnimal(a, traitIds.filter(id => sv.has(id)));
      const groups = {};
      traits.forEach(t => { (groups[t[2] || '기타'] = groups[t[2] || '기타'] || []).push(t); });

      return '<div class="pad"><div class="lbl">' + (isNew ? '개체 등록' : '개체 수정') + '</div>'
        + '<div class="hint">' + esc(CORES[S.species].ko) + ' 기준으로 모프를 고릅니다.</div>'
        + '<div class="lbl2"><label for="f_name">이름 / 개체번호</label></div>'
        + '<input class="in" id="f_name" value="' + esc(a.name || '') + '">'
        + '<div class="row2"><div><div class="lbl2"><label for="f_sex">성별</label></div><select class="in" id="f_sex">'
        + ['unknown:미상', 'male:수컷 ♂', 'female:암컷 ♀'].map(o => {
            const [v, t] = o.split(':');
            return '<option value="' + v + '"' + ((a.sex || 'unknown') === v ? ' selected' : '') + '>' + t + '</option>';
          }).join('') + '</select></div>'
        + '<div><div class="lbl2"><label for="f_hatch">해칭일 (선택)</label></div>'
        + '<input class="in" id="f_hatch" type="date" value="' + esc(a.hatch_date || '') + '"></div></div>'
        + '<div class="lbl2">비주얼 (발현 모프)</div><div class="tokgrid">'
        + B.visualOptions().map(t => '<label class="tokchk"><input type="checkbox" class="v" value="'
            + esc(t[0]) + '"' + (sv.has(t[0]) ? ' checked' : '') + '>' + esc(t[1]) + '</label>').join('') + '</div>'
        + (B.hetOptions().length ? '<div class="lbl2">het 보유 (열성)</div><div class="tokgrid">'
          + B.hetOptions().map(t => '<label class="tokchk"><input type="checkbox" class="h" value="'
              + esc(t[0]) + '"' + (sh.has(t[0]) ? ' checked' : '') + '>' + esc(t[1]) + '</label>').join('') + '</div>' : '')
        + (traits.length ? '<div class="lbl2">라인브리딩 형질</div>' + Object.keys(groups).map(g =>
            '<div class="hint" style="margin:8px 0 3px;font-weight:800;color:var(--ink)">' + esc(g) + '</div>'
            + '<div class="tokgrid line-score-grid">' + groups[g].map(t => {
                const checked = sv.has(t[0]);
                return '<label class="tokchk line-score-row"><input type="checkbox" class="v line-trait" value="'
                  + esc(t[0]) + '"' + (checked ? ' checked' : '') + '><span>' + esc(t[1]) + '</span>'
                  + '<select class="in line-score" data-line-trait-score="' + esc(t[0]) + '" aria-label="'
                  + esc(t[1]) + ' 강도"' + (checked ? '' : ' disabled') + (checked ? '' : ' hidden') + '>'
                  + '<option value="">강도 미기록</option>' + [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"'
                    + (traitScores[t[0]] === n ? ' selected' : '') + '>' + n + ' / 5</option>').join('')
                  + '</select></label>';
              }).join('') + '</div>').join('') : '')
        + '<div class="lbl2">혈통 (선택)</div><div class="row2">'
        + '<select class="in" id="f_pa" aria-label="부">' + popt(a.parent_a) + '</select>'
        + '<select class="in" id="f_pb" aria-label="모">' + popt(a.parent_b) + '</select></div>'
        + (traits.length ? '<div class="hint">선택한 형질마다 강도를 1~5로 따로 기록합니다. 유전 확률이 아닌 관찰값입니다.</div>' : '')
        + CarePhotos.editorHtml(a, A)
        + '<div class="lbl2"><label for="f_note">메모 (선택)</label></div>'
        + '<input class="in" id="f_note" value="' + esc(a.note || '') + '">'
        + '<div class="hint">' + icon('bi-shield-check')
        + ' 이 메모는 공개되지 않습니다. 공유 화면에는 개체 관리의 <b>공개 소개글</b>만 나갑니다.</div>'
        + '<div class="err" id="f_err"></div><div class="formbtns"><button class="btn" id="f_save">'
        + icon('bi-check-lg') + '저장</button><button class="btn ghost" data-cancel="1">취소</button>'
        + (isNew ? '' : '<button class="btn danger" data-del="animal:' + a.id + '" style="margin-left:auto">'
          + icon('bi-trash3') + '삭제</button>') + '</div></div>';
    }

    function saveAnimal() {
      const B = breedSpec();
      const name = $('f_name').value.trim();
      if (!name) { $('f_err').textContent = '이름을 적어주세요.'; return; }
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
        name: name, sex: $('f_sex').value || null, hatch_date: $('f_hatch').value || null,
        morphs: selectedMorphs, hets: pick('h'),
        line_trait_scores: LineTraitScores.fromForm(selectedLineTraits, scoreValues),
        parent_a: $('f_pa').value || null, parent_b: $('f_pb').value || null,
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
      }, cleanup => cleanup && cleanup.ok ? '저장했습니다' : CarePhotos.t('cleanupWarning'));
    }

    return { tabAnimals: tabAnimals, saveAnimal: saveAnimal };
  };
})();
