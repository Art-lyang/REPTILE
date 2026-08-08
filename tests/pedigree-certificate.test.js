const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* 혈통서
   ---------------------------------------------------------------------------
   분양할 때 개체와 함께 넘기는 문서입니다. 새 표를 만들지 않고, 이미 있는
   것만 읽어 정리합니다 — animals · care_records · care_plans · weight_logs.

   마이그레이션이 0건이라는 뜻입니다. supabase_v64.sql(CITES)이 스테이징
   검증을 마치기 전에는 그 위에 아무것도 쌓지 않기로 했습니다.

   소유권·거래가격은 여기 없습니다. 그건 혈통서가 아니라 양도 기록이고
   (plans/transfer-docs-roadmap.md 의 Phase 2), 거래 기록 표를 두 벌 만들면
   CITES 잠금이 안 걸린 쪽이 우회로가 됩니다. */

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(read('care/care-core.js'), ctx);
  vm.runInContext(read('care/pedigree-certificate.js'), ctx);
  return { C: ctx.window.CareCore, P: ctx.window.PedigreeCertificate };
}

function fixture(C) {
  const T = C.today();
  const ago = n => C.addDays(T, -n);
  return {
    animals: [
      { id: 'a', name: '라봉이', species: 'leopard', sex: 'female', parent_a: 'f', parent_b: 'm' },
      { id: 'f', name: '아비', species: 'leopard', sex: 'male' },
      { id: 'm', name: '어미', species: 'leopard', sex: 'female' }
    ],
    records: [
      { animal_id: 'a', kind: 'feed', done_date: ago(2), feed_name: '귀뚜라미', feed_category: 'staple' },
      { animal_id: 'a', kind: 'feed', done_date: ago(5), feed_name: '귀뚜라미', feed_category: 'staple' },
      { animal_id: 'a', kind: 'feed', done_date: ago(9), feed_name: '슈퍼웜', feed_category: 'treat' },
      { animal_id: 'a', kind: 'supplement', done_date: ago(4) },
      { animal_id: 'a', kind: 'memo', done_date: ago(30), note: '28~30도, 페이퍼타올' },
      { animal_id: 'a', kind: 'memo', done_date: ago(1), title: 'pedigree-postscript', note: '온순합니다' },
      /* 다른 개체의 기록. 섞이면 문서가 거짓말을 합니다. */
      { animal_id: 'b', kind: 'feed', done_date: ago(1), feed_name: '남의개체' }
    ],
    plans: [{ animal_id: 'a', kind: 'feed', title: '급여', interval_days: 3, is_active: true }],
    weights: [
      { animal_id: 'a', measured_on: ago(20), grams: 48 },
      { animal_id: 'a', measured_on: T, grams: 62 }
    ]
  };
}

function build(extra) {
  const { C, P } = load();
  const f = fixture(C);
  return P.build(Object.assign({
    core: C, i18n: {}, esc: s => s, animal: f.animals[0],
    animals: f.animals, records: f.records, plans: f.plans, weights: f.weights
  }, extra || {}));
}

test('Given a certificate is built, when the animal has a lineage, then it goes six generations', () => {
  const { C, P } = load();
  const f = fixture(C);
  const doc = P.build({ core: C, i18n: {}, esc: s => s, animal: f.animals[0],
    animals: f.animals, records: f.records, plans: f.plans, weights: f.weights });
  /* 기록이 두 세대뿐이면 두 세대만 나옵니다. 깊이는 6까지 열려 있을 뿐입니다. */
  assert.equal(doc.pedigree.up.length, 1);
  assert.equal(doc.pedigree.known.filled, 2);
});

test('Given other animals exist, when the certificate is built, then only this animal is counted', () => {
  /* 남의 기록이 섞이면 문서가 거짓말을 합니다. 분양받는 사람은 확인할 방법이
     없으므로, 여기서 새면 끝까지 안 잡힙니다. */
  const doc = build();
  assert.ok(!JSON.stringify(doc).includes('남의개체'));
});

test('Given feeding history, when it is summarised, then each food is counted separately', () => {
  /* 슈퍼푸드만 먹던 개체에게 갑자기 곤충만 주면 안 먹습니다. 무엇을 먹고
     자랐는지가 분양받는 사람에게 가장 실질적인 정보입니다. */
  const doc = build();
  /* vm 안에서 만든 배열·객체는 프로토타입이 달라 deepEqual 이 그대로는 안
     맞습니다. 값만 보면 되므로 이쪽 realm 으로 옮겨 비교합니다. */
  assert.deepEqual(JSON.parse(JSON.stringify(doc.care.feeds.map(f => [f.name, f.count]))),
    [['귀뚜라미', 2], ['슈퍼웜', 1]]);
  /* 계획의 주기가 함께 나와야 '3일마다로 두고 실제로 3번' 이 읽힙니다. */
  assert.equal(doc.care.plans[0].interval_days, 3);
});

test('Given a postscript exists, when care records are tallied, then it is not counted as care', () => {
  /* 추신은 케어 메모로 저장되지만 사육 행위가 아닙니다. 세면 문서가 스스로를
     실적으로 세는 꼴이 됩니다. */
  const doc = build();
  const memo = doc.care.kinds.filter(k => k.kind === 'memo')[0];
  assert.equal(memo.count, 1, '추신을 뺀 메모만 세어야 합니다');
  /* 사육 메모 목록에도 추신이 다시 나오면 안 됩니다 — 같은 글이 문서에 두 번
     나오면 어느 쪽이 최신인지 알 수 없습니다. */
  assert.deepEqual(JSON.parse(JSON.stringify(doc.memos.map(m => m.note))), ['28~30도, 페이퍼타올']);
  assert.equal(doc.postscript.note, '온순합니다');
});

test('Given no postscript, when the certificate is built, then the slot is simply empty', () => {
  const { C, P } = load();
  const f = fixture(C);
  const doc = P.build({ core: C, i18n: {}, esc: s => s, animal: f.animals[0], animals: f.animals,
    records: f.records.filter(r => r.title !== 'pedigree-postscript'), plans: f.plans, weights: f.weights });
  assert.equal(doc.postscript, null);
});

test('Given a keeper writes a postscript, when it is saved, then it becomes a dated care memo', () => {
  /* 담을 표를 새로 만들지 않기로 했습니다. 날짜가 함께 남아서, 언제 쓴 글인지
     문서에 그대로 적을 수 있습니다. */
  const { P } = load();
  const calls = [];
  const app = { addRecord(r) { calls.push(r); return Promise.resolve(r); } };
  P.savePostscript(app, 'a', '  28~30℃, 은신처 3곳  ');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ animal_id: 'a', kind: 'memo',
    title: 'pedigree-postscript', note: '28~30℃, 은신처 3곳' }]);
  /* 빈 글은 저장하지 않습니다 — 눌렀다는 이유로 빈 메모가 쌓입니다. */
  P.savePostscript(app, 'a', '   ');
  assert.equal(calls.length, 1);
});

test('Given the certificate ships, when the source is read, then it adds no migration', () => {
  /* v64 가 스테이징 검증을 마치기 전에는 그 위에 아무것도 쌓지 않기로 했습니다.
     혈통서는 읽기만 하므로 지킬 수 있습니다. */
  const files = fs.readdirSync(ROOT).filter(f => /^supabase_v\d+\.sql$/.test(f));
  const highest = Math.max(...files.map(f => parseInt(f.match(/\d+/)[0], 10)));
  assert.equal(highest, 64, '혈통서는 새 마이그레이션을 만들지 않습니다');

  /* 소유권·거래가격은 혈통서가 아니라 양도 기록입니다. 주석에는 '여기 없다'
     고 적혀 있으므로, 주석을 걷어낸 코드만 봅니다 — 안 그러면 설명 자체가
     걸려서 검사가 늘 빨간불이 됩니다. */
  const source = read('care/pedigree-certificate.js');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /animal_transfers|transfer|price/i);
});
