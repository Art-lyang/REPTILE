(function () {
  'use strict';

  window.createBreedingEvents = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const CarePhotos = deps.photos;
    const act = deps.act;
    const toast = deps.toast;
    const render = deps.render;
    const animalPanel = deps.animalPanel;
    const pairingPanel = deps.pairingPanel;
    const clutchPanel = deps.clutchPanel;
    const geneticGoal = deps.geneticGoal;

    function onClick(ev) {
      const t = ev.target.closest('button');
      if (!t) return;
      const d = t.dataset;
      if (t.classList.contains('tab')) {
        const nextTab = t.getAttribute('data-t');
        const leave = S.edit && S.edit.what === 'animal' ? CarePhotos.cancel() : Promise.resolve();
        return leave.then(function () {
          S.tab = nextTab;
          S.edit = null;
          try { history.replaceState(null, '', '?species=' + S.species + '#' + S.tab); } catch (e) {}
          render();
        });
      }
      if (d.carePhotoRemove) {
        CarePhotos.remove(d.carePhotoRemove);
        CarePhotos.refresh(document, A.sb);
        return;
      }
      if (d.cancel) {
        const leave = S.edit && S.edit.what === 'animal' ? CarePhotos.cancel() : Promise.resolve();
        return leave.then(function () { S.edit = null; render(); });
      }
      if (d.new) {
        S.edit = { what: d.new, row: null };
        if (d.new === 'animal') CarePhotos.begin({}, A);
        return render();
      }
      if (d.edit) {
        const [what, id] = d.edit.split(':');
        const src = { animal: S.animals, pair: S.pairs, clutch: S.clutches }[what];
        S.edit = { what: what, row: src.filter(x => x.id === id)[0] };
        if (what === 'animal') CarePhotos.begin(S.edit.row, A);
        return render();
      }
      if (d.del) {
        const [what, id] = d.del.split(':');
        const label = { animal: '개체', pair: '페어링', clutch: '클러치' }[what];
        if (!confirm('이 ' + label + '을(를) 지울까요? 되돌릴 수 없습니다.')) return;
        const table = { animal: 'animals', pair: 'pairings', clutch: 'clutches' }[what];
        const animal = what === 'animal' ? S.animals.filter(x => x.id === id)[0] : null;
        return act(async () => {
          await A.deleteRow(table, id);
          if (animal) {
            await CarePhotos.cancel();
            const cleanup = await CarePhotos.deleteAnimalPhotos(animal, A);
            S.edit = null;
            return cleanup;
          }
          S.edit = null;
          return { ok: true };
        }, cleanup => cleanup && cleanup.ok ? '삭제했습니다' : CarePhotos.t('cleanupWarning'));
      }
      if (t.id === 'f_save') return animalPanel.saveAnimal();
      if (t.id === 'p_save') return pairingPanel.savePair();
      if (t.id === 'c_save') return clutchPanel.saveClutch();
      if (t.id === 'g_run') return geneticGoal.runGoal();
    }

    async function onChange(ev) {
      const slot = ev.target.dataset && ev.target.dataset.carePhotoPick;
      if (slot) {
        try {
          const selected = await CarePhotos.select(slot, ev.target.files && ev.target.files[0]);
          if (selected) CarePhotos.refresh(document, A.sb);
        } catch (e) {
          toast(A.friendly(e));
        } finally {
          ev.target.value = '';
        }
        return;
      }
      if (ev.target.classList && ev.target.classList.contains('line-trait')) {
        const score = ev.target.closest('.line-score-row').querySelector('[data-line-trait-score]');
        score.disabled = !ev.target.checked;
        score.hidden = !ev.target.checked;
        if (!ev.target.checked) score.value = '';
        return;
      }
      if (ev.target.id !== 'species') return;
      location.href = 'breeding.html?species=' + encodeURIComponent(ev.target.value) + '#' + S.tab;
    }

    function bind() {
      document.addEventListener('click', onClick);
      document.addEventListener('change', onChange);
    }

    return { bind: bind };
  };
})();
