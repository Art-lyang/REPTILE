const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function assertContract(sql, label) {
  assert.match(sql, /create table if not exists public\.mating_groups/i, `${label} needs mating_groups`);
  assert.match(sql, /alter table public\.pairings[\s\S]*add column if not exists group_id uuid/i, `${label} links exact 1:1 pairings to a group`);
  assert.match(sql, /create table if not exists public\.mating_events/i, `${label} needs dated mating events`);
  assert.match(sql, /female_ids[\s\S]*cardinality[\s\S]*(?:12|twelve)/i, `${label} bounds a group roster`);
  assert.match(sql, /CARE_MATING_GROUP_MALE_INVALID/i, `${label} validates the adult male`);
  assert.match(sql, /CARE_MATING_GROUP_FEMALE_INVALID/i, `${label} validates every adult female`);
  assert.match(sql, /CARE_MATING_GROUP_LINK_INVALID/i, `${label} validates group pairing ownership`);
  assert.match(sql, /create or replace function public\.save_mating_group/i, `${label} saves a group atomically`);
  assert.match(sql, /revoke all on function public\.save_mating_group[\s\S]*from public, anon/i, `${label} does not expose the RPC anonymously`);
  assert.match(sql, /revoke all on public\.mating_groups from public, anon/i, `${label} removes anonymous table privileges`);
  assert.match(sql, /revoke all on public\.mating_events from public, anon/i, `${label} removes anonymous event privileges`);
  assert.match(sql, /grant (?:select|select, insert, update, delete)[\s\S]*mating_groups[\s\S]*to authenticated/i, `${label} explicitly exposes authenticated Data API access`);
  assert.match(sql, /alter table public\.mating_groups enable row level security/i, `${label} enables group RLS`);
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/i, `${label} scopes rows to the current owner`);
  assert.match(sql, /mating_groups_user_species_updated_idx/i, `${label} indexes the owner-scoped group list`);
  assert.match(sql, /mating_events_user_date_idx/i, `${label} indexes owner-scoped event history`);
  assert.match(sql, /CARE_MATING_GROUP_MEMBER_HAS_HISTORY/i, `${label} preserves recorded group lineage`);
}

test('Given an upgraded database, when v44 is applied, then 1:N groups preserve exact parent pairings and dated history', () => {
  assertContract(read('supabase_v44.sql'), 'v44');
});

test('Given a fresh database, when setup runs, then it includes the same 1:N mating contract', () => {
  assertContract(read('supabase_setup.sql'), 'setup');
});

test('Given a mating group event, when the client saves it, then only structured fields cross the boundary', () => {
  const app = read('care/care-app.js');
  assert.match(app, /listMatingGroups\s*\(/);
  assert.match(app, /saveMatingGroup\s*\(/);
  assert.match(app, /listMatingEvents\s*\(/);
  assert.match(app, /saveMatingEvent\s*\(/);
});
