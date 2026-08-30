const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Given a breeding animal with no photo, when its mobile card renders, then metadata stays on one row and the photo slot is empty', () => {
  const panel = read('care/breeding-animal-panel.js');
  const css = read('care/care.css');

  assert.match(panel, /class="thumb thumb-empty"/);
  assert.doesNotMatch(panel, /class="thumb empty"/);
  assert.doesNotMatch(panel, /:\s*['"]🦎['"]/);
  assert.match(panel, /class="animal-card-heading"/);
  assert.match(panel, /class="animal-card-name"/);
  assert.match(panel, /class="animal-card-meta"/);
  assert.match(css, /\.animal-card-heading\s*\{/);
  assert.match(css, /\.animal-card-meta\s*\{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(css, /\.animal-card-meta\s+\.chip\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.thumb\.thumb-empty\s*\{/);
});
