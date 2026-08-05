const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function assertContract(sql, label) {
  assert.match(sql, /alter table public\.clutches[\s\S]*fertile_count[\s\S]*hatched_count/i, `${label} stores outcomes`);
  assert.match(sql, /clutches_outcome_counts_ck/i, `${label} bounds outcome totals by egg count`);
  assert.match(sql, /actual_hatch_date/i, `${label} stores the actual hatch date`);
  assert.match(sql, /alter table public\.animals[\s\S]*clutch_id uuid/i, `${label} links offspring to a clutch`);
  assert.match(sql, /breeding_project_id uuid/i, `${label} carries the linebreeding project`);
  assert.match(sql, /create or replace function public\.care_animal_clutch_guard/i, `${label} validates offspring lineage`);
  assert.match(sql, /new\.parent_a := linked_clutch\.male[\s\S]*new\.parent_b := linked_clutch\.female/i,
    `${label} assigns the exact sire and dam`);
  assert.match(sql, /CARE_CLUTCH_OFFSPRING_LIMIT/i, `${label} cannot register more offspring than hatched eggs`);
  assert.match(sql, /create or replace function public\.clutches_outcome_guard/i, `${label} protects recorded offspring`);
  assert.match(sql, /clutches_outcome_owner_idx/i, `${label} indexes owner outcome history`);
  assert.match(sql, /create or replace function public\.save_clutch_v48/i, `${label} updates clutches without delete-and-reinsert`);
  assert.match(sql, /create or replace function public\.save_clutch_outcome/i, `${label} exposes a bounded outcome write`);
  assert.match(sql, /revoke all on function public\.save_clutch_outcome[\s\S]*from public, anon/i,
    `${label} blocks anonymous outcome writes`);
  assert.match(sql, /delete from public\.mating_events[\s\S]*delete from public\.animals[\s\S]*delete from public\.clutches[\s\S]*delete from public\.pairings[\s\S]*delete from public\.mating_groups/i,
    `${label} deletes linked breeding rows in foreign-key-safe order`);
}

test('Given an upgraded database, when v48 is applied, then hatch outcomes close the clutch-to-offspring lineage', () => {
  assertContract(read('supabase_v48.sql'), 'v48');
});

test('Given a fresh database, when setup runs, then it includes the same hatch outcome contract', () => {
  assertContract(read('supabase_setup.sql'), 'setup');
});

test('Given the browser client, when hatch results load and save, then structured authenticated methods are used', () => {
  const app = read('care/care-app.js');
  assert.match(app, /listClutchOffspring\s*\(/);
  assert.match(app, /saveClutchOutcome\s*\(/);
  assert.doesNotMatch(app, /service_role/i);
});
