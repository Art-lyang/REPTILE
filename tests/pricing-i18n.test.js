const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const HTML = read('pricing.html');
const SRC = read('pricing-i18n.js');

/* 사전을 진짜로 실행해 봅니다. 정규식으로 키 이름만 훑으면 문법이 깨진
   파일도 통과합니다 — 실제로 다른 사전에서 한 번 겪었습니다. */
function load() {
  const nodes = [];
  const stub = () => ({ setAttribute() {}, getAttribute() { return null; }, textContent: '', innerHTML: '' });
  const win = {
    location: { search: '', href: 'https://ryangstudio.com/pricing.html' },
    navigator: { language: 'ko' },
    localStorage: { getItem: () => null, setItem() {} },
    URL, URLSearchParams,
    document: {
      readyState: 'complete',
      documentElement: {},
      title: '',
      querySelector: () => null,
      querySelectorAll: () => nodes,
      getElementById: () => null,
      addEventListener() {},
    },
  };
  new Function('window', SRC)(win);
  return win.PricingI18n;
}

const I18n = load();
const L = I18n.locales;
const LANGS = ['en', 'ja', 'zh'];
/* 언어와 무관하게 같아야 하는 것들입니다 — 코드값이라 번역 대상이 아닙니다. */
const NOT_TRANSLATED = ['htmlLang', 'ogLocale'];

test('Given the page ships four languages, when they load, then every key exists in each', () => {
  const base = Object.keys(L.ko);
  assert.ok(base.length > 50, '키가 ' + base.length + '개뿐입니다');
  LANGS.forEach(function (lang) {
    const missing = base.filter(key => !(key in L[lang]));
    assert.deepEqual(missing, [], lang + ' 에 빠진 키: ' + missing.join(', '));
    const extra = Object.keys(L[lang]).filter(key => base.indexOf(key) < 0);
    assert.deepEqual(extra, [], lang + ' 에만 있는 키: ' + extra.join(', '));
  });
});

test('Given a key is left untranslated, when that language loads, then Korean shows through', () => {
  /* 사전을 복사해 놓고 번역을 잊으면, 키는 다 있는데 화면은 한국어입니다.
     '있는지' 가 아니라 '다른지' 를 봐야 잡힙니다. */
  LANGS.forEach(function (lang) {
    const same = Object.keys(L.ko)
      .filter(key => NOT_TRANSLATED.indexOf(key) < 0)
      .filter(key => L[lang][key] === L.ko[key]);
    assert.deepEqual(same, [], lang + ' 에서 번역되지 않은 키: ' + same.join(', '));
  });
});

test('Given the page has markup hooks, when a key is renamed, then no slot silently falls back', () => {
  /* data-pt / data-ph 가 가리키는 키가 사전에 없으면 화면에 키 이름이 그대로
     나옵니다(t() 가 키를 돌려줍니다). 정적으로 대조합니다. */
  const used = new Set();
  const re = /data-(?:pt|ph)="([^"]+)"/g;
  let match;
  while ((match = re.exec(HTML)) !== null) used.add(match[1]);
  assert.ok(used.size > 50, '표시가 ' + used.size + '개뿐입니다');
  const unknown = [...used].filter(key => !(key in L.ko));
  assert.deepEqual(unknown, [], '사전에 없는 키를 가리킵니다: ' + unknown.join(', '));
});

test('Given a dictionary entry exists, when nothing uses it, then it is dead weight', () => {
  /* 메타·언어 선택기용 키는 코드가 직접 부르므로 표시가 없습니다. */
  const viaCode = ['htmlLang', 'ogLocale', 'pageTitle', 'metaDesc', 'ogDesc', 'language'];
  const used = new Set();
  const re = /data-(?:pt|ph)="([^"]+)"/g;
  let match;
  while ((match = re.exec(HTML)) !== null) used.add(match[1]);
  const unused = Object.keys(L.ko).filter(key => !used.has(key) && viaCode.indexOf(key) < 0);
  assert.deepEqual(unused, [], '쓰이지 않는 키: ' + unused.join(', '));
});

test('Given user copy carries markup, when it is inserted, then only our own strings use innerHTML', () => {
  /* data-ph 는 innerHTML 입니다. 사용자 입력이 이 길로 들어오면 안 됩니다.
     이 페이지는 사용자 입력을 받지 않지만, 나중에 붙일 사람을 위해 못 박아 둡니다. */
  assert.match(SRC, /node\.innerHTML = t\(node\.getAttribute\('data-ph'\)\)/);
  assert.match(SRC, /node\.textContent = t\(node\.getAttribute\('data-pt'\)\)/);
  /* 사전 밖의 값을 innerHTML 로 넣는 곳이 없어야 합니다.
     부정형 전방탐색(?!t\() 으로 쓰면 \s* 가 0글자를 잡는 쪽으로 역추적해서
     정작 t() 인 줄까지 위반으로 셉니다. 대입 자체를 세는 편이 확실합니다. */
  const assigns = SRC.match(/innerHTML\s*=/g) || [];
  assert.equal(assigns.length, 1, 'innerHTML 대입이 ' + assigns.length + '곳입니다');
});

test('Given a visitor arrives from an English screen, when the page opens, then the URL wins over saved choice', () => {
  /* 계산기를 영어로 보다가 요금 안내를 누르면 ?lang=en 이 따라옵니다.
     저장값을 먼저 보면 그 흐름이 끊겨 한국어로 돌아갑니다. */
  const order = SRC.slice(SRC.indexOf('function pick()'));
  const body = order.slice(0, order.indexOf('\n  }'));
  assert.ok(body.indexOf("get('lang')") < body.indexOf('getItem'), 'URL 을 먼저 봐야 합니다');
  assert.ok(body.indexOf('getItem') < body.indexOf('navigator'), '저장값이 브라우저 설정보다 먼저여야 합니다');
});

test('Given the visitor keeps a language, when they follow a link, then it travels with them', () => {
  /* 요금 안내를 영어로 보던 사람이 케어로그로 갔을 때 한국어로 돌아가면
     안 됩니다. mailto 와 바깥 주소는 건드리지 않습니다. */
  assert.match(SRC, /querySelectorAll\('a\[href\^="\/"\]'\)/);
  assert.match(SRC, /if \(!href \|\| href\.indexOf\('\?'\) >= 0\) return;/);
  /* #앵커는 lang 뒤에 붙어야 합니다. terms.html#terms?lang=ja 는 열리지 않습니다. */
  assert.match(SRC, /href \+ '\?lang=' \+ lang \+ hash/);
});

test('Given the picker sits in the corner, when a phone shows it, then it clears the title', () => {
  /* 이 규칙이 style 블록 위쪽에 있으면 뒤에 오는 header{padding:...} 이 같은
     특이도로 이겨서, 선택기가 제목 위에 겹칩니다. */
  const styleEnd = HTML.lastIndexOf('</style>');
  const tail = HTML.slice(styleEnd - 700, styleEnd);
  assert.match(tail, /@media \(max-width:430px\)\{[\s\S]*?header\{padding-top:58px\}/);
});

test('Given links now carry a language, when pricing is reached, then the callers pass it', () => {
  /* 번역 전에는 한국어 전용이라 lang 을 일부러 뺐습니다. 이제는 붙여야 합니다. */
  assert.match(read('care/care-ui.js'), /esc\(I\.url\('\/pricing\.html'\)\)/);
  assert.match(read('care/breeding-ui.js'), /I18n\.url\('\/pricing\.html'\)/);
  assert.match(read('gecko/login.html'), /LoginLocale\.url\('\/pricing\.html'\)/);
});
