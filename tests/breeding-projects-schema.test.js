const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function sqlFrom(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function functionsIn(sql) {
  return sql.match(/create or replace function public\.[a-z0-9_]+\s*\([\s\S]*?\$\$\s*;/g) || [];
}

function functionWith(sql, markers) {
  return functionsIn(sql).find(source => markers.every(marker => source.includes(marker))) || '';
}

function assertSql(sql, pattern, message) {
  assert.ok(pattern.test(sql), message);
}

function assertLineTraitContract(sql, label) {
  assertSql(
    sql,
    /\bline_trait_scores\s+jsonb\s+not null\s+default\s+'\{\}'(?:::jsonb)?/,
    `${label} must add animals.line_trait_scores as non-null JSONB with an empty-object default`,
  );
  const validator = functionWith(sql, ['line_trait_scores', '4096']);
  assert.notEqual(validator, '', `${label} must define the line_trait_scores structural validator`);
  assert.match(validator, /jsonb_typeof\([^)]*\)\s*(?:=|<>)\s*'object'/, `${label} must reject non-object scores`);
  assert.match(validator, /jsonb_(?:object_keys|each)\(/, `${label} must inspect every score key`);
  assert.match(validator, /(?:<=|>)\s*32\b/, `${label} must reject more than 32 score keys`);
  assert.match(validator, /octet_length\([^)]*::text\)\s*(?:<=|>)\s*4096/, `${label} must enforce the 4KB score limit`);
  assert.ok(validator.includes('^[a-z0-9_-]{1,64}$'), `${label} must enforce the score-key pattern`);
  assert.match(validator, /jsonb_typeof\([^)]*\)\s*(?:=|<>)\s*'number'/, `${label} must require numeric score values`);
  assert.match(validator, /between\s+1\s+and\s+5|\^\[1-5\]\$/, `${label} must require integer scores from 1 through 5`);

  const validatorName = validator.match(/function public\.([a-z0-9_]+)\s*\(/)[1];
  assertSql(sql, new RegExp(`check\\s*\\([^;]*${validatorName}\\s*\\(\\s*line_trait_scores\\s*\\)`), `${label} must attach the validator to animals`);
  for (const role of ['public', 'anon', 'authenticated']) {
    assertSql(
      sql,
      new RegExp(`revoke (?:all|execute) on function public\\.${validatorName}\\s*\\(\\s*jsonb\\s*\\) from [^;]*\\b${role}\\b`),
      `${label} must revoke the score validator from ${role}`,
    );
  }
}

function assertProjectTableContract(sql, label) {
  const table = (sql.match(/create table(?: if not exists)? public\.breeding_projects\s*\([\s\S]*?\)\s*;/) || [''])[0];
  assert.notEqual(table, '', `${label} must create public.breeding_projects`);
  const columns = {
    id: /\bid\s+uuid\s+primary key/,
    user_id: /\buser_id\s+uuid\s+not null/,
    species: /\bspecies\s+text\s+not null/,
    name: /\bname\s+text\s+not null/,
    target: /\btarget\s+jsonb\s+not null/,
    status: /\bstatus\s+text\s+not null/,
    created_at: /\bcreated_at\s+timestamptz\s+not null\s+default\s+now\(\)/,
    updated_at: /\bupdated_at\s+timestamptz\s+not null\s+default\s+now\(\)/,
  };
  for (const [column, pattern] of Object.entries(columns)) {
    assert.match(table, pattern, `${label} must define the required ${column} column`);
  }
  const statuses = (sql.match(/status\s+in\s*\([^)]+\)/) || [''])[0];
  const species = (sql.match(/species\s+in\s*\([^)]+\)/) || [''])[0];
  for (const value of ['draft', 'active', 'complete', 'archived']) assert.ok(statuses.includes(`'${value}'`), `${label} must allow project status ${value}`);
  for (const value of ['gecko', 'crested', 'fattail', 'ballpython']) assert.ok(species.includes(`'${value}'`), `${label} must constrain project species to ${value}`);
  assertSql(sql, /char_length\(btrim\(name\)\)\s+between\s+1\s+and\s+120/, `${label} must bound the trimmed project name`);
}

function assertTargetContract(sql, label) {
  const validator = functionWith(sql, ['jsonb_array_length', 'targetscore', '4096']);
  assert.notEqual(validator, '', `${label} must define the breeding project target v1 validator`);
  assert.match(validator, /jsonb_typeof\([^)]*\)\s*(?:=|<>)\s*'object'/, `${label} must require a target object`);
  assert.match(validator, /'version'[\s\S]{0,80}(?:=|<>)\s*'?1'?/, `${label} must require target version 1`);
  assert.ok(validator.includes("'line_fix'") && validator.includes("'cross'"), `${label} must allow only line_fix and cross modes`);
  assert.match(validator, /jsonb_typeof\([^)]*'traits'[^)]*\)\s*(?:=|<>)\s*'array'/, `${label} must require a traits array`);
  assert.match(validator, /line_fix[\s\S]{0,180}jsonb_array_length\([^)]*\)\s*(?:=|<>)\s*1/, `${label} must require exactly one line_fix trait`);
  assert.match(validator, /cross[\s\S]{0,180}jsonb_array_length\([^)]*\)\s*(?:=|<>)\s*2/, `${label} must require exactly two cross traits`);
  assert.match(validator, /distinct[\s\S]{0,180}->>\s*'id'|->>\s*'id'[\s\S]{0,180}distinct/, `${label} must reject duplicate trait IDs`);
  assert.ok(validator.includes('^[a-z0-9_-]{1,64}$'), `${label} must validate every target trait ID`);
  assert.match(validator, /targetscore[\s\S]{0,180}(?:between\s+1\s+and\s+5|\^\[1-5\]\$)/, `${label} must require integer targetScore values from 1 through 5`);
  assert.match(validator, /octet_length\([^)]*::text\)\s*(?:<=|>)\s*4096/, `${label} must enforce the 4KB target limit`);
}

function assertProjectSecurityContract(sql, label) {
  assertSql(sql, /alter table public\.breeding_projects enable row level security/, `${label} must enable project RLS`);
  const policies = (sql.match(/create policy [^;]+ on public\.breeding_projects[\s\S]*?;/g) || []).join(' ');
  assert.match(policies, /to authenticated/, `${label} must scope project policies to authenticated users`);
  assert.match(policies, /using\s*\([^)]*user_id[^)]*auth\.uid\(\)/, `${label} must isolate project reads and writes by auth.uid()`);
  assert.match(policies, /with check\s*\([^)]*user_id[^)]*auth\.uid\(\)/, `${label} must prevent cross-owner project inserts and updates`);
  for (const role of ['public', 'anon']) {
    assertSql(sql, new RegExp(`revoke all on (?:table )?public\\.breeding_projects from [^;]*\\b${role}\\b`), `${label} must revoke project table access from ${role}`);
  }
  const grants = (sql.match(/grant [^;]+ on (?:table )?public\.breeding_projects to authenticated/g) || []).join(' ');
  for (const privilege of ['select', 'insert', 'update', 'delete']) assert.ok(grants.includes(privilege), `${label} must grant authenticated ${privilege}`);
}

function assertProjectLinkContract(sql, label) {
  assertSql(sql, /add column if not exists project_id\s+uuid/, `${label} must add pairings.project_id`);
  assertSql(sql, /foreign key\s*\(\s*project_id\s*\)\s+references public\.breeding_projects\s*\(\s*id\s*\)\s+on delete set null/, `${label} must retain pairings when projects are deleted`);
  assertSql(sql, /add column if not exists project_step\s+(?:smallint|integer|int)/, `${label} must add pairings.project_step`);
  assertSql(sql, /project_step\s+between\s+1\s+and\s+3/, `${label} must restrict project_step to 1 through 3`);
  const guard = functionWith(sql, ['breeding_projects', 'new.project_id', 'new.user_id', 'new.species']);
  assert.notEqual(guard, '', `${label} must define the pairing/project ownership and species guard`);
  assert.match(guard, /(?:[a-z0-9_.]*user_id\s*(?:=|<>|is distinct from)\s*new\.user_id|new\.user_id\s*(?:=|<>|is distinct from)\s*[a-z0-9_.]*user_id)/, `${label} must compare pairing and project owners`);
  assert.match(guard, /(?:[a-z0-9_.]*species\s*(?:=|<>|is distinct from)\s*new\.species|new\.species\s*(?:=|<>|is distinct from)\s*[a-z0-9_.]*species)/, `${label} must compare pairing and project species`);
  assert.match(guard, /raise exception/, `${label} must reject cross-owner or cross-species project links`);
  assertSql(sql, /create trigger [^;]+ before insert or update[^;]+ on public\.pairings[^;]+execute function/, `${label} must run the project link guard before pairing writes`);
}

function assertUpdatedAtAndCleanup(sql, label) {
  const trigger = (sql.match(/create trigger [^;]+ before update[^;]+ on public\.breeding_projects[^;]+execute function (?:public\.)?([a-z0-9_]+)\(\)/) || []);
  assert.ok(trigger[0], `${label} must automatically refresh breeding_projects.updated_at`);
  const updater = functionWith(sql, [`function public.${trigger[1]}(`, 'new.updated_at', 'now()']);
  assert.notEqual(updater, '', `${label} must assign now() to updated_at in the trigger function`);

  const cleanup = functionWith(sql, ['delete_my_account']);
  assert.notEqual(cleanup, '', `${label} must redefine delete_my_account`);
  for (const relation of ['storage.objects', 'public.clutches', 'public.pairings', 'public.animals', 'public.feed_items', 'public.breeding_projects', 'public.profiles', 'auth.users']) {
    assert.match(cleanup, new RegExp(`delete from ${relation.replace('.', '\\.')}\\b`), `${label} delete_my_account must keep cleanup for ${relation}`);
  }
  assert.match(cleanup, /delete from public\.breeding_projects[^;]+user_id\s*=\s*uid/, `${label} must delete only the withdrawing user's projects`);
}

const migration = sqlFrom('supabase_v31.sql');
const setup = sqlFrom('supabase_setup.sql');

test('Given animal line scores, when v31 is applied, then malformed score maps are rejected', () => {
  // Given/When: untrusted line score JSON crosses the database boundary
  // Then: shape, count, size, key, integer, and privilege limits are present
  assert.notEqual(migration, '', 'supabase_v31.sql is missing; add the secure breeding-project schema migration');
  assertLineTraitContract(migration, 'supabase_v31.sql');
});

test('Given an authenticated breeder, when v31 is applied, then projects have the bounded storage contract', () => {
  // Given/When: project rows and target JSON are stored
  // Then: columns, enums, names, target v1 shape, uniqueness, scores, and size are constrained
  assertProjectTableContract(migration, 'supabase_v31.sql');
  assertTargetContract(migration, 'supabase_v31.sql');
});

test('Given anonymous and separate-account callers, when projects are queried, then RLS and grants fail closed', () => {
  // Given/When: public, anon, authenticated A, and authenticated B access the table
  // Then: only the matching auth.uid() can perform CRUD
  assertProjectSecurityContract(migration, 'supabase_v31.sql');
});

test('Given project-linked pairings, when links change or projects are deleted, then ownership, species, and history stay safe', () => {
  // Given/When: a pairing is linked across users/species or its project is removed
  // Then: invalid links fail and valid pairing history survives with a null link
  assertProjectLinkContract(migration, 'supabase_v31.sql');
});

test('Given project edits and account deletion, when v31 runs, then timestamps refresh and existing cleanup remains intact', () => {
  // Given/When: a project changes or its owner withdraws
  // Then: updated_at advances and every established cleanup path plus projects is deleted
  assertUpdatedAtAndCleanup(migration, 'supabase_v31.sql');
});

test('Given a fresh Supabase install, when setup runs, then it matches the v31 schema and security result', () => {
  // Given/When: supabase_setup.sql is used instead of sequential migrations
  // Then: fresh installs receive the same complete contract
  assertLineTraitContract(setup, 'supabase_setup.sql');
  assertProjectTableContract(setup, 'supabase_setup.sql');
  assertTargetContract(setup, 'supabase_setup.sql');
  assertProjectSecurityContract(setup, 'supabase_setup.sql');
  assertProjectLinkContract(setup, 'supabase_setup.sql');
  assertUpdatedAtAndCleanup(setup, 'supabase_setup.sql');
});

test('Given a fresh install pairing is linked to a project, when save_row runs, then the authenticated owner is injected', () => {
  const saveRow = functionWith(setup, ['save_row', "'animals','pairings','clutches'"]);
  const myRows = functionWith(setup, ['my_rows', 'jsonb_agg']);
  const deleteRow = functionWith(setup, ['delete_row', 'row_count']);
  const claimDevice = functionWith(setup, ['claim_device', 'access_codes']);
  assert.notEqual(saveRow, '', 'supabase_setup.sql must define the owner-aware save_row');
  assert.match(saveRow, /auth\.uid\(\)/, 'fresh-install save_row must read the authenticated user');
  assert.match(saveRow, /p_row\s*:=\s*p_row\s*-\s*'device'\s*-\s*'user_id'/,
    'fresh-install save_row must discard caller-supplied ownership');
  assert.match(saveRow, /jsonb_build_object\([^;]*'user_id'[^;]*'device'/,
    'fresh-install save_row must inject the authenticated owner and canonical device');
  for (const [name, source] of [['my_rows', myRows], ['delete_row', deleteRow], ['claim_device', claimDevice]]) {
    assert.notEqual(source, '', `supabase_setup.sql must define owner-aware ${name}`);
    assert.match(source, /auth\.uid\(\)/, `${name} must derive ownership from the authenticated user`);
  }
  assert.match(myRows, /where t\.user_id\s*=\s*\$1/,
    'fresh-install my_rows must not trust a caller-supplied account-shaped device key');
  assert.match(deleteRow, /where id\s*=\s*\$1 and user_id\s*=\s*\$2/,
    'fresh-install delete_row must delete only the authenticated owner row');
  assert.match(claimDevice, /where device\s*=\s*\$3 and user_id is null/,
    'fresh-install claim_device must import only unclaimed device rows');
});
