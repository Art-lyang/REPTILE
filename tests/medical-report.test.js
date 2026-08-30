const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* 진료 참고 기록은 병원에서 남에게 건네지는 종이입니다. 숫자가 틀리면
   기억으로 답하는 것보다 나쁩니다 — 틀린 숫자는 의심조차 안 받습니다. */
function load() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('care/care-core.js'), ctx, { filename: 'care-core.js' });
  vm.runInContext(read('care/medical-report.js'), ctx, { filename: 'medical-report.js' });
  return { C: ctx.window.CareCore, M: ctx.window.MedicalReport };
}

const ANIMAL = { id: 'a1', name: '도도', species: 'leopard', sex: 'female', hatch_date: '2024-05-01' };

function ctxOf(records, weights, today) {
  const { C } = load();
  return {
    core: C, animal: ANIMAL, today: today || '2026-08-09',
    records: records || [], weights: weights || [], plans: []
  };
}

test('Given a last meal, when the report is built, then it counts the days since in dates not memory', () => {
  const { M } = load();
  const data = M.build(ctxOf([
    { animal_id: 'a1', kind: 'feed', done_date: '2026-07-21', feed_name: '밀웜' },
    { animal_id: 'a1', kind: 'feed', done_date: '2026-07-10', feed_name: '밀웜' },
    { animal_id: 'a1', kind: 'refusal', done_date: '2026-07-25' },
    { animal_id: 'a1', kind: 'refusal', done_date: '2026-08-01' }
  ]));

  assert.equal(data.feeding.last.date, '2026-07-21');
  assert.equal(data.feeding.daysSince, 19);
  /* 마지막 식사 뒤의 거식만 셉니다. 그 전 것은 이미 끝난 일입니다. */
  assert.equal(data.feeding.refusalsSinceLastMeal, 2);
});

test('Given no feeding record at all, when the report is built, then it says so instead of guessing', () => {
  const { M } = load();
  const data = M.build(ctxOf([{ animal_id: 'a1', kind: 'poop', done_date: '2026-08-01' }]));
  assert.equal(data.feeding.last, null);
  assert.equal(data.feeding.daysSince, null);
});

test('Given a weight history, when the report is built, then it shows the drop from the peak', () => {
  const { M } = load();
  const data = M.build(ctxOf([], [
    { animal_id: 'a1', measured_on: '2026-05-01', grams: 60 },
    { animal_id: 'a1', measured_on: '2026-06-01', grams: 72 },
    { animal_id: 'a1', measured_on: '2026-08-01', grams: 54 }
  ]));

  assert.equal(data.weight.peak.grams, 72);
  assert.equal(data.weight.latest.grams, 54);
  assert.equal(data.weight.dropGrams, 18);
  assert.equal(data.weight.dropPercent, 25);
});

test('Given the newest weight is also the highest, when the report is built, then it does not claim a drop', () => {
  /* '0g 감소' 라고 적으면 빠졌다가 돌아온 것처럼 읽힙니다. */
  const { M } = load();
  const data = M.build(ctxOf([], [
    { animal_id: 'a1', measured_on: '2026-05-01', grams: 50 },
    { animal_id: 'a1', measured_on: '2026-08-01', grams: 66 }
  ]));
  assert.equal(data.weight.dropGrams, null);
  assert.equal(data.weight.dropPercent, null);
});

test('Given repeated signs, when the report is built, then it reports when they started and puts vet ones first', () => {
  const { M, C } = load();
  const data = M.build(ctxOf([
    { animal_id: 'a1', kind: 'symptom', done_date: '2026-08-02', detail: 'kinked_tail' },
    { animal_id: 'a1', kind: 'symptom', done_date: '2026-07-28', detail: 'resp', note: '쌕쌕거림' },
    { animal_id: 'a1', kind: 'symptom', done_date: '2026-08-05', detail: 'resp' }
  ]));

  assert.equal(data.signs.length, 2);
  /* 상담 권고 항목이 먼저 — 진료실에서 먼저 봐야 할 줄입니다. */
  assert.equal(data.signs[0].sign, 'resp');
  assert.equal(data.signs[0].vet, true);
  assert.equal(C.SIGNS.resp.vet, true, 'SIGNS 의 vet 표시를 그대로 따라야 합니다');
  /* 여러 번 기록됐으면 가장 오래된 것이 시작일입니다. */
  assert.equal(data.signs[0].first, '2026-07-28');
  assert.equal(data.signs[0].last, '2026-08-05');
  assert.equal(data.signs[0].count, 2);
  assert.equal(data.signs[1].vet, false);
});

test('Given records that belong to another animal, when the report is built, then they never leak in', () => {
  const { M } = load();
  const data = M.build(ctxOf([
    { animal_id: 'a2', kind: 'feed', done_date: '2026-08-08', feed_name: '남의 것' },
    { animal_id: 'a1', kind: 'feed', done_date: '2026-08-01', feed_name: '내 것' }
  ], [
    { animal_id: 'a2', measured_on: '2026-08-08', grams: 999 }
  ]));

  assert.equal(data.feeding.last.name, '내 것');
  assert.equal(data.weight, null);
});

test('Given the report is a handout, when it renders, then it says it is not a diagnosis', () => {
  /* 병원에서 남에게 건네지는 종이입니다. 우리 판단이 실린 것처럼 보이면
     안 됩니다 — 문구가 사라지지 않게 묶어 둡니다. */
  const ui = read('care/medical-report-ui.js');
  assert.match(ui, /mr-disc/);
  assert.match(ui, /mrDisclaimer/);

  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    const dict = read('care/care-i18n-' + lang + '.js');
    assert.match(dict, /mrDisclaimer:/, lang + ' 에 안내 문구가 없습니다');
    assert.match(dict, /mrTitle:/, lang + ' 에 제목이 없습니다');
  }
  assert.match(read('care/care-i18n-ko.js'), /진단서가 아닙니다/);
});

test('Given the report is collapsed, when print is pressed, then it is opened first', () => {
  /* 접힌 채로 인쇄하면 빈 종이가 나옵니다. */
  const src = read('care/animal-ui.js');
  const start = src.indexOf("t.id === 'mr_print'");
  assert.notEqual(start, -1, '인쇄 처리가 없습니다');
  const block = src.slice(start, start + 260);
  assert.match(block, /mrBox/);
  assert.ok(block.indexOf('box.open = true') < block.indexOf('window.print()'),
    '펼치기가 인쇄보다 먼저 와야 합니다');
});

test('Given no new table was added, when the feature ships, then no migration is required', () => {
  /* 이 문서는 이미 있는 표만 읽습니다. 새 표를 만들면 마이그레이션이
     필요해지고, 그건 이 기능의 약속과 다릅니다. */
  const src = read('care/medical-report.js');
  assert.doesNotMatch(src, /\.from\(|rpc\(/, 'DB 를 직접 부르면 안 됩니다');
  assert.doesNotMatch(src, /document\./, '값 고르는 파일이 화면을 만지면 안 됩니다');
});

test('Given the report is not released yet, when the page renders, then it stays hidden by default', () => {
  /* 병원에서 남에게 건네지는 종이입니다. 실제 진료에서 써 보기 전까지는
     내보내지 않습니다 — 문서 하나가 어색해도 그게 서비스 신뢰가 됩니다. */
  const cfg = read('assets/studio-config.js');
  assert.match(cfg, /var MEDICAL_REPORT_ACCESS = 'off';/);

  const ui = read('care/animal-ui.js');
  assert.match(ui, /function medicalVisible\(\)/);
  /* 스위치를 모르는 옛 캐시는 꺼짐으로 봅니다 — 안 보이는 편이 낫습니다. */
  assert.match(ui, /typeof MEDICAL_REPORT_ACCESS === 'undefined' \? 'off'/);
  assert.match(ui, /A\.premium && A\.premium\.kind === 'pro'/);

  const block = ui.slice(ui.indexOf('function medicalBlock()'), ui.indexOf('function medicalBlock()') + 200);
  assert.match(block, /if \(!medicalVisible\(\)\) return '';/);
});
