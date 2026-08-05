const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPlanner() {
  const context = vm.createContext({});
  context.window = context;
  for (const relativePath of [
    'gecko/gecko-core.js',
    'care/breeding-spec.js',
    'care/care-core.js',
    'assets/linebreeding-species-policy.js',
  ]) {
    const fullPath = path.join(root, relativePath);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: relativePath });
  }
  const plannerPath = path.join(root, 'assets', 'linebreeding-planner.js');
  assert.equal(
    fs.existsSync(plannerPath),
    true,
    'missing planner SUT: assets/linebreeding-planner.js',
  );
  vm.runInContext(fs.readFileSync(plannerPath, 'utf8'), context, {
    filename: 'assets/linebreeding-planner.js',
  });
  const api = context.LineBreedingPlanner;
  assert.ok(api, 'window.LineBreedingPlanner must exist');
  for (const name of ['sanitizeTarget', 'candidatePairs', 'relationshipWarnings', 'roadmap']) {
    assert.equal(typeof api[name], 'function', `LineBreedingPlanner.${name} must exist`);
  }
  return api;
}

function target(mode, ids, targetScore = 4) {
  return { version: 1, mode, traits: ids.map((id) => ({ id, targetScore })) };
}

function project(projectTarget, species = 'gecko') {
  return {
    id: 'project-1', user_id: 'user-1', species, name: 'Line goal',
    target: projectTarget, status: 'active',
    created_at: '2026-07-31T00:00:00.000Z', updated_at: '2026-07-31T00:00:00.000Z',
  };
}

function animal(id, sex, morphs, scores, parents = {}) {
  return {
    id, user_id: 'user-1', species: 'gecko', name: id, sex, life_stage: 'adult',
    hatch_date: null, morphs, hets: [], color_grade: null,
    line_trait_scores: scores, parent_a: null, parent_b: null,
    photo_url: null, photos: [], note: null,
    created_at: '2026-07-31T00:00:00.000Z', ...parents,
  };
}

function candidates(projectTarget, animals) {
  return loadPlanner().candidatePairs({ project: project(projectTarget), animals });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function warningCodes(warnings) {
  return plain(warnings.map((warning) => warning.code));
}

function hasForbiddenField(value) {
  if (!value || typeof value !== 'object') return false;
  const forbidden = ['probability', 'fixedPercent', 'inbreedingCoefficient'];
  return Object.entries(value).some(([key, child]) => (
    forbidden.includes(key) || hasForbiddenField(child)
  ));
}

test('Given a line-fix target, when sanitized, then one scored trait remains', () => {
  // Given
  const raw = { ...target('line_fix', ['blacknight']), ignored: '<img onerror=alert(1)>' };
  // When
  const result = loadPlanner().sanitizeTarget(raw);
  // Then
  assert.deepEqual(plain(result), target('line_fix', ['blacknight']));
});

test('Given a cross target, when sanitized, then two distinct scored traits remain', () => {
  // Given
  const raw = target('cross', ['blacknight', 'tangerine'], 5);
  // When
  const result = loadPlanner().sanitizeTarget(raw);
  // Then
  assert.deepEqual(plain(result), raw);
});

test('Given an invalid target mode, when sanitized, then it is rejected', () => {
  // Given
  const api = loadPlanner();
  const raw = target('probability', ['blacknight']);
  // When
  const action = () => api.sanitizeTarget(raw);
  // Then
  assert.throws(action, /mode/i);
});

test('Given duplicate cross traits, when sanitized, then they are rejected', () => {
  // Given
  const api = loadPlanner();
  const raw = target('cross', ['blacknight', 'blacknight']);
  // When
  const action = () => api.sanitizeTarget(raw);
  // Then
  assert.throws(action, /duplicate|distinct/i);
});

test('Given a score outside 1 through 5, when sanitized, then it is rejected', () => {
  // Given
  const api = loadPlanner();
  const raw = target('line_fix', ['blacknight'], 6);
  // When
  const action = () => api.sanitizeTarget(raw);
  // Then
  assert.throws(action, /score|1.*5/i);
});

test('Given scored Black Night parents, when line fixing, then the pair is ready', () => {
  // Given
  const animals = [
    animal('male', 'male', ['blacknight'], { blacknight: 4 }),
    animal('female', 'female', ['blacknight'], { blacknight: 5 }),
  ];
  // When
  const result = candidates(target('line_fix', ['blacknight']), animals);
  // Then
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'ready');
  assert.equal(result[0].lineOutcome.name, '블랙나이트');
  assert.deepEqual(plain(result[0].traitEvidence.map((item) => item.scores)), [[4, 5]]);
});

test('Given Black Night and Tangerine parents, when crossed, then the named line is Mela Tangerine', () => {
  // Given
  const animals = [
    animal('male', 'male', ['blacknight'], { blacknight: 4 }),
    animal('female', 'female', ['tangerine'], { tangerine: 4 }),
  ];
  // When
  const result = candidates(target('cross', ['blacknight', 'tangerine']), animals);
  // Then
  assert.equal(result[0].lineOutcome.name, '멜라텐져린');
  assert.equal(result[0].lineOutcome.warning, null);
});

test('Given Mandarin and Tangerine parents, when crossed, then the base line and reset warning are explicit', () => {
  // Given
  const animals = [
    animal('male', 'male', ['mandarin'], { mandarin: 4 }),
    animal('female', 'female', ['tangerine'], { tangerine: 4 }),
  ];
  // When
  const result = candidates(target('cross', ['mandarin', 'tangerine']), animals);
  // Then
  assert.equal(result[0].lineOutcome.name, '탠저린');
  assert.equal(result[0].lineOutcome.warning, 'line_reset');
  assert.notEqual(result[0].lineOutcome.name, '만다린');
});

test('Given a target holder without its trait score, when paired, then evaluation is required', () => {
  // Given
  const animals = [
    animal('male', 'male', ['blacknight'], {}),
    animal('female', 'female', ['blacknight'], { blacknight: 5 }),
  ];
  // When
  const result = candidates(target('line_fix', ['blacknight']), animals);
  // Then
  assert.equal(result[0].status, 'review');
  assert.equal(result[0].traitEvidence[0].assessment, 'evaluation_required');
  assert.deepEqual(plain(result[0].traitEvidence[0].scores), [null, 5]);
});

test('Given the same animal in both slots, when candidates are made, then self-pairing is excluded', () => {
  // Given
  const animals = [
    animal('same', 'male', ['blacknight'], { blacknight: 5 }),
    animal('same', 'female', ['blacknight'], { blacknight: 5 }),
  ];
  // When
  const result = candidates(target('line_fix', ['blacknight']), animals);
  // Then
  assert.equal(result.length, 0);
});

test('Given two confirmed males, when candidates are made, then the same-sex pair is excluded', () => {
  // Given
  const animals = [
    animal('male-a', 'male', ['blacknight'], { blacknight: 5 }),
    animal('male-b', 'male', ['blacknight'], { blacknight: 5 }),
  ];
  // When
  const result = candidates(target('line_fix', ['blacknight']), animals);
  // Then
  assert.equal(result.length, 0);
});

test('Given an adult with unknown sex, when candidates are made, then it is excluded from breeding candidates', () => {
  // Given
  const animals = [
    animal('known', 'male', ['blacknight'], { blacknight: 5 }),
    animal('unknown', 'unknown', ['blacknight'], { blacknight: 5 }),
  ];
  // When
  const result = candidates(target('line_fix', ['blacknight']), animals);
  // Then
  assert.equal(result.length, 0);
});

test('Given a subadult with a confirmed sex, when candidates are made, then it is excluded until adulthood', () => {
  const animals = [
    animal('male', 'male', ['blacknight'], { blacknight: 5 }, { life_stage: 'subadult' }),
    animal('female', 'female', ['blacknight'], { blacknight: 5 }),
  ];

  const result = candidates(target('line_fix', ['blacknight']), animals);

  assert.equal(result.length, 0);
});

test('Given a parent lacks the target trait, when candidates are made, then the pair is insufficient', () => {
  // Given
  const animals = [
    animal('male', 'male', ['blacknight'], { blacknight: 5 }),
    animal('female', 'female', [], {}),
  ];
  // When
  const result = candidates(target('line_fix', ['blacknight']), animals);
  // Then
  assert.equal(result[0].status, 'insufficient');
});

test('Given candidates share a parent, when three generations are checked, then direct kin is warned', () => {
  // Given
  const animals = [
    animal('a', 'male', ['blacknight'], { blacknight: 5 }, { parent_a: 'p' }),
    animal('b', 'female', ['blacknight'], { blacknight: 5 }, { parent_b: 'p' }),
    animal('p', 'unknown', [], {}),
  ];
  // When
  const result = loadPlanner().relationshipWarnings({ animals, parentAId: 'a', parentBId: 'b', generations: 3 });
  // Then
  assert.deepEqual(warningCodes(result), ['shared_parent']);
});

test('Given candidates share only a grandparent, when three generations are checked, then grandparent kin is warned', () => {
  // Given
  const animals = [
    animal('a', 'male', [], {}, { parent_a: 'pa' }),
    animal('b', 'female', [], {}, { parent_b: 'pb' }),
    animal('pa', 'unknown', [], {}, { parent_a: 'g' }),
    animal('pb', 'unknown', [], {}, { parent_b: 'g' }),
    animal('g', 'unknown', [], {}),
  ];
  // When
  const result = loadPlanner().relationshipWarnings({ animals, parentAId: 'a', parentBId: 'b', generations: 3 });
  // Then
  assert.deepEqual(warningCodes(result), ['shared_grandparent']);
});

test('Given cyclic ancestry, when three generations are checked, then traversal ends with a review warning', () => {
  // Given
  const animals = [
    animal('a', 'male', [], {}, { parent_a: 'loop' }),
    animal('loop', 'unknown', [], {}, { parent_a: 'a' }),
    animal('b', 'female', [], {}),
  ];
  // When
  const result = loadPlanner().relationshipWarnings({ animals, parentAId: 'a', parentBId: 'b', generations: 3 });
  // Then
  assert.deepEqual(warningCodes(result), ['pedigree_cycle']);
  assert.equal(result[0].status, 'review');
});

test('Given shuffled equally ranked animals, when candidates are made, then ids determine order', () => {
  // Given
  const animals = [
    animal('female-b', 'female', ['blacknight'], { blacknight: 5 }),
    animal('male-b', 'male', ['blacknight'], { blacknight: 5 }),
    animal('female-a', 'female', ['blacknight'], { blacknight: 5 }),
    animal('male-a', 'male', ['blacknight'], { blacknight: 5 }),
  ];
  // When
  const result = candidates(target('line_fix', ['blacknight']), animals);
  // Then
  assert.deepEqual(plain(result.map((pair) => [pair.parentAId, pair.parentBId])), [
    ['male-a', 'female-a'], ['male-a', 'female-b'],
    ['male-b', 'female-a'], ['male-b', 'female-b'],
  ]);
});

test('Given an unsupported species project, when its roadmap is requested, then a non-throwing unsupported contract returns', () => {
  // Given
  const input = { project: project(target('line_fix', ['blacknight']), 'crested'), animals: [], pairings: [] };
  // When
  const result = loadPlanner().roadmap(input);
  // Then
  assert.equal(result.species, 'crested');
  assert.equal(result.supported, false);
  assert.equal(result.status, 'unsupported');
});

test('Given a supported roadmap, when it is produced, then probability and fixed-percentage fields are absent', () => {
  // Given
  const animals = [
    animal('male', 'male', ['blacknight'], { blacknight: 4 }),
    animal('female', 'female', ['blacknight'], { blacknight: 5 }),
  ];
  const input = { project: project(target('line_fix', ['blacknight'])), animals, pairings: [] };
  // When
  const result = loadPlanner().roadmap(input);
  // Then
  assert.equal(hasForbiddenField(result), false);
});
