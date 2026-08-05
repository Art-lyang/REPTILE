const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Given repeated weighing on the same day, when v34 is applied, then every measurement remains in chronological history', () => {
  const sql = read('supabase_v34.sql');
  const app = read('care/care-app.js');

  assert.match(sql, /drop constraint if exists weight_logs_animal_id_measured_on_key/i);
  assert.match(sql, /add column if not exists measured_at timestamptz/i);
  assert.match(sql, /create index if not exists weight_logs_animal_measured_idx/i);
  assert.match(app, /from\('weight_logs'\)\.insert\(/,
    'weights must append instead of upserting over an earlier measurement');
  assert.doesNotMatch(app, /onConflict:\s*'animal_id,measured_on'/);
});

test('Given a saved weight history, when animal detail renders, then the graph and removable measurement list are both present', () => {
  const source = read('care/animal-ui.js');
  assert.match(source, /data-delweight/);
  assert.match(source, /weightHistory/);
  assert.match(source, /chart\(w\)/);
});

test('Given an owner enables a public animal card, when its QR URL opens, then only approved profile facts are returned', () => {
  const sql = read('supabase_v34.sql');
  const page = read('care/p.html');
  const ui = read('care/pub-ui.js');

  assert.match(sql, /create or replace function public\.public_animal\(p_token text\)/i);
  assert.match(sql, /'latest_weight'/i);
  assert.match(sql, /'clutch'/i);
  assert.doesNotMatch(sql, /'private_note'/i);
  assert.match(sql, /share_token\s*=\s*p_token[\s\S]{0,100}public_breeder\s*=\s*true/i,
    'related breeder cards require the owner to opt into public breeder identity');
  assert.match(page, /pub-ui\.js\?v=/);
  assert.match(ui, /latest_weight/);
  assert.match(ui, /clutch/);
  assert.match(ui, /breederAnimals/);
  assert.match(ui, /studioHome/);
});

test('Given v34 adds public RPCs, when the migration commits, then PostgREST reloads its schema cache', () => {
  const sql = read('supabase_v34.sql');
  assert.match(sql, /notify\s+pgrst\s*,\s*'reload schema'/i);
});

test('Given a private detail page, when the owner needs a QR card, then a visible shortcut targets the separate public HTML page settings', () => {
  const detail = read('care/animal.html');
  const controller = read('care/animal-ui.js');
  assert.match(detail, /id="animalShare"/);
  assert.match(controller, /id="share-card"/);
  assert.match(controller, /\/care\/p\.html/);
});

test('Given weight sharing is enabled, when v37 serves a public animal, then a bounded chronological history can draw a graph', () => {
  const sql = read('supabase_v37.sql');
  const page = read('care/p.html');
  const ui = read('care/pub-ui.js');
  const chart = read('care/public-weight-chart.js');

  assert.match(sql, /'weight_history'/i);
  assert.match(sql, /if\s+a\.public_weight/i);
  assert.match(sql, /limit\s+30/i);
  assert.match(page, /public-weight-chart\.js\?v=/);
  assert.match(ui, /weight_history/);
  assert.match(chart, /<canvas/);
  assert.match(chart, /getContext\(['"]2d['"]\)/);
});

test('Given public parents exist, when the public card loads, then only a public parent photo is returned and rendered', () => {
  const sql = read('supabase_v37.sql');
  const ui = read('care/pub-ui.js');

  assert.match(sql, /'photo'\s*,\s*case\s+when\s+p\.is_public/is);
  assert.match(ui, /p\.photo/);
  assert.match(ui, /Photo\.tag\(p\.photo/);
});

test('Given breeder identity is public, when visitors ask for more animals, then a dedicated breeder profile lists only public listed animals', () => {
  const sql = read('supabase_v37.sql');
  const card = read('care/pub-ui.js');
  const page = read('care/breeder.html');
  const profile = read('care/breeder-ui.js');

  assert.match(sql, /create or replace function public\.public_breeder_profile/i);
  assert.match(sql, /public_breeder\s*=\s*true/i);
  assert.match(sql, /a\.is_public\s*=\s*true\s+and\s+a\.is_listed\s*=\s*true/i);
  assert.match(card, /breeder\.html/);
  assert.match(page, /breeder-ui\.js\?v=/);
  assert.match(profile, /public_breeder_profile/);
  assert.match(profile, /data-species/);
});

test('Given the live share RPC supports weight privacy, when sharing is saved, then one request carries the complete setting', () => {
  const app = read('care/care-app.js');

  assert.match(app, /p_weight:\s*!!showWeight/);
  assert.match(app, /const response = await SB\.rpc\('set_animal_share', args\)/);
  assert.equal((app.match(/SB\.rpc\('set_animal_share', args\)/g) || []).length, 1);
});
