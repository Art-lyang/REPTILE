const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* 부모로 쓰이는 개체의 종·성별·성장 단계를 잠급니다
   ---------------------------------------------------------------------------
   부모 자격 검사가 자식 쪽에서만 일어났습니다. 어미를 연결해 둔 뒤에 그 어미를
   열어서 종을 '기타' 로 바꾸면 아무도 막지 않아, 레오파드 새끼의 어미가 기타로
   앉아 있는 상태가 실제로 나왔습니다.

   성별과 성장 단계도 같은 문제입니다 — 어미를 수컷이나 베이비로 바꿔도
   그대로 저장되었습니다. 셋 다 부모 자격을 이루는 값이라 함께 잠급니다. */

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

function core() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(read('care/care-core.js'), ctx);
  return ctx.window.CareCore;
}

test('Given an animal is linked as a parent, when its children are looked up, then both sides count', () => {
  const C = core();
  const list = [
    { id: 'mom', name: '도도' },
    { id: 'kid', name: 'ㅇㄹㄹㄴ', parent_b: 'mom' },
    { id: 'kid2', name: '둘째', parent_a: 'mom' },
    { id: 'other', name: '무관' }
  ];
  assert.deepEqual(C.childrenOf(list, 'mom').map(a => a.name), ['ㅇㄹㄹㄴ', '둘째']);
  assert.equal(C.childrenOf(list, 'other').length, 0);
  /* 새 개체는 id 가 없습니다. 여기서 걸러 두지 않으면 parent_a 가 없는 개체까지
     전부 자식으로 잡혀 폼이 통째로 잠깁니다. */
  assert.equal(C.childrenOf(list, null).length, 0);
  assert.equal(C.childrenOf(null, 'mom').length, 0);
});

test('Given an animal has children, when the edit form renders, then species sex and stage are locked', () => {
  const form = read('care/care-animal-form.js');
  assert.match(form, /function parentLock\(animal, kids\)/);
  assert.match(form, /if \(!animal\.id \|\| !kids \|\| !kids\.length\) return null;/);
  /* 세 칸 모두에 걸려야 합니다 — 종만 막으면 어미를 수컷으로 바꿀 수 있습니다. */
  ['f_species', 'f_sex', 'f_stage'].forEach(function (id) {
    assert.match(form, new RegExp('id="' + id + '"\'? \\+ lockAttr'), id);
  });
  /* 이름·메모는 잠그지 않습니다. 부모 자격과 무관하고, 이름을 못 고치면
     잠금이 벌처럼 읽힙니다. */
  assert.doesNotMatch(form, /id="f_name"[^>]*lockAttr/);
});

test('Given a lock is shown, when the keeper reads it, then it says which child caused it', () => {
  const form = read('care/care-animal-form.js');
  assert.match(form, /parentLockedHint', \{ names: lock\.names \}/);
  assert.match(form, /kids\.map\(k => k\.name \|\| I\.t\('unnamed'\)\)\.join\(', '\)/);
});

test('Given the list screen opens the form, when it does, then it passes the children through', () => {
  const ui = read('care/care-ui.js');
  assert.match(ui, /AnimalForm\.html\(a, C\.childrenOf\(S\.animals, a\.id\)\)/);
});

test('Given four languages, when the lock hint renders, then each language has its own words', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  ['ko', 'en', 'zh', 'ja'].forEach(function (lang) {
    vm.runInContext(read('care/care-i18n-' + lang + '.js'), ctx);
  });
  const L = ctx.window.CareI18nLocales;
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    assert.match(L[lang].parentLockedHint, /\{names\}/, lang);
  });
  ['en', 'ja', 'zh'].forEach(function (lang) {
    assert.notEqual(L[lang].parentLockedHint, L.ko.parentLockedHint, lang);
  });
});

test('Given the screen can be bypassed, when the server saves, then it refuses the same change', () => {
  /* 화면만 막으면 화면을 거치지 않는 경로가 그대로 남습니다. */
  const sql = read('supabase_v63.sql');
  assert.match(sql, /create trigger care_animal_child_guard\s+before update of species, sex, life_stage on public\.animals/);
  assert.match(sql, /CARE_PARENT_IN_USE_SIRE/);
  assert.match(sql, /CARE_PARENT_IN_USE_DAM/);
  /* 세 값이 그대로면 통과시켜야 합니다 — 이름만 고치는 저장이 훨씬 잦습니다. */
  assert.match(sql, /new\.species\s+is not distinct from old\.species/);
  /* 레오파드는 관리 코드 gecko 와 개체 코드 leopard 를 같은 종으로 봅니다(v37). */
  assert.match(sql, /case when new\.species = 'leopard' then 'gecko'/);
});
