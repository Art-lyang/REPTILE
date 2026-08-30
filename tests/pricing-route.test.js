const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

/* 무료 회원이 유료 기능을 눌렀을 때 요금 안내로 갑니다.
   ---------------------------------------------------------------------------
   예전에는 세 곳 모두 /gecko/login.html 로 보냈습니다. 거기까지 온 사람은
   이미 로그인한 상태라, 눌러 봐야 자기 계정 화면만 나왔습니다. 무엇이 더
   열리는지는 끝내 알 수 없었습니다. */

test('Given a free member is at the animal limit, when they ask for more, then they see what premium adds', () => {
  const ui = read('care/care-ui.js');
  assert.match(ui, /q\.premium \? ''\s*\n\s*: '<a class="mini" href="' \+ esc\(I\.url\('\/pricing\.html'\)\)/);
  /* 유료 회원에게는 더 권할 것이 없습니다. */
  assert.match(ui, /q\.premium \? ''/);
});

test('Given a free member opens breeding management, when the gate stops them, then it points at pricing', () => {
  const ui = read('care/breeding-ui.js');
  assert.match(ui, /if \(!A\.premium\.active\) \{ gate\('bi-gem',[^;]*'\/pricing\.html'/);
  /* 로그인하지 않은 사람은 요금 안내가 아니라 로그인으로 가야 합니다. */
  assert.match(ui, /if \(!A\.user\) \{ gate\('bi-person-lock',[^;]*loginUrl\(\)/);
});

test('Given the account page lists features, when a free member reads it, then breeding is visible but priced', () => {
  const login = read('gecko/login.html');
  assert.match(login, /prem\.active\? LoginLocale\.url\('\/care\/breeding\.html[\s\S]{0,60}: LoginLocale\.url\('\/pricing\.html'\)/);
});

test('Given signups are closed, when the account page renders, then the care log is not advertised', () => {
  /* 케어로그는 무료도 쓸 수 있게 만들어 두었지만, 가입을 막아 둔 동안에는
     아직 들어올 수 없는 사람에게 먼저 보여 줄 이유가 없습니다. */
  const login = read('gecko/login.html');
  assert.match(login, /prem\.active\? '<a href="'\+esc\(LoginLocale\.url\('\/care\/'\)\)[^:]*: ''/);
});

test('Given a logged-in free member uses the calculator, when they look for breeding, then the button is there', () => {
  const app = read('gecko/gecko-app.js');
  /* 감춰 두면 무엇이 더 있는지 알 수 없어서, 결제를 권할 자리 자체가 없어집니다. */
  assert.match(app, /if\(pro\) pro\.style\.display = '';/);
  /* 로그인 전에는 그대로 감춥니다 — 그 사람에게 먼저 필요한 것은 로그인입니다. */
  assert.match(app, /if\(!USER\)\{[\s\S]{0,320}if\(pro\) pro\.style\.display='none';/);
});

test('Given pricing is the destination, when someone lands there, then they are not stranded', () => {
  const pricing = read('pricing.html');
  /* 돌아갈 길이 없으면 뒤로가기 말고는 방법이 없습니다. */
  assert.match(pricing, /href="\/"/);
  assert.match(pricing, /href="\/gecko\/login\.html"/);
});

test('Given pricing now speaks four languages, when a link points at it, then the language travels', () => {
  /* 처음에는 한국어 전용이라 lang 을 일부러 뺐습니다. 번역이 붙은 뒤로는
     반대로, 안 붙이면 영어로 보던 사람이 한국어 요금표를 보게 됩니다. */
  ['care/care-ui.js', 'care/breeding-ui.js'].forEach(function (file) {
    assert.match(read(file), /url\('\/pricing\.html'\)/, file);
  });
});
