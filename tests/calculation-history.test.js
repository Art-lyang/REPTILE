const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { breedingSource } = require('./helpers/breeding-source');

const root = path.resolve(__dirname, '..');

function draft(index, language = 'ko') {
  const labels = {
    ko: ['맥스노우', '노멀', '슈퍼 스노우'],
    en: ['Mack Snow', 'Normal', 'Super Snow'],
  }[language] || ['Mack Snow', 'Normal', 'Super Snow'];
  return {
    version: 1,
    species: 'gecko',
    calculatedAt: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
    parents: {
      A: {
        label: index ? labels[0] + ' ' + index : labels[0],
        traits: [{ id: 'gene' + index, state: 'het', label: labels[0] }],
      },
      B: { label: labels[1], traits: [] },
    },
    results: [
      { label: labels[1], probability: 0.5, guaranteedHets: [], partialHets: [] },
      { label: labels[2], probability: 0.5, guaranteedHets: [], partialHets: [] },
    ],
    warnings: [],
    lineTraits: [],
  };
}

function loadApi(seed) {
  const values = new Map(Object.entries(seed || {}));
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const window = {};
  const context = {
    window,
    Date,
    Intl,
    encodeURIComponent,
    localStorage,
    sessionStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {},
    },
  };
  vm.createContext(context);
  [
    ['assets', 'breeding-draft.js'],
    ['assets', 'calculation-history-i18n.js'],
    ['assets', 'calculation-history-store.js'],
    ['assets', 'calculation-history.js'],
  ].forEach(parts => {
    const file = path.join(root, ...parts);
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  });
  return {
    store: window.CalculationHistoryStore || {},
    ui: window.CalculationHistory || {},
    values,
  };
}

test('Given the same two parents in reverse order, when fingerprints are made, then the pairing is treated as one calculation', () => {
  const { store } = loadApi();
  assert.equal(typeof store.fingerprint, 'function');
  const original = draft(1);
  const swapped = structuredClone(original);
  [swapped.parents.A, swapped.parents.B] = [swapped.parents.B, swapped.parents.A];
  swapped.results[1].label = 'localized result text does not affect identity';

  assert.equal(store.fingerprint(original), store.fingerprint(swapped));
});

test('Given more than five calculations, when recent history is read, then only the latest five remain', () => {
  const { store } = loadApi();
  assert.equal(typeof store.record, 'function');
  for (let index = 1; index <= 6; index += 1) store.record(draft(index), 'ko');

  const history = store.list('gecko', 'ko');

  assert.equal(history.recent.length, 5);
  assert.match(history.recent[0].snapshot.parents.A.label, /6/);
  assert.doesNotMatch(history.recent.map(item => item.snapshot.parents.A.label).join(' '), / 1(?: |$)/);
});

test('Given an older favorite, when newer calculations trim recents, then the favorite is preserved', () => {
  const { store } = loadApi();
  const first = store.record(draft(1), 'ko');
  assert.equal(store.toggleFavorite(first.key), true);
  for (let index = 2; index <= 7; index += 1) store.record(draft(index), 'ko');

  const history = store.list('gecko', 'ko');

  assert.equal(history.recent.length, 5);
  assert.equal(history.favorites.length, 1);
  assert.equal(history.favorites[0].key, first.key);
});

test('Given invalid browser storage, when history loads, then tampered records are discarded safely', () => {
  const storageKey = 'studioCalculationHistory.v1';
  const { store, values } = loadApi({
    [storageKey]: JSON.stringify([
      { key: '<script>', language: 'ko', favorite: true, snapshot: { version: 99 } },
    ]),
  });
  assert.equal(typeof store.list, 'function');

  const history = store.list('gecko', 'ko');

  assert.equal(history.recent.length, 0);
  assert.equal(history.favorites.length, 0);
  assert.equal(values.get(storageKey), '[]');
});

test('Given stored labels contain markup, when history renders, then browser data is escaped instead of executed', () => {
  const { store, ui } = loadApi();
  const unsafe = draft(1);
  unsafe.parents.A.label = '<img src=x onerror=alert(1)>';
  unsafe.results[1].label = '<script>alert(1)</script>';
  store.record(unsafe, 'ko');

  const html = ui.html(unsafe, 'ko');

  assert.doesNotMatch(html, /<img|<script>/i);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script/);
});

test('Given Korean and English history screens, when they render, then each language stays localized', () => {
  const { store, ui } = loadApi();
  store.record(draft(1, 'ko'), 'ko');
  assert.equal(typeof ui.html, 'function');

  const korean = ui.html(draft(1, 'ko'), 'ko');
  const english = ui.html(draft(2, 'en'), 'en');

  assert.match(korean, /계산 기록/);
  assert.match(korean, /최근 5/);
  assert.match(korean, /즐겨찾기/);
  assert.match(korean, /부모 A\/B 바꾸기/);
  assert.match(korean, /다시 불러오기/);
  assert.match(korean, /대표 결과/);
  assert.match(ui.html(null, 'ko', 'gecko'), /맥스노우/);
  assert.match(english, /Calculation history/);
  assert.match(english, /Swap parents A\/B/);
  assert.doesNotMatch(english, /계산 기록|즐겨찾기|다시 불러오기/);
});

test('Given the leopard calculator, when history is integrated, then it records silently and management owns the history UI', () => {
  const page = fs.readFileSync(path.join(root, 'gecko', 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'gecko', 'gecko-ui.js'), 'utf8');
  const breedingPage = fs.readFileSync(path.join(root, 'care', 'breeding.html'), 'utf8');
  const breedingUi = breedingSource();

  assert.match(page, /\/assets\/calculation-history-store\.js/);
  assert.doesNotMatch(page, /calculation-history-i18n\.js/);
  assert.doesNotMatch(page, /calculation-history\.js/);
  assert.doesNotMatch(page, /calculation-history\.css/);
  assert.match(ui, /CalculationHistoryStore\.record/);
  assert.doesNotMatch(ui, /CalculationHistory\.(?:html|bind)/);
  assert.match(breedingPage, /\/assets\/calculation-history-store\.js/);
  assert.match(breedingPage, /\/assets\/breeding-workspace\.js/);
  assert.match(breedingUi, /BreedingWorkspace\.html/);
});
