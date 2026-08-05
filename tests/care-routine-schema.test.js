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

function statementWith(sql, marker) {
  return sql.split(';').find((statement) => statement.includes(marker)) || '';
}

function routineContract(sql) {
  const weeklyColumn = sql.match(/\bweekly_target\s+(smallint|integer|int)\b/);
  const cycleConstraint = statementWith(sql, 'add constraint care_plans_cycle_ck');
  const weeklyConstraint = statementWith(sql, 'add constraint care_plans_weekly_target_ck');
  return {
    weeklyType: weeklyColumn?.[1] === 'smallint' ? 'smallint' : '',
    exactlyOne: /num_nonnulls\s*\(\s*interval_days\s*,\s*weekdays\s*,\s*weekly_target\s*\)\s*=\s*1/.test(cycleConstraint),
    weeklyMinimum: /weekly_target\s+between\s+1\s+and\s+7/.test(weeklyConstraint) ? 1 : null,
    weeklyMaximum: /weekly_target\s+between\s+1\s+and\s+7/.test(weeklyConstraint) ? 7 : null,
  };
}

function assertRoutineContract(sql, label) {
  assert.notEqual(sql, '', `${label} must exist`);
  assert.deepEqual(routineContract(sql), {
    weeklyType: 'smallint',
    exactlyOne: true,
    weeklyMinimum: 1,
    weeklyMaximum: 7,
  }, `${label} must enforce one bounded recurrence mode`);
}

function assertCareSecurityAndCompletion(sql, label) {
  for (const table of ['care_plans', 'care_records']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`),
      `${label} must enable RLS on ${table}`);
    const policy = statementWith(sql, `create policy ${table}_own`);
    assert.match(policy, /to authenticated/, `${label} must restrict ${table} to authenticated callers`);
    assert.match(policy, /user_id\s*=\s*(?:\(select\s+)?auth\.uid\(\)/,
      `${label} must isolate ${table} by auth.uid()`);
  }

  const ownerFunction = statementWith(sql, 'function public.care_set_owner()');
  assert.match(ownerFunction, /new\.user_id\s*:=\s*(?:\(select\s+)?auth\.uid\(\)/,
    `${label} must derive care ownership on the server`);
  for (const table of ['care_plans', 'care_records']) {
    assert.match(sql, new RegExp(`create trigger ${table}_owner before insert on public\\.${table}[\\s\\S]*?care_set_owner\\(\\)`),
      `${label} must attach the owner trigger to ${table}`);
  }

  assert.match(sql,
    /create unique index(?: if not exists)? care_records_plan_once_a_day on public\.care_records\s*\(\s*plan_id\s*,\s*done_date\s*\)\s*where plan_id is not null/,
    `${label} must keep one completion per plan per day`);
}

const migration = sqlFrom('supabase_v33.sql');
const setup = sqlFrom('supabase_setup.sql');

test('Given a v16 care schema, when v33 is applied, then weekly frequency is a nullable smallint recurrence mode', () => {
  assertRoutineContract(migration, 'supabase_v33.sql');
  assert.match(migration,
    /alter table public\.care_plans add column if not exists weekly_target smallint/,
    'v33 must add weekly_target without replacing care_plans or existing rows');
  assert.doesNotMatch(migration,
    /\b(?:drop table|truncate|delete from)\s+(?:table\s+)?public\.care_plans\b/,
    'v33 must preserve every existing care plan row');
  assert.doesNotMatch(migration,
    /weekly_target\s+smallint\s+(?:not null|default)/,
    'v33 must leave weekly_target nullable without changing existing row values');
});

test('Given any care plan, when its recurrence is stored, then exactly one mode is selected and weekly targets stay within 1 through 7', () => {
  const cycleConstraint = statementWith(migration, 'add constraint care_plans_cycle_ck');
  const weeklyConstraint = statementWith(migration, 'add constraint care_plans_weekly_target_ck');

  assert.match(cycleConstraint,
    /num_nonnulls\s*\(\s*interval_days\s*,\s*weekdays\s*,\s*weekly_target\s*\)\s*=\s*1/);
  assert.match(weeklyConstraint,
    /weekly_target is null or weekly_target between 1 and 7/);
});

test('Given v33 is retried after a partial or complete run, when constraints are installed, then the migration remains safe to rerun', () => {
  assert.match(migration, /to_regclass\(\s*'public\.care_plans'\s*\)/,
    'v33 must guard that v16 care_plans exists');
  assert.match(migration, /to_regclass\(\s*'public\.care_records'\s*\)/,
    'v33 must guard that v16 care_records exists');
  assert.match(migration, /drop constraint if exists care_plans_cycle_ck\s*;\s*alter table public\.care_plans add constraint care_plans_cycle_ck/,
    'v33 must safely replace the old two-mode cycle constraint');
  assert.match(migration, /drop constraint if exists care_plans_weekly_target_ck\s*;\s*alter table public\.care_plans add constraint care_plans_weekly_target_ck/,
    'v33 must safely replace the weekly range constraint');
  assert.match(migration, /information_schema\.columns/, 'v33 must include a column confirmation query');
  assert.match(migration, /pg_constraint/, 'v33 must include a constraint confirmation query');
});

test('Given established care security and completion history, when v33 is applied, then RLS, owner triggers, and duplicate protection are not replaced', () => {
  assert.doesNotMatch(migration, /disable row level security|drop trigger|drop index/,
    'v33 must retain owner triggers and duplicate protection');
  for (const contractName of ['care_plans_own', 'care_records_own', 'care_plans_owner', 'care_records_owner', 'care_records_plan_once_a_day']) {
    assert.ok(migration.includes(contractName), `v33 confirmation must retain visibility of ${contractName}`);
  }
});

test('Given empty weekday input, when recurrence constraints run, then it cannot become a plan that never runs', () => {
  for (const [label, sql] of [['supabase_v33.sql', migration], ['supabase_setup.sql', setup]]) {
    const weekdays = statementWith(sql, 'add constraint care_plans_weekdays_ck');
    assert.match(weekdays, /cardinality\s*\(\s*weekdays\s*\)\s+between\s+1\s+and\s+7/, label);
  }
});

test('Given a known feed id owned by another account, when a plan is written or completed, then policy and trigger both reject cross-user inventory changes', () => {
  for (const [label, sql] of [['supabase_v33.sql', migration], ['supabase_setup.sql', setup]]) {
    const policy = statementWith(sql, 'create policy care_plans_own');
    assert.match(policy, /feed_item_id is null[\s\S]*public\.feed_items/, `${label} plan policy`);
    assert.match(policy, /feed\.user_id\s*=\s*(?:\(select\s+)?auth\.uid\(\)/, `${label} feed owner check`);
    assert.match(sql, /owner_id is distinct from rec\.user_id[\s\S]*feed_owner_id is distinct from rec\.user_id/,
      `${label} trigger owner checks`);
    assert.match(sql, /where id = fid and user_id = rec\.user_id/, `${label} update owner scope`);
  }
});

test('Given a streak longer than the browser record window, when the current value is requested, then an authenticated server aggregate is available', () => {
  for (const [label, sql] of [['supabase_v33.sql', migration], ['supabase_setup.sql', setup]]) {
    assert.match(sql, /function public\.care_routine_streak\s*\(\s*\)/,
      `${label} must define the aggregate`);
    assert.match(sql, /drop function if exists public\.care_routine_streak\(date\)/,
      `${label} must remove the old unbounded overload`);
    assert.match(sql, /auth\.uid\(\)/, `${label} must derive the account from the session`);
    assert.match(sql, /greatest[\s\S]*end_date\s*-\s*3650/,
      `${label} must keep the generated date range bounded`);
    assert.match(sql, /grant execute on function public\.care_routine_streak\(\) to authenticated/,
      `${label} must expose the aggregate only to signed-in users`);
    assert.match(sql, /revoke all on function public\.care_routine_streak\(\) from public, anon/,
      `${label} must deny public and anonymous execution`);
  }
});

test('Given a fresh install, when setup runs, then it matches the upgraded routine, security, and duplicate-completion contract', () => {
  assertRoutineContract(setup, 'supabase_setup.sql');
  assert.deepEqual(routineContract(setup), routineContract(migration));
  assertCareSecurityAndCompletion(setup, 'supabase_setup.sql');
});

test('Given a fresh install, when care plans use existing food links, then setup retains the secured inventory contract', () => {
  assert.match(setup, /create table if not exists public\.feed_items/);
  assert.ok(setup.indexOf('create table if not exists public.feed_items')
    < setup.indexOf('create table if not exists public.care_plans'),
  'feed_items must exist before the care plan foreign key is created');
  assert.match(setup,
    /feed_item_id\s+uuid\s+references public\.feed_items\s*\(\s*id\s*\)\s+on delete set null/);
  assert.match(setup, /alter table public\.feed_items enable row level security/);
  assert.match(statementWith(setup, 'create policy feed_items_own'),
    /for all to authenticated[\s\S]*user_id\s*=\s*(?:\(select\s+)?auth\.uid\(\)/);
  assert.match(setup, /create trigger feed_items_owner before insert on public\.feed_items/);
  assert.match(setup, /create trigger care_records_feed_use[\s\S]*public\.feed_apply_usage\(\)/);
});
