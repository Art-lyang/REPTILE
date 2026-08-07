const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

function loadField() {
  const context = { window: {}, Date, Math, Number, String, Object, Array, JSON };
  vm.createContext(context);
  vm.runInContext(read('care/date-field.js'), context);
  return context.window.DateField;
}

test('Given a month, when its length is needed, then leap years are handled', () => {
  const f = loadField();
  assert.equal(f.lastDay(2024, 2), 29, '2024는 윤년입니다');
  assert.equal(f.lastDay(2023, 2), 28);
  assert.equal(f.lastDay(2026, 4), 30);
  assert.equal(f.lastDay(2026, 12), 31);
});

test('Given a stored value, when the field is drawn, then the hidden input keeps the id and the ISO date', () => {
  const f = loadField();
  const html = f.html({ id: 'w_d', value: '2026-08-07', max: '2026-08-07' });

  /* 읽는 쪽은 예전처럼 document.getElementById('w_d').value 를 봅니다.
     id 가 숨은 칸으로 옮겨간 것이 이 방식의 핵심입니다. */
  assert.match(html, /<input type="hidden" id="w_d" value="2026-08-07"/);
  assert.match(html, /data-max="2026-08-07"/);
  assert.equal((html.match(/<select/g) || []).length, 3);
  assert.match(html, /<option value="2026" selected>/);
  assert.match(html, /<option value="8" selected>/);
  assert.match(html, /<option value="7" selected>/);
});

test('Given a half-broken value, when the field is drawn, then it starts empty instead of guessing', () => {
  const f = loadField();
  /* '2026-8-7' 이나 '오늘' 같은 값을 억지로 읽어 엉뚱한 날짜를 보여주면
     사용자는 그 값이 저장된 줄 압니다. */
  assert.equal(f.parse('2026-8-7'), null);
  assert.equal(f.parse(''), null);
  assert.equal(f.parse(null), null);
  assert.match(f.html({ id: 'x', value: '2026-8-7' }), /<input type="hidden" id="x" value=""/);
});

test('Given a marker on the old input, when it is replaced, then the marker moves with it', () => {
  const f = loadField();
  /* breeding-events.js 가 data-hatch-preview 를 보고 미리보기를 다시 그립니다.
     표식이 빠지면 그 연결이 조용히 끊깁니다. */
  const html = f.html({ id: 'h_date', value: '', attrs: 'data-hatch-preview' });
  assert.match(html, /<input type="hidden" id="h_date"[^>]*data-hatch-preview/);
});

test('Given the year list, when it is built, then it spans 1980 to the newest allowed year', () => {
  const f = loadField();
  const html = f.html({ id: 'y', value: '', max: '2026-08-07' });
  assert.equal(f.MIN_YEAR, 1980);
  assert.match(html, /<option value="1980">/);
  assert.match(html, /<option value="2026">/);
  assert.doesNotMatch(html, /<option value="2027">/, 'max 를 넘는 해는 고를 수 없어야 합니다');
});

test('Given every care screen, when dates are entered, then no native date input is left', () => {
  const files = [
    'care/animal-ui.js', 'care/care-ui.js', 'care/animal-feeding-dialog.js',
    'care/breeding-animal-panel.js', 'care/breeding-clutch-panel.js',
    'care/breeding-hatch-panel.js', 'care/breeding-mating-panel.js',
    'care/care-animal-form.js', 'care/care-plan-ui.js',
  ];
  files.forEach(function (file) {
    assert.doesNotMatch(read(file), /type="date"/,
      file + ' : input[type=date] 는 기기마다 다르게 그려져서 쓰지 않습니다');
  });
});

test('Given the pages that render dates, when they load, then the shared field is included', () => {
  ['care/index.html', 'care/animal.html', 'care/breeding.html'].forEach(function (page) {
    const html = read(page);
    assert.match(html, /date-field\.js\?v=/, page);
    /* care-core 가 먼저 와야 합니다 — 날짜 칸을 그리는 쪽이 C.today() 를 씁니다. */
    assert.ok(html.indexOf('care-core.js') < html.indexOf('date-field.js'), page + ' : 읽는 순서');
  });
});

test('Given many screens draw dates, when they are wired, then one delegated listener covers them all', () => {
  const source = read('care/date-field.js');
  /* 화면마다 bind 를 부르게 하면 한 곳만 빠뜨려도 그 화면의 날짜가 조용히
     동작하지 않습니다. 문서에 리스너 하나로 두는 이유입니다. */
  assert.match(source, /document\.addEventListener\('change', onChange, true\)/);
  assert.doesNotMatch(source, /bind:/, 'bind 를 내보내면 다시 호출부가 생깁니다');
});
