const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

function loadCarePhotos(lang = 'ko') {
  const source = read('care/care-photos.js');
  assert.notEqual(source, '', 'the shared care photo module must exist');

  const objectUrls = [];
  const revokedUrls = [];
  const window = {
    Photo: {
      tag: (url, alt) => `<img src="${url}" alt="${alt}">`,
      hydrate: () => {},
      removeMany: async (_sb, urls) => ({
        removed: urls.slice(),
        ignored: [],
        failed: [],
      }),
    },
    PhotoCropper: {
      open: async (file) => file,
    },
  };
  const document = { documentElement: { lang } };
  const URL = {
    createObjectURL: (file) => {
      const url = `blob:${file.name}`;
      objectUrls.push(url);
      return url;
    },
    revokeObjectURL: (url) => revokedUrls.push(url),
  };
  const context = vm.createContext({ window, document, URL, console });
  vm.runInContext(source, context, { filename: 'care/care-photos.js' });
  return { api: window.CarePhotos, window, objectUrls, revokedUrls };
}

function loadPhotoApi() {
  const source = read('assets/photo.js');
  const window = {};
  const context = vm.createContext({
    window,
    Date,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context, { filename: 'assets/photo.js' });
  return window.Photo;
}

test('Given duplicate animal photos, when normalized, then one cover and at most three unique extras remain', () => {
  // Given: duplicated and oversized photo input
  const { api } = loadCarePhotos();

  // When: the profile is normalized at the boundary
  const normalized = api.normalize({
    photo_url: 'cover.jpg',
    photos: ['cover.jpg', 'one.jpg', 'one.jpg', 'two.jpg', 'three.jpg', 'four.jpg'],
  });

  // Then: the persisted contract is cover + three extras
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    photo_url: 'cover.jpg',
    photos: ['one.jpg', 'two.jpg', 'three.jpg'],
  });
  assert.equal(api.MAX_EXTRA, 3);
});

test('Given a selected replacement, when the edit is cancelled, then no remote upload occurs', async () => {
  // Given: an existing profile and an upload spy
  const { api, revokedUrls } = loadCarePhotos();
  let uploads = 0;
  api.begin(
    { photo_url: 'old.jpg', photos: [] },
    { uploadPhoto: async () => { uploads += 1; return 'new.jpg'; }, sb: {} },
  );

  // When: a local file is selected and the form is cancelled
  await api.select('cover', { name: 'replacement.jpg', type: 'image/jpeg' });
  await api.cancel();

  // Then: selection was only a local preview
  assert.equal(uploads, 0);
  assert.deepEqual(revokedUrls, ['blob:replacement.jpg']);
});

test('Given a saved replacement, when commit finishes, then only superseded remote photos are removed', async () => {
  // Given: an old cover and extra photo
  const { api, window } = loadCarePhotos();
  const removed = [];
  window.Photo.removeMany = async (_sb, urls) => {
    removed.push(...urls);
    return { removed: urls.slice(), ignored: [], failed: [] };
  };
  api.begin(
    { photo_url: 'old-cover.jpg', photos: ['old-extra.jpg'] },
    { uploadPhoto: async () => 'new-cover.jpg', sb: {} },
  );
  await api.select('cover', { name: 'new-cover.jpg', type: 'image/jpeg' });
  api.remove('extra-0');

  // When: pending files are uploaded, persisted, and committed
  const values = await api.prepare();
  const cleanup = await api.commit(values);

  // Then: the new cover stays and old references are removed
  assert.deepEqual(JSON.parse(JSON.stringify(values)), {
    photo_url: 'new-cover.jpg',
    photos: [],
  });
  assert.deepEqual(removed.sort(), ['old-cover.jpg', 'old-extra.jpg']);
  assert.equal(cleanup.ok, true);
});

test('Given a database save failure, when prepared uploads roll back, then the new Storage object is removed', async () => {
  // Given: a prepared new extra photo
  const { api, window } = loadCarePhotos();
  const removed = [];
  window.Photo.removeMany = async (_sb, urls) => {
    removed.push(...urls);
    return { removed: urls.slice(), ignored: [], failed: [] };
  };
  api.begin(
    { photo_url: null, photos: [] },
    { uploadPhoto: async () => 'prepared-extra.jpg', sb: {} },
  );
  await api.select('extra-0', { name: 'extra.jpg', type: 'image/jpeg' });

  // When: upload preparation succeeds but persistence fails
  await api.prepare();
  const rollback = await api.rollback();

  // Then: the uploaded object is removed and the local selection remains retryable
  assert.deepEqual(removed, ['prepared-extra.jpg']);
  assert.equal(rollback.ok, true);
  assert.equal(api.values().photos.length, 0);
});

test('Given Storage cleanup fails, when saving is retried, then the prepared object is reused instead of uploaded twice', async () => {
  const { api, window } = loadCarePhotos();
  let uploads = 0;
  window.Photo.removeMany = async (_sb, urls) => ({
    removed: [],
    ignored: [],
    failed: urls.slice(),
  });
  api.begin(
    { photo_url: null, photos: [] },
    { uploadPhoto: async () => { uploads += 1; return 'retry-extra.jpg'; }, sb: {} },
  );
  await api.select('extra-0', { name: 'retry.jpg', type: 'image/jpeg' });

  await api.prepare();
  const rollback = await api.rollback();
  const retried = await api.prepare();

  assert.equal(rollback.ok, false);
  assert.equal(uploads, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(retried.photos)), ['retry-extra.jpg']);
});

test('Given another document language, when photo labels render, then feature text uses i18n keys', () => {
  // Given: an English care page
  const { api } = loadCarePhotos('en');
  api.begin({ photo_url: null, photos: [] }, { uploadPhoto: async () => '', sb: {} });

  // When: the editor is rendered
  const html = api.editorHtml();

  // Then: visible and accessible photo labels are localized
  assert.match(html, /Profile photo/);
  assert.match(html, /Additional photos/);
  assert.doesNotMatch(html, /프로필 사진/);
});

test('Given an existing photo, when crop editing is cancelled, then the existing selection remains unchanged', async () => {
  // Given
  const { api, window, objectUrls } = loadCarePhotos();
  window.PhotoCropper.open = async () => null;
  api.begin(
    { photo_url: 'old-cover.jpg', photos: [] },
    { uploadPhoto: async () => 'unused.jpg', sb: {} },
  );

  // When
  const selected = await api.select('cover', {
    name: 'cancelled.jpg',
    type: 'image/jpeg',
  });

  // Then
  assert.equal(selected, false);
  assert.equal(api.values().photo_url, 'old-cover.jpg');
  assert.deepEqual(objectUrls, []);
});

test('Given one cover and three extras, when the shared gallery renders, then all four photos are reachable', () => {
  // Given: the maximum supported gallery
  const { api } = loadCarePhotos();

  // When: the shared public/internal strip is rendered
  const html = api.stripHtml({
    photo_url: '/cover.jpg',
    photos: ['/extra-1.jpg', '/extra-2.jpg', '/extra-3.jpg'],
  }, '🦎');

  // Then: one main image and three selectable thumbnails are present
  assert.equal((html.match(/<img/g) || []).length, 4);
  assert.equal((html.match(/data-care-photo-view=/g) || []).length, 3);
});

test('Given malformed or duplicate private photo URLs, when Storage cleanup runs, then decoding is safe and paths are deduplicated', async () => {
  // Given: a malformed URL and duplicate valid private URLs
  const photo = loadPhotoApi();
  const removedPaths = [];
  const sb = {
    storage: {
      from: () => ({
        remove: async (paths) => {
          removedPaths.push(...paths);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  const valid = 'https://project.supabase.co/storage/v1/object/public/animal-photos/a/u_owner_1.jpg';

  // When: paths are parsed and removed
  const malformed = photo.pathOf('https://project/animal-photos/%E0%A4%A');
  const outcome = await photo.removeMany(sb, [valid, valid, '/legacy.jpg']);

  // Then: malformed input cannot crash rendering and only owned-bucket paths reach Storage
  assert.equal(malformed, null);
  assert.deepEqual(removedPaths, ['a/u_owner_1.jpg']);
  assert.equal(outcome.failed.length, 0);
});

test('Given large iPhone widths, when care forms render, then date inputs stack and remain bounded', () => {
  // Given: the shared care stylesheet
  const css = read('care/care.css');

  // When/Then: 430–440px devices are covered and native date controls are bounded
  assert.match(css, /@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*?\.row2\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(css, /\.row2\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /input\.in\[type=["']date["']\]\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
});

test('Given care animal pages, when they boot, then editing and detail views share the bounded photo workflow', () => {
  // Given: care entry pages and their UI modules
  const pages = ['care/index.html', 'care/animal.html', 'care/breeding.html', 'care/p.html'];
  const careUi = read('care/care-ui.js');
  const animalUi = read('care/animal-ui.js');
  const breedingUi = read('care/breeding-ui.js');
  const pubUi = read('care/pub-ui.js');
  const photoModule = read('care/care-photos.js');

  // When/Then: every relevant page loads the shared boundary before its UI
  for (const page of pages) {
    assert.match(read(page), /care-photos\.js\?v=/, `${page} must load the shared photo module`);
  }
  assert.match(careUi, /CarePhotos\.editorHtml/);
  assert.match(careUi, /CarePhotos\.prepare/);
  assert.match(careUi, /CarePhotos\.commit/);
  assert.match(animalUi, /CarePhotos\.galleryHtml/);
  assert.match(breedingUi, /CarePhotos\.editorHtml/);
  assert.match(pubUi, /CarePhotos\.stripHtml/);
  assert.match(photoModule, /querySelector\(['"]#animalPhotoEditor['"]\)/);
});

test('Given photo metadata from the browser, when the database migration is applied, then count and ownership are server-enforced', () => {
  // Given: the next care photo migration and fresh setup
  const migration = read('supabase_v30.sql');
  const setup = read('supabase_setup.sql');

  // When/Then: both upgrade and fresh install enforce cover + three owned extras
  assert.match(migration, /cardinality\(new\.photos\)\s*>\s*3/i);
  assert.match(migration, /owner_id\s*=\s*\(select auth\.uid\(\)::text\)/i);
  assert.match(migration, /a\.user_id::text\s*=\s*storage\.objects\.owner_id/i);
  assert.match(migration, /split_part\([^;]+\/animal-photos\//i);
  assert.match(migration, /set search_path\s*=\s*''/i);
  assert.doesNotMatch(migration, /like\s+'%\/'\s*\|\|\s*storage\.objects\.name/i);
  assert.match(setup, /photos\s+text\[\]\s+not null default '\{\}'/i);
  assert.match(setup, /care_animal_photos_guard/i);
  assert.doesNotMatch(setup, /animal-photos (bucket|policies) setup failed/i);
});
