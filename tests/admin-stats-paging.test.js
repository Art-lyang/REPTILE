const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/* 관리자 통계가 조용히 잘리던 문제
   ---------------------------------------------------------------------------
   30일 통계가 정확히 1000 에서 멈추고, 같은 화면의 '오늘 접속' 은 0 인데 7일
   통계에서는 67 이었습니다. 두 화면이 서로 다른 사실을 말하고 있었습니다.

   원인은 .limit(50000) 입니다. PostgREST 는 서버 쪽 상한(기본 1000)에서
   자르고, 클라이언트가 더 큰 수를 적어도 그 위로는 오지 않습니다. 게다가
   order 가 없어 '어느 1000건' 인지도 정해지지 않았고, 실제로 돌아온 것이
   옛날 것들이라 최근 날짜가 통째로 0 으로 보였습니다.

   7일은 619건뿐이라 상한에 안 닿았습니다. 그래서 기간을 바꿀 때만 드러났고,
   틀린 숫자가 오래 그럴듯하게 보였습니다. */

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'admin', 'index.html'), 'utf8');

test('Given a large row count, when the admin page fetches, then it pages instead of capping', () => {
  assert.match(html, /async function fetchAll\(build, orderCol\)/);
  /* 페이지 크기는 서버 상한과 같아야 합니다. 더 크게 잡으면 매 페이지가
     잘리면서 같은 문제가 다시 납니다. */
  assert.match(html, /const PAGE=1000/);
  assert.match(html, /\.range\(from,from\+PAGE-1\)/);
  assert.match(html, /if\(got\.length<PAGE\) break;/);
});

test('Given pages are fetched, when they are stitched, then an order column is required', () => {
  /* order 가 없으면 페이지 경계에서 같은 줄이 두 번 오거나 아예 빠집니다. */
  assert.match(html, /if\(orderCol\) q=q\.order\(orderCol,\{ascending:true\}\)/);
  /* 호출은 한 줄에 하나씩입니다. 정규식으로 괄호를 세려 하면 중첩 때문에
     중간에서 잘립니다 — 줄 단위로 봅니다. */
  const calls = html.split(/\r?\n/).filter(l => l.includes('fetchAll(()=>'));
  assert.ok(calls.length >= 7, 'fetchAll 호출이 ' + calls.length + '개뿐입니다');
  calls.forEach(function (line) {
    assert.match(line, /,\s*'[a-z_]+'\)/,
      '정렬 칼럼 없는 호출: ' + line.trim().slice(0, 90));
  });
});

test('Given the old pattern caused this, when the file is read, then no large limit remains', () => {
  /* 주석 안의 설명은 제외하고, 실제 호출만 봅니다. */
  const code = html.split(/\r?\n/).filter(l => !/^\s*(\/\*|\*|--|\/\/)/.test(l)).join('\n');
  const big = code.match(/\.limit\(\d{4,}\)/g) || [];
  assert.deepEqual(big, [], '아직 큰 limit 이 남아 있습니다: ' + big.join(', '));
});

test('Given the runaway case, when a query never ends, then there is a stop', () => {
  /* 상한이 없으면 데이터가 많아졌을 때 브라우저가 멈춥니다. 여기 닿으면
     집계 함수로 옮겨야 한다는 신호입니다. */
  assert.match(html, /if\(out\.length>=200000\) break;/);
});

test('Given the helper replaces a supabase call, when a caller reads it, then the shape matches', () => {
  /* 부르는 쪽이 전부 r.data / r.error 를 읽습니다. 배열을 그냥 돌려주면
     r.data 가 undefined 가 되어 화면이 조용히 비어 보입니다 — 실제로 유입과
     한눈에 탭이 그렇게 비었습니다. 에러가 안 나서 더 늦게 드러납니다. */
  assert.match(html, /return \{ data: out, error: null \};/);
  /* 배열로 받던 자리도 .data 로 맞춰야 합니다. */
  const bare = html.split(/\r?\n/).filter(function (l) {
    return /=\s*await fetchAll\(/.test(l) && !/\)\)\.data/.test(l);
  });
  assert.deepEqual(bare, [], '배열로 받는 자리가 남아 있습니다: ' + bare.join(' | '));
});