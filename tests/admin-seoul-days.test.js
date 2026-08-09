const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');

/* 같은 '오늘 접속' 이 한눈에는 169, 통계는 92 로 나왔습니다. 한쪽은 UTC 로,
   다른 쪽은 브라우저 지역 시각으로 세고 있었기 때문입니다. 숫자가 탭마다
   다르면 어느 쪽도 못 믿게 됩니다. */

function helpers() {
  const start = ADMIN.indexOf('const KST = 9 * 3600e3;');
  assert.notEqual(start, -1, '서울 날짜 헬퍼가 없습니다');
  const end = ADMIN.indexOf('function bucketKey(d, unit){', start);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(ADMIN.slice(start, end), ctx);
  return ctx;
}

test('Given a visit in the Korean morning, when the day is decided, then it is today in Seoul not yesterday in UTC', () => {
  const { seoulYmd } = helpers();
  const dawn = Date.parse('2026-08-09T00:30:00+09:00');

  assert.equal(seoulYmd(dawn), '2026-08-09');
  /* 이게 버그였던 자리입니다 — UTC 로는 전날입니다. */
  assert.equal(new Date(dawn).toISOString().slice(0, 10), '2026-08-08');
});

test('Given a Seoul date, when a query needs a boundary, then it starts at 15:00 UTC the day before', () => {
  const { seoulStart } = helpers();
  assert.equal(seoulStart('2026-08-09'), '2026-08-08T15:00:00.000Z');
});

test('Given the overview tab, when it counts visits, then it filters by ts not the UTC day column', () => {
  /* day 컬럼은 UTC 라 서울 경계와 맞지 않습니다. */
  assert.doesNotMatch(ADMIN, /\.eq\('day',/, "day 컬럼으로 거르면 안 됩니다");
  assert.doesNotMatch(ADMIN, /\.gte\('day',/, "day 컬럼으로 거르면 안 됩니다");
  assert.match(ADMIN, /\.gte\('ts',todayFrom\)/);
  assert.match(ADMIN, /\.gte\('ts',weekFrom\)/);
});

test('Given either tab, when today is decided, then both use the same Seoul helper', () => {
  /* 한 화면이 toISOString, 다른 화면이 toDateString 을 쓰던 것이 원인입니다. */
  assert.doesNotMatch(ADMIN, /toDateString\(\)/);
  assert.doesNotMatch(ADMIN, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
  assert.match(ADMIN, /const today=seoulYmd\(\);/);
});

test('Given a bucket label, when it is drawn, then it reads the shifted date in UTC', () => {
  /* seoulDate() 로 밀어 둔 값을 지역 시각으로 읽으면 두 번 밀립니다. */
  const start = ADMIN.indexOf('function bucketKey(d, unit){');
  const block = ADMIN.slice(start, start + 420);
  assert.match(block, /getUTCHours\(\)/);
  assert.match(block, /getUTCMonth\(\)/);
  assert.match(block, /getUTCDate\(\)/);
  assert.doesNotMatch(block, /d\.getHours\(\)|d\.getMonth\(\)|d\.getDate\(\)/);
});

test('Given the server counts the funnel, when the client counts visits, then both mean Seoul', () => {
  /* supabase_v76 의 admin_funnel 과 기준이 어긋나면 두 숫자를 나란히 놓을 수
     없습니다. */
  const v76 = fs.readFileSync(path.join(root, 'supabase_v76.sql'), 'utf8');
  assert.match(v76, /Asia\/Seoul/);
  assert.doesNotMatch(v76, /time zone 'utc'/i, 'v76 은 서울 기준이어야 합니다');
});
