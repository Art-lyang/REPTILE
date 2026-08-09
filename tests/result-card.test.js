const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('assets/result-card.js');

/* 지금 바깥에서 오는 사람의 대부분이 커뮤니티 스크린샷을 타고 옵니다.
   그 그림에 우리 이름이 없었을 뿐입니다. */

test('Given the card is the growth loop, when it renders, then the address is on it', () => {
  assert.match(SRC, /ryangstudio\.com/);
});

test('Given four calculators, when the button is added, then all four get it from one place', () => {
  /* 계산기마다 사전이 따로라, 문구를 그쪽에 넣으면 16곳을 고쳐야 하고
     하나 빠뜨리면 그 계산기만 다른 말이 됩니다. */
  for (const ui of ['gecko/gecko-ui.js', 'crested/crested-ui.js',
                    'ballpython/ball-ui.js', 'fattail/fattail-ui.js']) {
    assert.match(read(ui), /StudioResultCard\.buttonHtml\(\)/, ui + ' 에 버튼이 없습니다');
  }
  for (const page of ['gecko/index.html', 'crested/index.html',
                      'ballpython/index.html', 'fattail/index.html']) {
    assert.match(read(page), /assets\/result-card\.js\?v=/, page + ' 이 모듈을 안 읽습니다');
  }
  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    assert.match(SRC, new RegExp(lang + ': \{ btn:'), lang + ' 문구가 없습니다');
  }
});

test('Given the row cell holds buttons too, when the label is read, then only the morph name survives', () => {
  /* 그대로 읽으면 '트램퍼 알비노근거 보기' 처럼 버튼 글자가 붙습니다. */
  assert.match(SRC, /cloneNode\(true\)/);
  assert.match(SRC, /querySelectorAll\('button/);
  /* 조각끼리 붙어 '콤보랩터' 가 되는 것도 막습니다. */
  assert.match(SRC, /replace\(\/<\[\^>\]\+>\/g, ' \$& '\)/);
});

test('Given it is the growth loop, when access is decided, then it is not behind premium', () => {
  /* 묶어 두면 퍼지지 않고, 퍼지지 않으면 이 기능은 할 이유가 없습니다. */
  assert.doesNotMatch(SRC, /premium|isPrem|__isPrem/i);
  for (const ui of ['gecko/gecko-ui.js', 'crested/crested-ui.js']) {
    const src = read(ui);
    const at = src.indexOf('StudioResultCard.buttonHtml()');
    const line = src.slice(src.lastIndexOf('\n', at), at);
    assert.doesNotMatch(line, /prem/i, ui + ' 에서 프리미엄으로 묶고 있습니다');
  }
});

test('Given a phone, when the button is pressed, then sharing is tried before downloading', () => {
  const at = SRC.indexOf('navigator.share');
  const down = SRC.indexOf('saveBlob(blob, filename);');
  assert.ok(at > 0 && down > at, '공유를 먼저 시도해야 합니다');
  /* 공유 창을 닫은 것은 실패가 아닙니다 — 닫았는데 파일이 떨어지면 안 됩니다. */
  assert.match(SRC, /AbortError/);
});
