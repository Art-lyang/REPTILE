const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadRules() {
  const relativePath = 'care/animal-life-stage.js';
  assert.equal(fs.existsSync(path.join(root, relativePath)), true,
    'the shared life-stage and parent eligibility module must exist');
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(read(relativePath), context, { filename: relativePath });
  return context.AnimalLifeStage;
}

function animal(id, sex, lifeStage, extra = {}) {
  return { id, name: id, species: 'gecko', sex, life_stage: lifeStage, ...extra };
}

test('Given mixed ages and sexes, when sire and dam candidates are requested, then only adult males and adult females remain', () => {
  // Given
  const rules = loadRules();
  const animals = [
    animal('adult-male', 'male', 'adult'),
    animal('adult-female', 'female', 'adult'),
    animal('subadult-male', 'male', 'subadult'),
    animal('juvenile-female', 'female', 'juvenile'),
    animal('unknown-stage', 'male', null),
  ];

  // When
  const sires = rules.parentCandidates(animals, { id: 'child', species: 'gecko' }, 'sire');
  const dams = rules.parentCandidates(animals, { id: 'child', species: 'gecko' }, 'dam');

  // Then
  assert.deepEqual(sires.map(item => item.id), ['adult-male']);
  assert.deepEqual(dams.map(item => item.id), ['adult-female']);
});

test('Given an edited adult, when parent candidates are requested, then the animal itself and another species are excluded', () => {
  const rules = loadRules();
  const animals = [
    animal('self', 'male', 'adult'),
    animal('other-species', 'male', 'adult', { species: 'crested' }),
    animal('valid', 'male', 'adult'),
  ];

  const sires = rules.parentCandidates(animals, animals[0], 'sire');

  assert.deepEqual(sires.map(item => item.id), ['valid']);
});

test('Given parent ids, when they are validated, then self, duplicate, role, and maturity violations are rejected', () => {
  const rules = loadRules();
  const animals = [
    animal('child', 'unknown', 'baby_unknown'),
    animal('sire', 'male', 'adult'),
    animal('dam', 'female', 'adult'),
    animal('young-dam', 'female', 'subadult'),
  ];

  assert.equal(rules.validateParents(animals, animals[0], 'sire', 'dam'), null);
  assert.equal(rules.validateParents(animals, animals[0], 'sire', 'sire'), 'duplicate');
  assert.equal(rules.validateParents(animals, animals[0], 'child', 'dam'), 'self');
  assert.equal(rules.validateParents(animals, animals[0], 'dam', null), 'sire_role');
  assert.equal(rules.validateParents(animals, animals[0], 'sire', 'young-dam'), 'dam_maturity');
});

test('Given animal edit routes, when the forms render, then life stage and explicit sire/dam controls are shared and localized', () => {
  const dashboard = read('care/index.html');
  const detail = read('care/animal.html');
  const breeding = read('care/breeding.html');
  const careForm = read('care/care-animal-form.js');
  const breedingPanel = read('care/breeding-animal-panel.js');

  assert.match(dashboard, /animal-life-stage\.js\?v=/);
  assert.match(detail, /animal-life-stage\.js\?v=/);
  assert.match(read('care/animal-ui.js'), /LifeStage\.labelKey\(a\.life_stage\)/);
  assert.match(dashboard, /care-animal-form\.js\?v=/);
  assert.match(breeding, /animal-life-stage\.js\?v=/);
  assert.match(careForm, /f_stage/);
  assert.match(breedingPanel, /animalSireLabel/);
  assert.match(breedingPanel, /animalDamLabel/);
  assert.match(breedingPanel, /parentCandidates/);
  assert.match(breedingPanel, /validateParents/);
});

test('Given a breeding pairing or line-fixing analysis, when candidates are built, then only adult confirmed sexes participate', () => {
  const pairing = read('care/breeding-pairing-panel.js');
  const planner = read('assets/linebreeding-planner.js');

  assert.match(pairing, /life_stage\s*===\s*['"]adult['"]/);
  assert.match(planner, /life_stage\s*===\s*['"]adult['"]/);
});

test('Given the database migration, when an animal or pairing is saved, then invalid parent roles and immature breeders are rejected server-side', () => {
  const sql = read('supabase_v37.sql');

  assert.match(sql, /add column if not exists life_stage text/i);
  assert.match(sql, /baby_unknown[^;]+juvenile[^;]+subadult[^;]+adult/is);
  assert.match(sql, /care_animal_parent_guard/i);
  assert.match(sql, /parent_a[^;]+male[^;]+adult/is);
  assert.match(sql, /parent_b[^;]+female[^;]+adult/is);
  assert.match(sql, /new\.parent_a\s*=\s*new\.parent_b/i);
  assert.match(sql, /care_pairing_parent_guard/i);
});

test('Given a linked parent, when its stage or sex changes, then the database keeps the existing pedigree adult-only', () => {
  const migration = read('supabase_v38.sql');
  const setup = read('supabase_setup.sql');

  for (const sql of [migration, setup]) {
    assert.match(sql, /care_parent_candidate_update_guard/i);
    assert.match(sql, /child\.parent_a\s*=\s*new\.id[\s\S]+new\.sex\s*=\s*'male'[\s\S]+new\.life_stage\s*=\s*'adult'/i);
    assert.match(sql, /child\.parent_b\s*=\s*new\.id[\s\S]+new\.sex\s*=\s*'female'[\s\S]+new\.life_stage\s*=\s*'adult'/i);
    assert.match(sql, /before update of sex, life_stage, species, user_id, device on public\.animals/i);
  }
});
