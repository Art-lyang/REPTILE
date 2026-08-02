const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { breedingSource } = require('./helpers/breeding-source');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function loadScores() {
  const relativePath = 'assets/line-trait-scores.js';
  const source = read(relativePath);
  assert.notEqual(source, '', `missing score SUT: ${relativePath}`);
  const window = {};
  vm.runInContext(source, vm.createContext({ window }), { filename: relativePath });
  const api = window.LineTraitScores;
  assert.ok(api, 'window.LineTraitScores must exist');
  for (const name of ['normalize', 'forAnimal', 'fromForm']) {
    assert.equal(typeof api[name], 'function', `LineTraitScores.${name} must exist`);
  }
  return api;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function scriptNames(html) {
  return Array.from(
    html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    (match) => path.posix.basename(match[1].split('?')[0]),
  );
}

test('Given selected line traits, when scores are normalized, then each trait keeps its independent score', () => {
  // Given
  const raw = { blacknight: 1, tangerine: 5, mandarin: 4 };
  // When
  const result = loadScores().normalize(raw, ['blacknight', 'tangerine']);
  // Then
  assert.deepEqual(plain(result), { blacknight: 1, tangerine: 5 });
});

test('Given score boundaries and malformed values, when normalized, then only integer 1 through 5 remains', () => {
  // Given
  const raw = { min: 1, max: 5, zero: 0, high: 6, fraction: 2.5, text: '3', nan: NaN };
  // When
  const result = loadScores().normalize(raw, Object.keys(raw));
  // Then
  assert.deepEqual(plain(result), { min: 1, max: 5 });
});

test('Given a malformed score container, when normalized, then it fails closed', () => {
  // Given
  const raw = null;
  // When
  const result = loadScores().normalize(raw, ['blacknight']);
  // Then
  assert.deepEqual(plain(result), {});
});

test('Given inherited and prototype keys, when normalized, then only safe own trait keys remain', () => {
  // Given
  const raw = Object.create({ blacknight: 5 });
  Object.defineProperties(raw, {
    tangerine: { value: 4, enumerable: true },
    ['__proto__']: { value: 3, enumerable: true },
    constructor: { value: 2, enumerable: true },
    prototype: { value: 1, enumerable: true },
  });
  // When
  const result = loadScores().normalize(
    raw,
    ['blacknight', 'tangerine', '__proto__', 'constructor', 'prototype'],
  );
  // Then
  assert.deepEqual(plain(result), { tangerine: 4 });
});

test('Given multiple selected controls, when form values are read, then valid values stay independent', () => {
  // Given
  const values = { blacknight: '2', tangerine: '5', mandarin: '4', invalid: '2.5' };
  // When
  const result = loadScores().fromForm(
    ['blacknight', 'tangerine', 'invalid'],
    values,
  );
  // Then
  assert.deepEqual(plain(result), { blacknight: 2, tangerine: 5 });
});

test('Given one selected trait without an explicit score, when an animal is read, then its legacy grade is used', () => {
  // Given
  const animal = { color_grade: 4, line_trait_scores: {} };
  // When
  const result = loadScores().forAnimal(animal, ['blacknight']);
  // Then
  assert.deepEqual(plain(result), { blacknight: 4 });
});

test('Given an explicit trait score and a legacy grade, when an animal is read, then the explicit score wins', () => {
  // Given
  const animal = { color_grade: 5, line_trait_scores: { blacknight: 2 } };
  // When
  const result = loadScores().forAnimal(animal, ['blacknight']);
  // Then
  assert.deepEqual(plain(result), { blacknight: 2 });
});

test('Given multiple selected traits and one legacy grade, when an animal is read, then the grade is not copied', () => {
  // Given
  const animal = { color_grade: 4, line_trait_scores: {} };
  // When
  const result = loadScores().forAnimal(animal, ['blacknight', 'tangerine']);
  // Then
  assert.deepEqual(plain(result), {});
});

test('Given the breeding page, when scripts boot, then line scores load before the breeding controller', () => {
  // Given
  const scripts = scriptNames(read('care/breeding.html'));
  // When
  const scoresIndex = scripts.indexOf('line-trait-scores.js');
  const controllerIndex = scripts.indexOf('breeding-ui.js');
  // Then
  assert.ok(scoresIndex >= 0, 'care/breeding.html must wire line-trait-scores.js');
  assert.ok(scoresIndex < controllerIndex, 'line-trait-scores.js must load before breeding-ui.js');
});

test('Given the animal editor, when scores persist, then it uses the line trait score field', () => {
  // Given
  const controller = breedingSource();
  // When
  const usesScores = /\bline_trait_scores\b/.test(controller);
  // Then
  assert.ok(usesScores, 'breeding-ui.js must read and save line_trait_scores');
});

test('Given selected line traits, when their editor renders, then each trait has its own score control', () => {
  // Given
  const controller = breedingSource();
  // When
  const hasPerTraitControls = /\bdata-line-trait-score\b/.test(controller);
  // Then
  assert.ok(hasPerTraitControls, 'breeding-ui.js must render data-line-trait-score controls');
});

test('Given the per-trait editor, when its source is inspected, then the legacy grade control is absent', () => {
  // Given
  const controller = breedingSource();
  // When
  const hasLegacyControl = /\bid=["']f_grade["']/.test(controller);
  // Then
  assert.equal(hasLegacyControl, false, 'breeding-ui.js must no longer render id="f_grade"');
});

test('Given many unselected line traits on mobile, when the editor renders, then only selected score controls are visible', () => {
  const controller = breedingSource();
  assert.match(controller, /data-line-trait-score[\s\S]{0,240}\(checked\s*\?\s*['"]['"]\s*:\s*['"] hidden['"]\)/,
    'unchecked line-trait score controls must render hidden');
  assert.match(controller, /score\.hidden\s*=\s*!ev\.target\.checked/,
    'checking a line trait must reveal its score control');
});
