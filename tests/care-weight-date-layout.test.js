const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Given a mobile-native date picker, when the weight form renders, then its date field cannot exceed the card width', () => {
  const css = read('care/animal-weight-date.css');

  assert.match(css, /#w_d\s*\{[^}]*min-inline-size:\s*0\s*!important/,
    'the weight date input must be allowed to shrink inside a narrow card');
  assert.match(css, /#w_d\s*\{[^}]*inline-size:\s*100%\s*!important/,
    'the weight date input must use only the available card width');
  assert.match(css, /#w_d\s*\{[^}]*max-inline-size:\s*100%\s*!important/,
    'the weight date input must never paint beyond the card width');
  assert.match(read('care/animal.html'), /animal-weight-date\.css\?v=20260804a/,
    'the live animal page must request the corrected stylesheet instead of a cached version');
});
