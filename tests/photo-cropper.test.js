const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadCropper(lang = 'ko') {
  const window = {};
  const document = { documentElement: { lang } };
  const context = vm.createContext({ window, document, console });
  vm.runInContext(read('care/photo-cropper-i18n.js'), context, {
    filename: 'care/photo-cropper-i18n.js',
  });
  vm.runInContext(read('care/photo-cropper-geometry.js'), context, {
    filename: 'care/photo-cropper-geometry.js',
  });
  vm.runInContext(read('care/photo-cropper.js'), context, {
    filename: 'care/photo-cropper.js',
  });
  return window.PhotoCropper;
}

test('Given a landscape image, when the 4:3 frame is fitted, then the whole image is the initial crop', () => {
  // Given
  const cropper = loadCropper();

  // When
  const crop = cropper.geometry.sourceRect({
    imageWidth: 1600,
    imageHeight: 1200,
    stageWidth: 400,
    stageHeight: 300,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), {
    sx: 0,
    sy: 0,
    sw: 1600,
    sh: 1200,
  });
});

test('Given a portrait image, when it is dragged past the frame edge, then the crop remains inside the image', () => {
  // Given
  const cropper = loadCropper();

  // When
  const crop = cropper.geometry.sourceRect({
    imageWidth: 1200,
    imageHeight: 1600,
    stageWidth: 400,
    stageHeight: 300,
    zoom: 1,
    offsetX: 999,
    offsetY: 999,
  });

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), {
    sx: 0,
    sy: 0,
    sw: 1200,
    sh: 900,
  });
});

test('Given a zoomed image, when the crop is calculated, then the selected source area becomes smaller', () => {
  // Given
  const cropper = loadCropper();

  // When
  const crop = cropper.geometry.sourceRect({
    imageWidth: 1600,
    imageHeight: 1200,
    stageWidth: 400,
    stageHeight: 300,
    zoom: 2,
    offsetX: 0,
    offsetY: 0,
  });

  // Then
  assert.deepEqual(JSON.parse(JSON.stringify(crop)), {
    sx: 400,
    sy: 300,
    sw: 800,
    sh: 600,
  });
});

test('Given supported care editors, when they boot, then the cropper loads before the photo workflow', () => {
  // Given
  const pages = [
    'care/index.html',
    'care/breeding.html',
    'care/_harness.html',
    'care/_harness-breed.html',
  ];

  // When/Then
  for (const page of pages) {
    const html = read(page);
    const cropperAt = html.indexOf('photo-cropper.js?v=');
    const photosAt = html.indexOf('care-photos.js?v=');
    assert.notEqual(cropperAt, -1, `${page} must load the cropper`);
    assert.ok(cropperAt < photosAt, `${page} must load the cropper before care photos`);
  }
});

test('Given a new production module, when the deployment bundle is built, then untracked public files are included', () => {
  // Given
  const build = read('build.sh');

  // When/Then
  assert.match(build, /git\s+-c\s+core\.quotepath=false\s+ls-files\s+[^|\n]*--others[^|\n]*--exclude-standard/);
});

test('Given local QA and orchestration artifacts, when the deployment bundle is built, then private work files are excluded', () => {
  const build = read('build.sh');

  for (const privatePath of ['.omo/*', '.playwright-cli/*', 'output/*', 'qa-artifacts/*', 'plans/*', 'dist-*/*', '.debug-journal.md', '.test-output*']) {
    assert.ok(build.includes(privatePath), `build.sh must exclude ${privatePath}`);
  }
});

test('Given the crop editor strings, when another language is active, then visible guidance is localized', () => {
  // Given
  const cropper = loadCropper('en');

  // When/Then
  assert.equal(cropper.t('coverTitle'), 'Adjust profile photo');
  assert.match(cropper.t('profileGuide'), /profile-safe area/i);
});
