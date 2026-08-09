const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* 이름이 언어마다 갈래져 있었습니다 — 일본어는 クリーチャーケアログ 와
   クリーチャー・ケアログ 둘, 중국어는 生物护理日志 와 生物照护日志 둘.
   서비스 이름은 한 언어에 하나여야 합니다. 검색·공유·입소문이 전부
   이름 하나에 걸립니다. */

const NAMES = {
  ko: '생물 케어 스케줄 관리',
  en: 'Creature Care Scheduler',
  ja: '生き物ケア スケジュール管理',
  zh: '生物护理日程管理'
};

/* 예전 이름들. 하나라도 남아 있으면 화면 어딘가에 옛 이름이 보입니다. */
const OLD = [
  '크리처 케어로그', '스케쥴',
  'Creature Care Log',
  'クリーチャーケアログ', 'クリーチャー・ケアログ',
  '生物护理日志', '生物照护日志'
];

function shipped() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/^(dist|output|node_modules|_final|_v2|_v5|\.git|\.omo|\.playwright-cli|toss)$/.test(e.name)) continue;
      if (e.name.indexOf('dist-') === 0) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|html|webmanifest)$/.test(e.name)) out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }(root));
  /* 마이그레이션은 기록이라 손대지 않습니다. 테스트 자신도 옛 이름을
     문자열로 들고 있으므로 뺍니다. */
  return out.filter(f => !/^tests\//.test(f));
}

test('Given the service was renamed, when any shipped file is read, then no old name survives', () => {
  const stale = [];
  for (const f of shipped()) {
    const src = read(f);
    for (const old of OLD) {
      if (src.indexOf(old) >= 0) stale.push(f + ' :: ' + old);
    }
  }
  assert.deepEqual(stale, [], '옛 이름이 남아 있습니다');
});

test('Given four languages, when the care screen names itself, then each uses its one name', () => {
  for (const [lang, name] of Object.entries(NAMES)) {
    const dict = read('care/care-i18n-' + lang + '.js');
    assert.ok(dict.indexOf(name) >= 0, lang + ' 사전에 서비스 이름이 없습니다: ' + name);
  }
});

test('Given the signup nudge lists what an account adds, then it names the service in that language', () => {
  const src = read('assets/signup-cta.js');
  for (const name of Object.values(NAMES)) {
    assert.ok(src.indexOf(name) >= 0, '가입 안내에 없습니다: ' + name);
  }
});
