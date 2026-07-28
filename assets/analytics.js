/* =============================================================================
   접속 기록 · 방문자 종류 판별 — 량 스튜디오 계산기 공용
   -----------------------------------------------------------------------------
   쓰는 법:  supabase-js → studio-config.js → (페이지 코어에서 SERVICE_ID 정의)
             → analytics.js  순서로 읽히면 알아서 기록합니다.

   ⚠️ 한계를 먼저 적어둡니다. 이건 브라우저에서 도는 코드라, JS 를 실행하지 않는
      수집기(GPTBot·Googlebot 대부분)는 애초에 이 줄까지 오지 않습니다. 즉
      "AI 가 몇 번 왔는지" 를 여기서 다 셀 수는 없고, 잡히는 건
        - 헤드리스 브라우저로 JS 까지 실행하는 수집기
        - 사람 흉내를 내지 않는 자동화 도구
      정도입니다. 서버(Cloudflare Worker)에서 요청을 받을 때 세야 전부 잡힙니다.
      docs/STUDIO.md 에 후속 작업으로 적어두었습니다.
   ============================================================================= */
(function (global) {
  'use strict';

  /* AI 학습·검색용 수집기. 사람 방문과 섞이면 통계가 왜곡돼서 따로 셉니다. */
  var AI_BOTS = /GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Google-Extended|Bytespider|Amazonbot|Applebot-Extended|meta-externalagent|FacebookBot|Diffbot|omgili|ImagesiftBot|cohere-ai|YouBot|Timpibot/i;

  /* 일반 검색·SEO 수집기 */
  var BOTS = /bot|crawler|spider|crawling|slurp|bingpreview|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|curl|wget|python-requests|axios|node-fetch|go-http-client|java\/|okhttp/i;

  /* 반환값: 'ai' | 'bot' | 'human' */
  function clientKind() {
    try {
      var ua = navigator.userAgent || '';
      if (AI_BOTS.test(ua)) return 'ai';
      if (BOTS.test(ua)) return 'bot';
      /* navigator.webdriver 는 자동화 도구가 붙었을 때 true 입니다.
         사람이 개발자도구를 켠 것만으로는 true 가 되지 않습니다. */
      if (navigator.webdriver === true) return 'bot';
      /* 실제 브라우저라면 거의 항상 있는 값들. 통째로 비어 있으면 흉내입니다. */
      if (!navigator.languages || navigator.languages.length === 0) return 'bot';
      return 'human';
    } catch (e) {
      return 'human';
    }
  }

  function deviceId() {
    try {
      var k = 'studioDevice', d = localStorage.getItem(k);
      /* 예전 레오파드 전용 키를 그대로 씁니다. 안 그러면 기존 방문자가 전부
         새 사람으로 잡혀서 '순 방문자' 가 하루아침에 뜁니다. */
      if (!d) d = localStorage.getItem('leoDevice');
      if (!d) {
        d = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      }
      localStorage.setItem(k, d);
      return d;
    } catch (e) {
      return 'dev_anon';
    }
  }

  /* 컬럼이 아직 없는 서버에서도 로그가 끊기지 않게, 넓은 것부터 좁혀가며 넣습니다.
     supabase_v3.sql 을 적용하기 전에는 client/ua 없이 저장됩니다. */
  function insertWithFallback(sb, table, variants) {
    var i = 0;
    function tryNext() {
      if (i >= variants.length) return Promise.resolve();
      var row = variants[i++];
      return sb.from(table).insert(row).then(function (r) {
        if (r && r.error) return tryNext();
      }, tryNext);
    }
    return tryNext();
  }

  var API = {
    kind: clientKind,
    device: deviceId,

    /* 접속 1건 기록 */
    logVisit: function (sb, service, lang) {
      if (!sb) return Promise.resolve();
      var kind = clientKind();
      var base = { device: deviceId(), lang: lang || 'ko' };
      var ua = String(navigator.userAgent || '').slice(0, 300);
      return insertWithFallback(sb, 'visits', [
        { device: base.device, lang: base.lang, service: service, client: kind, ua: ua },
        { device: base.device, lang: base.lang, service: service },
        base
      ]);
    },

    /* 조합 검색 1건 기록. 수집기가 만든 건 통계를 흐리므로 남기지 않습니다. */
    logCombo: function (sb, service, ckey, label) {
      if (!sb || clientKind() !== 'human') return Promise.resolve();
      var base = { ckey: ckey, label: label };
      return insertWithFallback(sb, 'combo_queries', [
        { ckey: ckey, label: label, service: service },
        base
      ]);
    }
  };

  global.StudioAnalytics = API;
})(window);
