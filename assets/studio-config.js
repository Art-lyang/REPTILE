/* =============================================================================
   량 스튜디오 공용 설정
   -----------------------------------------------------------------------------
   Supabase 접속 정보가 gecko/gecko-core.js 안에만 있어서, 그 파일을 읽지 않는
   크레스티드 계산기는 접속 기록을 아예 남기지 못했습니다. 도구가 늘어날수록
   같은 문제가 반복되므로 여기로 옮깁니다.

   여기 있는 anon 키는 공개용(publishable)입니다. 브라우저에 노출되는 것이
   정상이고, 실제 접근 통제는 Supabase 의 RLS 정책이 합니다.

   새 도구를 추가할 때: 이 파일을 읽게 한 뒤, 그 도구의 코어에서
   SERVICE_ID 를 자기 이름으로 정의하면 됩니다. (docs/STUDIO.md)
   ============================================================================= */
var SUPABASE_URL  = 'https://icjuhsktqcfloiqdfxtm.supabase.co';
var SUPABASE_ANON = 'sb_publishable_uAf776_KFEyAqG_eWJdYRQ_zm3n_uKm';

/* 서비스 이름표 — 관리자 화면에서 도구별로 나눠 볼 때 씁니다. */
var STUDIO_SERVICES = {
  gecko:   '레오파드 게코',
  crested: '크레스티드 게코',
  fattail: '펫테일 게코',
  ballpython: '볼파이톤',
  care:    '생물 케어 스케쥴 관리'
};

/* 계정 기능 공개 스위치.
   false 인 동안 기존 회원 로그인은 유지하되 새 회원가입 UI와 요청을 막습니다.

   2026-08-09 열었습니다. 여기만 켜서는 열리지 않습니다 — 자물쇠가 셋입니다.
     1. 이 스위치 (화면)
     2. supabase_v75.sql — auth.users 의 block_new_auth_users 트리거 (DB)
     3. Supabase 대시보드 → Authentication → Allow new users to sign up
   다시 잠글 때도 셋을 함께 되돌려야 합니다. 하나만 잠그면 가입 버튼은
   보이는데 눌리지 않는 상태가 됩니다. */
var SIGNUPS_ENABLED = true;

/* 비밀번호 재설정 접수. 가입을 열면 이것도 함께 열어야 합니다 — 새로 들어온
   회원이 비밀번호를 잊었을 때 돌아올 길이 없으면, 계정을 하나 더 만들거나
   그냥 떠납니다. */
var PASSWORD_RESET_REQUESTS_ENABLED = true;

/* 사업자 회원가입 갈래.
   false 면 가입 화면에서 '일반 / 사업자' 탭이 사라지고 모두 일반으로
   가입합니다. 이미 가입한 회원은 계정 화면에서 사업자 인증을 따로 낼 수
   있으므로(supabase_v61), 이걸 꺼도 사업자 인증 자체는 막히지 않습니다. */
var BUSINESS_SIGNUP_ENABLED = false;

/* 혈통서(개체 페이지의 문서 블록).
   양도·양수 기능이 아직 화면으로 나오지 않은 상태라 함께 내려 둡니다 —
   혈통서에는 '이 개체를 누가 넘겼는가' 자리가 있는데, 그걸 채울 방법이
   없는 채로 내보내면 빈 칸이 있는 문서를 손에 쥐여 주는 셈이 됩니다.

   코드와 문서 서식은 그대로 있습니다(care/pedigree-certificate*.js).
   양도 화면이 붙는 날 여기를 true 로 바꾸면 됩니다. */
var PEDIGREE_CERTIFICATE_ENABLED = false;

/* 진료 참고 기록(개체 페이지). 누구에게 보일지.

     'off'  아무에게도. 지금은 여기입니다 — 실제 진료에서 써 보기 전까지는
            내보내지 않습니다. 병원에서 남에게 건네지는 종이라 문서 하나가
            어색해도 그게 서비스 신뢰가 됩니다.
     'pro'  프로 등급에게만. 등급이 생기면 이 값으로 둡니다.
     'all'  모두에게.

   ⚠️ 프로 등급은 아직 없습니다('off' 와 'pro' 가 지금은 결과가 같습니다).
      테스트할 때는 잠깐 'all' 로 두고 확인한 뒤 되돌리세요. */
var MEDICAL_REPORT_ACCESS = 'off';

/* 가입 봇 차단 (Cloudflare Turnstile)
   ---------------------------------------------------------------------------
   비워 두면 아무 일도 하지 않습니다. 키를 넣는 순간부터 가입·로그인 화면에
   위젯이 뜨고, 토큰을 Supabase 로 함께 보냅니다.

   켜는 방법 (둘 다 해야 합니다. 한쪽만 하면 가입이 막힙니다)
     1. Cloudflare 대시보드 → Turnstile → 위젯 추가 → 사이트 키를 아래에 붙여넣기
     2. Supabase 대시보드 → Authentication → Attack Protection →
        Enable CAPTCHA protection, Provider = Turnstile, 비밀 키 붙여넣기

   순서 주의 — 2번만 켜고 1번을 비워 두면, 서버는 토큰을 요구하는데 화면은
   토큰을 못 보내서 아무도 가입하지 못합니다. 1번을 먼저 넣으세요.

   왜 Turnstile 인가 — 이미 Cloudflare 를 쓰고 있어 추가 업체가 늘지 않고,
   대부분의 사람에게 풀 문제를 내지 않습니다. reCAPTCHA 와 달리 방문자
   데이터가 광고 사업자로 넘어가지 않습니다. */
var TURNSTILE_SITE_KEY = '0x4AAAAAAEKeqnG0tjlhIZHo';
