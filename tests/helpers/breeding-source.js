const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const BREEDING_FACTORIES = Object.freeze([
  /* 일괄 빠른 기록은 개체 패널보다 먼저 만들어져야 합니다 — 패널이 이것을
     받아서 체크상자와 막대를 그립니다. 목록 순서가 곧 <script> 순서입니다. */
  ['breeding-bulk-record.js', 'createBreedingBulkRecord'],
  ['breeding-animal-panel.js', 'createBreedingAnimalPanel'],
  ['breeding-pairing-panel.js', 'createBreedingPairingPanel'],
  ['breeding-mating-panel.js', 'createBreedingMatingPanel'],
  ['breeding-hatch-panel.js', 'createBreedingHatchPanel'],
  ['breeding-clutch-panel.js', 'createBreedingClutchPanel'],
  ['breeding-genetic-goal.js', 'createBreedingGeneticGoal'],
  ['breeding-events.js', 'createBreedingEvents'],
]);
const BREEDING_MODULES = Object.freeze([
  'breeding-ui.js',
  ...BREEDING_FACTORIES.map(([file]) => file),
]);

function breedingSource() {
  return BREEDING_MODULES.map((file) => (
    fs.readFileSync(path.join(root, 'care', file), 'utf8')
  )).join('\n');
}

module.exports = { BREEDING_FACTORIES, BREEDING_MODULES, breedingSource };
