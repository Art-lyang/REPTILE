const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const corePath = path.join(__dirname, "crested-core.js");
const coreSource = fs.readFileSync(corePath, "utf8");
const context = vm.createContext({});

vm.runInContext(coreSource, context, { filename: corePath });

function evaluate(expression) {
	return vm.runInContext(expression, context);
}

test("한국어 유전 모프에서 Fire 계열을 하이포 계열로 표시한다", () => {
	// Given: Fire 유전 모프
	// When: 한국어 기본형과 슈퍼폼 이름을 조회
	const names = evaluate(
		"(() => { const gene = CR_ALL_GENES().find((item) => item.id === 'fire'); return [gene.ko, gene.superKo]; })()",
	);

	// Then: 국내 명칭인 하이포와 슈퍼하이포로 표시
	assert.deepEqual(Array.from(names), ["하이포", "슈퍼하이포"]);
});

test("관리자 데이터가 Fire의 예전 한국어명을 내려줘도 국내 표기를 유지한다", () => {
	// Given: 관리자 데이터가 덮어쓴 예전 Fire 한국어명
	context.adminFireGene = {
		id: "fire",
		ko: "파이어 (제네틱 하이포)",
		superKo: "슈퍼파이어 (BEL)",
	};

	// When: 계산기의 고정 국내 표기를 적용
	evaluate("crApplyLockedGeneLabels(adminFireGene)");

	// Then: 하이포와 슈퍼하이포로 복원
	assert.equal(context.adminFireGene.ko, "하이포");
	assert.equal(context.adminFireGene.superKo, "슈퍼하이포");
});

test("화이트아웃은 계산 가능한 유전자 목록에서 제외한다", () => {
	// Given: 계산기가 제공하는 전체 유전자 목록
	// When: 화이트아웃 유전자를 조회
	const whiteout = evaluate(
		"CR_ALL_GENES().find((item) => item.id === 'whiteout')",
	);

	// Then: 화이트아웃은 존재하지 않음
	assert.equal(whiteout, undefined);
});

test("화이트아웃 관리자 데이터도 제거 대상으로 표시한다", () => {
	// Given: 관리자 데이터에서 제외할 유전자 ID 목록
	// When: 화이트아웃 포함 여부를 조회
	const isRemoved = evaluate("CR_REMOVED_GENE_IDS.has('whiteout')");

	// Then: 관리자 덮어쓰기로 다시 추가되지 않도록 제거 대상으로 유지
	assert.equal(isRemoved, true);
});

test("화이트 월은 구조형질로 제공한다", () => {
	// Given: 확률 계산 대상이 아닌 형질 목록
	// When: 화이트 월을 조회
	const whiteWall = evaluate(
		"CR_TRAITS.find((item) => item.id === 'whitewall')",
	);

	// Then: 구조형질 그룹에 국내 표기로 등록
	assert.equal(whiteWall.grp, "struct");
	assert.equal(whiteWall.ko, "화이트 월");
	assert.equal(whiteWall.en, "White Wall");
});

test("Given 크레스티드 유전 모프 목록, when 파이드를 조회하면, then 불완전우성 슈퍼폼을 제공한다", () => {
	const gene = evaluate("CR_ALL_GENES().find((item) => item.id === 'pied')");

	assert.equal(gene.type, "incdom");
	assert.equal(gene.superKo, "슈퍼 파이드");
	assert.equal(gene.superEn, "Super Pied");
});

test("Given 파이드 두 개체, when 새끼 유전형을 계산하면, then 노멀 파이드 슈퍼파이드가 25 50 25로 나온다", () => {
	const dist = evaluate("crGenoDist(CR_ALL_GENES().find((item) => item.id === 'pied'), 'het', 'het')");

	assert.deepEqual(JSON.parse(JSON.stringify(dist)), { NN: 0.25, Nm: 0.5, mm: 0.25 });
});

test("Given 운영 데이터가 파이드를 열성으로 내려줄 때, when 고정 구조를 적용하면, then 불완전우성을 유지한다", () => {
	context.adminPiedGene = { id: "pied", type: "rec", proof: "contested" };

	evaluate("crApplyLockedGeneStructure(adminPiedGene)");

	assert.equal(context.adminPiedGene.type, "incdom");
	assert.equal(context.adminPiedGene.proof, "partial");
});
