const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function compactSql(relativePath) {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function loadScope() {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(read('care/breeding-row-scope.js'), context, {
    filename: 'care/breeding-row-scope.js',
  });
  return context.BreedingRowScope;
}

function assertClutchSpeciesContract(sql, label) {
  assert.match(sql, /alter table public\.clutches[\s\S]*add column if not exists species text/,
    `${label} must add clutches.species without discarding existing rows`);
  assert.match(sql, /update public\.clutches[\s\S]*public\.pairings[\s\S]*species/,
    `${label} must backfill linked clutches from their pairing species`);
  assert.match(sql, /alter table public\.clutches[\s\S]*alter column species set not null/,
    `${label} must make clutch species mandatory after backfill`);
  for (const species of ['gecko', 'crested', 'fattail', 'ballpython']) {
    assert.ok(sql.includes(`'${species}'`), `${label} must allow ${species}`);
  }
  assert.match(sql, /create trigger clutches_pairing_guard[\s\S]*before insert or update[\s\S]*on public\.clutches/,
    `${label} must validate clutch links before writes`);
  const guard = (sql.match(/create or replace function public\.clutches_pairing_guard\(\)[\s\S]*?\$\$\s*;/) || [''])[0];
  assert.match(guard, /public\.pairings/, `${label} guard must read the linked pairing`);
  assert.match(guard, /user_id is distinct from new\.user_id/,
    `${label} guard must reject a pairing owned by another user`);
  assert.match(guard, /species is distinct from new\.species/,
    `${label} guard must reject a pairing from another species`);
}

test('Given clutches from several species, when a dashboard is scoped, then orphan rows never leak across species', () => {
  const Scope = loadScope();
  const pairs = [
    { id: 'g-pair', species: 'gecko' },
    { id: 'c-pair', species: 'crested' },
  ];
  const clutches = [
    { id: 'g-orphan', species: 'gecko', pairing: null },
    { id: 'c-orphan', species: 'crested', pairing: null },
    { id: 'g-linked', species: 'gecko', pairing: 'g-pair' },
    { id: 'c-linked', species: 'crested', pairing: 'c-pair' },
    { id: 'tampered', species: 'crested', pairing: 'g-pair' },
  ];

  assert.deepEqual(
    Scope.clutches(clutches, pairs.slice(0, 1), 'gecko').map((row) => row.id),
    ['g-orphan', 'g-linked'],
  );
  assert.deepEqual(
    Scope.clutches(clutches, pairs.slice(1), 'crested').map((row) => row.id),
    ['c-orphan', 'c-linked'],
  );
});

test('Given rows made before species storage, when they are scoped during rollout, then linked rows follow the pair and orphans stay Leopard-only', () => {
  const Scope = loadScope();
  const legacy = [
    { id: 'linked', pairing: 'c-pair' },
    { id: 'orphan', pairing: null },
  ];

  assert.deepEqual(Scope.clutches(legacy, [{ id: 'c-pair', species: 'crested' }], 'crested')
    .map((row) => row.id), ['linked']);
  assert.deepEqual(Scope.clutches(legacy, [], 'gecko').map((row) => row.id), ['orphan']);
});

test('Given a clutch is saved, when it has no pairing, then the active species is still persisted', () => {
  const panel = read('care/breeding-clutch-panel.js');
  const controller = read('care/breeding-ui.js');
  const production = read('care/breeding.html');
  const harness = read('care/_harness-breed.html');

  assert.match(panel, /species:\s*S\.species/);
  assert.match(controller, /BreedingRowScope\.pairings/);
  assert.match(controller, /BreedingRowScope\.clutches/);
  for (const html of [production, harness]) {
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
      .map((match) => match[1].split('/').pop().split('?')[0]);
    assert.ok(scripts.indexOf('breeding-row-scope.js') < scripts.indexOf('breeding-ui.js'));
  }
});

test('Given an upgraded or fresh database, when clutch rows are written, then both paths enforce the same species contract', () => {
  assertClutchSpeciesContract(compactSql('supabase_v32.sql'), 'supabase_v32.sql');
  assertClutchSpeciesContract(compactSql('supabase_setup.sql'), 'supabase_setup.sql');
});
