const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* 혈통서 — 화면과 인쇄본
   ---------------------------------------------------------------------------
   문서로 건네는 것이 목적이라, 종이에 무엇이 남는지가 화면만큼 중요합니다.
   개체 화면의 다른 절이 함께 인쇄되면 혈통서가 아니라 화면 출력물이 됩니다. */

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

test('Given the certificate prints, when the print rules run, then only the document survives', () => {
  const css = read('care/pedigree-certificate.css');
  const block = css.slice(css.indexOf('@media print'));
  /* 개체 화면의 다른 절 */
  assert.match(block, /#body>\*:not\(\.pc-root\)/);
  /* 머리말·버튼·추신 입력칸 */
  assert.match(block, /\.no-print/);
  assert.match(block, /header/);
  /* 절이 페이지 사이에서 잘리면 표 하나가 두 장에 걸칩니다. */
  assert.match(block, /page-break-inside:avoid/);
});

test('Given black and white printing, when an ancestor repeats, then colour is not the only signal', () => {
  /* 근친 표시가 색만이면 흑백 인쇄에서 사라집니다. */
  const css = read('care/pedigree-certificate.css');
  assert.match(css, /\.pc-repeat\{[^}]*text-decoration:underline/);
});

test('Given the animal screen renders, when the certificate is added, then it gets the screen data', () => {
  const ui = read('care/animal-ui.js');
  assert.match(ui, /\+ certificateBlock\(\)/);
  assert.match(ui, /animal: S\.animal, animals: S\.animals/);
  assert.match(ui, /records: S\.records, plans: S\.plans, weights: S\.weights/);
  /* 모듈이 아직 안 실렸으면 조용히 빠집니다 — 화면 전체가 죽는 것보다 낫습니다. */
  assert.match(ui, /if \(!Ui\) return '';/);
});

test('Given a keeper presses save with an empty box, when nothing was typed, then no memo is stored', () => {
  /* 눌렀다는 이유로 빈 메모가 쌓이면 케어 기록이 지저분해집니다. */
  const ui = read('care/animal-ui.js');
  assert.match(ui, /if \(!String\(text \|\| ''\)\.trim\(\)\) return;/);
  assert.match(ui, /PedigreeCertificate\.savePostscript\(A, S\.id, text\)/);
});

test('Given the certificate is a document, when it is rendered, then it says it is not official', () => {
  /* '혈통서' 라는 이름은 공적 증명처럼 읽힙니다. 문서 안에서 아니라고 밝혀야
     합니다 — 유전 정보도 사육자가 적은 값이지 검사 결과가 아닙니다. */
  const ui = read('care/pedigree-certificate-ui.js');
  assert.match(ui, /pcDisclaimer/);
  const ctx = { window: {} };
  vm.createContext(ctx);
  ['ko', 'en', 'zh', 'ja'].forEach(function (lang) {
    vm.runInContext(read('care/care-i18n-' + lang + '.js'), ctx);
  });
  const L = ctx.window.CareI18nLocales;
  assert.match(L.ko.pcDisclaimer, /공적 증명서가 아닙니다/);
  assert.match(L.en.pcDisclaimer, /not an official certificate/);
});

test('Given ownership is not built yet, when the certificate renders, then the slot says so', () => {
  /* 아예 안 그리면 받는 사람은 그런 항목이 있는 줄도 모릅니다. */
  const ui = read('care/pedigree-certificate-ui.js');
  assert.match(ui, /pcOwnership'\)[\s\S]{0,120}pcOwnershipSoon/);
});

test('Given four languages, when the certificate renders, then none falls back to Korean', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  ['ko', 'en', 'zh', 'ja'].forEach(function (lang) {
    vm.runInContext(read('care/care-i18n-' + lang + '.js'), ctx);
  });
  const L = ctx.window.CareI18nLocales;
  const keys = Object.keys(L.ko).filter(k => k.indexOf('pc') === 0);
  assert.ok(keys.length >= 25, '혈통서 문구가 ' + keys.length + '개뿐입니다');
  ['en', 'ja', 'zh'].forEach(function (lang) {
    const same = keys.filter(k => L[lang][k] === L.ko[k]);
    assert.deepEqual(same, [], lang + ' 번역 누락: ' + same.join(', '));
  });
});

test('Given the page loads the certificate, when scripts are ordered, then the module precedes the screen', () => {
  /* animal-ui.js 가 그릴 때 이미 있어야 합니다. */
  ['care/animal.html', 'care/_harness-animal.html'].forEach(function (page) {
    const html = read(page);
    const mod = html.indexOf('pedigree-certificate-ui.js');
    const screen = html.indexOf('animal-ui.js');
    assert.ok(mod > 0 && screen > 0 && mod < screen, page);
    assert.match(html, /pedigree-certificate\.css/, page);
  });
});
