const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const TERMS = read('terms.html');

/* 공개되는데 방침에 없는 항목을 잡습니다.
   ---------------------------------------------------------------------------
   기능이 먼저 나가고 고지가 뒤따라가는 일이 두 번 있었습니다 — 브리더 프로필
   이미지와 닉네임 변경 이력. 둘 다 공개 주소를 아는 누구나 볼 수 있게 만들어
   두고도 방침에는 없었습니다.

   여기서는 'anon 에게 열린 함수가 무엇을 내보내는가' 와 '방침에 그 항목이
   적혀 있는가' 를 짝지어 봅니다. 기계가 문장을 읽을 수는 없으니, 새 공개
   함수를 만들면 이 목록에도 한 줄 더하는 것이 규칙입니다. */

const PUBLIC_FUNCTIONS = [
  { fn: 'public_nickname_history', policy: '닉네임 변경 이력' },
  { fn: 'public_breeder_badge', policy: '브리더 프로필 이미지' },
  { fn: 'public_breeder_badge', policy: '상호명' },
];

/* grant 가 함수를 정의한 파일에 있으리라는 보장이 없습니다 — v62 는
   public_breeder_badge 를 다시 쓰지만 grant 는 v60 에 그대로 있습니다.
   마이그레이션 전체에서 찾습니다. */
const ALL_SQL = fs.readdirSync(path.resolve(__dirname, '..'))
  .filter(name => /^supabase_v\d+\.sql$/.test(name))
  .map(name => read(name)).join('\n');

test('Given a function is open to anonymous callers, when it returns data, then the policy names it', () => {
  const missing = [];
  const unchecked = [];
  PUBLIC_FUNCTIONS.forEach(function (item) {
    /* 정말 익명에게 열려 있는지부터 봅니다. 닫혀 있으면 고지 대상이 아닙니다. */
    const granted = new RegExp('grant execute on function public\.' + item.fn + '\([^)]*\)[^;]*to[^;]*anon');
    if (!granted.test(ALL_SQL)) { unchecked.push(item.fn); return; }
    if (!TERMS.includes(item.policy)) missing.push(item.fn + ' -> 방침에 「' + item.policy + '」 없음');
  });
  /* 하나도 확인 못 했으면 검사가 통과한 게 아니라 헛돈 것입니다. */
  assert.deepEqual(unchecked, [], '익명 공개 여부를 확인하지 못한 함수: ' + unchecked.join(', '));
  assert.deepEqual(missing, [], '공개되는데 방침에 없습니다:\n  ' + missing.join('\n  '));
});

test('Given the security log keeps an IP, when the policy is read, then the shorter retention is stated', () => {
  /* 접속 통계는 IP 를 안 남기지만 보안 기록은 남깁니다. 목적도 보관 기간도
     달라서 한 줄로 묶으면 둘 중 하나가 틀린 설명이 됩니다. */
  assert.match(TERMS, /보안 기록[\s\S]{0,200}접속 IP/);
  assert.match(TERMS, /90일/);
});

test('Given business verification collects a registration number, when it is described, then the limits are stated', () => {
  assert.match(TERMS, /사업자등록번호/);
  /* 공개되지 않는다는 것과, 증빙 서류를 안 받는다는 것 둘 다 적어야 합니다 —
     안 받는 것도 알려야 할 사실입니다. */
  assert.match(TERMS, /사업자등록번호는 공개되지 않고/);
  assert.match(TERMS, /증빙 서류는 받지 않습니다/);
});

test('Given the policy changed, when it is published, then the log says what and why', () => {
  /* 무엇이 바뀌었는지 안 적으면 나중에 우리도 왜 바꿨는지 모릅니다. */
  assert.match(TERMS, /2026-08-09 개정/);
  assert.match(TERMS, /시행일[\s\S]{0,80}2026년 8월 9일|2026년 8월 9일/);
});

test('Given the nickname history is public, when it is described, then auto-assigned names are excluded', () => {
  /* 자동으로 지어 준 이름까지 공개된다고 적으면 사실과 다릅니다 —
     public_nickname_history 는 kind in ('user','admin') 만 내보냅니다. */
  const sql = read('supabase_v59.sql');
  const fn = sql.slice(sql.indexOf('function public.public_nickname_history'));
  assert.match(fn.slice(0, fn.indexOf('$$;')), /c\.kind in \('user', 'admin'\)/);
  assert.match(TERMS, /자동으로 지어 준 이름은 이력에 남지만 공개되지 않습니다/);
});
