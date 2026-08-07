const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const SQL = read('supabase_v62.sql');
const LOGIN = read('gecko/login.html');
const PUB = read('care/pub-ui.js');
const BREEDER = read('care/breeder-ui.js');

test('Given an image is uploaded, when it is shown, then it does not imply verification', () => {
  /* 이미지는 '나를 알아보게 하는 것' 이고 인증 표시는 '우리가 확인했다는 것'
     입니다. 이미지를 올렸다고 확인된 것이 되면 인증 표시가 아무 뜻도 없어집니다. */
  const fn = SQL.slice(SQL.indexOf('function public.public_breeder_badge'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  assert.match(body, /'verified', exists \(select 1 from biz\)/);
  /* image 는 승인 로고가 있으면 그것, 없으면 본인 프로필 이미지입니다. */
  assert.match(body, /'image', coalesce\(\s*\n?\s*\(select logo_url from biz\),\s*\n?\s*\(select p\.avatar_url/);

  /* new RegExp('...\s...') 는 문자열 안에서 \s 가 s 로 먹혀 [sS] 가 됩니다.
     리터럴로 적습니다. */
  assert.match(PUB, /badge && badge\.verified \? '<i class="bi bi-patch-check-fill pbizmark"/);
  assert.match(BREEDER, /badge && badge\.verified \? '<i class="bi bi-patch-check-fill breeder-mark-check"/);
});

test('Given no business, when a member uploads an image, then it still appears', () => {
  /* 인증 없이 프로필 이미지만 올린 브리더가 대부분일 것입니다. 예전 조건
     (biz_name 이 있을 때만)을 그대로 두면 그 사람들 이미지가 안 나옵니다. */
  assert.match(PUB, /b\.data && \(b\.data\.image \|\| b\.data\.verified\)/);
  assert.match(BREEDER, /b\.data && \(b\.data\.image \|\| b\.data\.verified\)/);
});

test('Given the image is a circle beside the name, when it renders, then the shape is kept', () => {
  const css = read('care/public-profile.css');
  assert.match(css, /\.pbizlogo\{[^}]*border-radius:50%/);
  assert.match(css, /\.pbizlogo\{[^}]*width:20px/);
});

test('Given anyone may set an image, when they do, then premium is not required', () => {
  /* 인증과 무관하게 누구나 씁니다. 계정 화면에서도 프리미엄을 묻지 않습니다. */
  const fn = SQL.slice(SQL.indexOf('function public.set_my_avatar'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  assert.doesNotMatch(body, /care_is_premium/);
  /* 사업자 칸은 여전히 프리미엄만 그립니다 — 두 칸은 별개입니다. */
  assert.match(LOGIN, /async function renderAvatarBox/);
  const box = LOGIN.slice(LOGIN.indexOf('async function renderAvatarBox'));
  assert.doesNotMatch(box.slice(0, box.indexOf('async function renderBusinessBox')), /premium/);
});

test('Given profiles are writable by their owner, when an address is set, then the table checks it', () => {
  /* profiles_self_write 때문에 PostgREST 로 avatar_url 에 아무 주소나 넣을 수
     있습니다. RPC 안에서만 검사하면 그 길이 열린 채로 남습니다. */
  assert.match(SQL, /add constraint profiles_avatar_ours check \(private\.is_our_logo\(avatar_url\)\)/);
  assert.match(SQL, /AVATAR_INVALID/);
});

test('Given a member has no profile row, when they set an image, then one is created', () => {
  /* 동의만 하고 정보를 안 적은 회원은 profiles 줄이 없습니다. update 만 하면
     아무 일도 안 일어나고 본인은 저장된 줄 압니다(v58 에서 겪은 것과 같음). */
  assert.match(SQL, /insert into public\.profiles\(user_id, avatar_url\)[\s\S]{0,160}on conflict \(user_id\) do update/);
});

test('Given older pages are still cached, when the badge is read, then logo_url survives one round', () => {
  /* 배포가 도는 동안 옛 화면이 logo_url 을 볼 수 있습니다. 같이 담아 두지
     않으면 그 사이 인증 업체의 로고가 사라집니다. */
  assert.match(SQL, /'logo_url', \(select logo_url from biz\)/);
});

test('Given the account screen, when the image is set, then it can also be removed', () => {
  /* 올릴 수만 있고 못 지우면, 잘못 올린 사람은 다른 이미지로 덮는 수밖에
     없습니다. 비우는 길이 있어야 합니다. */
  assert.match(LOGIN, /avatarClear/);
  assert.match(LOGIN, /SB\.rpc\('set_my_avatar',\{p_url:null\}\)/);
});

test('Given the new copy, when a language is missing a line, then Korean shows through', () => {
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    const dict = read('gecko/login-i18n-' + lang + '.js');
    ['avatarTitle', 'avatarPick', 'avatarClear', 'avatarHint'].forEach(function (key) {
      assert.match(dict, new RegExp(key + '\s*:'), lang + ' 에 ' + key + ' 가 없습니다');
    });
  });
});
