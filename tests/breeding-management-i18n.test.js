const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const localeFiles = ['ko', 'en', 'zh', 'ja'].map((locale) => `care/breeding-i18n-${locale}.js`);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadI18n({ htmlLanguage = 'ko', search = '' } = {}) {
  const context = vm.createContext({
    document: { documentElement: { lang: htmlLanguage }, querySelectorAll() { return []; }, title: '' },
    location: { search },
  });
  context.window = context;
  localeFiles.concat('care/breeding-i18n.js').forEach((file) => {
    vm.runInContext(read(file), context, { filename: file });
  });
  return { context, i18n: context.BreedingI18n, locales: context.BreedingI18nLocales };
}

function scriptNames(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => match[1].split('/').pop().split('?')[0]);
}

function tokens(value, pattern) {
  return [...String(value).matchAll(pattern)].map((match) => match[1] || match[0]).sort();
}

test('Given four management locales, when their dictionaries load, then every locale has the same non-empty keys', () => {
  // Given
  const { locales } = loadI18n();
  const supported = ['ko', 'en', 'zh', 'ja'];

  // When
  const keySets = supported.map((locale) => Object.keys(locales[locale]).sort());

  // Then
  supported.forEach((locale, index) => {
    assert.deepEqual(keySets[index], keySets[0], `${locale} management keys must match Korean`);
    keySets[index].forEach((key) => {
      assert.equal(typeof locales[locale][key] === 'string' && locales[locale][key].trim().length > 0, true,
        `${locale}.${key} must be a non-empty string`);
      assert.deepEqual(tokens(locales[locale][key], /\{([a-zA-Z0-9_]+)\}/g),
        tokens(locales.ko[key], /\{([a-zA-Z0-9_]+)\}/g), `${locale}.${key} placeholders`);
      assert.deepEqual(tokens(locales[locale][key], /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi),
        tokens(locales.ko[key], /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi), `${locale}.${key} markup`);
    });
  });
});

test('Given URL and HTML language variants, when management I18n initializes, then locale and species-core LANG stay synchronized', () => {
  // Given
  const cases = [
    [{ htmlLanguage: 'ko', search: '?species=gecko&lang=en' }, 'en'],
    [{ htmlLanguage: 'zh-Hans', search: '' }, 'zh'],
    [{ htmlLanguage: 'ja-JP', search: '' }, 'ja'],
    [{ htmlLanguage: 'fr', search: '' }, 'ko'],
  ];

  // When
  const results = cases.map(([options]) => {
    const loaded = loadI18n(options);
    loaded.i18n.initialize();
    return [loaded.i18n.language(), loaded.context.LANG, loaded.context.document.documentElement.lang];
  });

  // Then
  results.forEach((result, index) => {
    const expected = cases[index][1];
    assert.deepEqual(result, [expected, expected, expected === 'zh' ? 'zh-Hans' : expected]);
  });
});

test('Given translated HTML with hostile replacement values, when it is formatted, then dictionary markup remains and values are escaped', () => {
  // Given
  const { i18n } = loadI18n({ search: '?lang=en' });
  i18n.initialize();

  // When
  const output = i18n.html('animalEmpty', { species: '<img src=x onerror=alert(1)>' });

  // Then
  assert.match(output, /<br>/);
  assert.doesNotMatch(output, /<img\b/i);
  assert.match(output, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Given a non-Korean management route, when tabs, species, and calculators are opened, then its language is preserved', () => {
  // Given
  const { i18n } = loadI18n({ search: '?species=crested&lang=ja' });
  i18n.initialize();

  // When / Then
  assert.equal(i18n.managementUrl('fattail', 'clutch'), 'breeding.html?species=fattail&v=20260803m&lang=ja#clutch');
  assert.equal(i18n.managementUrl('gecko', 'pair', { from: 'analysis' }),
    'breeding.html?species=gecko&v=20260803m&lang=ja&from=analysis#pair');
  assert.equal(i18n.calculatorUrl('/crested/'), '/ja/crested/');
});

test('Given a classified backend error, when management presents it, then one shared classifier selects localized copy', () => {
  const loaded = loadI18n({ search: '?lang=en' });
  vm.runInContext(read('care/care-app.js'), loaded.context, { filename: 'care/care-app.js' });
  const cases = [
    ['row-level security violation', 'ownership'],
    ['duplicate key value violates unique constraint', 'duplicate'],
    ['JWT expired', 'login'],
    ['Failed to fetch', 'network'],
    ['care_plans_cycle_ck', 'cycle'],
    ['weight_logs_grams_ck', 'weight'],
    ['clutch and pairing species must match', 'link'],
    ['null value in column "public_weight" violates not-null constraint', 'data'],
    ['CARE_SIRE_INVALID', 'parent'],
  ];
  cases.forEach(([message, key]) => {
    assert.equal(loaded.context.CareApp.errorKey(new Error(message)), key);
    assert.notEqual(loaded.i18n.friendly(new Error(message)), message);
  });
  assert.equal(loaded.i18n.friendly(new Error('JWT expired')), 'Sign in required.');
  assert.equal(loaded.i18n.friendly(new Error('internal database detail')), 'Unknown error');
  assert.doesNotMatch(read('care/breeding-i18n.js'), /row-level security|duplicate key|Failed to fetch/);
  assert.match(read('care/care-app.js'), /errorKey:\s*errorKey/);
});

test('Given production and harness pages, when scripts load, then all management locales and runtime precede every panel', () => {
  // Given
  const expectedI18n = localeFiles.map((file) => file.split('/').pop()).concat('breeding-i18n.js');
  const firstPanel = 'breeding-animal-panel.js';

  // When / Then
  ['care/breeding.html', 'care/_harness-breed.html'].forEach((page) => {
    const scripts = scriptNames(read(page));
    const actualI18n = scripts.filter((name) => expectedI18n.includes(name));
    assert.deepEqual(actualI18n, expectedI18n, `${page} management I18n order`);
    assert.ok(scripts.indexOf(expectedI18n.at(-1)) < scripts.indexOf(firstPanel), `${page} I18n must precede panels`);
  });
  const production = read('care/breeding.html');
  assert.ok(production.indexOf('breeding-i18n.js?v=20260803i') >= 0);
  assert.ok(production.indexOf('breeding-i18n.js?v=20260803i') < production.indexOf('</head>'));
  assert.ok(production.indexOf('BreedingI18n.apply(document)') < production.indexOf('supabase-js@'));
});

test('Given the management controller, when dependencies and core loading are inspected, then one translator is injected before the core executes', () => {
  // Given
  const controller = read('care/breeding-ui.js');

  // When / Then
  assert.match(controller, /window\.BreedingI18n/);
  assert.match(controller, /i18n:\s*I18n/);
  assert.match(controller, /I18n\.initialize\(\)[\s\S]*await loadScript\(CORES\[S\.species\]\.src/);
  assert.match(controller, /pairCandidate:[\s\S]*I18n\.managementUrl\(S\.species, 'pair'\)/);
  assert.doesNotMatch(controller, /replaceState\([^\n]+['"]\?species=/);
  assert.match(controller, /A\.logVisit\(I18n\.language\(\)\)/);
});

test('Given the Leopard calculator language changes, when its management entry is updated, then label and route follow the active language', () => {
  const calculator = read('gecko/gecko-ui.js');
  const page = read('gecko/index.html');
  assert.match(calculator, /pro\.href='\/care\/breeding\.html\?species=gecko&v=20260803m'.*LANG.*lang=/);
  assert.match(calculator, /proText\.textContent=t\.saveBreeding/);
  assert.match(page, /gecko-ui\.js\?v=20260806b/);
});

test('Given the shared care backend changes, when production pages boot, then every consumer requests the same fresh version', () => {
  ['care/index.html', 'care/animal.html', 'care/breeding.html'].forEach((page) => {
    assert.match(read(page), /care-app\.js\?v=20260807a/, page);
  });
});

test('Given every management feature module, when visible copy is audited, then no Korean-only UI literal bypasses I18n', () => {
  const modules = ['breeding-ui.js', 'breeding-animal-panel.js', 'breeding-pairing-panel.js',
    'breeding-mating-panel.js', 'breeding-hatch-panel.js', 'breeding-clutch-panel.js',
    'breeding-genetic-goal.js', 'breeding-events.js'];
  modules.forEach((file) => {
    const executable = read(`care/${file}`).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(executable, /[가-힣]/, `${file} visible copy must use BreedingI18n`);
    assert.match(executable, /(?:deps\.i18n|window\.BreedingI18n)/, `${file} must consume BreedingI18n`);
  });
});
