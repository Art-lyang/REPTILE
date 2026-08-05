const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadRoutine() {
  const file = path.join(root, 'care', 'care-routine.js');
  const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const window = {};
  vm.runInNewContext(source, { window, Date }, { filename: 'care/care-routine.js' });
  return window.CareRoutine || {};
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('Given weekly frequency values, when targets are parsed, then only whole numbers from one through seven are accepted', () => {
  // Given
  const routine = loadRoutine();

  // When
  const values = [
    routine.weeklyTarget({ weekly_target: 1 }),
    routine.weeklyTarget({ weekly_target: '7' }),
    routine.weeklyTarget({ weekly_target: 0 }),
    routine.weeklyTarget({ weekly_target: 8 }),
    routine.weeklyTarget({ weekly_target: 2.5 }),
    routine.weeklyTarget({ interval_days: 3 }),
  ];

  // Then
  assert.deepEqual(values, [1, 7, null, null, null, null]);
});

test('Given a Sunday at a month boundary, when its week is calculated, then Monday through Sunday stay as date-only strings', () => {
  // Given
  const routine = loadRoutine();
  const sunday = '2026-08-02';

  // When
  const monday = routine.mondayStart(sunday);
  const dates = routine.weekDates(sunday);

  // Then
  assert.equal(monday, '2026-07-27');
  assert.deepEqual(plain(dates), [
    '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
    '2026-07-31', '2026-08-01', '2026-08-02',
  ]);
});

test('Given fixed and flexible plans, when a date is checked, then only interval and weekday schedules become due', () => {
  // Given
  const routine = loadRoutine();
  const date = '2026-08-05';

  // When
  const results = [
    routine.fixedDue({ start_date: '2026-08-01', interval_days: 2 }, date),
    routine.fixedDue({ start_date: '2026-08-01', weekdays: [3] }, date),
    routine.fixedDue({ start_date: '2026-08-06', interval_days: 1 }, date),
    routine.fixedDue({ start_date: '2026-08-01', weekly_target: 3 }, date),
    routine.fixedDue({ start_date: '2026-08-01', interval_days: 1, is_active: false }, date),
  ];

  // Then
  assert.deepEqual(results, [true, true, false, false, false]);
});

test('Given a three-times-weekly plan, when progress is read midweek, then unique completion dates and day flags are returned', () => {
  // Given
  const routine = loadRoutine();
  const plan = { id: 'weekly', weekly_target: 3, start_date: '2026-08-01' };
  const records = [
    { plan_id: 'weekly', done_date: '2026-08-03' },
    { plan_id: 'weekly', done_date: '2026-08-03' },
    { plan_id: 'weekly', done_date: '2026-08-05' },
    { plan_id: 'other', done_date: '2026-08-06' },
  ];

  // When
  const progress = routine.weeklyProgress(plan, records, '2026-08-07');

  // Then
  assert.deepEqual(plain(progress), {
    target: 3,
    done: 2,
    remaining: 1,
    complete: false,
    days: [
      { date: '2026-08-03', done: true, available: true, future: false, today: false },
      { date: '2026-08-04', done: false, available: true, future: false, today: false },
      { date: '2026-08-05', done: true, available: true, future: false, today: false },
      { date: '2026-08-06', done: false, available: true, future: false, today: false },
      { date: '2026-08-07', done: false, available: true, future: false, today: true },
      { date: '2026-08-08', done: false, available: true, future: true, today: false },
      { date: '2026-08-09', done: false, available: true, future: true, today: false },
    ],
  });
});

test('Given a weekly target starts midweek, when progress is read, then pre-start completions are ignored', () => {
  const routine = loadRoutine();
  const plan = { id: 'weekly', weekly_target: 3, start_date: '2026-08-05' };
  const records = [
    { plan_id: 'weekly', done_date: '2026-08-03' },
    { plan_id: 'weekly', done_date: '2026-08-05' },
  ];

  const progress = routine.weeklyProgress(plan, records, '2026-08-06');

  assert.equal(progress.done, 1);
  assert.equal(progress.days[0].available, false);
  assert.equal(progress.days[2].available, true);
});

test('Given fixed plans completed before today, when today is unfinished, then yesterday streak remains and weekly plans cannot break it', () => {
  // Given
  const routine = loadRoutine();
  const plans = [
    { id: 'daily', start_date: '2026-08-01', interval_days: 1 },
    { id: 'mwf', start_date: '2026-08-01', weekdays: [1, 3, 5] },
    { id: 'weekly', start_date: '2026-08-01', weekly_target: 3 },
  ];
  const records = [
    { plan_id: 'daily', done_date: '2026-08-03' },
    { plan_id: 'mwf', done_date: '2026-08-03' },
    { plan_id: 'daily', done_date: '2026-08-04' },
    { plan_id: 'daily', done_date: '2026-08-05' },
  ];

  // When
  const achievement = routine.todayAchievement(plans, records, '2026-08-05');

  // Then
  assert.deepEqual(plain(achievement), {
    due: 2,
    done: 1,
    allDone: false,
    current: 2,
    next: 3,
  });
});

test('Given fixed plans across the current week, when the overview is built, then each day reports completion state without weekly targets', () => {
  // Given
  const routine = loadRoutine();
  const plans = [
    { id: 'daily', start_date: '2026-08-01', interval_days: 1 },
    { id: 'mwf', start_date: '2026-08-01', weekdays: [1, 3, 5] },
    { id: 'weekly', start_date: '2026-08-01', weekly_target: 2 },
  ];
  const records = [
    { plan_id: 'daily', done_date: '2026-08-03' },
    { plan_id: 'mwf', done_date: '2026-08-03' },
    { plan_id: 'daily', done_date: '2026-08-04' },
    { plan_id: 'daily', done_date: '2026-08-05' },
    { plan_id: 'weekly', done_date: '2026-08-03' },
  ];

  // When
  const overview = routine.weekOverview(plans, records, '2026-08-05');

  // Then
  assert.deepEqual(plain(overview), [
    { date: '2026-08-03', due: 2, done: 2, status: 'complete' },
    { date: '2026-08-04', due: 1, done: 1, status: 'complete' },
    { date: '2026-08-05', due: 2, done: 1, status: 'partial' },
    { date: '2026-08-06', due: 1, done: 0, status: 'future' },
    { date: '2026-08-07', due: 2, done: 0, status: 'future' },
    { date: '2026-08-08', due: 1, done: 0, status: 'future' },
    { date: '2026-08-09', due: 1, done: 0, status: 'future' },
  ]);
});

test('Given a past missed schedule and a day without schedules, when the week is summarized, then missed and idle remain distinct', () => {
  // Given
  const routine = loadRoutine();
  const plans = [{ id: 'monday', start_date: '2026-08-01', weekdays: [1] }];

  // When
  const overview = routine.weekOverview(plans, [], '2026-08-05');

  // Then
  assert.equal(overview[0].status, 'missed');
  assert.equal(overview[1].status, 'idle');
  assert.equal(overview[2].status, 'idle');
});

test('Given a server-derived streak, when today achievement renders, then the bounded records window cannot truncate it', () => {
  const routine = loadRoutine();
  const plans = [{ id: 'daily', start_date: '2020-01-01', interval_days: 1 }];
  const records = [{ plan_id: 'daily', done_date: '2026-08-05' }];

  const achievement = routine.todayAchievement(plans, records, '2026-08-05', 120);

  assert.equal(achievement.current, 120);
  assert.equal(achievement.next, 121);
  assert.equal(achievement.allDone, true);
});
