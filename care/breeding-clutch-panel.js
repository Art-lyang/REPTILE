(function () {
  'use strict';

  // Temperature-based hatch estimates are intentionally Leopard-only;
  // other species require a breeder-entered date rather than a misleading estimate.

  window.createBreedingClutchPanel = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const C = deps.core;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const act = deps.act;
    const I18n = deps.i18n;

    function hatchDays(t) {
      t = parseFloat(t) || 28;
      if (t >= 31) return 38;
      if (t >= 29.5) return 45;
      if (t >= 28) return 55;
      if (t >= 26.5) return 68;
      return 80;
    }

    function tabClutch() {
      if (S.edit && S.edit.what === 'clutch') return clutchForm(S.edit.row);
      let h = '<button class="btn wide" data-new="clutch" style="margin-bottom:14px">'
            + icon('bi-plus-lg') + esc(I18n.t('clutchCreate')) + '</button>';
      if (!S.clutches.length) {
        return h + '<div class="pad"><div class="empty">' + icon('bi-egg')
          + esc(I18n.t('clutchEmpty')) + '</div></div>';
      }
      const today = C.today();
      return h + S.clutches.map(function (c) {
        const pair = S.pairs.filter(p => p.id === c.pairing)[0];
        const left = c.expected_hatch ? C.daysBetween(today, c.expected_hatch) : null;
        return '<div class="card"><div class="thumb">🥚</div><div class="info">'
          + '<div class="nm">' + esc(pair ? (pair.name || I18n.t('unnamedPairing')) : I18n.t('clutchNoPair'))
          + (left != null && left >= 0 ? '<span class="chip" style="color:var(--teal);border-color:var(--teal)">D-' + left + '</span>'
             : left != null ? '<span class="chip">' + esc(I18n.t('clutchOverdue')) + '</span>' : '') + '</div>'
          + '<div class="ms">' + (c.laid_date ? esc(I18n.t('clutchLaid', { date: I18n.formatDate(c.laid_date) })) : esc(I18n.t('clutchLaidMissing')))
          + (c.egg_count ? ' · ' + esc(I18n.t('clutchEggCount', { count: c.egg_count })) : '')
          + (c.temp ? ' · ' + esc(I18n.t('clutchTemperature', { temp: c.temp })) : '')
          + (c.expected_hatch ? '<br>' + esc(I18n.t('clutchExpected', { date: I18n.formatDate(c.expected_hatch) })) : '')
          + (c.note ? '<br>' + esc(c.note) : '') + '</div></div>'
          + '<div class="acts"><button class="mini" data-edit="clutch:' + c.id + '">'
          + icon('bi-pencil') + esc(I18n.t('edit')) + '</button></div></div>';
      }).join('');
    }

    function clutchForm(c) {
      c = c || {};
      return '<div class="pad"><div class="lbl">' + esc(I18n.t(c.id ? 'clutchEdit' : 'clutchCreate')) + '</div>'
        + '<div class="lbl2">' + esc(I18n.t('clutchPairingLabel')) + '</div><select class="in" id="c_p" aria-label="' + esc(I18n.t('clutchPairingLabel')) + '">'
        + '<option value="">' + esc(I18n.t('noSelection')) + '</option>'
        + S.pairs.map(p => '<option value="' + p.id + '"' + (c.pairing === p.id ? ' selected' : '') + '>'
            + esc(p.name || I18n.t('unnamedPairing')) + '</option>').join('') + '</select>'
        + '<div class="row2"><div><div class="lbl2"><label for="c_laid">' + esc(I18n.t('clutchLaidLabel')) + '</label></div>'
        + '<input class="in" id="c_laid" type="date" value="' + esc(c.laid_date || '') + '"></div>'
        + '<div><div class="lbl2"><label for="c_n">' + esc(I18n.t('clutchEggsLabel')) + '</label></div>'
        + '<input class="in" id="c_n" type="number" min="0" max="99" inputmode="numeric" value="'
        + esc(c.egg_count == null ? '' : c.egg_count) + '"></div></div>'
        + '<div class="lbl2"><label for="c_t">' + esc(I18n.t('clutchTemperatureLabel')) + '</label></div>'
        + '<input class="in" id="c_t" type="number" step="0.5" inputmode="decimal" value="'
        + esc(c.temp == null ? '' : c.temp) + '">'
        + (S.species === 'gecko'
          ? '<div class="hint">' + I18n.html('clutchAutoHint') + '</div>'
          : '<div class="hint">' + I18n.html('clutchManualHint', { species: I18n.speciesName(S.species) }) + '</div>')
        + '<div class="lbl2"><label for="c_exp">' + esc(I18n.t('clutchExpectedLabel')) + '</label></div>'
        + '<input class="in" id="c_exp" type="date" value="' + esc(c.expected_hatch || '') + '">'
        + '<div class="lbl2"><label for="c_note">' + esc(I18n.t('clutchNoteLabel')) + '</label></div>'
        + '<input class="in" id="c_note" value="' + esc(c.note || '') + '">'
        + '<div class="err" id="c_err"></div><div class="formbtns"><button class="btn" id="c_save">'
        + icon('bi-check-lg') + esc(I18n.t('save')) + '</button><button class="btn ghost" data-cancel="1">' + esc(I18n.t('cancel')) + '</button>'
        + (c.id ? '<button class="btn danger" data-del="clutch:' + c.id + '" style="margin-left:auto">'
          + icon('bi-trash3') + esc(I18n.t('delete')) + '</button>' : '') + '</div></div>';
    }

    function saveClutch() {
      const temp = $('c_t').value ? Number($('c_t').value) : null;
      let exp = $('c_exp').value || null;
      if (!exp && S.species === 'gecko' && $('c_laid').value && temp) {
        exp = C.addDays($('c_laid').value, hatchDays(temp));
      }
      const row = Object.assign({}, S.edit.row || {}, {
        species: S.species,
        pairing: $('c_p').value || null,
        laid_date: $('c_laid').value || null,
        egg_count: $('c_n').value ? parseInt($('c_n').value, 10) : null,
        temp: temp, expected_hatch: exp,
        note: $('c_note').value.trim() || null
      });
      return act(async () => { await A.saveRow('clutches', row); S.edit = null; }, I18n.t('saved'));
    }

    return { tabClutch: tabClutch, saveClutch: saveClutch };
  };
})();
