const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadResults() {
  const context = vm.createContext({});
  context.window = context;
  for (const relativePath of [
    'assets/breeding-project-contract.js',
    'care/breeding-goal-results.js',
  ]) {
    const fullPath = path.join(root, relativePath);
    if (fs.existsSync(fullPath)) {
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: relativePath });
    }
  }
  return context.BreedingGoalResults;
}

function text() {
  return {
    roadmap: '조건부 로드맵', resultReady: '준비', resultReview: '검토',
    resultInsufficient: '부족', relationshipWarning: '혈연 확인', missingInfo: '정보 확인',
    lineOutcome: '예상 라인명', lineResetWarning: '라인 초기화', savePairing: '페어링 저장',
    noCandidates: '후보 없음', stepOne: '1단계', stepTwo: '2단계', stepThree: '3단계',
    actualProgress: '실제 진행', actionCreatePairing: '페어링 생성', actionContinue: '계속',
    selectedOffspring: '선발 개체', unsupported: '미지원',
  };
}

test('Given a candidate result, when rendered, then line direction and safe pairing action remain visible', () => {
  // Given
  const result = {
    supported: true,
    candidates: [{
      parentAId: 'a', parentBId: 'b', status: 'ready', reviewReasons: [], relationshipWarnings: [],
      lineOutcome: { name: '정글 × <img src=x onerror=alert(1)>', warning: null },
    }],
  };
  const progress = { nextAction: 'create_pairing', assessments: [], offspring: [] };

  // When
  const results = loadResults();
  assert.equal(results && typeof results.html, 'function', 'BreedingGoalResults.html must exist');
  const html = results.html({
    result, progress, animals: [{ id: 'a', name: '수컷' }, { id: 'b', name: '암컷' }], text: text(),
  });

  // Then
  assert.match(html, /예상 라인명/);
  assert.match(html, /정글 × &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /data-bg-save-pairing/);
  assert.match(html, /\u00d7/, 'parent names should use the multiplication sign separator');
  assert.doesNotMatch(html, /\uD69E/, 'mojibake parent separator must not be rendered');
});

test('Given an unsupported roadmap, when rendered, then the translated unsupported state is returned', () => {
  // Given
  const result = { supported: false, candidates: [] };

  // When
  const results = loadResults();
  assert.equal(results && typeof results.html, 'function', 'BreedingGoalResults.html must exist');
  const html = results.html({ result, progress: null, animals: [], text: text() });

  // Then
  assert.match(html, /미지원/);
  assert.doesNotMatch(html, /data-bg-save-pairing/);
});
