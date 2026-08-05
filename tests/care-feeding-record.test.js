const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadDialog() {
  const window = {};
  const context = { window, document: {}, Date };
  vm.createContext(context);
  vm.runInContext(read('care/animal-feeding-dialog.js'), context, {
    filename: 'care/animal-feeding-dialog.js',
  });
  return window.AnimalFeedingDialog;
}

const i18n = {
  t(key, values) {
    return values && values.name ? `${key}:${values.name}` : key;
  },
  feedCategoryName: value => `category:${value}`,
  feedStateName: value => `state:${value}`,
  feedingResultName: value => `result:${value}`,
  feedUnitName: value => `unit:${value}`,
};

test('Given varied reptile diets, when the feeding dialog opens, then prepared food, prey, plants and supplements can be described', () => {
  const api = loadDialog();
  const html = api.html(i18n, [
    { id: 'food-1', name: '망고 슈퍼푸드', unit: 'g', per_use: 6, is_active: true },
    { id: 'food-2', name: '<냉동 마우스>', unit: 'piece', is_active: true },
  ]);

  for (const category of ['prepared', 'insect', 'whole_prey', 'plant', 'supplement', 'other']) {
    assert.match(html, new RegExp(`value="${category}"`));
  }
  for (const state of ['ready', 'live', 'frozen', 'thawed', 'powder', 'mixed', 'fresh', 'other']) {
    assert.match(html, new RegExp(`value="${state}"`));
  }
  for (const result of ['all', 'partial', 'refused', 'unknown']) {
    assert.match(html, new RegExp(`value="${result}"`));
  }
  assert.match(html, /망고 슈퍼푸드/);
  assert.match(html, /&lt;냉동 마우스&gt;/);
  assert.doesNotMatch(html, /<냉동 마우스>/);
});

test('Given a saved inventory item, when a full feeding is recorded, then an immutable name, unit and eaten amount snapshot is produced', () => {
  const api = loadDialog();
  const feed = { id: 'food-1', name: '귀뚜라미', unit: 'piece', per_use: 3 };
  const result = api.buildPayload({
    feed_item_id: feed.id,
    feed_category: 'insect',
    feed_state: 'live',
    offered_amount: '3',
    feed_unit: 'piece',
    feeding_result: 'all',
    done_date: '2026-08-03',
    note: '잘 먹음',
  }, [feed]);

  assert.equal(result.error, null);
  assert.equal(result.payload.feed_name, '귀뚜라미');
  assert.equal(result.payload.feed_item_id, 'food-1');
  assert.equal(result.payload.offered_amount, 3);
  assert.equal(result.payload.eaten_amount, 3);
  assert.equal(result.payload.feed_unit, 'piece');
});

test('Given a refused or partial feeding, when it is normalized, then intake cannot exceed the offered amount', () => {
  const api = loadDialog();
  const refused = api.buildPayload({
    custom_feed_name: '냉동 마우스', feed_category: 'whole_prey', feed_state: 'thawed',
    offered_amount: '1', feed_unit: 'piece', feeding_result: 'refused', done_date: '2026-08-03',
  }, []);
  assert.equal(refused.error, null);
  assert.equal(refused.payload.eaten_amount, 0);

  const partial = api.buildPayload({
    custom_feed_name: '슈퍼푸드', feed_category: 'prepared', feed_state: 'mixed',
    offered_amount: '5', eaten_amount: '7', feed_unit: 'g', feeding_result: 'partial', done_date: '2026-08-03',
  }, []);
  assert.equal(partial.payload, null);
  assert.equal(partial.error, 'feedingAmountInvalid');
});

test('Given no inventory link, when a custom feeding is saved, then a food name remains required for useful history', () => {
  const api = loadDialog();
  const result = api.buildPayload({
    custom_feed_name: '  ', feed_category: 'other', feed_state: 'ready',
    offered_amount: '1', feed_unit: 'portion', feeding_result: 'unknown', done_date: '2026-08-03',
  }, []);
  assert.equal(result.payload, null);
  assert.equal(result.error, 'feedingNameRequired');
});

test('Given structured feeding fields, when a record is inserted, then the application forwards every snapshot column', () => {
  const app = read('care/care-app.js');
  for (const field of ['feed_item_id', 'feed_name', 'feed_category', 'feed_state',
    'offered_amount', 'eaten_amount', 'feed_unit', 'feeding_result']) {
    assert.match(app, new RegExp(`${field}:\\s*r\\.${field}`), `${field} must be inserted`);
  }
});

test('Given an animal detail page, when Feeding is selected, then a structured dialog replaces the empty one-tap record', () => {
  const page = read('care/animal.html');
  const ui = read('care/animal-ui.js');

  assert.match(page, /animal-feeding-dialog\.js\?v=/);
  assert.match(page, /animal-feeding-dialog\.css\?v=/);
  assert.match(ui, /AnimalFeedingDialog/);
  assert.match(ui, /if \(d\.quick === 'feed'\)[\s\S]{0,220}return FeedingDialog\.open/,
    'feeding must leave the generic quick path before it can save an empty record');
});

test('Given a structured feeding record, when a calendar date is selected, then food, state, quantity and result are visible', () => {
  const window = {};
  const context = { window, document: null, Date };
  vm.createContext(context);
  vm.runInContext(read('care/animal-calendar.js'), context);
  const parts = window.AnimalCalendar.recordParts({
    kind: 'feed', feed_name: '냉동 마우스', feed_category: 'whole_prey', feed_state: 'thawed',
    offered_amount: 1, eaten_amount: 1, feed_unit: 'piece', feeding_result: 'all',
  }, {
    kindInfo: () => ({ ko: '급여' }),
    i18n: Object.assign({}, i18n, { kindName: () => '급여', formatNumber: value => String(value) }),
  });
  assert.deepEqual(Array.from(parts), ['냉동 마우스', 'category:whole_prey', 'state:thawed', '1 unit:piece', 'result:all']);
});

test('Given the four supported languages, when feeding labels are added, then none fall back to Korean', () => {
  for (const language of ['ko', 'en', 'zh', 'ja']) {
    const source = read(`care/care-i18n-${language}.js`);
    for (const key of ['feedingInputTitle', 'feedingFood', 'feedingCategory', 'feedingState',
      'feedingOffered', 'feedingEaten', 'feedingResult', 'feedingNameRequired', 'feedingAmountInvalid']) {
      assert.match(source, new RegExp(`${key}:`), `${language}.${key}`);
    }
  }
});
