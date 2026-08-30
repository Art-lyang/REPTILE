const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* 족보 6세대
   ---------------------------------------------------------------------------
   혈통서에서 흔히 쓰는 깊이가 6세대입니다. 예전 상한은 5였고, 화면에서 고를 수
   있는 것은 4까지라 실제로는 4세대가 끝이었습니다.

   6세대는 마지막 줄이 64칸입니다. 카드를 그대로 두면 6,500px 이 넘어서, 스크롤
   상자 안이라도 조상을 찾는 게 아니라 헤매게 됩니다. 5세대부터는 사진을 접고
   이름만 남겨 칸을 좁힙니다. */

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

function core() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(read('care/care-core.js'), ctx);
  return ctx.window.CareCore;
}

/* 여섯 세대가 꽉 찬 가계도. 실제로는 이렇게 채워지지 않지만, 상한을 보려면
   상한까지 채운 입력이 있어야 합니다. */
function fullTree(depth) {
  const animals = [{ id: 'r', name: 'root' }];
  let front = [animals[0]];
  for (let g = 1; g <= depth; g++) {
    const next = [];
    front.forEach(function (node, i) {
      ['a', 'b'].forEach(function (side) {
        const id = node.id + side;
        const rec = { id: id, name: 'g' + g + '-' + i + side };
        animals.push(rec);
        node['parent_' + side] = id;
        next.push(rec);
      });
    });
    front = next;
  }
  return animals;
}

test('Given a lineage six deep, when the pedigree is asked for six, then it returns six', () => {
  const p = core().buildPedigree(fullTree(6), 'r', 6);
  assert.equal(p.up.length, 6);
  /* vm 안에서 만든 배열은 프로토타입이 달라서 deepEqual 이 그대로는 안 맞습니다.
     값만 보면 되므로 이쪽 realm 의 배열로 옮겨 비교합니다. */
  assert.deepEqual(Array.from(p.slots), [2, 4, 8, 16, 32, 64]);
  assert.equal(p.known.total, 126);   // 2+4+8+16+32+64
  assert.equal(p.known.filled, 126);
});

test('Given someone asks past six, when the pedigree is built, then it stops at six', () => {
  /* 일곱 세대면 128칸이 더 붙는데, 거기까지 거슬러 올라간 기록을 가진 사람은
     없습니다. 칸만 두 배가 되고 채워지는 것은 늘지 않습니다. */
  const p = core().buildPedigree(fullTree(8), 'r', 9);
  assert.equal(p.up.length, 6);
  assert.equal(p.slots[p.slots.length - 1], 64);
});

test('Given a shallow lineage, when six generations are asked for, then it stops where the record does', () => {
  const animals = [{ id: 'r', parent_a: 'f' }, { id: 'f' }];
  const p = core().buildPedigree(animals, 'r', 6);
  assert.equal(p.up.length, 1);
  assert.equal(p.known.filled, 1);
  assert.equal(p.known.total, 2);
});

test('Given the screen lets you choose depth, when the buttons render, then five and six are offered', () => {
  const ui = read('care/animal-ui.js');
  assert.match(ui, /\[2, 3, 4, 5, 6\]\.map/);
});

test('Given sixty-four slots, when the tree is deep, then the cards shrink instead of overflowing', () => {
  const ui = read('care/animal-ui.js');
  assert.match(ui, /const deep = up >= 5;/);
  assert.match(ui, /const CARD = deep \? 52 :/);
  assert.match(ui, /pedtree' \+ \(deep \? ' deep' : ''\)/);

  const css = read('care/care.css');
  /* 사진을 접는 것이 폭을 줄이는 가장 큰 몫입니다. */
  assert.match(css, /\.pedtree\.deep \.pedface\{display:none\}/);
  assert.match(css, /\.pedtree\.deep \.pedbox\{width:48px/);
  /* 좁은 화면 규칙보다 뒤에 와야 폰에서도 이깁니다 — 앞에 두면 440px 이하에서
     72px 로 되돌아가 6세대가 다시 넘칩니다. */
  assert.ok(css.indexOf('.pedtree.deep .pedbox') > css.indexOf('.pedbox{width:72px'),
    '.pedtree.deep 규칙이 max-width:440px 블록보다 앞에 있습니다');
});

test('Given six buttons in a row, when the screen is narrow, then they wrap instead of overflowing', () => {
  const css = read('care/care.css');
  assert.match(css, /\.pedgens\{display:flex;flex-wrap:wrap/);
});

test('Given the harness stands in for real data, when six generations are checked, then it goes that deep', () => {
  /* 세 세대짜리 예시로는 6세대 화면을 한 번도 못 봅니다. */
  const harness = read('care/_harness-animal.html');
  assert.match(harness, /function deepen\(\)/);
  assert.match(harness, /gen <= 6/);
});
