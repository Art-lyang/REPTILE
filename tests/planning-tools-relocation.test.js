const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { breedingSource } = require('./helpers/breeding-source');

const root = path.resolve(__dirname, '..');

function snapshot(index, language = 'ko') {
  const labels = language === 'en'
    ? ['Mack Snow', 'Normal', 'Super Snow']
    : ['맥스노우', '노멀', '슈퍼 스노우'];
  return {
    version: 1,
    species: 'gecko',
    calculatedAt: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
    parents: {
      A: {
        label: labels[0] + ' ' + index,
        traits: [{ id: 'snow' + index, state: 'het', label: labels[0] }],
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

function loadWorkspace() {
  const values = new Map();
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
    ['assets', 'pairing-compare-metrics.js'],
    ['assets', 'calculation-history-store.js'],
    ['assets', 'breeding-workspace-i18n.js'],
    ['assets', 'breeding-workspace.js'],
  ].forEach(parts => {
    const file = path.join(root, ...parts);
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  });
  return {
    store: window.CalculationHistoryStore || {},
    workspace: window.BreedingWorkspace || {},
  };
}

test('Given the public leopard calculator, when it renders a result, then planning tools stay out of the calculator UI', () => {
  const page = fs.readFileSync(path.join(root, 'gecko', 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'gecko', 'gecko-ui.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'gecko', 'gecko-app.js'), 'utf8');

  assert.doesNotMatch(page, /gecko-clutch|pairing-compare(?!-metrics)|calculation-history-(?:i18n|css)|calculation-history\.js/);
  assert.doesNotMatch(ui, /GeckoClutch\.html|PairingCompare\.html|CalculationHistory\.html|CalculationHistory\.bind/);
  assert.doesNotMatch(ui, /saveBreedingDraft\(\)|exportImage\(\)/);
  assert.doesNotMatch(app, /window\.(?:saveBreedingDraft|exportImage)/);
  assert.match(page, /calculation-history-store\.js/);
  assert.match(ui, /CalculationHistoryStore\.record/);
});

test('Given breeding management, when it loads, then the analysis workspace owns the relocated planning tools', () => {
  const page = fs.readFileSync(path.join(root, 'care', 'breeding.html'), 'utf8');
  const ui = breedingSource();
  const css = fs.readFileSync(path.join(root, 'care', 'breeding-workspace.css'), 'utf8');

  assert.match(page, /data-t="analysis"/);
  assert.match(page, /breeding-workspace-i18n\.js/);
  assert.match(page, /breeding-workspace\.js/);
  assert.match(page, /breeding-workspace\.css/);
  assert.match(ui, /tabAnalysis/);
  assert.match(ui, /BreedingWorkspace\.html/);
  assert.match(ui, /BreedingWorkspace\.bind/);
  assert.match(ui, /onImport/);
  assert.match(css, /\.bw-grid\{display:grid;min-width:0/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
});

test('Given a calculated result, when clutch statistics run in breeding management, then expected count and at-least-one chance are returned', () => {
  const { workspace } = loadWorkspace();
  assert.equal(typeof workspace.clutchStatistics, 'function');

  const values = workspace.clutchStatistics(0.25, 6);

  assert.equal(values.expected, 1.5);
  assert.ok(Math.abs(values.atLeastOne - 0.822021484375) < 1e-12);
});

test('Given recent and saved calculations, when the breeding workspace renders, then history, clutch, and comparison tools share one screen', () => {
  const { store, workspace } = loadWorkspace();
  store.record(snapshot(1), 'ko');
  store.record(snapshot(2), 'ko');

  const html = workspace.html({
    species: 'gecko',
    language: 'ko',
    pairs: [{ id: 'pair-1', name: '2026 A라인', calculation: snapshot(3) }],
  });

  assert.match(html, /data-bw-export/);
  assert.match(html, /브리딩 분석/);
  assert.match(html, /계산 기록/);
  assert.match(html, /클러치 예상/);
  assert.match(html, /페어링 비교/);
  assert.match(html, /2026 A라인/);
  assert.match(html, /맥스노우/);
  assert.match(html, /페어링 등록/);
});

test('Given the English workspace, when it renders, then relocated tools do not leak Korean labels', () => {
  const { store, workspace } = loadWorkspace();
  store.record(snapshot(1, 'en'), 'en');

  const html = workspace.html({ species: 'gecko', language: 'en', pairs: [] });

  assert.match(html, /Breeding analysis/);
  assert.match(html, /Calculation history/);
  assert.match(html, /Clutch estimate/);
  assert.match(html, /Pairing comparison/);
  assert.doesNotMatch(html, /브리딩 분석|계산 기록|클러치 예상|페어링 비교/);
});

test('Given browser-stored labels contain markup, when the workspace renders, then the labels remain escaped', () => {
  const { store, workspace } = loadWorkspace();
  const unsafe = snapshot(1);
  unsafe.parents.A.label = '<img src=x onerror=alert(1)>';
  unsafe.results[1].label = '<script>alert(1)</script>';
  store.record(unsafe, 'ko');

  const html = workspace.html({ species: 'gecko', language: 'ko', pairs: [] });

  assert.doesNotMatch(html, /<img|<script>/i);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script/);
});
