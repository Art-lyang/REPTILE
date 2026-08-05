const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadBrowserModule(file, extras = {}) {
  const window = Object.assign({}, extras.window || {});
  const context = Object.assign({ window, URL, URLSearchParams, Date, Intl }, extras);
  context.window = window;
  vm.createContext(context);
  vm.runInContext(read(file), context, { filename: file });
  return context.window;
}

test('Given an animal detail page, when the owner needs photos, then a direct edit route opens the existing four-slot editor', () => {
  const detail = read('care/animal.html');
  const dashboard = read('care/index.html');
  const controller = read('care/care-ui.js');

  assert.match(detail, /id="animalEdit"/,
    'the animal detail header must expose photo/profile editing');
  assert.match(detail, /care-animal-edit-route\.js\?v=/);
  assert.match(dashboard, /care-animal-edit-route\.js\?v=/);
  assert.match(controller, /CareAnimalEditRoute/,
    'the dashboard must consume the requested animal id');
  assert.match(read('care/care-photos.js'), /MAX_EXTRA\s*=\s*3/);
});

test('Given a memo quick action, when it is selected, then the owner enters content before a record is saved', () => {
  const source = read('care/animal-ui.js');
  assert.match(source, /AnimalRecordDialog/);
  assert.doesNotMatch(source,
    /if \(d\.quick\)[\s\S]{0,180}A\.addRecord\(\{ animal_id: S\.id, kind: d\.quick, title: null \}\)/,
    'memo must not be saved as an empty generic quick record');

  const api = loadBrowserModule('care/animal-record-dialog.js').AnimalRecordDialog;
  const html = api.html({ t: key => ({ memo: '메모', memoInputHint: '내용' }[key] || key) });
  assert.match(html, /<dialog/);
  assert.match(html, /<textarea/);
  assert.equal(api.payload('memo', '  사료를 거부함  ').note, '사료를 거부함');
});

test('Given one registered animal and quick health records, when Health opens, then the animal and those records are visible', () => {
  const api = loadBrowserModule('care/care-health-ui.js').CareHealthUi;
  const animal = { id: 'a1', name: '라봉이', species: 'leopard' };
  assert.equal(api.resolveAnimalId([animal], ''), 'a1');

  const html = api.render({
    animals: [animal], focus: '', today: '2026-08-03',
    records: [
      { id: 'r1', animal_id: 'a1', kind: 'health', done_date: '2026-08-03' },
      { id: 'r2', animal_id: 'a1', kind: 'refusal', done_date: '2026-08-03' },
    ],
    core: {
      signStatus: () => [], signsFor: () => [], SIGNS: {},
      kindInfo: kind => ({ icon: 'bi-dot', color: kind === 'health' ? 'red' : 'orange' }),
    },
    i18n: {
      t: (key, values) => values && values.name ? `${key}:${values.name}` : key,
      kindName: kind => kind === 'health' ? '건강' : '거식',
      signName: value => value, signWhat: value => value,
      formatDate: value => value, formatNumber: value => String(value),
    },
    escapeHtml: value => String(value), icon: name => name,
  });
  assert.match(html, /라봉이/);
  assert.match(html, /건강/);
  assert.match(html, /거식/);
});

test('Given 84 days of activity, when rendered, then named monthly calendars replace unlabeled selectable dots', () => {
  const api = loadBrowserModule('care/animal-calendar.js').AnimalCalendar;
  const days = [];
  const end = new Date('2026-08-03T00:00:00Z');
  for (let offset = 83; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - offset);
    days.push({ date: date.toISOString().slice(0, 10), count: offset === 0 ? 3 : 0 });
  }
  const html = api.render({
    days,
    i18n: {
      weekdayShort: day => ['일', '월', '화', '수', '목', '금', '토'][day],
      formatDate: (value, options) => options && options.month === 'long'
        ? value.slice(0, 7) : value,
      formatNumber: value => String(value),
      t: (key, values) => values && values.count != null ? `${key}:${values.count}` : key,
    },
    escapeHtml: value => String(value),
  });

  assert.match(html, /class="animal-calendars"/);
  assert.match(html, /data-month="2026-05"/);
  assert.match(html, /data-month="2026-08"/);
  assert.match(html, /data-date="2026-08-03"/);
  assert.match(html, /animal-cal-count">3</);
  assert.match(read('care/animal-calendar.css'), /user-select\s*:\s*none/);
});

test('Given feeding and memo records on a calendar date, when that date is shown, then its care details are available beside the month', () => {
  const api = loadBrowserModule('care/animal-calendar.js').AnimalCalendar;
  const html = api.render({
    days: [
      { date: '2026-08-02', count: 0 },
      { date: '2026-08-03', count: 2 },
    ],
    records: [
      { kind: 'feed', done_date: '2026-08-03', title: '저녁 급여', detail: '귀뚜라미 3마리', note: '2마리 먹음' },
      { kind: 'memo', done_date: '2026-08-03', note: '<script>입맛 저하</script>' },
    ],
    i18n: {
      weekdayShort: day => ['일', '월', '화', '수', '목', '금', '토'][day],
      formatDate: value => value,
      formatNumber: value => String(value),
      t: (key, values) => values && values.count != null ? `${key}:${values.count}` : key,
      kindName: kind => kind === 'feed' ? '급여' : '메모',
      signName: value => value,
    },
    kindInfo: kind => ({ icon: kind === 'feed' ? 'bi-egg-fried' : 'bi-sticky', ko: kind === 'feed' ? '급여' : '메모' }),
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  });

  assert.match(html, /<button[^>]+class="animal-cal-day[^>]+data-date="2026-08-03"/);
  assert.match(html, /data-calendar-detail="2026-08-03"/);
  assert.match(html, /저녁 급여/);
  assert.match(html, /귀뚜라미 3마리/);
  assert.match(html, /2마리 먹음/);
  assert.match(html, /&lt;script&gt;입맛 저하&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>입맛 저하<\/script>/);
});

test('Given a signed-in account, when it first opens, then only overview is shown and settings are categorized', () => {
  const login = read('gecko/login.html');
  const shell = read('gecko/account-shell.js');

  assert.match(login, /account-shell\.js\?v=/);
  assert.match(shell, /data-account-tab="overview"/);
  assert.match(shell, /data-account-tab="profile"/);
  assert.match(shell, /data-account-tab="privacy"/);
  assert.match(shell, /data-account-tab="security"/);
  assert.match(shell, /data-account-pane="overview"/);
  assert.match(shell, /data-account-pane="security"[^>]*hidden/);
  assert.doesNotMatch(login, /id="xNote"/,
    'the unnecessary free-form feedback field must be removed');
});

test('Given an animal registration form, when hatch date is chosen, then future dates are rejected in both UI and database', () => {
  const ui = read('care/care-animal-form.js');
  const sql = read('supabase_v34.sql');

  assert.match(ui, /id="f_hatch"[^>]+max="[^"+]*'\s*\+\s*C\.today\(\)/,
    'the native date picker must stop at today');
  assert.match(ui, /futureHatchDate/,
    'save must reject a manually forged future date');
  assert.match(sql, /create or replace function public\.care_animal_hatch_date_guard\(\)/i);
  assert.match(sql, /new\.hatch_date\s*>\s*current_date/i);
  assert.match(sql, /before insert or update of hatch_date on public\.animals/i);
});

test('Given an older animal form omits newly added defaults, when save_row inserts it, then the database fills every required animal default', () => {
  const setup = read('supabase_setup.sql');
  const trigger = setup.match(/create or replace function public\.animals_fill_species\(\)[\s\S]*?end \$\$;/i);

  assert.ok(trigger, 'fresh setup must define the animal default trigger');
  for (const field of ['is_public', 'is_listed', 'public_breeder', 'public_weight',
    'line_trait_scores', 'life_stage']) {
    assert.match(trigger[0], new RegExp(`new\\.${field}\\s+is null`, 'i'),
      `${field} must not become NULL when jsonb_populate_record receives an omitted value`);
  }
});

test('Given a keeper registers an animal, when an initial weight is entered, then weight privacy and the first history row are saved together', () => {
  const form = read('care/care-animal-form.js');
  const app = read('care/care-app.js');
  const migration = read('supabase_v41.sql');
  const setup = read('supabase_setup.sql');

  assert.match(form, /id="f_weight"[^>]+type="number"/);
  assert.match(form, /id="f_public_weight"[^>]+type="checkbox"/);
  assert.match(form, /public_weight:\s*\$\('f_public_weight'\)\.checked/);
  assert.match(form, /A\.saveAnimal\(row,\s*initialWeight\)/);
  assert.match(app, /save_animal_with_initial_weight/);

  for (const sql of [migration, setup]) {
    assert.match(sql, /create or replace function public\.save_animal_with_initial_weight/i);
    assert.match(sql, /security invoker/i);
    assert.match(sql, /newid\s*:=\s*public\.save_row/i);
    assert.match(sql, /insert into public\.weight_logs\s*\(animal_id,\s*grams,\s*measured_on\)/i);
    assert.match(sql, /grant execute on function public\.save_animal_with_initial_weight[\s\S]*to authenticated/i);
  }
});

test('Given an empty-state sentence contains inline emphasis, when rendered, then words stay in natural sentence flow', () => {
  const css = read('care/care.css');
  const block = (css.match(/\.empty\s*\{[^}]+\}/) || [''])[0];
  assert.doesNotMatch(block, /flex-direction\s*:\s*column/,
    'anonymous text around <b> must not become separate flex rows');
  assert.match(css, /\.empty\s*>?\s*i\s*\{[^}]*display\s*:\s*block/,
    'the icon should own its line instead of forcing every word onto one');
});

test('Given visible parents in a pedigree, when the tree renders, then paired branches connect them to their child generation', () => {
  const ui = read('care/animal-ui.js');
  const css = read('care/care.css');

  assert.match(ui, /class="pedrow ancestors"/);
  assert.match(ui, /class="pedlinks"/);
  assert.match(ui, /<span class="pedbranch/);
  assert.match(css, /\.pedrow\.ancestors\s+\.pedcell:not\(\.empty\)::after/);
  assert.match(css, /\.pedbranch\.has-left::before/);
  assert.match(css, /\.pedbranch\.has-left::after/);
});

test('Given a two-generation pedigree on mobile, when it renders, then all four grandparents fit before horizontal scrolling is needed', () => {
  const ui = read('care/animal-ui.js');
  const css = read('care/care.css');

  assert.match(ui, /matchMedia\(['"]\(max-width:\s*440px\)['"]\)/,
    'the pedigree width must account for a phone viewport');
  assert.match(ui, /up\s*<=\s*2/,
    'only the default two-generation tree should be compacted');
  assert.match(css, /@media\s*\(max-width:\s*440px\)[\s\S]*?\.pedbox[\s\S]*?width\s*:\s*72px/,
    'mobile pedigree cards must fit four columns inside the detail card');
});

test('Given overlapping auth events, when account settings finish loading, then only the latest render may append panes', () => {
  const login = read('gecko/login.html');
  assert.match(login, /ACCOUNT_RENDER/);
  assert.match(login, /run\s*!==\s*ACCOUNT_RENDER/,
    'stale async account renders must stop before appending duplicate sections');
});

test('Given a highest-admin account, when account overview loads, then server authority hides ordinary member settings', () => {
  const login = read('gecko/login.html');
  assert.match(login, /SB\.rpc\('is_owner'\)/,
    'highest-admin UI must use the server owner check instead of a hard-coded email');
  assert.doesNotMatch(login, /u\.email\s*===\s*['"]kmc612000@gmail\.com/i);
  assert.match(login, /renderMe\([^)]*isAdmin/);
});
