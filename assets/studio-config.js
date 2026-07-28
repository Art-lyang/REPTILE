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
  fattail: '펫테일 게코'
};

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
var TURNSTILE_SITE_KEY = '';
