(function (global) {
  'use strict';

  let pending = false;

  function selectedIds(inputs) {
    const seen = Object.create(null);
    return Array.prototype.slice.call(inputs || []).map(function (input) {
      return input && input.checked && input.dataset ? String(input.dataset.planBulkId || '') : '';
    }).filter(function (id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  async function deletePlans(app, ids) {
    if (!app || !app.sb || !ids.length) throw new Error('CARE_PLAN_BULK_DELETE_UNAVAILABLE');
    const response = await app.sb.from('care_plans').delete().in('id', ids);
    if (response && response.error) throw response.error;
    return response ? response.data : null;
  }

  function i18n() { return global.CareI18n; }

  function root() { return global.document && global.document.getElementById('body'); }

  function count(rootElement) {
    return selectedIds(rootElement.querySelectorAll('[data-plan-bulk-id]')).length;
  }

  function formatCount(value) {
    const I = i18n();
    return I && I.formatNumber ? I.formatNumber(value) : String(value);
  }

  function update(rootElement) {
    if (!rootElement) return 0;
    const I = i18n(), selected = count(rootElement);
    const countNode = rootElement.querySelector('[data-plan-bulk-count]');
    const label = rootElement.querySelector('[data-plan-bulk-delete-label]');
    const button = rootElement.querySelector('[data-plan-bulk-delete]');
    if (countNode && I) countNode.textContent = I.t('planBulkCount', { count: formatCount(selected) });
    if (label && I) label.textContent = I.t('planBulkDeleteAction', { count: formatCount(selected) });
    if (button) button.disabled = selected === 0 || pending;
    return selected;
  }

  function setMode(rootElement, enabled) {
    if (!rootElement) return;
    rootElement.classList.toggle('plan-bulk-mode', enabled);
    if (!enabled) {
      rootElement.querySelectorAll('[data-plan-bulk-id]').forEach(function (input) { input.checked = false; });
    }
    update(rootElement);
  }

  function toast(error) {
    const node = global.document && global.document.getElementById('toast');
    const I = i18n();
    if (!node) return;
    node.textContent = I && I.friendly ? I.friendly(error) : String(error && error.message || error);
    node.classList.add('on');
    global.setTimeout(function () { node.classList.remove('on'); }, 2400);
  }

  async function confirmAndDelete(rootElement) {
    const ids = selectedIds(rootElement.querySelectorAll('[data-plan-bulk-id]'));
    const I = i18n();
    if (!ids.length || !I || !global.confirm(I.t('planBulkDeleteConfirm', { count: formatCount(ids.length) }))) return;
    pending = true;
    update(rootElement);
    try {
      await deletePlans(global.CareApp, ids);
      global.location.reload();
    } catch (error) {
      toast(error);
    } finally {
      pending = false;
      update(rootElement);
    }
  }

  function onClick(event) {
    const target = event.target.closest('[data-plan-bulk-mode], [data-plan-bulk-cancel], [data-plan-bulk-delete]');
    if (!target) return;
    const rootElement = root();
    if (!rootElement) return;
    event.preventDefault();
    if (target.hasAttribute('data-plan-bulk-mode')) return setMode(rootElement, true);
    if (target.hasAttribute('data-plan-bulk-cancel')) return setMode(rootElement, false);
    if (target.hasAttribute('data-plan-bulk-delete')) return confirmAndDelete(rootElement);
  }

  function onChange(event) {
    if (event.target && event.target.hasAttribute('data-plan-bulk-id')) update(root());
  }

  function init() {
    if (!global.document || global.__carePlanBulkDeleteReady) return;
    global.__carePlanBulkDeleteReady = true;
    global.document.addEventListener('click', onClick);
    global.document.addEventListener('change', onChange);
  }

  global.CarePlanBulkDelete = Object.freeze({ selectedIds: selectedIds, deletePlans: deletePlans, init: init });
  init();
})(window);
