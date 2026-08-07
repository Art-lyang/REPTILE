const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const SRC = read('assets/premium-expiry-notice.js');

/* 화면을 만들지 않고 판단 부분만 실행합니다. 붙였다 뗐다 하는 DOM 은
   브라우저에서 확인했고, 여기서는 '언제 뜨는가' 를 못 박습니다. */
function load(store) {
  const win = {
    document: {
      getElementById: () => null,
      createElement: () => ({ setAttribute() {}, querySelector: () => null, appendChild() {} }),
      head: { appendChild() {} }, body: { appendChild() {} },
    },
    localStorage: {
      getItem: key => (store && key in store ? store[key] : null),
      setItem: (key, value) => { if (store) store[key] = value; },
    },
  };
  new Function('window', SRC)(win);
  return win.PremiumExpiryNotice;
}

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

const N = load({});

test('Given a plan with no end date, when it is checked, then nothing is shown', () => {
  /* 무기한 프리미엄과 무료는 알릴 것이 없습니다. */
  assert.equal(N.shouldShow({ active: false }), false);
  assert.equal(N.shouldShow({ active: true, expires_at: null }), false);
  assert.equal(N.shouldShow(null), false);
});

test('Given a plan ending soon, when the remaining days cross ten, then the notice appears', () => {
  assert.equal(N.shouldShow({ active: true, expires_at: inDays(11) }), false);
  assert.equal(N.shouldShow({ active: true, expires_at: inDays(10) }), true, '10일은 포함입니다');
  assert.equal(N.shouldShow({ active: true, expires_at: inDays(1) }), true);
  assert.equal(N.shouldShow({ active: true, expires_at: inDays(0) }), true, '오늘 만료도 알려야 합니다');
});

test('Given the plan already ended, when the page loads, then it does not nag', () => {
  /* 이미 지난 뒤에는 안내가 아니라 잔소리입니다. 잠긴 개체가 스스로 말해 줍니다. */
  assert.equal(N.shouldShow({ active: true, expires_at: inDays(-1) }), false);
});

test('Given a date near midnight, when days are counted, then whole days are used', () => {
  /* 시각까지 세면 23시간 남았을 때 0일이 되어 '오늘이 마지막' 이라고 하는데,
     실제로는 내일까지 쓸 수 있습니다. */
  const end = new Date();
  end.setDate(end.getDate() + 1);
  end.setHours(1, 0, 0, 0);
  assert.equal(N.daysLeft(end.toISOString()), 1);
});

test('Given the member hides it for today, when they return the same day, then it stays hidden', () => {
  const store = {};
  const M = load(store);
  const now = new Date();
  const key = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    + '-' + String(now.getDate()).padStart(2, '0');
  assert.equal(M.shouldShow({ active: true, expires_at: inDays(3) }), true);
  store[M.KEY] = key;
  assert.equal(M.shouldShow({ active: true, expires_at: inDays(3) }), false);
  /* 다른 날짜면 다시 보여야 합니다 — 남은 날이 줄수록 더 알아야 할 소식입니다. */
  store[M.KEY] = '2020-01-01';
  assert.equal(M.shouldShow({ active: true, expires_at: inDays(3) }), true);
});

test('Given the notice carries its own copy, when a language is missing a line, then it falls back', () => {
  const keys = Object.keys(N.COPY.ko);
  assert.ok(keys.length >= 6);
  ['en', 'ja', 'zh'].forEach(function (lang) {
    const missing = keys.filter(key => !(key in N.COPY[lang]));
    assert.deepEqual(missing, [], lang + ' 에 빠진 문구: ' + missing.join(', '));
    const same = keys.filter(key => N.COPY[lang][key] === N.COPY.ko[key]);
    assert.deepEqual(same, [], lang + ' 에서 번역되지 않은 문구: ' + same.join(', '));
  });
});

test('Given the box is fixed-position, when it is styled, then it has a real width', () => {
  /* max-width 만 두면 position:fixed 상자가 글자 폭으로 쪼그라들어, 한 글자씩
     세로로 늘어선 기둥이 됩니다. 실제로 그렇게 나왔습니다. */
  assert.match(SRC, /width:min\(340px,calc\(100vw - 28px\)\)/);
  assert.match(SRC, /box-sizing:border-box/);
});

test('Given a date format we do not control, when it is placed, then it is not innerHTML', () => {
  /* 날짜 형식은 지역마다 다르고 우리가 만든 문자열이 아닙니다. */
  assert.match(SRC, /querySelector\('p'\)\.textContent = msg/);
  assert.doesNotMatch(SRC, /innerHTML = .*msg/);
});

test('Given the host pages differ, when the notice is called, then a missing module is survivable', () => {
  /* 안내 하나 때문에 케어 화면이나 계정 화면이 안 뜨면 안 됩니다. */
  assert.match(read('care/care-ui.js'), /if \(window\.PremiumExpiryNotice\)/);
  assert.match(read('gecko/login.html'), /if\(!isAdmin && window\.PremiumExpiryNotice\)/);
  assert.match(read('care/index.html'), /premium-expiry-notice\.js\?v=/);
  assert.match(read('gecko/login.html'), /premium-expiry-notice\.js\?v=/);
});
