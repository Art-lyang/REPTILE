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
    const matingPanel = deps.matingPanel;
    const hatchPanel = deps.hatchPanel;
    const clutchPanel = deps.clutchPanel;
    const geneticGoal = deps.geneticGoal;
    const I18n = deps.i18n;

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
          try { history.replaceState(null, '', I18n.managementUrl(S.species, S.tab)); } catch (e) {}
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
      if (d.newEvent) {
        S.edit = { what: 'event', row: { group_id: d.newEvent } };
        return render();
      }
      if (d.hatch) {
        S.edit = { what: 'hatch', row: S.clutches.filter(item => item.id === d.hatch)[0] };
        return render();
      }
      if (d.registerOffspring) return hatchPanel.beginOffspring(d.registerOffspring);
      if (d.new) {
        S.edit = { what: d.new, row: null };
        if (d.new === 'animal') CarePhotos.begin({}, A);
        return render();
      }
      if (d.edit) {
        const [what, id] = d.edit.split(':');
        const src = { animal: S.animals, pair: S.pairs, group: S.groups,
          event: S.matingEvents, clutch: S.clutches }[what];
        S.edit = { what: what, row: src.filter(x => x.id === id)[0] };
        if (what === 'animal') CarePhotos.begin(S.edit.row, A);
        return render();
      }
      if (d.del) {
        const [what, id] = d.del.split(':');
        const confirmKey = { animal: 'deleteAnimalConfirm', pair: 'deletePairingConfirm',
          event: 'matingEventDeleteConfirm', clutch: 'deleteClutchConfirm' }[what];
        if (!confirm(I18n.t(confirmKey))) return;
        if (what === 'event') {
          return act(async () => { await A.deleteMatingEvent(id); S.edit = null; }, I18n.t('deleted'));
        }
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
        }, cleanup => cleanup && cleanup.ok ? I18n.t('deleted') : CarePhotos.t('cleanupWarning'));
      }
      if (t.id === 'f_save') return animalPanel.saveAnimal();
      if (t.id === 'p_save') return pairingPanel.savePair();
      if (t.id === 'g_save') return matingPanel.saveGroup();
      if (t.id === 'e_save') return matingPanel.saveEvent();
      if (t.id === 'c_save') return clutchPanel.saveClutch();
      if (t.id === 'h_save') return hatchPanel.save();
      if (t.id === 'g_run') return geneticGoal.runGoal();
    }

    async function onChange(ev) {
      if (ev.target.dataset && Object.prototype.hasOwnProperty.call(ev.target.dataset, 'hatchPreview')) {
        hatchPanel.refreshPreview();
        return;
      }
      const slot = ev.target.dataset && ev.target.dataset.carePhotoPick;
      if (slot) {
        try {
          const selected = await CarePhotos.select(slot, ev.target.files && ev.target.files[0]);
          if (selected) CarePhotos.refresh(document, A.sb);
        } catch (e) {
          toast(I18n.friendly(e));
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
      location.href = I18n.managementUrl(ev.target.value, S.tab);
    }

    function bind() {
      document.addEventListener('click', onClick);
      document.addEventListener('change', onChange);
      document.addEventListener('input', function (event) {
        if (event.target.dataset && Object.prototype.hasOwnProperty.call(event.target.dataset, 'hatchPreview')) {
          hatchPanel.refreshPreview();
        }
      });
    }

    return { bind: bind };
  };
})();
