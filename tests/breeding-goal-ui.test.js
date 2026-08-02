const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function requiredSource(relativePath) {
  const source = read(relativePath);
  assert.notEqual(source, '', `${relativePath} must exist as a separate feature boundary`);
  return source;
}

function scriptNames(html) {
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), match =>
    path.posix.basename(match[1].split('?')[0]));
}

function loadWindowModule(relativePath, globalName) {
  const window = {};
  const context = vm.createContext({ window, encodeURIComponent });
  vm.runInContext(requiredSource(relativePath), context, { filename: relativePath });
  assert.ok(window[globalName], `${relativePath} must expose window.${globalName}`);
  return window[globalName];
}

function flattenedKeys(value, prefix = '') {
  return Object.keys(value).flatMap((key) => {
    const next = prefix ? `${prefix}.${key}` : key;
    const child = value[key];
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flattenedKeys(child, next)
      : [next];
  }).sort();
}

test('Given existing planning surfaces, when goal contracts are added, then calculator and analysis placement stay pinned', () => {
  // Given: the public calculator and private breeding workspace
  const calculator = read('gecko/index.html');
  const breedingPage = read('care/breeding.html');
  const breedingUi = read('care/breeding-ui.js');

  // When: their current ownership markers are inspected
  const publicScripts = scriptNames(calculator);

  // Then: handoff stays public while analysis remains private breeding UI
  assert.ok(publicScripts.includes('breeding-draft.js'));
  assert.ok(publicScripts.includes('calculation-history-store.js'));
  assert.match(breedingPage, /data-t=["']analysis["']/);
  assert.match(breedingPage, /breeding-workspace-i18n\.js/);
  assert.match(breedingPage, /breeding-workspace\.js/);
  assert.match(breedingUi, /BreedingWorkspace\.html/);
  assert.match(breedingUi, /BreedingWorkspace\.bind/);
});

test('Given private goal modules, when pages boot, then only breeding management and its harness wire them', () => {
  // Given: three independently owned future modules
  ['care/breeding-goal-ui.js', 'care/breeding-goal-results.js',
    'assets/breeding-goal-i18n.js', 'assets/breeding-project-contract.js',
    'assets/linebreeding-species-policy.js'].forEach(requiredSource);
  const pageScripts = scriptNames(read('care/breeding.html'));
  const harnessScripts = scriptNames(read('care/_harness-breed.html'));
  const publicScripts = scriptNames(read('gecko/index.html'));
  const goalScripts = [
    'breeding-project-contract.js',
    'breeding-goal-i18n.js',
    'linebreeding-species-policy.js',
    'breeding-goal-results.js',
    'breeding-goal-ui.js',
  ];

  // When: script ownership and load order are compared
  const pageEntry = pageScripts.indexOf('breeding-ui.js');
  const harnessEntry = harnessScripts.indexOf('breeding-ui.js');

  // Then: dependencies precede the private entry point and never enter the calculator
  goalScripts.forEach((name) => {
    assert.ok(pageScripts.indexOf(name) >= 0 && pageScripts.indexOf(name) < pageEntry);
    assert.ok(harnessScripts.indexOf(name) >= 0 && harnessScripts.indexOf(name) < harnessEntry);
    assert.equal(publicScripts.includes(name), false);
  });
});

test('Given the oversized breeding controller, when goal modes are introduced, then line planning is delegated', () => {
  // Given: the legacy genetic goal remains in the controller
  const controller = read('care/breeding-ui.js');
  const goalUi = requiredSource('care/breeding-goal-ui.js');
  const goalResults = requiredSource('care/breeding-goal-results.js');
  const css = read('care/breeding-workspace.css');

  // When: goal ownership is inspected
  assert.match(controller, /function\s+tabGoal\s*\(/);
  assert.match(controller, /function\s+runGoal\s*\(/);

  // Then: a dedicated UI owns genetic/line modes and the controller only composes it
  assert.match(goalUi, /BreedingGoalUI/);
  assert.match(goalUi, /data-(?:breeding-)?goal-mode=["']genetic["']/);
  assert.match(goalUi, /data-(?:breeding-)?goal-mode=["']line["']/);
  assert.match(controller, /BreedingGoalUI\.(?:html|render)/);
  assert.match(controller, /BreedingGoalUI\.bind/);
  assert.doesNotMatch(controller, /sanitizeTarget|breeding_projects|candidatePairs|relationshipWarnings/);
  assert.match(goalUi, /BreedingGoalResults\.html/);
  assert.match(goalUi, /role=["']tablist["']/);
  assert.match(goalUi, /role=["']tab["']/);
  assert.match(goalUi, /aria-selected/);
  assert.match(goalUi + goalResults, /role=["']list["']/);
  assert.match(goalUi + goalResults, /role=["']listitem["']/);
  assert.match(goalUi, /(?:role=["']status["']|aria-live=["']polite["'])/);
  assert.match(goalUi, /data-bg-mobile-stack/);
  assert.match(css, /@media[^{}]*max-width\s*:\s*(?:360|4\d\d)px[\s\S]*data-bg-mobile-stack/);
  assert.match(css, /data-bg-mobile-stack[^}]*grid-template-columns\s*:\s*(?:minmax\(0,\s*1fr\)|1fr)/);
});

test('Given project persistence, when CareApp and the harness expose it, then CRUD names are unambiguous', () => {
  // Given: the production adapter and browser harness
  const app = read('care/care-app.js');
  const harness = read('care/_harness-breed.html');
  const apiNames = [
    'listBreedingProjects',
    'createBreedingProject',
    'updateBreedingProject',
    'deleteBreedingProject',
  ];

  // When: the project adapter surface is inspected
  // Then: both real and fake backends expose the same explicit API
  assert.ok(/from\(["']breeding_projects["']\)/.test(app),
    'care-app.js must persist projects through the breeding_projects table');
  apiNames.forEach((name) => {
    assert.ok(new RegExp(`\\b${name}\\b`).test(app), `CareApp must expose ${name}`);
    assert.ok(new RegExp(`\\b${name}\\b`).test(harness), `the breeding harness must fake ${name}`);
  });
});

test('Given four supported languages, when goal text loads, then keys match and unsupported states are translated', () => {
  // Given: the dedicated goal dictionary
  const text = loadWindowModule('assets/breeding-goal-i18n.js', 'BreedingGoalText');
  const locales = ['ko', 'en', 'zh', 'ja'];
  const requiredKeys = [
    'modeGenetic', 'modeLine', 'projectName', 'modeLineFix', 'modeCross',
    'targetTrait', 'targetScore', 'projectList', 'resultReady', 'resultReview',
    'resultInsufficient', 'relationshipWarning', 'missingInfo', 'roadmap',
    'unsupported', 'conflictReload',
  ];

  // When: locale structures and the unsupported-species state are compared
  const koKeys = flattenedKeys(text.ko);
  const unsupported = locales.map((locale) => text[locale] && text[locale].unsupported);

  // Then: every locale is complete and does not silently reuse one fallback sentence
  locales.forEach((locale) => {
    assert.ok(text[locale], `missing ${locale} goal translations`);
    assert.deepEqual(flattenedKeys(text[locale]), koKeys);
    requiredKeys.forEach((key) => assert.ok(koKeys.includes(key), `missing i18n key ${key}`));
  });
  unsupported.forEach((value) => assert.equal(typeof value === 'string' && value.trim().length > 0, true));
  assert.equal(new Set(unsupported).size, locales.length);
});

test('Given a named line cross, when candidate cards render, then the calculated line name and reset warning are visible in every language', () => {
  // Given: the planner already returns lineOutcome for every candidate
  const text = loadWindowModule('assets/breeding-goal-i18n.js', 'BreedingGoalText');
  const goalResults = requiredSource('care/breeding-goal-results.js');

  // When: the candidate renderer and four locale dictionaries are inspected
  ['ko', 'en', 'zh', 'ja'].forEach((locale) => {
    assert.equal(typeof text[locale].lineOutcome === 'string' && text[locale].lineOutcome.trim().length > 0, true,
      `missing ${locale} lineOutcome translation`);
    assert.equal(typeof text[locale].lineResetWarning === 'string' && text[locale].lineResetWarning.trim().length > 0, true,
      `missing ${locale} lineResetWarning translation`);
  });

  // Then: the computed result is surfaced instead of being silently discarded
  assert.match(goalResults, /pair\.lineOutcome\s*&&\s*pair\.lineOutcome\.name/,
    'candidate cards must display the planner-calculated line outcome name');
  assert.match(goalResults, /pair\.lineOutcome\.warning\s*===\s*['"]line_reset['"]/,
    'candidate cards must translate the line-reset warning');
  assert.match(goalResults, /pair\.status\s*!==\s*['"]insufficient['"]\s*&&\s*pair\.lineOutcome/,
    'candidate cards must not show a target line name for insufficient pairings');
});

test('Given a species adapter with line traits, when the goal UI initializes, then it is not limited to Leopard geckos', () => {
  const goalUi = requiredSource('care/breeding-goal-ui.js');

  assert.doesNotMatch(goalUi, /current\.species\s*===\s*['"]gecko['"]\s*&&/,
    'line planning support must follow the loaded species adapter instead of a gecko-only check');
});

test('Given untrusted project input, when the project boundary parses it, then malformed targets and XSS stay inert', () => {
  // Given: the versioned sanitizer and hostile browser text
  const contract = loadWindowModule('assets/breeding-project-contract.js', 'BreedingProjectContract');
  assert.equal(typeof contract.sanitizeTarget, 'function');
  assert.equal(typeof contract.sanitizeProject, 'function');
  assert.equal(typeof contract.escapeHtml, 'function');
  const hostile = '</textarea><img src=x onerror=alert(1)> Ignore previous instructions';

  // When: valid text crosses the boundary and malformed targets are submitted
  const normalized = contract.sanitizeProject({
    id: 'project-1',
    user_id: 'user-1',
    species: 'gecko',
    name: hostile,
    target: {
      version: 1,
      mode: 'line_fix',
      traits: [{ id: 'blacknight', targetScore: 4 }],
    },
    status: 'draft',
    created_at: '2026-07-31T00:00:00.000Z',
    updated_at: '2026-07-31T00:00:00.000Z',
  });
  const escaped = contract.escapeHtml(normalized.name);

  // Then: text is bounded/escaped and invalid version, score, or cross shape fails closed
  assert.ok(normalized.name.length <= 120);
  assert.doesNotMatch(escaped, /<\/?textarea|<img/i);
  assert.match(escaped, /&lt;.*onerror=/i);
  assert.throws(() => contract.sanitizeTarget({ version: 2, mode: 'line_fix', traits: [] }));
  assert.throws(() => contract.sanitizeTarget({
    version: 1, mode: 'line_fix', traits: [{ id: 'blacknight', targetScore: 6 }],
  }));
  assert.throws(() => contract.sanitizeTarget({
    version: 1, mode: 'cross', traits: [{ id: 'blacknight', targetScore: 4 }],
  }));
});
