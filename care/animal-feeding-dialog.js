(function (w) {
  'use strict';

  var CATEGORIES = ['prepared', 'insect', 'whole_prey', 'plant', 'supplement', 'other'];
  var STATES = ['ready', 'live', 'frozen', 'thawed', 'powder', 'mixed', 'fresh', 'other'];
  var RESULTS = ['all', 'partial', 'refused', 'unknown'];
  var UNITS = ['piece', 'g', 'ml', 'scoop', 'portion', 'other'];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function activeFeeds(feeds) {
    return (feeds || []).filter(function (feed) { return feed && feed.is_active !== false; });
  }

  function radioGroup(name, values, label, nameFor, selected) {
    return '<fieldset class="feeding-fieldset"><legend>' + esc(label) + '</legend><div class="feeding-choices feeding-' + name + '">'
      + values.map(function (value) {
        return '<label><input type="radio" name="' + name + '" value="' + esc(value) + '"'
          + (value === selected ? ' checked' : '') + '><span>' + esc(nameFor(value)) + '</span></label>';
      }).join('') + '</div></fieldset>';
  }

  function unitOptions(i18n, feeds) {
    var values = UNITS.slice();
    activeFeeds(feeds).forEach(function (feed) {
      var unit = String(feed.unit || '').trim();
      if (unit && values.indexOf(unit) < 0) values.push(unit);
    });
    return values.map(function (unit) {
      var label = UNITS.indexOf(unit) >= 0 ? i18n.feedUnitName(unit) : unit;
      return '<option value="' + esc(unit) + '">' + esc(label) + '</option>';
    }).join('');
  }

  function html(i18n, feeds) {
    var options = activeFeeds(feeds).map(function (feed) {
      return '<option value="' + esc(feed.id) + '">' + esc(feed.name) + '</option>';
    }).join('');
    return '<dialog class="feeding-dialog" id="feedingDialog" aria-labelledby="feedingDialogTitle">'
      + '<form method="dialog"><div class="feeding-dialog-head"><div><strong id="feedingDialogTitle">'
      + esc(i18n.t('feedingInputTitle')) + '</strong><span>' + esc(i18n.t('feedingInputHint')) + '</span></div>'
      + '<button class="mini" value="cancel" aria-label="' + esc(i18n.t('close'))
      + '"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div><div class="feeding-dialog-body">'
      + '<label class="feeding-label" for="feedingFood">' + esc(i18n.t('feedingFood')) + '</label>'
      + '<select class="in" id="feedingFood"><option value="">' + esc(i18n.t('feedingInventoryNone'))
      + '</option>' + options + '</select>'
      + '<div class="feeding-inventory-hint"><i class="bi bi-box-seam" aria-hidden="true"></i>'
      + esc(i18n.t('feedingInventoryHint')) + '</div>'
      + '<div id="feedingCustomWrap"><label class="feeding-label" for="feedingCustomName">' + esc(i18n.t('feedingCustomName')) + '</label>'
      + '<input class="in" id="feedingCustomName" maxlength="120" autocomplete="off" placeholder="'
      + esc(i18n.t('feedingCustomNamePlaceholder')) + '"></div>'
      + radioGroup('feed_category', CATEGORIES, i18n.t('feedingCategory'), i18n.feedCategoryName, 'prepared')
      + radioGroup('feed_state', STATES, i18n.t('feedingState'), i18n.feedStateName, 'ready')
      + '<div class="feeding-amount-grid"><label><span>' + esc(i18n.t('feedingOffered')) + '</span>'
      + '<input class="in" id="feedingOffered" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="1"></label>'
      + '<label><span>' + esc(i18n.t('feedingUnit')) + '</span><select class="in" id="feedingUnit">'
      + unitOptions(i18n, feeds) + '</select></label></div>'
      + radioGroup('feeding_result', RESULTS, i18n.t('feedingResult'), i18n.feedingResultName, 'all')
      + '<label class="feeding-eaten" id="feedingEatenWrap"><span>' + esc(i18n.t('feedingEaten')) + '</span>'
      + '<input class="in" id="feedingEaten" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.5">'
      + '<small>' + esc(i18n.t('feedingEatenHint')) + '</small></label>'
      + '<div class="feeding-meta-grid"><label><span>' + esc(i18n.t('feedingDate')) + '</span>'
      + '<input class="in" id="feedingDate" type="date"></label><label><span>' + esc(i18n.t('optionalNote')) + '</span>'
      + '<input class="in" id="feedingNote" maxlength="500" placeholder="' + esc(i18n.t('feedingNotePlaceholder')) + '"></label></div></div>'
      + '<div class="err" id="feedingDialogError" role="alert"></div>'
      + '<div class="formbtns"><button type="button" class="btn" id="feedingDialogSave"><i class="bi bi-check-lg" aria-hidden="true"></i>'
      + esc(i18n.t('feedingSave')) + '</button><button class="btn ghost" value="cancel">'
      + esc(i18n.t('cancel')) + '</button></div></form></dialog>';
  }

  function selectedValue(root, name) {
    var input = root && root.querySelector ? root.querySelector('input[name="' + name + '"]:checked') : null;
    return input ? input.value : '';
  }

  function findFeed(feeds, id) {
    return activeFeeds(feeds).filter(function (feed) { return String(feed.id) === String(id || ''); })[0] || null;
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function buildPayload(values, feeds) {
    values = values || {};
    var feed = findFeed(feeds, values.feed_item_id);
    var name = String(feed ? feed.name : values.custom_feed_name || '').trim();
    if (!name) return { payload: null, error: 'feedingNameRequired' };

    var offered = numberOrNull(values.offered_amount);
    if (offered === null || offered <= 0) return { payload: null, error: 'feedingOfferedRequired' };

    var result = RESULTS.indexOf(values.feeding_result) >= 0 ? values.feeding_result : 'unknown';
    var eaten = numberOrNull(values.eaten_amount);
    if (result === 'all') eaten = offered;
    if (result === 'refused') eaten = 0;
    if (result === 'unknown') eaten = null;
    if (result === 'partial' && (eaten === null || eaten <= 0 || eaten >= offered)) {
      return { payload: null, error: 'feedingAmountInvalid' };
    }

    var category = CATEGORIES.indexOf(values.feed_category) >= 0 ? values.feed_category : 'other';
    var state = STATES.indexOf(values.feed_state) >= 0 ? values.feed_state : 'other';
    var unit = String(values.feed_unit || (feed && feed.unit) || 'portion').trim();
    if (!unit || unit.length > 24) return { payload: null, error: 'feedingUnitRequired' };

    return { error: null, payload: {
      kind: 'feed', title: null, detail: null,
      done_date: values.done_date || null,
      note: String(values.note || '').trim() || null,
      feed_item_id: feed ? feed.id : null,
      feed_name: name,
      feed_category: category,
      feed_state: state,
      offered_amount: offered,
      eaten_amount: eaten,
      feed_unit: unit,
      feeding_result: result,
    } };
  }

  function valuesFrom(dialog) {
    return {
      feed_item_id: dialog.querySelector('#feedingFood').value,
      custom_feed_name: dialog.querySelector('#feedingCustomName').value,
      feed_category: selectedValue(dialog, 'feed_category'),
      feed_state: selectedValue(dialog, 'feed_state'),
      offered_amount: dialog.querySelector('#feedingOffered').value,
      eaten_amount: dialog.querySelector('#feedingEaten').value,
      feed_unit: dialog.querySelector('#feedingUnit').value,
      feeding_result: selectedValue(dialog, 'feeding_result'),
      done_date: dialog.querySelector('#feedingDate').value,
      note: dialog.querySelector('#feedingNote').value,
    };
  }

  function sync(feeds) {
    var dialog = document.getElementById('feedingDialog');
    if (!dialog) return;
    var feed = findFeed(feeds, dialog.querySelector('#feedingFood').value);
    var custom = dialog.querySelector('#feedingCustomName');
    dialog.querySelector('#feedingCustomWrap').hidden = !!feed;
    custom.disabled = !!feed;
    if (feed) {
      var offered = dialog.querySelector('#feedingOffered');
      if (!offered.value && feed.per_use != null) offered.value = feed.per_use;
      var unit = dialog.querySelector('#feedingUnit');
      if (feed.unit && Array.from(unit.options).some(function (option) { return option.value === String(feed.unit); })) {
        unit.value = String(feed.unit);
      }
    }

    var result = selectedValue(dialog, 'feeding_result');
    var eatenWrap = dialog.querySelector('#feedingEatenWrap');
    var eaten = dialog.querySelector('#feedingEaten');
    var partial = result === 'partial';
    eatenWrap.hidden = !partial;
    eaten.disabled = !partial;
    if (!partial) eaten.value = '';
  }

  function open(feeds, preferredFeedId) {
    var dialog = document.getElementById('feedingDialog');
    if (!dialog) return false;
    var form = dialog.querySelector('form');
    if (form && form.reset) form.reset();
    var select = dialog.querySelector('#feedingFood');
    var preferred = findFeed(feeds, preferredFeedId) || activeFeeds(feeds)[0] || null;
    select.value = preferred ? preferred.id : '';
    var date = dialog.querySelector('#feedingDate');
    var today = new Date();
    var ymd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0')
      + '-' + String(today.getDate()).padStart(2, '0');
    date.value = ymd;
    date.max = ymd;
    dialog.querySelector('#feedingDialogError').textContent = '';
    sync(feeds);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    return true;
  }

  function close() {
    var dialog = document.getElementById('feedingDialog');
    if (!dialog) return;
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  }

  w.AnimalFeedingDialog = {
    html: html, open: open, close: close, sync: sync,
    valuesFrom: valuesFrom, buildPayload: buildPayload,
    categories: CATEGORIES.slice(), states: STATES.slice(), results: RESULTS.slice(), units: UNITS.slice(),
  };
}(window));
