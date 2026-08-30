const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPlanner(language = 'ko') {
  const context = vm.createContext({});
  context.window = context;
  context.LANG = language;
  ['fattail/fattail-core.js', 'care/breeding-spec.js', 'assets/linebreeding-species-policy.js',
    'assets/linebreeding-planner.js']
    .forEach((relativePath) => vm.runInContext(
      fs.readFileSync(path.join(root, relativePath), 'utf8'),
      context,
      { filename: relativePath },
    ));
  return context.LineBreedingPlanner;
}

function project(mode, traits) {
  return {
    species: 'fattail',
    target: {
      version: 1,
      mode,
      traits: traits.map((id) => ({ id, targetScore: 4 })),
    },
  };
}

function animal(id, sex, morphs, scores, species = 'fattail') {
  return {
    id,
    species,
    sex,
    life_stage: 'adult',
    morphs,
    line_trait_scores: scores,
    parent_a: null,
    parent_b: null,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasForbiddenField(value) {
  if (!value || typeof value !== 'object') return false;
  const forbidden = ['probability', 'fixedPercent', 'fixedGeneration', 'inbreedingCoefficient'];
  return Object.entries(value).some(([key, child]) => (
    forbidden.includes(key) || hasForbiddenField(child)
  ));
}

test('Given scored Tangerine Fat-tail parents, when line fixing, then the pair is ready', () => {
  // Given
  const animals = [
    animal('male', 'male', ['tangerine'], { tangerine: 4 }),
    animal('female', 'female', ['tangerine'], { tangerine: 5 }),
  ];

  // When
  const result = loadPlanner().roadmap({ project: project('line_fix', ['tangerine']), animals });

  // Then
  assert.equal(result.supported, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.candidates[0].lineOutcome.name, '탠저린');
});

test('Given Jungle and Sunglow Fat-tail parents, when crossed, then only a selection direction is shown', () => {
  // Given
  const animals = [
    animal('male', 'male', ['jungle'], { jungle: 5 }),
    animal('female', 'female', ['sunglow'], { sunglow: 4 }),
  ];

  // When
  const result = loadPlanner().roadmap({ project: project('cross', ['jungle', 'sunglow']), animals });

  // Then
  assert.equal(result.supported, true);
  assert.equal(result.candidates[0].lineOutcome.name, '정글 × 선글로우');
  assert.equal(result.candidates[0].lineOutcome.warning, null);
  assert.equal(hasForbiddenField(result), false);
});

test('Given a Fat-tail project, when another species is present, then it is excluded', () => {
  // Given
  const animals = [
    animal('fattail-male', 'male', ['tangerine'], { tangerine: 5 }),
    animal('crested-female', 'female', ['tangerine'], { tangerine: 5 }, 'crested'),
  ];

  // When
  const result = loadPlanner().candidatePairs({ project: project('line_fix', ['tangerine']), animals });

  // Then
  assert.deepEqual(plain(result), []);
});

test('Given each supported language, when a Fat-tail cross is named, then its trait direction stays localized', () => {
  // Given
  const expected = {
    ko: '정글 × 선글로우', en: 'Jungle × Sunglow',
    ja: 'ジャングル × サングロー', zh: '丛林纹 × Sunglow',
  };
  const animals = [
    animal('male', 'male', ['jungle'], { jungle: 5 }),
    animal('female', 'female', ['sunglow'], { sunglow: 5 }),
  ];

  // When
  const outcomes = Object.keys(expected).map((language) => {
    const result = loadPlanner(language).roadmap({ project: project('cross', ['jungle', 'sunglow']), animals });
    return [language, result.candidates[0].lineOutcome.name];
  });

  // Then
  outcomes.forEach(([language, outcome]) => assert.equal(outcome, expected[language]));
});
