const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/uitext.js'), 'utf8');

/* uitext.js 는 브라우저 전역 스크립트라 window 를 흉내 낸 상자에서 돌립니다.
   모듈 안에 "이미 알렸는지" 상태가 있어서, 시험마다 새로 적재해야 합니다. */
function loadModule() {
  const context = { window: {}, Promise, setTimeout, clearTimeout, Object, JSON };
  context.window.setTimeout = setTimeout;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.StudioText;
}

/* Supabase 클라이언트 흉내.
   load() 는 ui_texts 는 .eq() 까지, update_notes 는 .order() 까지 호출한 뒤
   그 결과를 기다립니다. */
function fakeClient(uiTexts, updateNotes) {
  return {
    from(table) {
      const rows = table === 'ui_texts' ? uiTexts : updateNotes;
      const result = Promise.resolve({ error: null, data: rows });
      return {
        select() {
          return {
            eq() {
              return Object.assign(Object.create(result), {
                then: result.then.bind(result),
                catch: result.catch.bind(result),
                order: () => result,
              });
            },
          };
        },
      };
    },
  };
}

function freshI18N() {
  return {
    ko: { updTitle: '기본 제목', updDoneList: ['기본 항목'] },
    en: { updTitle: 'Default title', updDoneList: ['Default item'] },
    ja: {}, zh: {},
  };
}

test('Given server copy arrives, when the update note is set to auto-open, then it waits until the new copy is applied', async () => {
  const StudioText = loadModule();
  const I18N = freshI18N();
  const order = [];

  const loading = StudioText.load(
    fakeClient([{ key: 'updTitle', ko: '서버 제목', en: null, ja: null, zh: null }], []),
    'gecko',
    I18N,
  );
  /* 화면이 하는 일: 문구가 확정되면 연다. */
  StudioText.whenReady(1000).then(() => order.push('open'));
  /* 앱이 하는 일: 문구를 받으면 다시 그린다. */
  loading.then(() => order.push('applyLang'));

  await new Promise(resolve => setTimeout(resolve, 60));

  /* 순서가 뒤집히면 기본 문구로 창이 먼저 열리고, 읽는 도중에 내용이 바뀝니다.
     이 시험이 지키려는 것이 정확히 그 순서입니다. */
  assert.deepEqual(order, ['applyLang', 'open']);
  assert.equal(I18N.ko.updTitle, '서버 제목');
});

test('Given the backend is unavailable, when the update note waits for copy, then it opens with the built-in copy after the timeout', async () => {
  const StudioText = loadModule();
  const started = Date.now();

  /* load() 를 아예 부르지 않는 경우 — 백엔드 미설정이면 앱이 건너뜁니다.
     그래도 안내창은 떠야 하므로 시간제한이 받아 줍니다. */
  const changed = await StudioText.whenReady(120);

  assert.equal(changed, false);
  assert.ok(Date.now() - started >= 100, '시간제한을 기다린 뒤에 진행해야 합니다');
});

test('Given no client, when copy loading is skipped, then waiting resolves immediately instead of stalling the popup', async () => {
  const StudioText = loadModule();
  await StudioText.load(null, 'gecko', freshI18N());

  const started = Date.now();
  await StudioText.whenReady(5000);

  /* sb 가 없으면 곧바로 알려야 합니다. 5초짜리 시간제한을 다 기다리면
     백엔드 없는 화면에서 안내창이 한참 뒤에 뜹니다. */
  assert.ok(Date.now() - started < 100, '즉시 진행해야 합니다');
});

test('Given update notes for one language only, when copy is applied, then other languages keep their built-in list', async () => {
  const StudioText = loadModule();
  const I18N = freshI18N();

  await StudioText.load(
    fakeClient([], [{ kind: 'done', ord: 1, active: true, ko: '서버 항목', en: null, ja: null, zh: null }]),
    'gecko',
    I18N,
  );

  assert.deepEqual(I18N.ko.updDoneList, ['서버 항목']);
  assert.deepEqual(I18N.en.updDoneList, ['Default item']);
});
