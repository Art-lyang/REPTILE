const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const sql = file => fs.readFileSync(path.join(root, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--[^\r\n]*/g, ' ')
  .replace(/\s+/g, ' ')
  .toLowerCase();

function contract(source, label) {
  for (const field of ['feed_item_id', 'feed_name', 'feed_category', 'feed_state',
    'offered_amount', 'eaten_amount', 'feed_unit', 'feeding_result']) {
    assert.match(source, new RegExp(`add column if not exists ${field}\\b|\\b${field}\\s+`), `${label}.${field}`);
  }
  assert.match(source, /feed_category in \('prepared','insect','whole_prey','plant','supplement','other'\)/);
  assert.match(source, /feed_state in \('ready','live','frozen','thawed','powder','mixed','fresh','other'\)/);
  assert.match(source, /feeding_result in \('all','partial','refused','unknown'\)/);
  assert.match(source, /eaten_amount is null or \(eaten_amount >= 0 and eaten_amount <= offered_amount\)/);

  const policy = source.split(';').find(statement => statement.includes('create policy care_records_own')) || '';
  assert.match(policy, /feed_item_id is null[\s\S]*public\.feed_items/,
    `${label} must reject another account's feed item at the RLS boundary`);
  assert.match(policy, /feed\.user_id = (?:\(select )?auth\.uid\(\)/);

  assert.match(source, /function public\.feed_apply_usage\(\)/);
  assert.match(source, /rec\.feed_item_id/);
  assert.match(source, /rec\.offered_amount/);
  assert.match(source, /where id = fid and user_id = rec\.user_id/);
}

test('Given an existing care database, when structured feeding is installed, then history fields and owner checks are added without destructive table changes', () => {
  const migration = sql('supabase_v42.sql');
  contract(migration, 'supabase_v42.sql');
  assert.doesNotMatch(migration, /\b(?:drop table|truncate|delete from)\s+(?:table\s+)?public\.care_records\b/);
});

test('Given a fresh project, when the consolidated setup runs, then it has the same structured feeding contract', () => {
  contract(sql('supabase_setup.sql'), 'supabase_setup.sql');
});
