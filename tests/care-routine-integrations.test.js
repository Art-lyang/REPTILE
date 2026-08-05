const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadCore() {
  const context = { window: {}, TextEncoder, Date, Set, Math };
  vm.createContext(context);
  vm.runInContext(read('care/care-core.js'), context);
  return context.window.CareCore;
}

test('Given fixed and flexible plans, when a calendar is exported, then flexible targets never become false daily events', () => {
  const core = loadCore();
  const ics = core.buildIcs([
    { id: 'fixed', kind: 'clean', title: 'Fixed clean', interval_days: 2, start_date: '2026-08-01' },
    { id: 'flex', kind: 'feed', title: 'Flexible feed', weekly_target: 3, start_date: '2026-08-01' },
  ], {}, 'ryangstudio.com');

  assert.match(ics, /SUMMARY:.*Fixed clean/);
  assert.doesNotMatch(ics, /Flexible feed/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('Given a linked weekly feeding target, when inventory is forecast, then its average weekly use is included', () => {
  const core = loadCore();
  const plan = { id: 'p1', feed_item_id: 'f1', weekly_target: 3, is_active: true };
  const item = { id: 'f1', per_use: 7, amount_left: 21, amount_full: 21, lead_days: 0 };

  assert.equal(core.planPerDay(plan), 3 / 7);
  assert.equal(core.feedForecast(item, [plan], '2026-08-01').perDay, 3);
});

test('Given the dashboard needs an untruncated streak, when Care boots, then it requests the server aggregate', () => {
  const ui = read('care/care-ui.js');
  const app = read('care/care-app.js');
  assert.match(ui, /A\.routineStreak\(\)/);
  assert.match(app, /routineStreak[\s\S]*?rpc\(['"]care_routine_streak['"]/);
});
