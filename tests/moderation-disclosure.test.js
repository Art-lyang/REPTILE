const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const TERMS = read('terms.html');

/* 관리자가 남의 사진과 사육 기록을 열어 볼 수 있게 만들어 두고 약관에 적지
   않으면, 그건 몰래 보는 것입니다. 기능이 먼저 나가고 고지가 뒤따라간 일이
   이미 두 번 있었습니다 — 브리더 프로필 이미지, 닉네임 변경 이력. */

test('Given admins can open a member\u0027s animal, when the terms are read, then they say so', () => {
  assert.match(TERMS, /제9조의3/, '검수 조항이 없습니다');
  ['열람', '비공개 개체', '열람은 기록으로 남습니다'].forEach(function (phrase) {
    assert.ok(TERMS.includes(phrase), '약관에 없습니다: ' + phrase);
  });
  /* 처리방침에도 있어야 합니다. 약관에만 적고 방침에 빠뜨리면 '고지하지 않은
     목적으로 처리' 가 됩니다. */
  assert.match(TERMS, /8-1\. 관리자의 열람 및 조치/);
  assert.ok(TERMS.includes('관리자 검수 기록'), '수집 항목 표에 검수 기록이 없습니다');
});

test('Given the terms promise a window, when the code computes it, then the two agree', () => {
  /* 약관에 7일이라 적어 놓고 코드가 30일을 세면 약관이 거짓말이 됩니다. */
  const v68 = read('supabase_v68.sql');
  const days = [...v68.matchAll(/current_date \+ (\d+)/g)].map(m => m[1]);
  assert.ok(days.length, '보류 기간을 계산하는 곳을 찾지 못했습니다');
  days.forEach(function (d) {
    assert.equal(d, '7', 'v68 이 ' + d + '일을 세는데 약관은 7일이라 적혀 있습니다');
  });
  assert.ok(TERMS.includes('<b>통지를 받은 날부터 7일 이내</b>'), '보류 기간 문장이 없습니다');
});

test('Given a photo was only inspected, when training picks images, then inspection alone excludes nothing', () => {
  /* '검수한 것은 제외' 를 곧이곧대로 적으면, 신고가 들어왔다가 문제없음으로
     끝난 사진까지 영구히 빠집니다. 제외 기준은 '문제가 확인된 것' 입니다. */
  assert.ok(TERMS.includes('보류되거나 삭제된 이미지는 학습에 이용하지 않습니다'));
  assert.ok(TERMS.includes('우리가 본 이미지'));
});
