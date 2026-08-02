const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const corePath = path.join(__dirname, "gecko-core.js");
const coreSource = fs.readFileSync(corePath, "utf8");
const context = vm.createContext({});

vm.runInContext(coreSource, context, { filename: corePath });

function polyLabel(input) {
	context.testPoly = input;
	return vm.runInContext("polyLabel(testPoly)", context);
}

function polyImplication(polyId, geneId) {
	context.testPolyId = polyId;
	context.testGeneId = geneId;
	return vm.runInContext(
		"(() => { const poly = POLY.find((item) => item.id === testPolyId); return poly.implies ? poly.implies[testGeneId] : null; })()",
		context,
	);
}

function searchMatches(collection, id, query) {
	context.testCollection = collection;
	context.testSearchId = id;
	context.testSearchQuery = query;
	return vm.runInContext(
		"leoMatches((testCollection === 'GENES' ? GENES : POLY).find((item) => item.id === testSearchId), testSearchQuery)",
		context,
	);
}

test("한쪽 부모만 블랙나이트일 때 순수 라인명으로 표시하지 않는다", () => {
	// Given: 블랙나이트 형질을 한쪽 부모만 가진 교배
	const traits = [{ id: "blacknight", name: "블랙나이트", both: false }];

	// When: 새끼의 라인브리딩 결과 이름을 계산
	const result = polyLabel(traits);

	// Then: 순수 블랙나이트가 아닌 크로스 표기 경로를 사용
	assert.equal(result, "");
});

test("양쪽 부모가 모두 블랙나이트일 때 라인명을 유지한다", () => {
	// Given: 블랙나이트 형질을 양쪽 부모가 모두 가진 교배
	const traits = [{ id: "blacknight", name: "블랙나이트", both: true }];

	// When: 새끼의 라인브리딩 결과 이름을 계산
	const result = polyLabel(traits);

	// Then: 블랙나이트 라인명을 그대로 사용
	assert.equal(result, "블랙나이트");
});

test("오렌지 스모그는 비주얼 벨 알비노를 내포한다", () => {
	// Given: 오렌지 스모그 라인 형질
	// When: 내포된 벨 알비노 유전자형을 조회
	const result = polyImplication("orangesmog", "bell");

	// Then: 단순 보인자가 아닌 비주얼 열성 유전자형
	assert.equal(result, "mm");
});

test("스모그는 비주얼 트램퍼 알비노를 내포한다", () => {
	// Given: 스모그 라인 형질
	// When: 내포된 트램퍼 알비노 유전자형을 조회
	const result = polyImplication("smog", "tremper");

	// Then: 단순 보인자가 아닌 비주얼 열성 유전자형
	assert.equal(result, "mm");
});

test("썬글로우를 선택하면 트램퍼 알비노 비주얼 유전자가 누락되지 않는다", () => {
	const result = polyImplication("sunglow", "tremper");

	assert.equal(result, "mm");
});

test("모프 검색은 현재 화면 언어와 무관하게 영문 이름을 찾는다", () => {
	// Given: 한국어 화면의 트램퍼 알비노 유전 모프
	// When: 영문 이름으로 검색
	const result = searchMatches("GENES", "tremper", "tremper");

	// Then: 해당 모프가 검색 결과에 포함
	assert.equal(result, true);
});

test("모프 검색은 슈퍼폼 이름도 찾는다", () => {
	// Given: 슈퍼폼 이름을 가진 맥스노우 유전 모프
	// When: 영문 슈퍼폼 이름으로 검색
	const result = searchMatches("GENES", "macksnow", "super snow");

	// Then: 맥스노우 항목이 검색 결과에 포함
	assert.equal(result, true);
});

test("모프 검색은 공백과 구두점을 무시한다", () => {
	// Given: 구두점이 포함된 GCT.M 라인브리딩 형질
	// When: 구두점 없이 검색
	const result = searchMatches("POLY", "gctm", "gctm");

	// Then: GCT.M이 검색 결과에 포함
	assert.equal(result, true);
});

test("모프 검색은 콤보 이름도 찾는다", () => {
	// Given: 갤럭시 콤보
	context.testSearchQuery = "total eclipse";

	// When: 콤보의 영문 별칭으로 검색
	const result = vm.runInContext(
		"leoMatches(COMBOS.find((combo) => combo.en.startsWith('Galaxy')), testSearchQuery)",
		context,
	);

	// Then: 갤럭시 콤보가 검색 결과에 포함
	assert.equal(result, true);
});

test("Given 화이트 앤 옐로우 유전자, when 한국어 이름을 표시하면, then WY 약칭을 함께 표시한다", () => {
	const name = vm.runInContext("GENES.find((gene) => gene.id === 'wy').ko", context);

	assert.equal(name, "화이트앤옐로우(WY)");
});

test("Given Supabase의 예전 이름, when 고정 표기를 적용하면, then 화이트앤옐로우 WY 표기를 유지한다", () => {
	context.adminWyGene = { id: "wy", ko: "화이트 앤 옐로우" };

	vm.runInContext("leoApplyLockedGeneLabels(adminWyGene)", context);

	assert.equal(context.adminWyGene.ko, "화이트앤옐로우(WY)");
});

test("Given 레오파드 모프 목록, when 느와르를 조회하면, then 열성 위험 형질로 제공한다", () => {
	const gene = vm.runInContext("GENES.find((item) => item.id === 'noir')", context);

	assert.equal(gene.type, "rec");
	assert.equal(gene.risk, true);
	assert.equal(gene.ko, "느와르");
	assert.equal(gene.en, "Noir");
});

test("Given 운영 데이터가 느와르를 다른 방식으로 내려줄 때, when 고정 구조를 적용하면, then 열성과 난임 주의를 유지한다", () => {
	context.adminNoirGene = { id: "noir", type: "dom", family: "dominant", risk: false };

	vm.runInContext("leoApplyLockedGeneStructure(adminNoirGene)", context);

	assert.equal(context.adminNoirGene.type, "rec");
	assert.equal(context.adminNoirGene.family, "melanisticgene");
	assert.equal(context.adminNoirGene.risk, true);
});

test("Given 운영 데이터에 느와르가 없을 때, when 필수 내장 모프를 병합하면, then 느와르를 보존한다", () => {
	context.loadedGenes = [{ id: "tremper", type: "rec" }];
	const ids = vm.runInContext(
		"leoMergeRequiredGenes(loadedGenes, GENES).map((item) => item.id)",
		context,
	);

	assert.equal(Array.from(ids).includes("noir"), true);
});

test("Given 운영 데이터에 느와르가 있을 때, when 필수 내장 모프를 병합하면, then 중복하지 않는다", () => {
	context.loadedGenes = [{ id: "noir", type: "rec" }];
	const count = vm.runInContext(
		"leoMergeRequiredGenes(loadedGenes, GENES).filter((item) => item.id === 'noir').length",
		context,
	);

	assert.equal(count, 1);
});

test("Given 비주얼 느와르와 노멀 교배, when 새끼 유전형을 계산하면, then 전부 헷 느와르다", () => {
	const result = vm.runInContext("geneOffspring('mm', 'nn')", context);

	assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ geno: "Nm", num: 1, den: 1 }]);
});

test("Given 비주얼 느와르가 나오는 교배, when 건강 경고를 계산하면, then 난임 주의를 표시한다", () => {
	const warning = vm.runInContext(
		"computeWarnings([{ g: GENES.find((item) => item.id === 'noir'), dist: { NN: 0, Nm: 0, mm: 1 } }])[0]",
		context,
	);

	assert.equal(warning.geneId, "noir");
	assert.match(warning.text, /난임|번식력/);
});

test("Given 비주얼 느와르 부모와 노멀 교배, when 새끼가 전부 헷이어도, then 부모의 난임 주의를 표시한다", () => {
	vm.runInContext("STATE.A.noir = 'mm'; STATE.B.noir = 'nn'", context);
	const warning = vm.runInContext(
		"computeWarnings([{ g: GENES.find((item) => item.id === 'noir'), dist: { NN: 0, Nm: 1, mm: 0 } }])[0]",
		context,
	);

	assert.equal(warning.geneId, "noir");
	assert.match(warning.text, /난임|번식력/);
});
