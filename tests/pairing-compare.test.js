const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function draft(labelA, labelB, results, warnings = [], lineTraits = []) {
  return {
    version: 1,
    species: 'gecko',
    calculatedAt: '2026-07-31T00:00:00.000Z',
    parents: {
      A: { label: labelA, traits: [] },
      B: { label: labelB, traits: [] },
    },
    results,
    warnings,
    lineTraits,
  };
}

function loadApi() {
  const window = {};
  const context = {
    window,
    Date,
    Intl,
    encodeURIComponent,
    sessionStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {},
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'assets', 'breeding-draft.js'), 'utf8'),
    context,
  );
  const comparePath = path.join(root, 'assets', 'pairing-compare.js');
  if (fs.existsSync(comparePath)) {
    const i18nPath = path.join(root, 'assets', 'pairing-compare-i18n.js');
    if (fs.existsSync(i18nPath)) {
      vm.runInNewContext(fs.readFileSync(i18nPath, 'utf8'), context);
    }
    const metricsPath = path.join(root, 'assets', 'pairing-compare-metrics.js');
    if (fs.existsSync(metricsPath)) {
      vm.runInNewContext(fs.readFileSync(metricsPath, 'utf8'), context);
    }
    vm.runInNewContext(fs.readFileSync(comparePath, 'utf8'), context);
  }
  return window.PairingCompare || {};
}

test('Given a target visual and conditional carriers, when pairing metrics are calculated, then both probabilities are weighted', () => {
  const api = loadApi();
  assert.equal(typeof api.metrics, 'function');
  const snapshot = draft('Eclipse', 'Normal', [
    { label: 'Visual Eclipse', probability: 0.25, guaranteedHets: [], partialHets: [] },
    {
      label: 'Normal',
      probability: 0.75,
      guaranteedHets: [],
      partialHets: [{ name: 'Visual Eclipse', pct: 66.7 }],
    },
  ]);

  const metrics = api.metrics(snapshot, 'Visual Eclipse');

  assert.equal(metrics.visualProbability, 0.25);
  assert.ok(Math.abs(metrics.carrierProbability - 0.50025) < 1e-12);
});

test('Given repeated and excess pairings, when they are added, then duplicates are rejected and the list stays bounded', () => {
  const api = loadApi();
  assert.equal(typeof api.add, 'function');
  const first = draft('A1', 'B1', [
    { label: 'Mack Snow', probability: 0.5, guaranteedHets: [], partialHets: [] },
  ]);

  assert.equal(api.add(first).status, 'added');
  assert.equal(api.add(first).status, 'duplicate');
  assert.equal(api.add(draft('A2', 'B2', first.results)).status, 'added');
  assert.equal(api.add(draft('A3', 'B3', first.results)).status, 'added');
  assert.equal(api.add(draft('A4', 'B4', first.results)).status, 'full');
  assert.equal(api.state().entries.length, 3);
});

test('Given two saved pairings, when the comparison renders, then target odds and breeding context are visible', () => {
  const api = loadApi();
  assert.equal(typeof api.html, 'function');
  const first = draft('맥스노우', '노멀', [
    { label: '노멀', probability: 0.5, guaranteedHets: [], partialHets: [] },
    { label: '맥스노우', probability: 0.5, guaranteedHets: [], partialHets: [] },
  ]);
  const second = draft('슈퍼 스노우', '노멀', [
    { label: '맥스노우', probability: 1, guaranteedHets: [], partialHets: [] },
  ], ['건강 주의'], [{ id: 'tangerine', label: '탠저린', both: false }]);
  api.add(first);
  api.add(second);

  const html = api.html(second, 'ko');

  assert.match(html, /페어링 비교/);
  assert.match(html, /목표 모프/);
  assert.match(html, /맥스노우.*×.*노멀/);
  assert.match(html, /슈퍼 스노우.*×.*노멀/);
  assert.match(html, /100%/);
  assert.match(html, /탠저린/);
  assert.match(html, /대표 결과<\/span>맥스노우 · 50%/);
});

test('Given the English calculator, when comparison guidance renders, then Korean labels do not leak', () => {
  const api = loadApi();
  const snapshot = draft('Mack Snow', 'Normal', [
    { label: 'Mack Snow', probability: 0.5, guaranteedHets: [], partialHets: [] },
  ]);
  api.add(snapshot);

  const html = api.html(snapshot, 'en');

  assert.match(html, /Pairing comparison/);
  assert.match(html, /Target morph/);
  assert.doesNotMatch(html, /페어링|목표 모프|건강 주의/);
});

test('Given saved Korean pairings, when the calculator language changes, then stale localized labels are cleared', () => {
  const api = loadApi();
  const korean = draft('맥스노우', '노멀', [
    { label: '맥스노우', probability: 0.5, guaranteedHets: [], partialHets: [] },
  ]);
  const english = draft('Mack Snow', 'Normal', [
    { label: 'Mack Snow', probability: 0.5, guaranteedHets: [], partialHets: [] },
  ]);
  api.add(korean);
  api.html(korean, 'ko');

  const html = api.html(english, 'en');

  assert.equal(api.state().entries.length, 0);
  assert.doesNotMatch(html, /맥스노우|노멀/);
});

test('Given the leopard calculator, when planning tools are organized, then pairing comparison lives in breeding analysis', () => {
  const page = fs.readFileSync(path.join(root, 'gecko', 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'gecko', 'gecko-ui.js'), 'utf8');
  const breedingPage = fs.readFileSync(path.join(root, 'care', 'breeding.html'), 'utf8');
  const breedingUi = fs.readFileSync(path.join(root, 'care', 'breeding-ui.js'), 'utf8');

  assert.doesNotMatch(page, /pairing-compare(?:-i18n|-metrics)?\.(?:js|css)/);
  assert.doesNotMatch(ui, /PairingCompare\.(?:html|bind)/);
  assert.match(breedingPage, /\/assets\/pairing-compare-metrics\.js/);
  assert.match(breedingPage, /\/assets\/breeding-workspace\.js/);
  assert.match(breedingUi, /BreedingWorkspace\.html/);
  assert.match(breedingUi, /BreedingWorkspace\.bind/);
});
