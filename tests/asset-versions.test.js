const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/* 캐시 깨기용 ?v= 가 내용과 어긋나는 것을 잡습니다.
   ---------------------------------------------------------------------------
   이 실수는 눈에 안 띕니다. 우리가 보는 화면은 늘 새로 받은 것이라 멀쩡하고,
   예전에 한 번 열어 본 사람만 옛 파일을 계속 씁니다. 실제로 두 번 났습니다.

     · care-i18n-*.js 에 닉네임·인증 문구를 더하고 ?v= 를 안 올려서, 캐시가
       남은 사람에게는 브리더 페이지에 'nickHistory' 라는 글자가 그대로 보일
       상태였습니다(없는 키는 키 이름을 돌려줍니다).
     · index.html 만 account-btn.js?v=20260806a 를 부르고 있었는데, 그건
       Supabase 클라이언트를 두 번 만들던 판의 캐시 키였습니다.

   asset-versions.json 은 '지금 옳다고 확인한 상태' 입니다. 파일을 고쳤으면
   ?v= 를 올리고 아래 명령으로 다시 만드세요.

     node tests/asset-versions.test.js --update
*/

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(__dirname, 'asset-versions.json');
const SKIP = /^(dist|output|node_modules|\.git|\.omo|\.playwright-cli|scratchpad)/;

function htmlFiles(dir, out) {
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.test(entry.name) || entry.name.indexOf('dist-') === 0) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/* 어떤 파일이 어떤 ?v= 로 불리는지 모읍니다. 하네스 페이지도 셉니다 — 하네스가
   옛 버전을 부르면 우리가 확인한 것과 손님이 보는 것이 달라집니다. */
function collect() {
  const pins = new Map();
  for (const file of htmlFiles(ROOT)) {
    const html = fs.readFileSync(file, 'utf8');
    const re = /(?:src|href)="([^"?]+\.(?:js|css))\?v=([0-9a-zA-Z.]+)"/g;
    let match;
    while ((match = re.exec(html)) !== null) {
      const ref = match[1];
      const abs = ref.charAt(0) === '/' ? path.join(ROOT, ref) : path.join(path.dirname(file), ref);
      if (!fs.existsSync(abs)) continue;
      const key = path.relative(ROOT, abs).split(path.sep).join('/');
      if (!pins.has(key)) pins.set(key, { versions: new Set(), pages: new Map() });
      pins.get(key).versions.add(match[2]);
      pins.get(key).pages.set(path.relative(ROOT, file).split(path.sep).join('/'), match[2]);
    }
  }
  return pins;
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file)))
    .digest('hex').slice(0, 16);
}

function build() {
  const out = {};
  for (const key of [...collect().keys()].sort()) {
    out[key] = { version: [...collect().get(key).versions].sort().join('|'), sha256: digest(key) };
  }
  return out;
}

if (process.argv.includes('--update')) {
  const pins = collect();
  const out = {};
  for (const key of [...pins.keys()].sort()) {
    out[key] = { version: [...pins.get(key).versions].sort().join('|'), sha256: digest(key) };
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n');
  console.log('자산 ' + Object.keys(out).length + '개를 다시 기록했습니다.');
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const pins = collect();

test('Given a file is loaded with ?v=, when its content changes, then the version must change too', () => {
  const stale = [];
  for (const [file, info] of pins) {
    const known = manifest[file];
    if (!known) continue;                       // 새로 추가된 자산은 아래 검사에서 봅니다
    const version = [...info.versions].sort().join('|');
    if (digest(file) !== known.sha256 && version === known.version) {
      stale.push(file + ' (?v=' + version + ')');
    }
  }
  assert.deepEqual(stale, [],
    '내용이 바뀌었는데 ?v= 가 그대로입니다. 예전에 열어 본 사람은 옛 파일을 계속 씁니다:\n  '
    + stale.join('\n  ')
    + '\n?v= 를 올린 뒤  node tests/asset-versions.test.js --update  를 실행하세요.');
});

test('Given one file, when several pages load it, then they must ask for the same version', () => {
  /* 페이지마다 다른 ?v= 를 쓰면 캐시 칸이 갈립니다. 낮은 쪽을 부르는 페이지는
     옛 파일을 계속 쓰고, 우리는 다른 페이지에서 멀쩡한 것만 보게 됩니다. */
  const split = [];
  for (const [file, info] of pins) {
    if (info.versions.size > 1) {
      split.push(file + ' → ' + [...info.pages].map(p => p[0] + ':' + p[1]).join(', '));
    }
  }
  assert.deepEqual(split, [], '한 파일을 여러 버전으로 부릅니다:\n  ' + split.join('\n  '));
});

test('Given the manifest is the record, when an asset appears or disappears, then it is updated', () => {
  const now = [...pins.keys()].sort();
  const before = Object.keys(manifest).sort();
  const added = now.filter(f => before.indexOf(f) < 0);
  const gone = before.filter(f => now.indexOf(f) < 0);
  assert.deepEqual({ added: added, gone: gone }, { added: [], gone: [] },
    'asset-versions.json 이 실제와 다릅니다. node tests/asset-versions.test.js --update 를 실행하세요.');
});

test('Given a page references an asset, when the path is wrong, then nothing silently 404s', () => {
  /* ?v= 가 붙은 참조 중 파일이 없는 것을 찾습니다. collect() 는 없는 파일을
     조용히 건너뛰므로, 여기서 따로 봐야 합니다. */
  const missing = [];
  for (const file of htmlFiles(ROOT)) {
    const html = fs.readFileSync(file, 'utf8');
    const re = /(?:src|href)="([^"?]+\.(?:js|css))\?v=[0-9a-zA-Z.]+"/g;
    let match;
    while ((match = re.exec(html)) !== null) {
      const ref = match[1];
      if (/^https?:/.test(ref)) continue;
      const abs = ref.charAt(0) === '/' ? path.join(ROOT, ref) : path.join(path.dirname(file), ref);
      if (!fs.existsSync(abs)) {
        missing.push(path.relative(ROOT, file).split(path.sep).join('/') + ' → ' + ref);
      }
    }
  }
  assert.deepEqual(missing, [], '없는 파일을 부릅니다:\n  ' + missing.join('\n  '));
});
