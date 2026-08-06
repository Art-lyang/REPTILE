const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

/* 한 화면에서 Supabase 클라이언트가 둘 이상 만들어지면 supabase-js 가
   "Multiple GoTrueClient instances" 를 경고합니다. 같은 저장소 키를 두 클라이언트가
   나눠 쓰면 토큰 갱신이 서로 엇갈릴 수 있어서, 화면마다 하나로 유지합니다.

   기존 시험은 앱 파일 하나만 세어서, 헤더의 로그인 버튼이 자기 것을 따로 만드는
   경우를 놓쳤습니다. 여기서는 그 화면이 읽어들이는 파일을 전부 합쳐서 셉니다. */

/* 계산기별로 <script src> 에 올라가는 우리 파일들. CDN 은 라이브러리라 제외합니다. */
const PAGES = [
  { page: 'crested/index.html', dir: 'crested' },
  { page: 'fattail/index.html', dir: 'fattail' },
  { page: 'ballpython/index.html', dir: 'ballpython' },
  { page: 'gecko/index.html', dir: 'gecko' },
];

function localScripts(pageFile, dir) {
  const html = read(pageFile);
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  return srcs
    .filter(src => !/^https?:/.test(src))
    .map(src => src.split('?')[0])
    .map(src => (src.startsWith('/') ? src.slice(1)
      : src.startsWith('../') ? src.slice(3)
        : `${dir}/${src}`))
    .filter(file => fs.existsSync(path.resolve(__dirname, '..', file)));
}

PAGES.forEach(({ page, dir }) => {
  test(`Given ${page}, when every script it loads is counted, then only one Supabase client is created`, () => {
    const files = localScripts(page, dir);
    const creators = files.filter(file => /createClient\(/.test(read(file)));

    assert.ok(files.length > 0, `${page} 의 스크립트를 찾지 못했습니다`);
    assert.deepEqual(
      creators.length <= 1 ? [] : creators,
      [],
      `${page} 에서 클라이언트를 만드는 파일이 둘 이상입니다`,
    );
  });
});

test('Given the shared account button, when a page already made a client, then it reuses that one instead of making another', () => {
  const button = read('assets/account-btn.js');

  /* 페이지가 내준 클라이언트를 쓰되, 스스로 만들지는 않아야 합니다.
     예비로 하나 만들어 두면 그 화면에 클라이언트가 둘이 됩니다. */
  assert.match(button, /if \(w\.__studioSB\) return w\.__studioSB;/);
  assert.doesNotMatch(button, /createClient\(/);

  /* 계산기들은 자기 클라이언트를 내주어야 로그인 버튼이 그걸 씁니다 */
  ['crested/crested-app.js', 'fattail/fattail-app.js', 'ballpython/ball-app.js'].forEach((file) => {
    assert.match(read(file), /window\.__studioSB\s*=/, `${file} 이 클라이언트를 내주지 않습니다`);
  });
});
