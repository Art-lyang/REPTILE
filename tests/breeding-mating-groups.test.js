const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadGroups() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'care/breeding-mating-groups.js'), 'utf8'), context);
  return context.window.BreedingMatingGroups;
}

function animal(id, sex, stage = 'adult', species = 'gecko', extra = {}) {
  return { id, name: id, sex, life_stage: stage, species, ...extra };
}

test('Given one adult male and three adult females, when a mating group is normalized, then all three 1:N members remain', () => {
  // Given
  const animals = [animal('m1', 'male'), animal('f1', 'female'), animal('f2', 'female'), animal('f3', 'female')];

  // When
  const result = loadGroups().normalize({
    species: 'gecko', maleId: 'm1', femaleIds: ['f1', 'f2', 'f2', 'f3'], name: '2026 A 라인'
  }, animals);

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    value: { species: 'gecko', maleId: 'm1', femaleIds: ['f1', 'f2', 'f3'], name: '2026 A 라인' }
  });
});

test('Given immature or wrong-species animals, when a mating group is normalized, then parent eligibility fails closed', () => {
  // Given
  const groups = loadGroups();
  const animals = [
    animal('m1', 'male', 'subadult'),
    animal('m2', 'male'),
    animal('f1', 'female', 'adult', 'crested'),
    animal('f2', 'female')
  ];

  // When
  const invalidMale = groups.normalize({ species: 'gecko', maleId: 'm1', femaleIds: ['f2'], name: 'A' }, animals);
  const invalidFemale = groups.normalize({ species: 'gecko', maleId: 'm2', femaleIds: ['f1'], name: 'A' }, animals);
  const missingFemale = groups.normalize({ species: 'gecko', maleId: 'm2', femaleIds: [], name: 'A' }, animals);

  // Then
  assert.equal(invalidMale.error, 'male');
  assert.equal(invalidFemale.error, 'female');
  assert.equal(missingFemale.error, 'female_required');
});

test('Given grouped pairings, when a lineage roster is built, then every female keeps her exact pair and warning level', () => {
  // Given
  const groups = loadGroups();
  const animals = [animal('m1', 'male'), animal('f1', 'female'), animal('f2', 'female')];
  const pairings = [
    { id: 'p1', group_id: 'g1', male: 'm1', female: 'f1' },
    { id: 'p2', group_id: 'g1', male: 'm1', female: 'f2' },
    { id: 'legacy', male: 'm1', female: 'f2' }
  ];
  const planner = { relationshipWarnings: ({ parentBId }) => parentBId === 'f1'
    ? [{ code: 'shared_grandparent', status: 'review' }]
    : [{ code: 'pedigree_incomplete', status: 'review' }] };

  // When
  const roster = groups.lineageRoster({ groupId: 'g1', pairings, animals, planner, generations: 3 });

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(roster)), [
    { pairingId: 'p1', femaleId: 'f1', femaleName: 'f1', level: 'review', warningCodes: ['shared_grandparent'] },
    { pairingId: 'p2', femaleId: 'f2', femaleName: 'f2', level: 'incomplete', warningCodes: ['pedigree_incomplete'] }
  ]);
});

test('Given mixed breeding animals, when candidates are requested, then only same-species adult roles are returned', () => {
  // Given
  const animals = [
    animal('m1', 'male'), animal('m2', 'male', 'juvenile'), animal('f1', 'female'),
    animal('f2', 'female', 'subadult'), animal('f3', 'female', 'adult', 'fattail')
  ];

  // When
  const result = loadGroups().candidates(animals, 'gecko');

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { males: ['m1'], females: ['f1'] });
});

test('Given the breeding page, when the mating feature boots, then the group domain and panel load before the controller', () => {
  // Given
  const html = fs.readFileSync(path.join(ROOT, 'care/breeding.html'), 'utf8');

  // When
  const domainAt = html.indexOf('breeding-mating-groups.js?v=');
  const panelAt = html.indexOf('breeding-mating-panel.js?v=');
  const controllerAt = html.indexOf('breeding-ui.js?v=');

  // Then
  assert.ok(domainAt >= 0 && panelAt > domainAt && controllerAt > panelAt);
});
