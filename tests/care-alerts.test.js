const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function loadAlerts() {
  const window = {};
  vm.runInNewContext(read('care/care-alerts.js'), { window }, { filename: 'care/care-alerts.js' });
  return window.CareAlerts;
}

function statusCore() {
  return {
    addDays(day, amount) {
      const date = new Date(day + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + amount);
      return date.toISOString().slice(0, 10);
    },
    planStatus(plan) {
      return plan.id === 'late-plan'
        ? { overdue: 2, done: false }
        : { overdue: 0, done: false };
    },
    signStatus(records) {
      return records.some(record => record.kind === 'symptom')
        ? [{ code: 'resp', open: true, days: 3 }]
        : [];
    },
    SIGNS: { resp: { vet: true } },
  };
}

test('Given overdue care, repeated refusals, a concerning observation, and weight signals, when alerts are built, then they are deduplicated and prioritized', () => {
  // Given
  const alerts = loadAlerts();
  const input = {
    today: '2026-08-04',
    core: statusCore(),
    animals: [
      { id: 'a1', name: '라봉이', created_at: '2026-06-01T00:00:00Z' },
      { id: 'a2', name: '도도', created_at: '2026-05-01T00:00:00Z' },
    ],
    plans: [{ id: 'late-plan', animal_id: 'a1', title: '물 교체', kind: 'water', is_active: true }],
    records: [
      { animal_id: 'a1', kind: 'symptom', detail: 'resp', done_date: '2026-08-01' },
      { animal_id: 'a2', kind: 'refusal', done_date: '2026-07-27' },
      { animal_id: 'a2', kind: 'refusal', done_date: '2026-08-03' },
      { animal_id: 'a2', kind: 'refusal', done_date: '2026-08-03' },
    ],
    weights: [
      { animal_id: 'a1', grams: 50, measured_on: '2026-07-20' },
      { animal_id: 'a1', grams: 45, measured_on: '2026-08-03' },
      { animal_id: 'a2', grams: 60, measured_on: '2026-06-20' },
    ],
  };

  // When
  const actual = alerts.build(input);

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(actual.map(alert => ({
    type: alert.type, severity: alert.severity, animalId: alert.animalId, count: alert.count || null,
  })))), [
    { type: 'plan_overdue', severity: 'urgent', animalId: 'a1', count: null },
    { type: 'symptom_open', severity: 'urgent', animalId: 'a1', count: null },
    { type: 'refusal_pattern', severity: 'attention', animalId: 'a2', count: 2 },
    { type: 'weight_drop', severity: 'attention', animalId: 'a1', count: null },
    { type: 'weight_stale', severity: 'attention', animalId: 'a2', count: null },
  ]);
  assert.equal(actual[3].percent, 10);
});

test('Given alert rows with untrusted animal text, when the alert centre renders, then text stays escaped and each row has a targeted route', () => {
  // Given
  const window = {};
  vm.runInNewContext(read('care/care-alert-ui.js'), { window }, { filename: 'care/care-alert-ui.js' });
  const i18n = {
    t: (key, values) => key + (values ? ':' + JSON.stringify(values) : ''),
    formatNumber: value => String(value),
    url: base => base,
  };

  // When
  const html = window.CareAlertUi.render({
    alerts: [{
      type: 'weight_drop', severity: 'attention', animalId: 'a1', animalName: '<img src=x>', percent: 10,
    }],
    i18n, escapeHtml: value => String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  });

  // Then
  assert.match(html, /care-alert-center/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /animal\.html\?id=a1#weight/);
});

test('Given production and harness pages, when care loads, then alert rules and UI load before the main controller without extra API calls', () => {
  // Given
  const pages = ['care/index.html', 'care/_harness.html'];

  // When / Then
  pages.forEach(relative => {
    const html = read(relative);
    const rules = html.indexOf('care-alerts.js');
    const alertUi = html.indexOf('care-alert-ui.js');
    const main = html.indexOf('care-ui.js');
    assert.ok(rules >= 0 && alertUi > rules && main > alertUi, relative);
    assert.match(html, /care-alert\.css/);
  });
});

test('Given care data has already loaded, when Today renders the alert centre, then it reuses that snapshot without a second data request', async () => {
  // Given
  const calls = { animals: 0, plans: 0, records: 0, weights: 0 };
  let enhanceToday = null;
  const todayUi = Object.freeze({
    render: options => enhanceToday ? enhanceToday(options, '<main>today</main>') : '<main>today</main>',
    setEnhancer: enhancer => { enhanceToday = enhancer; },
  });
  const window = {
    CareTodayUi: todayUi,
    CareApp: {
      listAnimals: async () => { calls.animals += 1; return [{ id: 'a1', name: '라봉이' }]; },
      listPlans: async () => { calls.plans += 1; return [{ id: 'late-plan', animal_id: 'a1', kind: 'water', title: '물 교체' }]; },
      listRecords: async () => { calls.records += 1; return []; },
      listWeights: async () => { calls.weights += 1; return []; },
    },
  };
  const context = { window, Promise, Date, Set, Number, Math, String, Object, Array, encodeURIComponent };
  vm.runInNewContext(read('care/care-alerts.js'), context, { filename: 'care/care-alerts.js' });
  vm.runInNewContext(read('care/care-alert-ui.js'), context, { filename: 'care/care-alert-ui.js' });
  const core = Object.assign(statusCore(), { signStatus: () => [] });
  const i18n = { t: key => key, formatNumber: value => String(value), url: value => value };

  // When
  await Promise.all([
    window.CareApp.listAnimals(), window.CareApp.listPlans(), window.CareApp.listRecords(), window.CareApp.listWeights(null),
  ]);
  const html = window.CareTodayUi.render({
    day: '2026-08-04', core, i18n, escapeHtml: value => String(value), plans: [], records: [],
  });

  // Then
  assert.deepEqual(calls, { animals: 1, plans: 1, records: 1, weights: 1 });
  assert.match(html, /care-alert-center/);
});
