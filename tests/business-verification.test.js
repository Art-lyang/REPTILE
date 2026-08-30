const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

const SQL = read('supabase_v60.sql');
const LOGIN = read('gecko/login.html');
const ADMIN = read('admin/admin-business.js');
const PUB = read('care/pub-ui.js');
const BREEDER = read('care/breeder-ui.js');

test('Given a business number is stored, when it is published, then it never leaves the server', () => {
  /* 공개 함수가 돌려주는 것은 상호명과 로고뿐이어야 합니다. 등록번호가 한 번
     새어 나가면 주워 담을 수 없습니다. */
  /* v62 가 이 함수를 다시 씁니다. 최신 정의를 봐야 합니다 — v60 것만 보면
     이미 갈아엎은 함수를 검사하는 셈입니다. */
  const V62 = read('supabase_v62.sql');
  const fn = V62.slice(V62.indexOf('function public.public_breeder_badge'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  assert.doesNotMatch(body, /biz_number/);
  /* 인증 표시는 승인된 경우에만. 이미지는 있어도 표시는 안 붙습니다. */
  assert.match(body, /b\.status = 'approved'/);
  assert.match(body, /'verified', exists \(select 1 from biz\)/);
  assert.match(body, /a\.share_token = p_token and a\.is_public = true and a\.public_breeder = true/);
});

test('Given the table holds registration numbers, when clients connect, then they cannot read it directly', () => {
  assert.match(SQL, /alter table public\.business_verifications enable row level security;/);
  assert.match(SQL, /revoke all on public\.business_verifications from anon, authenticated;/);
});

test('Given only premium may apply, when the request arrives, then the server checks it', () => {
  /* 화면에서도 감추지만 화면 조건문은 개발자도구로 넘어갑니다. */
  const fn = SQL.slice(SQL.indexOf('function public.apply_business_verification'));
  assert.match(fn.slice(0, fn.indexOf('$$;')), /care_is_premium\(actor\)[\s\S]*?BIZ_PREMIUM_REQUIRED/);
});

test('Given a registration number is typed loosely, when it is stored, then only the digits are kept', () => {
  /* 123-45-67890 · 1234567890 · 123 45 67890 이 다 들어옵니다. 그대로 두면
     같은 업체가 다른 번호로 보여 중복 검사가 헛돕니다. */
  assert.match(SQL, /function private\.biz_digits/);
  assert.match(SQL, /regexp_replace\(coalesce\(p_value, ''\), '\[\^0-9\]', '', 'g'\)/);
  assert.match(SQL, /length\(digits\) <> 10[\s\S]{0,120}BIZ_NUMBER_INVALID/);
  /* 승인된 번호가 겹치면 막습니다. 같은 사업자가 계정 둘로 인증받을 수 없습니다. */
  assert.match(SQL, /BIZ_NUMBER_TAKEN/);
});

test('Given a logo address is submitted, when it points elsewhere, then it is rejected', () => {
  /* 남의 서버 주소를 그대로 두면 그쪽에서 이미지를 바꿔치기할 수 있고,
     우리 화면에 무엇이 뜰지 우리가 모르게 됩니다. */
  assert.match(SQL, /function private\.is_our_logo/);
  assert.match(SQL, /position\('\/breeder-logos\/' in coalesce\(p_url, ''\)\) > 0/);
  assert.match(SQL, /is_our_logo\(p_logo\)[\s\S]{0,90}BIZ_LOGO_INVALID/);
});

test('Given the logo bucket is public, when types are allowed, then SVG is not among them', () => {
  /* SVG 는 스크립트를 품을 수 있습니다. 남이 올린 것을 그대로 내주는 자리에
     둘 형식이 아닙니다. */
  /* 주석에도 'SVG' 라는 글자가 나옵니다. 목록 자체만 떼어 봐야 합니다 —
     주석까지 같이 보면 '왜 뺐는지' 를 적어 둔 문장이 위반으로 잡힙니다. */
  const list = /allowed_mime_types[\s\S]*?(array\[[^\]]*\])/.exec(SQL);
  assert.ok(list, 'allowed_mime_types 목록을 찾지 못했습니다');
  assert.equal(list[1], "array['image/png', 'image/jpeg', 'image/webp']");
  assert.doesNotMatch(list[1], /svg/i);
});

test('Given a member uploads a logo, when the path is written, then it must be their own', () => {
  assert.match(SQL, /create policy bl_insert on storage\.objects[\s\S]*?starts_with\(name, 'b\/u_' \|\| \(select auth\.uid\(\)\)::text \|\| '_'\)/);
  assert.match(LOGIN, /'b\/u_'\+uid\+'_'\+Date\.now\(\)/);
});

test('Given an approved business changes only its logo, when it saves, then approval is kept', () => {
  /* 상호명이나 번호가 바뀌면 다시 확인해야 하지만, 로고 교체까지 승인을 풀면
     그때마다 심사가 밀립니다. */
  assert.match(SQL, /function public\.set_my_breeder_logo/);
  assert.match(SQL, /where user_id = actor and status = 'approved'/);
  assert.match(LOGIN, /b\.status==='approved' && nameSame && numSame\)\s*\n?\s*\? await SB\.rpc\('set_my_breeder_logo'/);
  /* 반대로 상호명이 바뀌면 신청으로 돌아가야 합니다. */
  assert.match(SQL, /on conflict \(user_id\) do update\s*\n\s*set status = 'pending'/);
});

test('Given a logo is a brand asset, when it is uploaded, then it is not silently re-encoded', () => {
  /* ImgTool.resize 는 JPEG 로 다시 굽습니다. 투명한 PNG 로고가 들어오면 뒤가
     까맣게 칠해집니다 — 남의 상표를 우리가 말없이 바꿀 일이 아닙니다. */
  const fn = LOGIN.slice(LOGIN.indexOf('async function uploadLogo'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.doesNotMatch(body, /ImgTool|resize/);
  assert.match(body, /BIZ_LOGO_SIZE/);
  assert.match(body, /BIZ_LOGO_TYPE/);
});

test('Given v60 is not applied, when a public page loads, then the card still renders', () => {
  /* 배지 하나 때문에 개체 카드나 브리더 페이지가 안 뜨면 안 됩니다. */
  assert.match(PUB, /catch \(e\) \{ \/\* 배지는 없어도 됩니다 \*\/ \}/);
  assert.match(BREEDER, /catch \(error\) \{ \/\* 배지는 없어도 됩니다 \*\/ \}/);
  assert.match(LOGIN, /async function bizStatus[\s\S]{0,200}return r\.error\? null : r\.data/);
  /* 프리미엄이 아니거나 v60 이전이면 신청 칸을 아예 안 그립니다. */
  assert.match(LOGIN, /if\(!first \|\| !first\.premium\) return;/);
});

test('Given an admin reviews an application, when they reject it, then a reason is required', () => {
  /* 사유를 안 적으면 왜 안 됐는지 묻는 문의가 그대로 돌아옵니다. */
  assert.match(ADMIN, /window\.prompt\([\s\S]{0,140}반려/);
  assert.match(ADMIN, /if \(!String\(note\)\.trim\(\)\) \{ window\.alert\('반려 사유를 적어 주세요\.'\); return; \}/);
  /* 취소(null)와 빈 문자열은 다릅니다 — 취소는 아무 일도 없어야 합니다. */
  assert.match(ADMIN, /if \(note === null\) return;/);
  /* 삭제는 되돌릴 수 없습니다. */
  assert.match(ADMIN, /window\.confirm\([\s\S]{0,120}되돌릴 수 없습니다/);
});

test('Given the admin adds a business directly, when the id is a typo, then it is caught before the round trip', () => {
  assert.match(ADMIN, /admin_upsert_business/);
  assert.match(ADMIN, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/);
  assert.match(ADMIN, /replace\(\/\[\^0-9\]\/g, ''\)\.length !== 10/);
});

test('Given a logo fails to load, when the fallback runs, then it does not rely on inline handlers', () => {
  /* onerror 속성으로 적으면 script-src 의 unsafe-inline 에 기대게 되고,
     나중에 그걸 떼는 순간 조용히 안 돌게 됩니다. */
  assert.doesNotMatch(ADMIN, /onerror=/);
  assert.match(ADMIN, /addEventListener\('error', fail\)/);
  /* 캐시된 404 는 error 가 다시 오지 않습니다. */
  assert.match(ADMIN, /if \(img\.complete && img\.naturalWidth === 0\) fail\(\);/);
});

test('Given only the highest admin may decide, when the function runs, then it checks the caller', () => {
  ['admin_decide_business', 'admin_upsert_business'].forEach(function (fn) {
    const body = SQL.slice(SQL.indexOf('function public.' + fn));
    assert.match(body.slice(0, body.indexOf('$$;')), /is_owner_user\(actor\)[\s\S]{0,90}ADMIN_OWNER_REQUIRED/, fn);
  });
  assert.match(SQL, /function public\.admin_business_list[\s\S]{0,160}is_admin\(\)/);
  assert.doesNotMatch(SQL, /grant execute on function public\.admin_[a-z_]*business[a-z_]*\([^)]*\) to anon/);
});

test('Given the badge is shown, when the name is long, then the logo replaces the icon instead of stacking', () => {
  /* 이름 뒤에 로고를 덧붙이면 줄이 길어져 좁은 화면에서 브리더명이 잘립니다. */
  /* v62 부터는 그림 하나를 image 로 받습니다 — 승인된 곳은 로고, 아니면
     본인이 올린 프로필 이미지입니다. 화면이 둘 중 무엇인지 고르지 않습니다. */
  assert.match(PUB, /badge && badge\.image\s*\n?\s*\? '<img class="pbizlogo"[\s\S]{0,120}: icon\('bi-person-badge'\)/);
  assert.match(BREEDER, /badge && badge\.image\s*\n?\s*\? '<img src="[\s\S]{0,120}: icon\('bi-person-heart'\)/);
  /* 어떤 비율로 올라올지 모르니 contain 이어야 합니다. cover 면 양끝이 잘려
     무슨 상표인지 알아볼 수 없습니다. */
  const css = read('care/public-profile.css');
  assert.match(css, /\.pbizlogo\{[^}]*object-fit:contain/);
  assert.match(css, /\.breeder-mark\.has-logo img\{[^}]*object-fit:contain/);
});

test('Given the CSP allows only known image hosts, when a logo is served, then it comes from Supabase', () => {
  /* 공개 버킷 주소는 Supabase 도메인입니다. img-src 에 없으면 로고가 안 뜹니다. */
  const headers = read('_headers');
  assert.match(headers, /img-src[^;]*https:\/\/icjuhsktqcfloiqdfxtm\.supabase\.co/);
});

test('Given the badge strings, when a language is missing one, then Korean leaks into that screen', () => {
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    assert.match(read('care/care-i18n-' + lang + '.js'), /bizVerifiedTitle\s*:/, lang);
  });
  const keys = ['bizTitle', 'bizName', 'bizNumber', 'bizApply', 'bizSaveLogo', 'bizHint',
    'bizStatusPending', 'bizStatusApproved', 'bizStatusRejected', 'bizRejectedNote',
    'bizPremiumOnly', 'bizNumberInvalid', 'bizNumberTaken', 'bizLogoType', 'bizLogoSize'];
  ['ko', 'en', 'ja', 'zh'].forEach(function (lang) {
    const dict = read('gecko/login-i18n-' + lang + '.js');
    keys.forEach(key => assert.match(dict, new RegExp(key + '\\s*:'), lang + ' 에 ' + key + ' 가 없습니다'));
  });
});
