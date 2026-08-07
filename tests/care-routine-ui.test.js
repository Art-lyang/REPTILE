const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function source(relative) {
  const file = path.join(root, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function loadUi(relative, exportName) {
  const window = {};
  const context = { window, Date, Math, Number, String, Object, Array, JSON };
  vm.createContext(context);
  /* 날짜 칸은 공용 부품이 그립니다(care/date-field.js). 가짜로 대신하면 실제로
     나가는 마크업과 달라져서, 이 시험이 통과해도 화면이 깨질 수 있습니다. */
  vm.runInContext(source('care/date-field.js'), context, { filename: 'care/date-field.js' });
  context.DateField = window.DateField;
  vm.runInContext(source(relative), context, { filename: relative });
  return window[exportName] || {};
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function i18n() {
  return {
    t(key, values) {
      return key + (values ? ':' + JSON.stringify(values) : '');
    },
    formatDate: value => value,
    formatNumber: value => String(value),
    weekdayShort: value => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][value],
    kindName: value => value,
    cycleLabel: plan => plan.weekly_target ? `weekly-${plan.weekly_target}` : 'fixed',
    presetTitle: value => value,
    planDetail: value => value,
  };
}

function core() {
  return {
    today: () => '2026-08-05',
    CARE_KINDS: { feed: { emoji: 'F' }, clean: { emoji: 'C' } },
    kindInfo: () => ({ color: '#075a48', icon: 'bi-check' }),
    feedKindInfo: () => ({ emoji: 'F' }),
    planStatus(plan, date, doneDates) {
      const done = doneDates.includes(date);
      return { due: true, done, overdue: 0 };
    },
  };
}

function routine() {
  return {
    weeklyTarget: plan => plan.weekly_target || null,
    todayAchievement: () => ({ due: 2, done: 1, allDone: false, current: 4, next: 5 }),
    weekOverview: () => [
      { date: '2026-08-03', due: 2, done: 2, status: 'complete' },
      { date: '2026-08-04', due: 1, done: 0, status: 'missed' },
      { date: '2026-08-05', due: 2, done: 1, status: 'partial' },
      { date: '2026-08-06', due: 1, done: 0, status: 'future' },
      { date: '2026-08-07', due: 1, done: 0, status: 'future' },
      { date: '2026-08-08', due: 0, done: 0, status: 'idle' },
      { date: '2026-08-09', due: 0, done: 0, status: 'idle' },
    ],
    weeklyProgress: () => ({
      target: 3, done: 2, remaining: 1, complete: false,
      days: [
        { date: '2026-08-03', done: true }, { date: '2026-08-04', done: false },
        { date: '2026-08-05', done: true, today: true }, { date: '2026-08-06', done: false, future: true },
        { date: '2026-08-07', done: false, future: true }, { date: '2026-08-08', done: false, future: true },
        { date: '2026-08-09', done: false, future: true },
      ],
    }),
  };
}

test('Given daily and flexible plans, when Today renders, then streak and seven-day rhythm stay visible and labelled', () => {
  const ui = loadUi('care/care-today-ui.js', 'CareTodayUi');
  const html = ui.render({
    plans: [
      { id: 'daily', kind: 'clean', title: '청소', interval_days: 1, is_active: true },
      { id: 'weekly', kind: 'feed', title: '유동 급여', weekly_target: 3, is_active: true },
    ],
    records: [{ plan_id: 'weekly', done_date: '2026-08-05' }],
    day: '2026-08-05', core: core(), routine: routine(), i18n: i18n(), escapeHtml,
    icon: name => `<i>${escapeHtml(name)}</i>`, animalName: () => null,
    planName: plan => plan.title, kindTag: () => '<span>kind</span>',
  });

  assert.match(html, /routine-achievement/);
  assert.match(html, /streakContinue/);
  assert.equal((html.match(/class="routine-day /g) || []).length, 7);
  assert.match(html, /weeklyFlexibleProgress/);
  assert.match(html, /aria-label=/);
});

test('Given a plan editor, when the repeat settings render, then all three repeat modes and one-through-seven targets exist', () => {
  const ui = loadUi('care/care-plan-ui.js', 'CarePlanUi');
  const html = ui.render({
    plans: [], animals: [], feeds: [], editPlan: {
      kind: 'feed', title: '급여', weekly_target: 3, start_date: '2026-08-01', is_active: true,
    },
    core: core(), i18n: i18n(), escapeHtml,
    icon: name => `<i>${escapeHtml(name)}</i>`, speciesOf: () => ({ icon: 'A' }),
    planName: plan => plan.title,
  });

  assert.match(html, /data-mode="days"/);
  assert.match(html, /data-mode="week"/);
  assert.match(html, /data-mode="target"/);
  assert.equal((html.match(/data-weekly-target=/g) || []).length, 7);
  assert.match(html, /data-weekly-target="3"[^>]*class="weekly-target on"|class="weekly-target on"[^>]*data-weekly-target="3"/);
  assert.match(html, /id="p_weekly_target"/);
  assert.ok(html.indexOf('data-wd="1"') < html.indexOf('data-wd="0"'),
    'weekday settings must read Monday through Sunday like the weekly rhythm');
});

test('Given a weekly target starts tomorrow, when Today renders, then it cannot be completed early', () => {
  const ui = loadUi('care/care-today-ui.js', 'CareTodayUi');
  const html = ui.render({
    plans: [
      { id: 'daily', kind: 'clean', title: 'current', interval_days: 1, start_date: '2026-08-01' },
      { id: 'future', kind: 'feed', title: 'future-weekly', weekly_target: 3, start_date: '2026-08-06' },
    ],
    records: [], day: '2026-08-05', streak: 0,
    core: core(), routine: routine(), i18n: i18n(), escapeHtml,
    icon: () => '', animalName: () => null, planName: plan => plan.title,
    kindTag: () => '<span>kind</span>',
  });

  assert.doesNotMatch(html, /future-weekly/);
});

test('Given an animal filter, when Today renders, then the streak rhythm keeps the whole-home plan scope', () => {
  const ui = loadUi('care/care-today-ui.js', 'CareTodayUi');
  const seen = [];
  const R = routine();
  R.todayAchievement = plans => {
    seen.push(['achievement', plans.map(plan => plan.id)]);
    return { due: plans.length, done: 0, allDone: false, current: 2, next: 3 };
  };
  R.weekOverview = plans => {
    seen.push(['rhythm', plans.map(plan => plan.id)]);
    return routine().weekOverview();
  };

  ui.render({
    plans: [{ id: 'focused', kind: 'clean', title: 'focused', interval_days: 1 }],
    routinePlans: [
      { id: 'focused', kind: 'clean', title: 'focused', interval_days: 1 },
      { id: 'other', kind: 'feed', title: 'other', interval_days: 1 },
    ],
    records: [], day: '2026-08-05', streak: 2,
    core: core(), routine: R, i18n: i18n(), escapeHtml,
    icon: () => '', animalName: () => null, planName: plan => plan.title,
    kindTag: () => '<span>kind</span>',
  });

  assert.deepEqual(seen, [
    ['achievement', ['focused', 'other']],
    ['rhythm', ['focused', 'other']],
  ]);
});

test('Given the selected animal has no tasks, when Today renders, then the whole-home streak dashboard remains visible', () => {
  const ui = loadUi('care/care-today-ui.js', 'CareTodayUi');
  const html = ui.render({
    plans: [],
    routinePlans: [{ id: 'other', kind: 'feed', title: 'other', interval_days: 1 }],
    records: [], day: '2026-08-05', streak: 2,
    core: core(), routine: routine(), i18n: i18n(), escapeHtml,
    icon: () => '', animalName: () => null, planName: plan => plan.title,
    kindTag: () => '<span>kind</span>',
  });

  assert.match(html, /routine-achievement/);
  assert.match(html, /routine-rhythm/);
  assert.match(html, /noPlansForSelection/);
});

test('Given only a flexible feeding plan with a reorder event, when Plans renders, then calendar export stays enabled', () => {
  const ui = loadUi('care/care-plan-ui.js', 'CarePlanUi');
  const html = ui.render({
    plans: [{ id: 'weekly', kind: 'feed', title: 'weekly', weekly_target: 3, is_active: true }],
    animals: [], feeds: [], editPlan: null, calendarOrderCount: 1,
    core: core(), i18n: i18n(), escapeHtml,
    icon: () => '', speciesOf: () => ({ icon: 'A' }), planName: plan => plan.title,
  });

  assert.match(html, /id="ics">/);
  assert.doesNotMatch(html, /id="ics" disabled/);
  assert.match(html, /countItems/);
});

test('Given untrusted plan text, when plan surfaces render, then markup stays inert', () => {
  const ui = loadUi('care/care-plan-ui.js', 'CarePlanUi');
  const malicious = '<img src=x onerror=alert(1)>';
  const html = ui.render({
    plans: [{ id: 'p1', title: malicious, kind: 'feed', interval_days: 1, is_active: true }],
    animals: [], feeds: [], editPlan: null, core: core(), i18n: i18n(), escapeHtml,
    icon: () => '', speciesOf: () => ({ icon: 'A' }), planName: plan => plan.title,
  });

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Given production and harness pages, when Care boots, then routine modules load before the main UI', () => {
  for (const page of ['care/index.html', 'care/_harness.html']) {
    const html = source(page);
    const routine = html.indexOf('care-routine.js');
    const today = html.indexOf('care-today-ui.js');
    const plan = html.indexOf('care-plan-ui.js');
    const main = html.indexOf('care-ui.js');
    assert.ok(routine >= 0 && today > routine && plan > today && main > plan, page);
    assert.match(html, /care-routine\.css/);
  }
});

test('Given the legacy Care controller, when routine UI is added, then schedule rendering is delegated and weekly targets persist', () => {
  const ui = source('care/care-ui.js');
  const app = source('care/care-app.js');
  assert.match(ui, /CareTodayUi\.render/);
  assert.match(ui, /CarePlanUi\.render/);
  assert.match(ui, /weekly_target/);
  assert.match(app, /weekly_target/);
  assert.match(ui, /feed_item_id/);
});

test('Given a flexible weekly plan, when its database row is normalized, then only that repeat rule persists', () => {
  const store = loadUi('care/care-plan-store.js', 'CarePlanStore');
  const row = store.row({
    animal_id: 'a1', kind: 'feed', title: '급여', feed_item_id: 'f1',
    interval_days: 2, weekdays: [1, 4], weekly_target: 3,
    start_date: '2026-08-01', is_active: true,
  }, '2026-08-02');

  assert.equal(row.interval_days, null);
  assert.equal(row.weekdays, null);
  assert.equal(row.weekly_target, 3);
  assert.equal(row.feed_item_id, 'f1');
});
