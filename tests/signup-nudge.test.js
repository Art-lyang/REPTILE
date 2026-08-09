const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'assets', 'signup-cta.js'), 'utf8');

/* 들어오자마자 띄우면 계산기를 보러 온 사람에게 우리 얘기를 먼저 들이미는
   꼴이고, 그때는 케어로그가 왜 필요한지 알 수 없습니다. 결과를 본 직후라야
   '이 조합을 개체로 남겨 둘까' 가 그 사람의 물음이 됩니다. */

test('Given someone opens the calculator, when nothing is calculated yet, then nothing is shown', () => {
  const run = SRC.slice(SRC.indexOf('function run(signedIn)'), SRC.indexOf('function boot()'));
  /* 화면이 뜨자마자 도는 타이머로 안내를 띄우면 안 됩니다. */
  assert.doesNotMatch(run, /showNudge\(\)/, 'run() 이 바로 띄우면 안 됩니다');
  assert.match(run, /armAfterResult\(\);/);
});

test('Given a result appears, when the table is drawn, then the nudge follows it', () => {
  assert.match(SRC, /function armAfterResult\(\)/);
  assert.match(SRC, /getElementById\('results'\)/);
  /* 결과 표가 실제로 생겼을 때만입니다 — 빈 상태에도 뜨면 안 됩니다. */
  assert.match(SRC, /if \(!host\.querySelector\('\.rtable'\)\) return;/);
  /* 결과를 먼저 보게 두고 띄웁니다. */
  assert.match(SRC, /setTimeout\(function \(\) \{ if \(!seenToday\(\)\) showNudge\(\); \}, 1400\)/);
});

test('Given it fired once, when more calculations happen, then it does not come back that day', () => {
  assert.match(SRC, /seen\.disconnect\(\);/);
  assert.match(SRC, /if \(seenToday\(\)\) \{ seen\.disconnect\(\); return; \}/);
  assert.match(SRC, /localStorage\.setItem\(SEEN_KEY, today\(\)\)/);
});

test('Given the moment changed, when the copy is read, then it speaks to what just happened', () => {
  /* '계산기는 무료입니다' 는 결과를 막 본 사람에게 이미 아는 얘기입니다. */
  assert.match(SRC, /이 조합, 개체로 남겨 둘까요\?/);
  for (const t of ['Keep this pairing?', 'この組み合わせ、個体として残しますか', '要把这个组合保存为个体吗？']) {
    assert.ok(SRC.indexOf(t) >= 0, '문구 없음: ' + t);
  }
});

test('Given a signed-in member, when they calculate, then they are not asked to sign up', () => {
  const run = SRC.slice(SRC.indexOf('function run(signedIn)'), SRC.indexOf('function boot()'));
  assert.match(run, /if \(signedIn \|\| !open\(\) \|\| !nudgeOn \|\| seenToday\(\)\) return;/);
});
