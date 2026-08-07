const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

function loadAlerts() {
  const context = { window: {}, Object, Array, Math, Number, String, Date, JSON };
  vm.createContext(context);
  vm.runInContext(read('care/care-alerts.js'), context);
  return context.window.CareAlerts;
}

/* 알림 엔진이 쓰는 최소한의 core 흉내.
   overdueAlerts 는 core.planStatus 로 밀린 일수를 받습니다. 여기서는 어느
   계획이든 이틀 밀린 것으로 두어, 걸러지는지 아닌지만 보게 합니다. */
const core = {
  addDays(day, n) {
    const d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  },
  today() { return '2026-08-07'; },
  planStatus() { return { done: false, overdue: 2 }; },
};

const TODAY = '2026-08-07';

function overdueInput(extra) {
  return Object.assign({
    today: TODAY, core,
    animals: [{ id: 'keep', name: '활성이' }, { id: 'locked', name: '잠긴이' }],
    plans: [
      { id: 'p1', animal_id: 'keep', kind: 'feed', title: 'CGD', is_active: true, every_days: 2 },
      { id: 'p2', animal_id: 'locked', kind: 'feed', title: 'CGD', is_active: true, every_days: 2 },
    ],
    records: [], weights: [],
  }, extra || {});
}

test('Given no active list, when alerts are built, then nothing is filtered out', () => {
  const alerts = loadAlerts();
  const rows = alerts.build(overdueInput());
  const ids = rows.map(r => r.animalId);

  /* 프리미엄이거나 한도가 없던 시절입니다. 거르면 안 됩니다. */
  assert.ok(ids.includes('keep'), '활성 개체 알림이 있어야 합니다');
  assert.ok(ids.includes('locked'), '거를 목록이 없으면 모두 남아야 합니다');
});

test('Given an animal locked beyond the free limit, when alerts are built, then its reminders stop', () => {
  const alerts = loadAlerts();
  const rows = alerts.build(overdueInput({ activeAnimalIds: ['keep'] }));
  const ids = rows.map(r => r.animalId);

  /* 수정도 완료 표시도 못 하는 개체에 알림이 계속 뜨면 잔소리가 됩니다. */
  assert.ok(ids.includes('keep'), '활성 개체 알림은 남아야 합니다');
  assert.ok(!ids.includes('locked'), '잠긴 개체 알림은 멈춰야 합니다');
});

test('Given the free limit is enforced, when the guard is written, then it lives in the database not the screen', () => {
  const sql = read('supabase_v54.sql');

  /* 화면 조건문만으로 막으면 개발자도구를 연 사람은 그냥 넘어갑니다. */
  assert.match(sql, /assert_care_animal_writable/);
  assert.match(sql, /CARE_FREE_LIMIT_REACHED/);
  assert.match(sql, /CARE_ANIMAL_INACTIVE/);
  /* 개체를 만드는 경로는 save_row 하나로 모입니다
     (save_animal_with_initial_weight 가 내부에서 이것을 부릅니다). */
  assert.match(sql, /create or replace function public\.save_row/);
  /* 계획은 표를 직접 고치므로 트리거로 막습니다. */
  assert.match(sql, /create trigger care_plan_slot_guard/);
});

test('Given a downgraded keeper, when slots are decided, then pinned animals win and the rest fall back to registration order', () => {
  const sql = read('supabase_v54.sql');

  /* 고정한 것을 먼저, 남은 자리는 등록순. 오래 키운 사람의 처음 10마리는
     이미 분양했거나 무지개다리를 건넌 경우가 많아 바꿀 수 있어야 합니다. */
  assert.match(sql, /order by a\.free_pinned desc, a\.created_at asc/);
  assert.match(sql, /create or replace function public\.set_animal_free_slot/);
  /* 초과분도 지울 수는 있어야 합니다 — 삭제까지 막으면 정리할 방법이 없습니다. */
  assert.doesNotMatch(sql, /before delete on public\.animals/i);
});

test('Given the free tier copy, when a language is missing a key, then the shared dictionaries disagree', () => {
  const keys = ['freeQuotaTitle', 'freeQuotaHint', 'freeQuotaOver',
    'freeSlotLocked', 'freeSlotLockedWhy', 'freeSlotActivate', 'freeSlotActivated'];
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    const source = read('care/care-i18n-' + lang + '.js');
    keys.forEach(function (key) {
      assert.match(source, new RegExp(key + '\\s*:'), lang + ' 에 ' + key + ' 가 없습니다');
    });
  });
});

test('Given the quota is unknown, when the screen decides what to lock, then it errs toward letting people work', () => {
  const app = read('care/care-app.js');
  const ui = read('care/care-ui.js');

  /* 조회에 실패했을 때 잠그는 쪽으로 틀리면 멀쩡한 사람이 자기 기록을 못 고칩니다. */
  assert.match(app, /QUOTA = \{ premium: true[^}]*known: false \}/);
  assert.match(ui, /if \(q\.premium \|\| !q\.active\) return true;/);
});
