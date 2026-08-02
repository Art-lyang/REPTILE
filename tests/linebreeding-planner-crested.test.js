const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPlanner() {
  const context = vm.createContext({});
  context.window = context;
  ['crested/crested-core.js', 'care/breeding-spec.js', 'assets/linebreeding-species-policy.js',
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
    species: 'crested',
    target: {
      version: 1,
      mode,
      traits: traits.map((id) => ({ id, targetScore: 4 })),
    },
  };
}

function animal(id, sex, morphs, scores, species = 'crested') {
  return {
    id,
    species,
    sex,
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

test('Given scored Red Crested parents, when line fixing, then the pair is ready', () => {
  const animals = [
    animal('male', 'male', ['red'], { red: 4 }),
    animal('female', 'female', ['red'], { red: 5 }),
  ];

  const result = loadPlanner().roadmap({ project: project('line_fix', ['red']), animals });

  assert.equal(result.supported, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.candidates[0].lineOutcome.name, '레드');
  assert.deepEqual(plain(result.candidates[0].traitEvidence[0].scores), [4, 5]);
});

test('Given Red and Pinstripe Crested parents, when crossed, then a selection direction is shown without invented genetics', () => {
  const animals = [
    animal('male', 'male', ['red'], { red: 5 }),
    animal('female', 'female', ['pinstripe'], { pinstripe: 4 }),
  ];

  const result = loadPlanner().roadmap({ project: project('cross', ['red', 'pinstripe']), animals });

  assert.equal(result.supported, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.candidates[0].lineOutcome.name, '레드 × 핀스트라이프');
  assert.equal(result.candidates[0].lineOutcome.warning, null);
  assert.equal(hasForbiddenField(result), false);
});

test('Given a Crested project, when animals from another species are present, then they are excluded', () => {
  const animals = [
    animal('crested-male', 'male', ['red'], { red: 5 }),
    animal('leopard-female', 'female', ['red'], { red: 5 }, 'gecko'),
  ];

  const result = loadPlanner().candidatePairs({ project: project('line_fix', ['red']), animals });

  assert.deepEqual(plain(result), []);
});
