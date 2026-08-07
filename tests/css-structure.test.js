const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/* CSS 구조 검사.
   ---------------------------------------------------------------------------
   주석을 한 번 더 닫으면 그 뒤 규칙이 통째로 죽습니다. 화면은 아무 말 없이
   예전 모습으로 돌아가고, 콘솔에도 아무것도 안 뜹니다. 실제로 base.css 에서
   주석을 이어 쓰다가 닫는 기호를 하나 더 남겨, 모바일 로그인 버튼 규칙이 파서에서
   버려졌습니다. 브라우저로 열어 보고서야 알았습니다.
   (이 설명에 그 기호를 그대로 적으면 이 파일도 같은 이유로 깨집니다.)

   전체 CSS 파서를 두지는 않습니다(의존성 없이 갑니다). 대신 조용히 규칙을
   삼키는 두 가지 — 주석 짝과 중괄호 짝 — 만 봅니다. */

const ROOT = path.resolve(__dirname, '..');
const SKIP = /^(dist|output|node_modules|toss|_final|_v2|_v5|\.git|\.omo|\.playwright-cli|scratchpad)/;

function cssFiles(dir, out) {
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.test(entry.name) || entry.name.indexOf('dist-') === 0) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) cssFiles(full, out);
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/* 따옴표 안의 주석 기호나 중괄호는 세지 않습니다. url("a{b}") 같은 값이
   있으면 짝이 안 맞는 것으로 잘못 잡힙니다. */
function scan(source) {
  let depth = 0, inComment = false, quote = null;
  const strayClose = [];
  let line = 1;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (ch === '\n') line++;
    if (inComment) {
      if (ch === '*' && next === '/') { inComment = false; i++; }
      continue;
    }
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '/' && next === '*') { inComment = true; i++; continue; }
    if (ch === '*' && next === '/') { strayClose.push(line); i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) return { depth: depth, strayClose: strayClose, line: line }; }
  }
  return { depth: depth, strayClose: strayClose, inComment: inComment, quote: quote };
}

const files = cssFiles(ROOT);

test('Given the project ships CSS, when it is scanned, then some files are actually found', () => {
  /* 경로 규칙이 틀리면 0개를 훑고 조용히 통과합니다. */
  assert.ok(files.length > 5, '검사한 CSS 가 ' + files.length + '개뿐입니다');
});

test('Given a comment is closed twice, when the parser reads on, then the rules after it are dropped', () => {
  const broken = [];
  for (const file of files) {
    const result = scan(fs.readFileSync(file, 'utf8'));
    if (result.strayClose.length) {
      broken.push(path.relative(ROOT, file).split(path.sep).join('/')
        + ' → ' + result.strayClose.length + '곳 (' + result.strayClose.slice(0, 3).join(', ') + '행)');
    }
  }
  assert.deepEqual(broken, [],
    '주석 밖에 */ 가 있습니다. 그 뒤 규칙이 조용히 버려집니다:\n  ' + broken.join('\n  '));
});

test('Given a comment is left open, when the file ends, then everything after it is swallowed', () => {
  const open = [];
  for (const file of files) {
    const result = scan(fs.readFileSync(file, 'utf8'));
    if (result.inComment) open.push(path.relative(ROOT, file).split(path.sep).join('/'));
  }
  assert.deepEqual(open, [], '닫히지 않은 주석이 있습니다:\n  ' + open.join('\n  '));
});

test('Given braces are unbalanced, when a block leaks, then unrelated rules change', () => {
  const bad = [];
  for (const file of files) {
    const result = scan(fs.readFileSync(file, 'utf8'));
    if (result.depth !== 0) {
      bad.push(path.relative(ROOT, file).split(path.sep).join('/') + ' → 남은 깊이 ' + result.depth);
    }
  }
  assert.deepEqual(bad, [], '중괄호 짝이 맞지 않습니다:\n  ' + bad.join('\n  '));
});

test('Given a phone loads a calculator, when the header is drawn, then the login button is readable', () => {
  /* 계정 버튼이 이름 없는 44px 정사각 아이콘이면, 똑같이 생긴 아이콘 셋 중
     하나가 되어 하나씩 눌러 봐야 합니다. 글자가 보여야 합니다. */
  const base = fs.readFileSync(path.join(ROOT, 'assets/base.css'), 'utf8');
  assert.match(base, /\.hd-btns \[data-account-btn\] span\{display:inline\}/);
  /* 44px 은 터치 표적 최소 크기입니다. */
  assert.match(base, /min-height:44px/);
  /* 절대배치는 쓰지 않습니다. 한 번 그렇게 했다가 430px 에서 제목이 47px 폭에
     여섯 줄로 짓눌리고 언어 버튼과 겹쳤습니다 — 헤더가 줄바꿈되는 폭과 안 되는
     폭이 갈리는데, 절대배치는 그중 한쪽에서만 맞습니다. */
  assert.doesNotMatch(base, /position:absolute;top:16px;right:16px/);
  assert.doesNotMatch(base, /header \.hd-txt\{padding-right/);

  const home = fs.readFileSync(path.join(ROOT, 'home-redesign.css'), 'utf8');
  assert.match(home, /\.nav-inner \.nav-account\{display:inline-flex/);
  /* 헤더에 띄웠으면 햄버거 안의 같은 버튼은 감춰야 중복이 아닙니다. */
  assert.match(home, /\.mobile-menu \[data-account-btn\]\{display:none\}/);
  assert.doesNotMatch(home, /\.nav-links,\.nav-cta,\.nav-account\{display:none\}/);
});
