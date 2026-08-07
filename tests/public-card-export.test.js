const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadModule() {
  const window = {};
  vm.runInNewContext(read('care/public-card-export.js'), { window });
  return window.PublicCardExport;
}

const i18n = {
  t(key) {
    return {
      unnamed: '이름 없음', sexMale: '수컷', sexFemale: '암컷', sexUnknown: '미구분',
      speciesFact: '종', sexFact: '성별', lifeStage: '성장 단계', hatchFact: '해칭일',
      clutchFact: '클러치', latestWeightFact: '최근 체중', morph: '모프',
      parentFather: '부', parentMother: '모',
      publicCardEyebrow: 'CREATURE PROFILE', publicCardScan: 'QR로 상세 프로필 보기',
      publicCardScanHint: '카메라로 스캔하면 공개 정보가 열립니다.', publicCardNoMorph: '모프 정보 없음',
      stageAdult: '성체'
    }[key] || key;
  },
  speciesName() { return '레오파드 게코'; },
  formatDate(value) { return value.replaceAll('-', '.'); },
  formatNumber(value) { return String(value); },
  /* 카드는 나이를 여기서 받아옵니다(care-core 의 ageText 와 같은 것).
     오늘 날짜에 따라 값이 흔들리면 시험이 날마다 다른 답을 내므로 고정합니다. */
  ageText() { return '9개월'; }
};

const lifeStage = { labelKey() { return 'stageAdult'; } };

test('Given the public RPC payload, when a share-card model is made, then it contains only public profile fields', () => {
  const exporter = loadModule();
  const model = exporter.model({
    name: '라봉이', species: 'leopard', sex: 'female', life_stage: 'adult',
    hatch_date: '2025-11-13', clutch: '2025-A', morphs: ['이클립스', '탠저린'],
    breeder: '량 스튜디오', latest_weight: { grams: 61.4, measured_on: '2026-08-03' },
    parents: { a: { name: '리봉이' }, b: { name: '도도' } },
    note: '공개 소개', photo_url: 'photo', private_note: '절대 노출 금지'
  }, 'https://ryangstudio.com/care/p.html?t=token', i18n, lifeStage);

  /* 이 시험의 값은 '카드에 나가도 되는 것' 의 목록입니다. 여기에 없는 필드를
     모델에 더하면 시험이 깨지고, 그때 그것이 공개해도 되는 값인지 한 번 더
     생각하게 됩니다. age·weightOn 은 이미 공개인 hatch_date·measured_on 에서
     나온 값이라 새로 나가는 정보가 아닙니다. */
  assert.deepEqual(JSON.parse(JSON.stringify(model)), {
    name: '라봉이', species: '레오파드 게코', sex: '암컷', stage: '성체',
    hatch: '2025.11.13', age: '9개월', clutch: '2025-A',
    weight: '61.4g', weightOn: '2026.08.03',
    morphs: ['이클립스', '탠저린'], breeder: '량 스튜디오', parents: '부 리봉이 · 모 도도',
    note: '공개 소개', photo: 'photo',
    url: 'https://ryangstudio.com/care/p.html?t=token', eyebrow: 'CREATURE PROFILE',
    scan: 'QR로 상세 프로필 보기', scanHint: '카메라로 스캔하면 공개 정보가 열립니다.',
    noMorph: '모프 정보 없음'
  });
  assert.equal(JSON.stringify(model).includes('절대 노출 금지'), false);
});

test('Given a hostile animal name, when an image filename is made, then it is filesystem safe and bounded', () => {
  const exporter = loadModule();
  assert.equal(exporter.filename(' 라봉이 / .. <A> '), 'ryang-profile-라봉이-A.png');
  assert.ok(exporter.filename('가'.repeat(100)).length < 70);
});

test('Given the owner share screen, when the QR is ready, then an offline canvas export and mobile share fallback are wired', () => {
  const page = read('care/animal.html');
  const harness = read('care/_harness-animal.html');
  const source = read('care/public-card-export.js');
  const ui = read('care/public-card-export-ui.js');

  for (const html of [page, harness]) {
    assert.match(html, /public-card-export\.css\?v=/);
    assert.ok(html.indexOf('public-card-export.js?v=') < html.indexOf('public-card-export-ui.js?v='));
  }
  assert.match(source, /canvas\.width\s*=\s*1080/);
  assert.match(source, /canvas\.height\s*=\s*1350/);
  assert.match(source, /qr\.isDark\(/);
  assert.match(source, /browser\.share/);
  assert.match(source, /download/);
  assert.doesNotMatch(source, /html2canvas|api\.qrserver|quickchart/i);
  assert.match(ui, /rpc\('public_animal'/);
  assert.match(ui, /Photo\.sign/);
  assert.match(ui, /id="sh_export_card"/);
});
