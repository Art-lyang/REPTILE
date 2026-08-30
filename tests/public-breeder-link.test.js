const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* QR 을 찍고 들어온 사람이 브리더로 갈 수 있는가
   ---------------------------------------------------------------------------
   개체 카드에 인쇄된 QR 은 /care/p.html?t= 로 갑니다. 거기까지 온 사람이 다음에
   할 일은 그 브리더의 다른 개체를 보는 것인데, 예전에는 갈 길이 두 개뿐이었고
   둘 다 잘 보이지 않았습니다.

     · 위쪽 브리더명 자체가 링크 — 글자라서 누를 수 있는 줄 모릅니다.
     · 카드 묶음 옆의 작은 글씨 '전체 개체 보기' — 화면 아래 2/3 지점입니다.

   더 나쁜 것은 두 번째가 카드 묶음 안에 있었다는 점입니다. 공개된 개체가 이
   한 마리뿐인 브리더는 카드 묶음이 아예 안 그려지고, 그러면 작은 글씨도 함께
   사라졌습니다. 개체를 처음 올린 사람이 정확히 그 상태입니다. */

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

function locales() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  ['ko', 'en', 'zh', 'ja'].forEach(function (lang) {
    vm.runInContext(read('care/care-i18n-' + lang + '.js'), ctx);
  });
  return ctx.window.CareI18nLocales;
}

test('Given someone scans the QR, when the page renders, then a breeder button is in the closing actions', () => {
  const ui = read('care/pub-ui.js');
  assert.match(ui, /function breederButton\(breeder, token\)/);
  assert.match(ui, /breederButton\(a\.breeder, token\)/);
  /* 다른 마무리 버튼들과 같은 모양이어야 눈에 버튼으로 읽힙니다. */
  assert.match(ui, /breederButton[\s\S]{0,400}class="btn ghost wide"/);
  assert.match(ui, /breederButton[\s\S]{0,400}I\.url\('\/care\/breeder\.html', \{ t: token \}\)/);
});

test('Given the breeder has no other public animals, when the page renders, then the button still shows', () => {
  const ui = read('care/pub-ui.js');
  /* 버튼은 카드 목록이 아니라 브리더명 유무만 봅니다. 목록을 보면 한 마리뿐인
     브리더에게서 버튼이 사라집니다 — 고치기 전 상태가 정확히 그것이었습니다. */
  const fn = ui.slice(ui.indexOf('function breederButton'));
  const body = fn.slice(0, fn.search(/\r?\n\s{2}\}/));
  assert.match(body, /if \(!breeder\) return '';/);
  assert.doesNotMatch(body, /\blist\b|\brelated\b|\.length/);
});

test('Given the breeder name is not public, when the page renders, then there is no breeder button', () => {
  /* 이름을 안 밝힌 브리더에게 보내면 빈 페이지로 데려가는 셈입니다. */
  const ui = read('care/pub-ui.js');
  assert.match(ui, /function breederButton\(breeder, token\) \{\s*\r?\n\s*if \(!breeder\) return '';/);
});

test('Given the card grid already has a header, when the button moved out, then the small link is gone', () => {
  /* 같은 곳으로 가는 링크가 화면에 둘이면 어느 쪽을 눌러야 하는지 고민하게
     됩니다. 큰 버튼만 남기고 카드 묶음 옆 작은 글씨는 걷어냈습니다. */
  const ui = read('care/pub-ui.js');
  const fn = ui.slice(ui.indexOf('function breederCards'));
  const body = fn.slice(0, fn.search(/\r?\n\s{2}\}/));
  assert.doesNotMatch(body, /class="mini"/);
  /* 제목과 설명은 남습니다 — 아래 카드가 무엇인지 알려 주는 글입니다. */
  assert.match(body, /breederAnimals/);
  assert.match(body, /breederPreviewHint/);
});

test('Given the site speaks four languages, when the button renders, then every language has its own words', () => {
  const L = locales();
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    assert.equal(typeof L[lang].breederMoreCta, 'string', lang);
    assert.ok(L[lang].breederMoreCta.length > 0, lang);
  });
  /* 사전은 ko 를 Object.assign 으로 물려받습니다. 키가 있는지만 보면 번역을
     빼먹어도 통과합니다 — 값이 한국어와 다른지를 봐야 합니다. */
  ['en', 'ja', 'zh'].forEach(function (lang) {
    assert.notEqual(L[lang].breederMoreCta, L.ko.breederMoreCta, lang);
  });
});

test('Given the harness stands in for the server, when a breeder has one animal, then that state is reachable', () => {
  /* 재현할 수 없는 상태는 다음에 또 놓칩니다. */
  const harness = read('care/_harness-public.html');
  assert.match(harness, /related.*===.*'none'|rel==='none'/);
});
