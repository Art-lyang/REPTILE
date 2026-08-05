const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadI18n(search = '?lang=en', htmlLanguage = 'ko') {
  const elements = [];
  const documentElement = { lang: htmlLanguage };
  const document = {
    title: '',
    documentElement,
    querySelectorAll() { return elements; },
  };
  const window = { location: { search }, document };
  const context = { window, document, Intl, URL, URLSearchParams, Date, decodeURIComponent, encodeURIComponent };
  vm.createContext(context);
  ['ko', 'en', 'zh', 'ja'].forEach(language => {
    vm.runInContext(read(`care/care-i18n-${language}.js`), context);
  });
  vm.runInContext(read('care/care-i18n.js'), context);
  return { i18n: window.CareI18n, locales: window.CareI18nLocales, document };
}

test('Given the four care locales, when their contracts are compared, then every language has the same keys', () => {
  const { locales } = loadI18n();
  const expected = Object.keys(locales.ko).sort();

  for (const language of ['en', 'zh', 'ja']) {
    assert.deepEqual(Object.keys(locales[language]).sort(), expected, `${language} locale keys must match Korean`);
  }
});

test('Given a non-Korean care locale, when every visible value is inspected, then Korean fallback copy does not leak', () => {
  const { locales } = loadI18n();

  for (const language of ['en', 'zh', 'ja']) {
    const leaked = Object.entries(locales[language])
      .filter(([, value]) => /[가-힣]/.test(Array.isArray(value) ? value.join('') : String(value)))
      .map(([key]) => key);
    assert.deepEqual(leaked, [], `${language} contains Korean fallback keys: ${leaked.join(', ')}`);
  }
});

test('Given an English care route, when common labels are requested, then core care concepts are translated', () => {
  const { i18n } = loadI18n('?lang=en');

  assert.equal(i18n.t('pageTitle'), 'Creature Care Log · Ryang Studio');
  assert.equal(i18n.t('tabToday'), 'Today');
  assert.equal(i18n.speciesName('leopard'), 'Leopard Gecko');
  assert.equal(i18n.kindName('feed'), 'Feeding');
  assert.equal(i18n.feedKindName('supplement'), 'Supplement');
  assert.equal(i18n.signName('resp'), 'Breathing changes');
  assert.equal(i18n.cycleLabel({ interval_days: 3 }), 'Every 3 days');
  assert.equal(i18n.presetTitle('급여'), 'Feeding');
  assert.equal(i18n.canonicalPresetTitle('Feeding'), '급여');
  assert.equal(i18n.planDetail('성체 기준. 유체는 매일'), 'Adult baseline. Juveniles may need daily feeding.');
  assert.equal(i18n.canonicalPlanDetail('Adult baseline. Juveniles may need daily feeding.'), '성체 기준. 유체는 매일');
});

test('Given Chinese is selected, when the care page initializes, then the document language and title update before UI boot', () => {
  const { i18n, document } = loadI18n('?lang=zh');

  i18n.initialize('pageTitle');

  assert.equal(document.documentElement.lang, 'zh-Hans');
  assert.equal(document.title, '生物照护日志 · Ryang Studio');
});

test('Given navigation between care screens, when a localized URL is created, then language and existing query data are preserved', () => {
  const { i18n } = loadI18n('?lang=ja');

  assert.equal(
    i18n.url('/care/animal.html?id=animal-1#weight'),
    '/care/animal.html?id=animal-1&lang=ja#weight',
  );
  assert.equal(i18n.url('/care/'), '/care/?lang=ja');
  assert.equal(i18n.url('/care/gallery.html', { species: 'crested' }), '/care/gallery.html?lang=ja&species=crested');
});

test('Given every care entry page, when its head is parsed, then locale modules initialize before the page UI', () => {
  const pages = {
    'care/index.html': 'care-ui.js',
    'care/animal.html': 'animal-ui.js',
    'care/gallery.html': 'gallery-ui.js',
    'care/p.html': 'pub-ui.js',
    'care/breeder.html': 'breeder-ui.js',
  };

  for (const [page, uiScript] of Object.entries(pages)) {
    const html = read(page);
    for (const language of ['ko', 'en', 'zh', 'ja']) {
      assert.match(html, new RegExp(`care-i18n-${language}\\.js\\?v=`), `${page} must load ${language}`);
    }
    assert.match(html, /care-i18n\.js\?v=/, `${page} must load the I18n runtime`);
    assert.match(html, /data-care-language/, `${page} must expose a language selector`);
    assert.ok(html.indexOf('CareI18n.initialize') < html.indexOf(uiScript), `${page} must initialize before ${uiScript}`);
  }
});

test('Given localized care UI modules, when they render dynamic content, then they use the shared I18n boundary', () => {
  for (const file of ['care/care-ui.js', 'care/animal-ui.js', 'care/gallery-ui.js', 'care/pub-ui.js', 'care/breeder-ui.js']) {
    const source = read(file);
    assert.match(source, /CareI18n/, `${file} must use CareI18n`);
    assert.match(source, /I\.t\(/, `${file} must translate dynamic labels`);
  }
});

test('Given the care dashboard and detail page, when static controls render, then text and accessibility labels have locale keys', () => {
  const dashboard = read('care/index.html');
  const animal = read('care/animal.html');

  assert.match(dashboard, /data-care-text="tabToday"/);
  assert.match(dashboard, /data-care-aria="focusAnimal"/);
  assert.match(animal, /data-care-text="backToList"/);
  assert.match(dashboard, /CareI18n\.apply\(document\)/);
  assert.match(animal, /CareI18n\.apply\(document\)/);
  assert.match(dashboard, /href="\/gecko\/login\.html"[^>]+data-care-url/);
  assert.match(animal, /href="\/care\/"[^>]+data-care-url/);
});

test('Given the closed beta gate, when a non-Korean care URL opens, then every gate message has localized copy', () => {
  const gate = read('assets/gate.js');
  for (const language of ['ko', 'en', 'zh', 'ja']) {
    assert.match(gate, new RegExp(`${language}: \\{`), `gate must include ${language}`);
  }
  assert.match(gate, /window\.location\.search/);
  assert.match(gate, /copy\('title'\)/);
  assert.match(gate, /copy\('password'\)/);
  for (const page of ['care/index.html', 'care/animal.html', 'care/breeding.html']) {
    assert.match(read(page), /gate\.js\?v=2/, `${page} must invalidate the old gate cache`);
  }
});

test('Given localized QA harnesses, when language is selected or the animal id is injected, then static labels and lang remain intact', () => {
  const dashboard = read('care/_harness.html');
  const animal = read('care/_harness-animal.html');

  assert.match(dashboard, /data-care-language/);
  assert.match(dashboard, /data-care-text="tabToday"/);
  assert.match(dashboard, /CareI18n\.apply\(document\)/);
  assert.match(animal, /new URL\(location\.href\)/);
  assert.doesNotMatch(animal, /replaceState\(null, '', '\?id=/);
});

test('Given a localized calendar export, when events are built, then its calendar, category, and order copy use that language', () => {
  const context = { window: {}, TextEncoder, Date, Set, Math };
  vm.createContext(context);
  vm.runInContext(read('care/care-core.js'), context);
  const core = context.window.CareCore;
  const labels = {
    language: 'EN', calendarName: 'Animal Care', kindName: () => 'Feeding', planTitle: title => title,
    planDetail: () => 'Adult baseline. Juveniles may need daily feeding.',
    orderTitle: name => `🛒 Order ${name}`, orderDescription: date => `Expected to run out around ${date}.`,
    orderCategory: 'Order',
  };
  const ics = core.buildIcs(
    [{ id: 'plan-1', kind: 'feed', title: null, detail: '성체 기준. 유체는 매일', start_date: '2026-08-02', interval_days: 2, is_active: true }],
    {}, 'ryangstudio.com',
    [{ id: 'feed-1', name: 'Crickets', orderOn: '2026-08-03', emptyOn: '2026-08-05' }],
    labels,
  );

  assert.match(ics, /X-WR-CALNAME:Animal Care/);
  assert.match(ics, /CATEGORIES:Feeding/);
  assert.match(ics, /DESCRIPTION:Adult baseline\. Juveniles may need daily feeding\./);
  assert.match(ics, /SUMMARY:🛒 Order Crickets/);
  assert.match(ics, /CATEGORIES:Order/);
  assert.doesNotMatch(ics, /사육 케어|주문|급여/);
});

test('Given system-generated records and presets, when another language is active, then stored protocol values remain language-neutral', () => {
  const dashboard = read('care/care-ui.js');
  const animal = read('care/animal-ui.js');

  assert.match(dashboard, /title:\s*t\.title,\s*detail:\s*t\.detail/);
  assert.match(dashboard, /canonicalPresetTitle\(\$\('p_title'\)\.value\.trim\(\)\)/);
  assert.match(dashboard, /canonicalPlanDetail\(\$\('p_detail'\)\.value\.trim\(\)\)/);
  assert.match(animal, /quickKind\s*=\s*d\.quick/);
  assert.match(animal, /kind:\s*quickKind,\s*title:\s*null/);
  assert.match(animal, /d\.quick === 'feed'[\s\S]*FeedingDialog\.open/);
});

test('Given old and new symptom status records, when status is calculated, then stable codes and legacy Korean values remain compatible', () => {
  const context = { window: {}, TextEncoder, Date, Set, Math };
  vm.createContext(context);
  vm.runInContext(read('care/care-core.js'), context);
  const core = context.window.CareCore;
  const row = title => [{ kind: 'symptom', detail: 'resp', title, done_date: '2026-08-02' }];

  assert.equal(core.signStatus(row('observing'), '2026-08-02')[0].open, true);
  assert.equal(core.signStatus(row('resolved'), '2026-08-02')[0].open, false);
  assert.equal(core.signStatus(row('관찰'), '2026-08-02')[0].open, true);
  assert.equal(core.signStatus(row('해소'), '2026-08-02')[0].open, false);
});
