const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = __dirname;

function loadApi() {
  const source = fs.readFileSync(path.join(root, 'gecko-clutch.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, Intl });
  return window.GeckoClutch;
}

test('Given a 25% morph and six eggs, when clutch statistics are calculated, then expected count and at-least-one chance are returned', () => {
  const api = loadApi();

  const result = api.statistics(0.25, 6);

  assert.equal(result.expected, 1.5);
  assert.equal(result.atLeastOne, 0.822021484375);
});

test('Given invalid direct egg counts, when they are normalized, then the supported 1 to 99 range is enforced', () => {
  const api = loadApi();

  assert.equal(api.normalizeSize(0), 1);
  assert.equal(api.normalizeSize(120), 99);
  assert.equal(api.normalizeSize('4.8'), 5);
});

test('Given Korean clutch results, when the estimator renders, then presets, expected count, chance, and disclaimer are visible', () => {
  const api = loadApi();

  const html = api.html([
    { label: '이클립스', probability: 0.25 },
    { label: '노멀', probability: 0.75 },
  ], 'ko');

  assert.match(html, /클러치 기준 예상 분포/);
  assert.match(html, /data-clutch-size="2"/);
  assert.match(html, /평균 0\.5마리/);
  assert.match(html, /최소 한 마리 43\.8%/);
  assert.match(html, /실제 부화 결과를 보장하지 않습니다/);
});

test('Given another calculator language, when the estimator renders, then clutch guidance is localized', () => {
  const api = loadApi();

  const html = api.html([{ label: 'Eclipse', probability: 0.5 }], 'en');

  assert.match(html, /Clutch estimate/);
  assert.match(html, /Average 1 hatchling/);
  assert.doesNotMatch(html, /마리|부화 결과/);
});

test('Given the live calculator, when planning tools are organized, then clutch estimation lives in breeding analysis', () => {
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'gecko-ui.js'), 'utf8');
  const breedingPage = fs.readFileSync(path.join(root, '..', 'care', 'breeding.html'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, '..', 'assets', 'breeding-workspace.js'), 'utf8');

  assert.doesNotMatch(page, /gecko-clutch\.(?:js|css)/);
  assert.doesNotMatch(ui, /GeckoClutch\.(?:html|bind)/);
  assert.match(breedingPage, /breeding-workspace\.js/);
  assert.match(workspace, /clutchStatistics/);
  assert.match(workspace, /bw-clutch-list/);
});
