const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function loadFlow() {
  const source = read('assets/breeding-project-flow.js');
  assert.notEqual(source, '', 'assets/breeding-project-flow.js must exist');
  const window = {};
  vm.runInContext(source, vm.createContext({ window }), { filename: 'breeding-project-flow.js' });
  return window.BreedingProjectFlow;
}

function project(mode = 'line_fix') {
  return {
    id: 'goal-1', species: 'gecko', name: 'line goal', status: 'active',
    target: { version: 1, mode, traits: mode === 'line_fix'
      ? [{ id: 'blacknight', targetScore: 4 }]
      : [{ id: 'blacknight', targetScore: 4 }, { id: 'tangerine', targetScore: 3 }] },
  };
}

const pairings = [
  { id: 'pair-1', project_id: 'goal-1', project_step: 1, male: 'm1', female: 'f1' },
  { id: 'pair-other', project_id: 'goal-2', project_step: 1, male: 'm2', female: 'f2' },
];

test('Given project-linked pairings, when filtered, then unrelated rows are excluded', () => {
  const rows = loadFlow().linkedPairings('goal-1', pairings);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [pairings[0]]);
});

test('Given offspring parent links in either order, when a project is inspected, then both are found', () => {
  const animals = [
    { id: 'm1' }, { id: 'f1' },
    { id: 'child-a', parent_a: 'm1', parent_b: 'f1' },
    { id: 'child-b', parent_a: 'f1', parent_b: 'm1' },
    { id: 'other', parent_a: 'm2', parent_b: 'f2' },
  ];
  const rows = loadFlow().offspringForProject('goal-1', pairings, animals);
  assert.deepEqual(rows.map(row => row.id), ['child-a', 'child-b']);
});

test('Given a deleted linked parent, when project state loads, then it requests reselection without throwing', () => {
  const state = loadFlow().projectState(project(), pairings, [{ id: 'f1' }]);
  assert.equal(state.nextAction, 'reselect_parents');
  assert.equal(state.missingReferences.length, 1);
});

test('Given a line-fix offspring meeting its observed score, when selected, then it is a candidate', () => {
  const animal = { id: 'child', morphs: ['blacknight'], line_trait_scores: { blacknight: 4 } };
  const result = loadFlow().assessOffspring(project(), animal);
  assert.equal(result.status, 'selected');
});

test('Given a cross offspring carrying both rated traits, when selected, then both directions remain explicit', () => {
  const animal = { id: 'child', morphs: ['blacknight', 'tangerine'],
    line_trait_scores: { blacknight: 4, tangerine: 3 } };
  const result = loadFlow().assessOffspring(project('cross'), animal);
  assert.equal(result.status, 'selected');
  assert.deepEqual(JSON.parse(JSON.stringify(result.traits)), [
    { id: 'blacknight', status: 'met', score: 4, targetScore: 4 },
    { id: 'tangerine', status: 'met', score: 3, targetScore: 3 },
  ]);
});

test('Given a linked pairing without registered offspring, when state loads, then it waits for real offspring', () => {
  const animals = [{ id: 'm1' }, { id: 'f1' }];
  const state = loadFlow().projectState(project(), pairings, animals);
  assert.equal(state.nextAction, 'await_offspring');
  assert.deepEqual(state.offspring, []);
});

test('Given a recommended candidate, when handed to pairing, then project linkage and step are preserved', () => {
  const draft = loadFlow().pairingDraft(project(), { parentAId: 'm1', parentBId: 'f1' });
  assert.deepEqual(JSON.parse(JSON.stringify(draft)), {
    male: 'm1', female: 'f1', species: 'gecko', project_id: 'goal-1', project_step: 1,
    name: 'line goal · 1', target_morph: 'line goal',
  });
});

test('Given every project flow response, when serialized, then no probability or fixed claim exists', () => {
  const flow = loadFlow();
  const state = flow.projectState(project(), pairings, [{ id: 'm1' }, { id: 'f1' }]);
  assert.doesNotMatch(JSON.stringify(state), /probability|fixedPercent|inbreedingCoefficient/i);
});

test('Given the goal UI and pairing controller, when inspected, then candidate handoff fields are wired', () => {
  assert.match(read('care/breeding-goal-ui.js'), /data-bg-save-pairing/);
  assert.match(read('care/breeding-ui.js'), /\bproject_id\b/);
  assert.match(read('care/breeding-ui.js'), /\bproject_step\b/);
  assert.match(read('care/breeding.html'), /breeding-project-flow\.js/);
});
