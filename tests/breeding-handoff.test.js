const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { breedingSource } = require('./helpers/breeding-source');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

function loadDraftApi() {
  const source = read('assets/breeding-draft.js');
  assert.notEqual(source, '', 'the shared breeding draft boundary must exist');

  const values = new Map();
  const sessionStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const window = {};
  const context = vm.createContext({ window, sessionStorage });
  vm.runInContext(source, context, { filename: 'assets/breeding-draft.js' });
  return { api: window.BreedingDraft, values };
}

function validDraft() {
  return {
    version: 1,
    species: 'gecko',
    calculatedAt: '2026-07-31T12:34:56.000Z',
    parents: {
      A: {
        label: '블랙나이트',
        traits: [{ id: 'blacknight', state: 'line', label: '블랙나이트' }],
      },
      B: {
        label: '탠저린',
        traits: [{ id: 'tangerine', state: 'line', label: '탠저린' }],
      },
    },
    results: [
      {
        label: '멜라텐져린 크로스',
        probability: 1,
        guaranteedHets: [],
        partialHets: [],
      },
    ],
    warnings: ['라인브리딩 발현 정도는 개체마다 다를 수 있습니다.'],
    lineTraits: [
      { id: 'blacknight', label: '블랙나이트', both: false },
      { id: 'tangerine', label: '탠저린', both: false },
    ],
  };
}

test('Given a calculator result, when it is handed to breeding management, then a versioned species-safe draft is stored', () => {
  // Given: a valid leopard-gecko calculator result
  const { api, values } = loadDraftApi();

  // When: the calculator stores the handoff draft
  const saved = api.save(validDraft());
  const raw = values.get(api.storageKey);

  // Then: the normalized versioned draft can be loaded for the same species
  assert.equal(saved.version, 1);
  assert.equal(saved.species, 'gecko');
  assert.equal(JSON.parse(raw).results[0].probability, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.load('gecko'))),
    JSON.parse(JSON.stringify(saved)),
  );
});

test('Given a tampered browser draft, when breeding management loads it, then unsupported species and oversized data are rejected', () => {
  // Given: a browser payload with an unsupported species
  const { api, values } = loadDraftApi();
  const tampered = validDraft();
  tampered.species = 'human';
  values.set(api.storageKey, JSON.stringify(tampered));

  // When: breeding management loads the payload
  const loaded = api.load('gecko');

  // Then: it fails closed and removes the invalid payload
  assert.equal(loaded, null);
  assert.equal(values.has(api.storageKey), false);
  assert.throws(
    () => api.save({ ...validDraft(), results: Array(129).fill(validDraft().results[0]) }),
    /result limit/i,
  );
});

test('Given the leopard calculator and breeding manager, when pages boot, then history is recorded silently and sanitized before import', () => {
  const calculator = read('gecko/index.html');
  const calculatorUi = read('gecko/gecko-ui.js');
  const breedingPage = read('care/breeding.html');
  const breedingUi = breedingSource();

  assert.match(calculator, /assets\/breeding-draft\.js/);
  assert.match(calculator, /assets\/calculation-history-store\.js/);
  assert.match(calculatorUi, /CalculationHistoryStore\.record/);
  assert.match(breedingPage, /assets\/breeding-draft\.js/);
  assert.match(breedingPage, /assets\/breeding-workspace\.js/);
  assert.match(breedingUi, /BreedingDraft\.load\(S\.species\)/);
  assert.match(breedingUi, /openCalculationAsPair/);
  assert.match(breedingUi, /target_morph/);
  assert.match(breedingUi, /calculation:/);
});

test('Given calculator snapshots contain user-controlled browser data, when the pairing schema is updated, then the database constrains its shape and size', () => {
  const migration = read('supabase_v29.sql');

  assert.match(migration, /add column if not exists species text/i);
  assert.match(migration, /add column if not exists calculation jsonb/i);
  assert.match(migration, /add column if not exists target_morph text/i);
  assert.match(migration, /jsonb_typeof\(calculation\)\s*=\s*'object'/i);
  assert.match(migration, /jsonb_array_length\(calculation->'results'\)\s+between 1 and 128/i);
  assert.match(migration, /octet_length\(calculation::text\)\s*<=\s*65536/i);
  assert.match(migration, /calculation->>'species'\s*=\s*species/i);
  assert.match(migration, /else\s+'gecko'/i);
});
