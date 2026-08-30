const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const routineKeys = [
  'repeatEveryDays', 'repeatWeekdays', 'repeatWeeklyTarget', 'weeklyTargetCount',
  'weeklyTargetHint', 'weeklyTargetRequired', 'dailyAchievement', 'streakAchieved',
  'streakContinue', 'streakStart', 'weeklyRhythm', 'weeklyFlexibleProgress',
  'dueCount', 'completedAll', 'partialDone', 'scheduled', 'noSchedule', 'thisWeek',
  'weeklyCalendarHint', 'planBulkMode', 'planBulkCount', 'planBulkHint',
  'planBulkDeleteAction', 'planBulkDeleteConfirm', 'planBulkSelectAria',
];
const alertKeys = [
  'alertKicker', 'alertCenter', 'alertCount', 'alertForAnimal', 'alertPlanOverdueTitle',
  'alertPlanOverdueDetail', 'alertSymptomOpenTitle', 'alertSymptomOpenDetail',
  'alertRefusalPatternTitle', 'alertRefusalPatternDetail', 'alertWeightDropTitle',
  'alertWeightDropDetail', 'alertWeightStaleTitle', 'alertWeightStaleDetail', 'alertSafetyNote',
];

function loadI18n(search = '?lang=en') {
  const document = {
    title: '',
    documentElement: { lang: 'ko' },
    querySelectorAll() { return []; },
  };
  const window = { location: { search }, document };
  const context = {
    window, document, Intl, URL, URLSearchParams, Date, decodeURIComponent, encodeURIComponent,
  };
  vm.createContext(context);
  for (const language of ['ko', 'en', 'zh', 'ja']) {
    vm.runInContext(read(`care/care-i18n-${language}.js`), context);
  }
  vm.runInContext(read('care/care-i18n.js'), context);
  return { i18n: window.CareI18n, locales: window.CareI18nLocales };
}

test('Given the routine copy contract, when all locales are inspected, then every locale defines each localized key', () => {
  // Given
  const { locales } = loadI18n();

  // When
  const missing = Object.fromEntries(Object.entries(locales).map(([language, locale]) => [
    language,
    routineKeys.filter(key => !Object.prototype.hasOwnProperty.call(locale, key)),
  ]));

  // Then
  assert.deepEqual(missing, { ko: [], en: [], zh: [], ja: [] });
  for (const language of ['en', 'zh', 'ja']) {
    const copy = routineKeys.map(key => String(locales[language][key])).join(' ');
    assert.doesNotMatch(copy, /[가-힣]/, `${language} routine copy must not contain Korean fallback text`);
  }
});

test('Given the alert centre copy contract, when all locales are inspected, then every locale defines each localized key', () => {
  // Given
  const { locales } = loadI18n();

  // When
  const missing = Object.fromEntries(Object.entries(locales).map(([language, locale]) => [
    language,
    alertKeys.filter(key => !Object.prototype.hasOwnProperty.call(locale, key)),
  ]));

  // Then
  assert.deepEqual(missing, { ko: [], en: [], zh: [], ja: [] });
});

test('Given weekly-target plans, when their cycle labels are rendered, then the active language expresses a flexible weekly count', () => {
  // Given
  const expected = {
    ko: '주 3회',
    en: '3 times a week',
    zh: '每周3次',
    ja: '週3回',
  };

  // When
  const actual = Object.fromEntries(Object.keys(expected).map(language => {
    const { i18n } = loadI18n(language === 'ko' ? '' : `?lang=${language}`);
    return [language, i18n.cycleLabel({ weekly_target: 3, interval_days: 1, weekdays: [1, 3, 5] })];
  }));

  // Then
  assert.deepEqual(actual, expected);
});

test('Given hostile routine progress values, when translated HTML is formatted, then only replacements are escaped', () => {
  // Given
  const { i18n } = loadI18n('?lang=en');
  const hostileDone = '<img src=x onerror=alert(1)>';

  // When
  const rendered = i18n.html('weeklyFlexibleProgress', { done: hostileDone, target: '4 & more' });

  // Then
  assert.equal(rendered, '&lt;img src=x onerror=alert(1)&gt; of 4 &amp; more completed');
});

test('Given an individual plan deletion, when Korean confirmation copy is shown, then the irreversible action is explicit and completion history is preserved', () => {
  const { i18n } = loadI18n('');
  const copy = i18n.t('planDeleteConfirm');

  assert.match(copy, /정말.*삭제/);
  assert.match(copy, /완료 기록/);
});
