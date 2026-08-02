const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function planner() {
  const context = vm.createContext({});
  context.window = context;
  ['gecko/gecko-core.js', 'care/breeding-spec.js', 'assets/linebreeding-planner.js']
    .forEach((relativePath) => vm.runInContext(
      fs.readFileSync(path.join(root, relativePath), 'utf8'),
      context,
      { filename: relativePath },
    ));
  return context.LineBreedingPlanner;
}

function animal(id, sex, morphs, scores) {
  return {
    id,
    species: 'leopard',
    sex,
    morphs,
    line_trait_scores: scores,
    parent_a: null,
    parent_b: null,
  };
}

test('Given both cross traits live on one parent only, when candidates are ranked, then the normal mate is insufficient', () => {
  // Given
  const project = {
    species: 'gecko',
    target: {
      version: 1,
      mode: 'cross',
      traits: [
        { id: 'blacknight', targetScore: 4 },
        { id: 'tangerine', targetScore: 4 },
      ],
    },
  };
  const animals = [
    animal('cross-male', 'male', ['blacknight', 'tangerine'], { blacknight: 5, tangerine: 5 }),
    animal('normal-female', 'female', [], {}),
  ];

  // When
  const result = planner().candidatePairs({ project, animals });

  // Then
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'insufficient');
});
