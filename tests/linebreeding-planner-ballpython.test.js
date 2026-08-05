const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const traitNames = {
  ko: {
    reduced: '리듀스드 패턴', aberrant: '애버런트 패턴', banded: '밴디드 성향',
    highgold: '하이 골드', contrast: '하이 컨트라스트', blushing: '블러싱',
  },
  en: {
    reduced: 'Reduced pattern', aberrant: 'Aberrant pattern', banded: 'Banded',
    highgold: 'High gold', contrast: 'High contrast', blushing: 'Blushing',
  },
  ja: {
    reduced: 'リデュースドパターン', aberrant: 'アベラントパターン', banded: 'バンデッド傾向',
    highgold: 'ハイゴールド', contrast: 'ハイコントラスト', blushing: 'ブラッシング',
  },
  zh: {
    reduced: '减纹', aberrant: '异常纹', banded: '条带倾向',
    highgold: '高金', contrast: '高对比', blushing: 'blushing',
  },
};
const traitIds = Object.keys(traitNames.ko);

function loadHarness(language = 'ko') {
  const context = vm.createContext({ LANG: language });
  context.window = context;
  ['ballpython/ball-core.js', 'care/breeding-spec.js', 'assets/linebreeding-species-policy.js',
    'assets/linebreeding-planner.js']
    .forEach((relativePath) => vm.runInContext(
      fs.readFileSync(path.join(root, relativePath), 'utf8'),
      context,
      { filename: relativePath },
    ));
  return { planner: context.LineBreedingPlanner, policy: context.LineBreedingSpeciesPolicy };
}

function project(mode, ids) {
  return {
    species: 'ballpython',
    target: { version: 1, mode, traits: ids.map((id) => ({ id, targetScore: 4 })) },
  };
}

function animal(id, sex, morphs, species = 'ballpython') {
  return {
    id,
    species,
    sex,
    life_stage: 'adult',
    morphs,
    line_trait_scores: Object.fromEntries(morphs.map((traitId) => [traitId, 5])),
    parent_a: null,
    parent_b: null,
  };
}

function hasForbiddenField(value) {
  if (!value || typeof value !== 'object') return false;
  const forbidden = [
    'probability', 'fixedPercent', 'fixedGeneration', 'geneticProbability',
    'inheritanceProbability', 'alleleProbability', 'inbreedingCoefficient',
  ];
  return Object.entries(value).some(([key, child]) => (
    forbidden.includes(key) || hasForbiddenField(child)
  ));
}

test('Given the Ball Python core, when line-breeding support is inspected, then only the six BP traits are supported', () => {
  // Given
  const { planner, policy } = loadHarness();

  // When
  const supportedTraits = traitIds.filter((id) => policy.trait(id));

  // Then
  assert.equal(planner.supportsSpecies('ballpython'), true);
  assert.deepEqual(supportedTraits, traitIds);
  ['pastel', 'mojave', 'bel', 'bel_white'].forEach((id) => assert.equal(policy.trait(id), undefined));
});

test('Given every supported language and BP trait, when a line is fixed, then the core trait name is preserved', () => {
  // Given
  const languages = Object.keys(traitNames);

  // When
  const outcomes = languages.flatMap((language) => traitIds.map((id) => {
    const { planner } = loadHarness(language);
    const animals = [animal('male', 'male', [id]), animal('female', 'female', [id])];
    const result = planner.roadmap({ project: project('line_fix', [id]), animals });
    return [language, id, result.candidates[0].lineOutcome.name];
  }));

  // Then
  outcomes.forEach(([language, id, name]) => assert.equal(name, traitNames[language][id]));
});

test('Given two scored BP line traits, when they are crossed, then only a localized selection direction is returned', () => {
  // Given
  const expected = {
    ko: '리듀스드 패턴 × 하이 골드', en: 'Reduced pattern × High gold',
    ja: 'リデュースドパターン × ハイゴールド', zh: '减纹 × 高金',
  };

  // When
  const results = Object.keys(expected).map((language) => {
    const { planner } = loadHarness(language);
    const animals = [
      animal('male', 'male', ['reduced']),
      animal('female', 'female', ['highgold']),
    ];
    return [language, planner.roadmap({
      project: project('cross', ['reduced', 'highgold']), animals,
    })];
  });

  // Then
  results.forEach(([language, result]) => {
    assert.equal(result.supported, true);
    assert.equal(result.candidates[0].lineOutcome.name, expected[language]);
    assert.equal(result.candidates[0].lineOutcome.warning, null);
    assert.equal(hasForbiddenField(result), false);
  });
});

test('Given a genetic morph or BEL target, when sanitized as a BP line target, then it is rejected', () => {
  // Given
  const { planner } = loadHarness();

  // When
  const actions = ['pastel', 'mojave', 'bel', 'bel_white'].map((id) => (
    () => planner.sanitizeTarget(project('line_fix', [id]).target)
  ));

  // Then
  actions.forEach((action) => assert.throws(action, /trait id is unsupported/i));
});

test('Given a mode outside line_fix and cross, when sanitized for BP, then it is rejected', () => {
  // Given
  const { planner } = loadHarness();
  const target = { version: 1, mode: 'genetic', traits: [{ id: 'reduced', targetScore: 4 }] };

  // When
  const action = () => planner.sanitizeTarget(target);

  // Then
  assert.throws(action, /mode must be line_fix or cross/i);
});

test('Given a BP project with an animal from another species, when candidates are made, then the other species is excluded', () => {
  // Given
  const { planner } = loadHarness();
  const animals = [
    animal('ball-male', 'male', ['reduced']),
    animal('gecko-female', 'female', ['reduced'], 'gecko'),
  ];

  // When
  const result = planner.candidatePairs({ project: project('line_fix', ['reduced']), animals });

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(result)), []);
});
