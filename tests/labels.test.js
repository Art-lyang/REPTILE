const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const UI = read('care/labels-ui.js');
const CSS = read('care/labels.css');

/* 개체가 100마리쯤 되면 통을 열기 전에 그게 누구인지부터 알아야 합니다.
   통 앞의 QR 을 찍으면 그 개체 화면이 바로 열립니다. */

test('Given a label on an enclosure, when the keeper scans it, then it opens their own record', () => {
  /* 라벨은 사육장에 붙는 것이고 그 앞에 서는 사람은 대개 주인입니다.
     공개 프로필로 보내면 자기 기록을 못 엽니다. */
  assert.match(UI, /mode: 'manage'/);
  assert.match(UI, /I\.url\('\/care\/animal\.html', \{ id: a\.id \}\)/);
});

test('Given the public mode, when an animal is not published, then it is left out and counted', () => {
  /* 공개를 안 켠 개체는 공개 주소가 열리지 않습니다. 조용히 빼면 왜 몇 장
     덜 나왔는지 알 수 없습니다. */
  assert.match(UI, /S\.mode === 'public' \? !!\(a\.is_public && a\.share_token\) : true/);
  assert.match(UI, /lbSkipped/);
  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    assert.match(read('care/care-i18n-' + lang + '.js'), /lbSkipped:/, lang + ' 문구 없음');
  }
});

test('Given labels get scratched on a tub, when the QR is drawn, then error correction is raised', () => {
  /* 개체 화면의 공유 QR 은 M 을 씁니다. 라벨은 통에 붙어 긁히므로 Q 로
     올립니다 — 조금 촘촘해지지만 잘 읽힙니다. */
  assert.match(UI, /qrcode\(0, 'Q'\)/);
});

test('Given the sheet is for paper, when it prints, then only the labels remain', () => {
  assert.match(CSS, /@media print\{/);
  assert.match(CSS, /#body > \.pad,/, '고르는 화면은 종이에 나오면 안 됩니다');
  assert.match(CSS, /\.no-print\{display:none !important\}/);
  /* 잉크를 아끼려고 색을 빼면 QR 이 흐려집니다. */
  assert.match(CSS, /print-color-adjust:exact/);
  assert.match(CSS, /break-inside:avoid/);
});

test('Given tubs come in different sizes, when a size is chosen, then the grid follows', () => {
  assert.match(CSS, /\.lb-sm\{grid-template-columns:repeat\(4,1fr\)\}/);
  assert.match(CSS, /\.lb-md\{grid-template-columns:repeat\(3,1fr\)\}/);
  assert.match(CSS, /\.lb-lg\{grid-template-columns:repeat\(2,1fr\)\}/);
});

test('Given someone came to print labels, when the page opens, then everything is pre-selected', () => {
  /* 라벨을 뽑으러 온 사람은 보통 전부 뽑습니다. 빼는 편이 고르는 것보다
     빠릅니다. */
  assert.match(UI, /S\.animals\.forEach\(a => \{ S\.picked\[a\.id\] = true; \}\);/);
});

test('Given the care list, when a keeper looks for labels, then there is a way in', () => {
  assert.match(read('care/index.html'), /href="\/care\/labels\.html"/);
});

test('Given a hundred animals, when a checkbox is toggled, then every QR is not rebuilt', () => {
  /* 체크 하나에 화면을 통째로 다시 그리면 QR 을 전부 다시 만듭니다.
     100마리면 한 번 누를 때 100장이고, 그 사이 화면이 멎습니다. */
  assert.match(UI, /function refreshSheet\(\)/);
  assert.match(UI, /refreshSheet\(\);/);
  assert.match(UI, /const QR_CACHE = \{\};/);
  assert.match(UI, /if \(b\.firstChild\) return;/);
  /* 여는 곳이 바뀌면 주소가 달라지므로 열쇠에 함께 들어가야 합니다. */
  assert.match(UI, /const key = S\.mode \+ '\|' \+ a\.id;/);

  /* 체크 처리가 전체 render 로 돌아가면 안 됩니다. */
  const at = UI.indexOf("data-lb-pick]')).forEach");
  const block = UI.slice(at, at + 300);
  assert.doesNotMatch(block, /\brender\(\);/);
});
