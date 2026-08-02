const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPlanner() {
  const context = vm.createContext({});
  context.window = context;
  ['gecko/gecko-core.js', 'care/breeding-spec.js', 'assets/linebreeding-species-policy.js',
    'assets/linebreeding-planner.js']
    .forEach((relativePath) => vm.runInContext(
      fs.readFileSync(path.join(root, relativePath), 'utf8'),
      context,
      { filename: relativePath },
    ));
  return context.LineBreedingPlanner;
}

function leopard(id, sex) {
  return {
    id,
    species: 'leopard',
    sex,
    morphs: ['blacknight'],
    line_trait_scores: { blacknight: 5 },
    parent_a: null,
    parent_b: null,
  };
}

test('Given legacy Leopard species rows, when a gecko project is analyzed, then owned candidates remain eligible', () => {
  // Given
  const project = {
    species: 'gecko',
    target: {
      version: 1,
      mode: 'line_fix',
      traits: [{ id: 'blacknight', targetScore: 4 }],
    },
  };
  const animals = [leopard('male', 'male'), leopard('female', 'female')];

  // When
  const result = loadPlanner().candidatePairs({ project, animals });

  // Then
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'ready');
});
