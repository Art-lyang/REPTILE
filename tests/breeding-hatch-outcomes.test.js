const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadOutcomes() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(read('care/breeding-hatch-outcomes.js'), context);
  return context.window.BreedingHatchOutcomes;
}

test('Given an eight-egg clutch, when outcome counts are normalized, then a closed partial hatch remains explicit', () => {
  // Given
  const outcomes = loadOutcomes();

  // When
  const result = outcomes.normalize({
    eggCount: 8, fertile: 1, infertile: 2, stopped: 1, hatched: 3,
    actualHatchDate: '2026-08-03', laidDate: '2026-06-01', closed: true
  });

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    value: {
      fertile_count: 1, infertile_count: 2, stopped_count: 1, hatched_count: 3,
      unknown_count: 1, actual_hatch_date: '2026-08-03', outcome_closed: true,
      outcome_status: 'closed'
    }
  });
});

test('Given impossible outcome totals or dates, when normalized, then the form fails closed', () => {
  // Given
  const outcomes = loadOutcomes();

  // When
  const tooMany = outcomes.normalize({ eggCount: 2, fertile: 1, infertile: 1, stopped: 1, hatched: 0 });
  const missingDate = outcomes.normalize({ eggCount: 2, fertile: 0, infertile: 0, stopped: 0, hatched: 1 });
  const earlyDate = outcomes.normalize({ eggCount: 2, fertile: 0, infertile: 0, stopped: 0, hatched: 1,
    laidDate: '2026-07-01', actualHatchDate: '2026-06-30' });

  // Then
  assert.equal(tooMany.error, 'count');
  assert.equal(missingDate.error, 'hatch_date');
  assert.equal(earlyDate.error, 'hatch_date');
});

test('Given a clutch from an exact group pairing, when an offspring draft is made, then lineage and project fields follow it', () => {
  // Given
  const outcomes = loadOutcomes();
  const clutch = { id: 'c1', species: 'gecko', actual_hatch_date: '2026-08-03', laid_date: '2026-06-01' };
  const pairing = { id: 'p1', male: 'm1', female: 'f1', project_id: 'bp1', project_step: 2, group_id: 'g1' };
  const group = { id: 'g1', name: '2026 Blacknight A' };

  // When
  const draft = outcomes.offspringDraft({ clutch, pairing, group, nextNumber: 2 });

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(draft)), {
    species: 'gecko', sex: 'unknown', life_stage: 'baby_unknown', hatch_date: '2026-08-03',
    parent_a: 'm1', parent_b: 'f1', clutch_id: 'c1', breeding_project_id: 'bp1',
    breeding_project_step: 3, clutch_label: '2026 Blacknight A · #2', morphs: [], hets: []
  });
});

test('Given live and completed clutch counts, when summaries are made, then unknown eggs and registration capacity are derived', () => {
  // Given
  const outcomes = loadOutcomes();

  // When / Then
  assert.deepEqual(JSON.parse(JSON.stringify(outcomes.summary({ egg_count: 4, fertile_count: 2,
    infertile_count: 1, stopped_count: 0, hatched_count: 1 }, 1))), {
    eggCount: 4, knownCount: 4, unknownCount: 0, hatchedCount: 1, registeredCount: 1,
    registrationRemaining: 0, status: 'partially_hatched'
  });
});

test('Given production and harness pages, when hatch management boots, then domain and panel load before the controller', () => {
  ['care/breeding.html', 'care/_harness-breed.html'].forEach(page => {
    const html = read(page);
    const domainAt = html.indexOf('breeding-hatch-outcomes.js?v=');
    const panelAt = html.indexOf('breeding-hatch-panel.js?v=');
    const controllerAt = html.indexOf('breeding-ui.js?v=');
    assert.ok(domainAt >= 0 && panelAt > domainAt && controllerAt > panelAt, page);
  });
});

