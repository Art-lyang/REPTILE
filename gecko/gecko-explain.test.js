const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;

function loadApi() {
  const file = path.join(root, 'gecko-explain.js');
  if (!fs.existsSync(file)) return {};
  const window = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window });
  return window.GeckoExplain;
}

function eclipseInput(tokens) {
  return {
    language: 'ko',
    row: { probability: 0.5, tokens, combo: null },
    dists: [{
      g: { id: 'eclipse', type: 'rec', ko: '이클립스', en: 'Eclipse' },
      dist: { NN: 0, Nm: 0.5, mm: 0.5 },
    }],
    states: {
      A: { eclipse: 'mm' },
      B: { eclipse: 'het' },
    },
    poly: [],
    warnings: [],
  };
}

test('Given visual × het recessive parents, when a visual result is explained, then its alleles and 50% outcome are shown', () => {
  const api = loadApi();

  const explanation = api.explain(eclipseInput(['eclipse']));

  assert.equal(explanation.loci[0].parentA, '비주얼 (m/m)');
  assert.equal(explanation.loci[0].parentB, 'het (N/m)');
  assert.equal(explanation.loci[0].allelesA, 'm 100%');
  assert.equal(explanation.loci[0].allelesB, 'N 50% · m 50%');
  assert.equal(explanation.loci[0].outcome, '비주얼 (m/m)');
  assert.equal(explanation.loci[0].probability, 0.5);
  assert.deepEqual(
    Array.from(explanation.loci[0].distribution),
    ['50% 비주얼 (m/m)', '50% het (N/m)'],
  );
});

test('Given a non-visual recessive result, when its carrier status is explained, then the conditional het chance is explicit', () => {
  const api = loadApi();

  const explanation = api.explain(eclipseInput([]));

  assert.equal(explanation.loci[0].outcome, '비주얼 아님 (N/N / N/m)');
  assert.equal(explanation.loci[0].carrier, '이 결과는 100% het 보인자');
});

test('Given Mack Snow × Mack Snow, when the super result is explained, then the incomplete-dominant distribution stays 25·50·25', () => {
  const api = loadApi();
  const gene = {
    id: 'macksnow',
    type: 'incdom',
    ko: '맥스노우',
    en: 'Mack Snow',
    superKo: '슈퍼 스노우',
    superEn: 'Super Snow',
  };

  const explanation = api.explain({
    language: 'ko',
    row: { probability: 0.25, tokens: ['super_macksnow'], combo: 'Super Test' },
    dists: [{ g: gene, dist: { NN: 0.25, Nm: 0.5, mm: 0.25 } }],
    states: { A: { macksnow: 'het' }, B: { macksnow: 'het' } },
    poly: [],
    warnings: [],
  });

  assert.equal(explanation.loci[0].outcome, '슈퍼 스노우 (m/m)');
  assert.deepEqual(
    Array.from(explanation.loci[0].distribution),
    ['25% 노멀 (N/N)', '50% 맥스노우 (N/m)', '25% 슈퍼 스노우 (m/m)'],
  );
  assert.deepEqual(Array.from(explanation.combo.components), ['슈퍼 스노우']);
});

test('Given an English dominant result, when it is explained, then Korean join words do not leak into the translation', () => {
  const api = loadApi();
  const explanation = api.explain({
    language: 'en',
    row: { probability: 0.75, tokens: ['enigma'], combo: null },
    dists: [{
      g: { id: 'enigma', type: 'dom', ko: '에니그마', en: 'Enigma' },
      dist: { NN: 0.25, Nm: 0.5, mm: 0.25 },
    }],
    states: { A: { enigma: 'het' }, B: { enigma: 'het' } },
    poly: [],
    warnings: [],
  });

  assert.doesNotMatch(JSON.stringify(explanation), /\uB610\uB294/);
});

test('Given a named combo and a health-warning gene, when the result is explained, then both reasons are attached to that result', () => {
  const api = loadApi();
  const genes = [
    { id: 'tremper', type: 'rec', ko: '트램퍼 알비노', en: 'Tremper Albino' },
    { id: 'eclipse', type: 'rec', ko: '이클립스', en: 'Eclipse' },
    { id: 'lemonfrost', type: 'incdom', ko: '레몬 프로스트', en: 'Lemon Frost', superKo: '슈퍼 레몬 프로스트' },
  ];

  const explanation = api.explain({
    language: 'ko',
    row: { probability: 0.125, tokens: ['tremper', 'eclipse', 'lemonfrost'], combo: 'RAPTOR' },
    dists: genes.map(g => ({ g, dist: { NN: 0, Nm: 0.5, mm: 0.5 } })),
    states: {
      A: { tremper: 'mm', eclipse: 'mm', lemonfrost: 'het' },
      B: { tremper: 'het', eclipse: 'het', lemonfrost: 'nn' },
    },
    poly: [],
    warnings: [{ geneId: 'lemonfrost', level: 'med' }],
  });

  assert.equal(explanation.combo.name, 'RAPTOR');
  assert.deepEqual(Array.from(explanation.combo.components), ['트램퍼 알비노', '이클립스', '레몬 프로스트']);
  assert.deepEqual(Array.from(explanation.risks), ['레몬 프로스트']);
});

test('Given line-bred parents, when a 100% named line result is explained, then Mendelian certainty is explicitly denied', () => {
  const api = loadApi();

  const explanation = api.explain({
    language: 'ko',
    row: { probability: 1, tokens: [], combo: null },
    dists: [],
    states: { A: {}, B: {} },
    poly: [
      { id: 'blacknight', name: '블랙나이트', a: true, b: false },
      { id: 'tangerine', name: '탠저린', a: false, b: true },
    ],
    warnings: [],
  });

  assert.match(explanation.lineBreeding, /멘델 유전 확률을 계산할 수 없습니다/);
  assert.match(explanation.lineBreeding, /모든 새끼가 동일한 색감과 발현 정도/);
  assert.match(api.lineBanner('ko'), /100%는 모든 새끼가 동일한 색감과 발현 정도/);
});

test('Given the live calculator page, when scripts load and rows render, then the explanation module is wired before the UI', () => {
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'gecko-ui.js'), 'utf8');

  assert.ok(
    page.indexOf('<script src="gecko-explain.js') < page.indexOf('<script src="gecko-ui.js'),
  );
  assert.match(ui, /GeckoExplain\.panel/);
  assert.match(ui, /GeckoExplain\.bind/);
  assert.match(ui, /GeckoExplain\.lineBanner/);
});

test('Given every supported language, when a result explanation button renders, then mobile gets a compact label and assistive technology keeps the full label', () => {
  const api = loadApi();
  const labels = {
    ko: ['유전 근거 보기', '근거'],
    en: ['Why this result?', 'Why'],
    zh: ['查看遗传依据', '依据'],
    ja: ['遺伝の根拠を見る', '根拠'],
  };

  Object.entries(labels).forEach(([language, [full, compact]]) => {
    const html = api.button(language, 0);

    assert.ok(html.includes('aria-label="' + full + '"'));
    assert.ok(html.includes('<span class="gx-label-full">' + full + '</span>'));
    assert.ok(html.includes('<span class="gx-label-compact" aria-hidden="true">' + compact + '</span>'));
  });
});

test('Given a narrow result table, when explanation controls render, then only the compact label is visible without wrapping', () => {
  const css = fs.readFileSync(path.join(root, 'gecko-explain.css'), 'utf8').replace(/\s+/g, ' ');

  assert.match(css, /\.gx-label-compact \{[^}]*display: none;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.gx-toggle \{[^}]*white-space: nowrap;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.gx-label-full \{[^}]*display: none;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.gx-label-compact \{[^}]*display: inline;/);
});
