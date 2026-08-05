const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function source(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function load(relative, exportName) {
  const window = {};
  vm.runInNewContext(source(relative), { window }, { filename: relative });
  return window[exportName];
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function planOptions() {
  return {
    plans: [
      { id: 'plan-1', kind: 'feed', title: 'CGD', interval_days: 1, is_active: true },
      { id: 'plan-2', kind: 'clean', title: '전체 청소', interval_days: 14, is_active: true },
    ],
    animals: [], feeds: [], editPlan: null, calendarOrderCount: 0,
    core: { kindInfo: () => ({ color: '#075a48', icon: 'bi-check' }) },
    i18n: {
      t: key => key,
      formatNumber: value => String(value),
      cycleLabel: plan => `${plan.interval_days} days`,
      presetTitle: value => value,
      planDetail: value => value,
    },
    escapeHtml,
    icon: () => '',
    speciesOf: () => ({ icon: '🦎' }),
    planName: plan => plan.title,
  };
}

test('Given recurring plans, when the list renders, then users can enter selection mode and choose each plan', () => {
  const ui = load('care/care-plan-ui.js', 'CarePlanUi');
  const html = ui.render(planOptions());

  assert.match(html, /data-plan-bulk-mode/);
  assert.match(html, /data-plan-bulk-delete/);
  assert.match(html, /data-plan-bulk-id="plan-1"/);
  assert.match(html, /data-plan-bulk-id="plan-2"/);
  assert.match(html, /data-plan-bulk-count/);
  assert.match(html, /data-delplan="plan-1"/);
  assert.match(html, /data-delplan="plan-2"/);
});

test('Given checked plan inputs, when a batch delete is requested, then duplicate and empty IDs are excluded from one secured request', async () => {
  const controller = load('care/care-plan-bulk-delete.js', 'CarePlanBulkDelete');
  const ids = controller.selectedIds([
    { checked: true, dataset: { planBulkId: 'plan-1' } },
    { checked: true, dataset: { planBulkId: 'plan-1' } },
    { checked: false, dataset: { planBulkId: 'plan-2' } },
    { checked: true, dataset: { planBulkId: '' } },
    { checked: true, dataset: { planBulkId: 'plan-3' } },
  ]);
  const seen = [];
  const app = {
    sb: {
      from: table => ({
        delete: () => ({
          in: (column, values) => {
            seen.push([table, column, values]);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    },
  };

  await controller.deletePlans(app, ids);

  assert.deepEqual(Array.from(ids), ['plan-1', 'plan-3']);
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [['care_plans', 'id', ['plan-1', 'plan-3']]]);
});

test('Given production and harness pages, when Care starts, then selection deletion assets load before the main controller', () => {
  for (const page of ['care/index.html', 'care/_harness.html']) {
    const html = source(page);
    const app = html.indexOf('care-app.js');
    const bulk = html.indexOf('care-plan-bulk-delete.js');
    const main = html.indexOf('care-ui.js');

    assert.match(html, /care-plan-bulk-delete\.css/);
    assert.ok(app >= 0 && bulk > app && main > bulk, page);
  }
});
