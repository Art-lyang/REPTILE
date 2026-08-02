const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { BREEDING_FACTORIES } = require('./helpers/breeding-source');

const root = path.resolve(__dirname, '..');
const modules = BREEDING_FACTORIES;

function readCare(file) {
  return fs.readFileSync(path.join(root, 'care', file), 'utf8');
}

function pureLoc(source) {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlocks.split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('//')).length;
}

function scriptNames(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(match => match[1].split('/').pop().split('?')[0]);
}

test('Given the breeding controller responsibilities, when module boundaries are inspected, then every factory exists', () => {
  for (const [file, factory] of modules) {
    const source = readCare(file);
    assert.match(source, new RegExp(`window\\.${factory}\\s*=`), `${file} must publish ${factory}`);
  }
});

test('Given the breeding UI sources, when pure LOC is counted, then each responsibility stays reviewable', () => {
  const files = ['breeding-ui.js', ...modules.map(([file]) => file)];
  for (const file of files) {
    const count = pureLoc(readCare(file));
    assert.ok(count <= 200, `${file} has ${count} pure LOC; expected at most 200`);
    assert.ok(count <= 250, `${file} must never exceed 250 pure LOC`);
  }
});

test('Given production and harness pages, when breeding scripts load, then factories precede the controller in one order', () => {
  const expected = [...modules.map(([file]) => file), 'breeding-ui.js'];
  for (const page of ['breeding.html', '_harness-breed.html']) {
    const names = scriptNames(readCare(page));
    assert.deepEqual(names.filter(name => expected.includes(name)), expected, `${page} module order`);
  }
});

test('Given every feature factory, when the controller boots, then modules are composed and events bind exactly once', () => {
  const calls = [];
  const panels = {};
  const nodes = new Map();
  let eventDeps;
  let bindCount = 0;
  const context = vm.createContext({
    clearTimeout,
    setTimeout,
    document: {
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { classList: { add() {}, remove() {} }, innerHTML: '', textContent: '' });
        return nodes.get(id);
      },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
  });
  context.window = context;
  context.CareCore = {};
  context.CareApp = { ready: false };
  context.BreedingDraft = {};
  context.CarePhotos = {};
  context.LineTraitScores = {};

  const slots = ['animalPanel', 'pairingPanel', 'clutchPanel', 'geneticGoal', 'events'];
  modules.forEach(([file, factory], index) => {
    context[factory] = (deps) => {
      calls.push(file);
      const panel = { file };
      panels[slots[index]] = panel;
      return panel;
    };
  });
  context.createBreedingEvents = (deps) => {
    calls.push('breeding-events.js');
    eventDeps = deps;
    return { bind() { bindCount += 1; } };
  };

  vm.runInContext(readCare('breeding-ui.js'), context, { filename: 'care/breeding-ui.js' });

  assert.deepEqual(calls, modules.map(([file]) => file));
  assert.strictEqual(eventDeps.animalPanel, panels.animalPanel);
  assert.strictEqual(eventDeps.pairingPanel, panels.pairingPanel);
  assert.strictEqual(eventDeps.clutchPanel, panels.clutchPanel);
  assert.strictEqual(eventDeps.geneticGoal, panels.geneticGoal);
  assert.equal(bindCount, 1);
  assert.match(nodes.get('body').innerHTML, /백엔드가 설정되지 않았습니다/);
});
