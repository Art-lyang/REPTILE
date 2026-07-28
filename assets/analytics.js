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

  /* ── 어디서 들어왔는가 ──────────────────────────────────────────────────
     document.referrer 는 직전 페이지의 주소입니다. 검색으로 왔는지, 링크를
     타고 왔는지, 주소를 직접 쳤는지를 여기서 가릅니다.

     주소 전체는 남기지 않고 호스트만 남깁니다. 검색어가 붙은 전체 주소를
     저장하면 남의 검색 기록을 우리가 들고 있게 됩니다.

     ⚠️ 안 잡히는 경우가 있습니다 — 카카오톡·인스타 같은 앱 안 브라우저나
        https→http 이동은 referrer 를 아예 안 줍니다. 그건 '직접'으로 잡힙니다.
        실제 '직접 방문'보다 항상 부풀어 있다고 보시면 됩니다. */
  var SEARCH = {
    'google': '구글', 'naver': '네이버', 'daum': '다음', 'bing': '빙',
    'yahoo': '야후', 'duckduckgo': '덕덕고', 'baidu': '바이두',
    'yandex': '얀덱스', 'ecosia': '에코시아', 'zum': '줌'
  };
  var SNS = {
    'instagram': '인스타그램', 'youtube': '유튜브', 'youtu.be': '유튜브',
    'facebook': '페이스북', 'twitter': 'X(트위터)', 'x.com': 'X(트위터)',
    'threads': '스레드', 'tiktok': '틱톡', 'kakao': '카카오',
    'band.us': '밴드', 'reddit': '레딧', 'discord': '디스코드',
    't.co': 'X(트위터)', 'linkedin': '링크드인'
  };

  function refInfo() {
    var out = { kind: 'direct', host: null, name: '직접' };
    try {
      var r = document.referrer;
      if (!r) return out;
      var h = new URL(r).hostname.toLowerCase().replace(/^www\./, '');
      if (!h) return out;

      /* 우리 사이트 안에서의 이동은 '유입'이 아닙니다. 이걸 세면
         계산기끼리 오간 것이 전부 유입으로 잡혀 숫자가 의미를 잃습니다. */
      if (h === location.hostname.toLowerCase().replace(/^www\./, '')) {
        return { kind: 'internal', host: h, name: '사이트 내부' };
      }
      out.host = h.slice(0, 120);

      /* 네이버 블로그·카페는 검색이 아니라 커뮤니티 유입으로 봅니다.
         검색 판정보다 먼저 봐야 blog.naver.com 이 '네이버 검색'이 안 됩니다. */
      var k;
      for (k in SNS) {
        if (h.indexOf(k) >= 0) { out.kind = 'sns'; out.name = SNS[k]; return out; }
      }
      if (/^(blog|cafe|post|m\.blog|m\.cafe)\./.test(h)) {
        out.kind = 'sns'; out.name = '블로그·카페'; return out;
      }
      for (k in SEARCH) {
        if (h.indexOf(k) >= 0) { out.kind = 'search'; out.name = SEARCH[k]; return out; }
      }
      out.kind = 'site'; out.name = out.host;
      return out;
    } catch (e) {
      return out;
    }
  }

  /* ── 어느 나라에서 들어왔는가 ────────────────────────────────────────────
     Cloudflare 가 모든 도메인에 붙여주는 /cdn-cgi/trace 를 씁니다. 워커를
     따로 만들 필요도, 외부 위치조회 서비스에 방문자를 넘길 필요도 없습니다.

     응답에는 ip= 도 들어 있지만 국가(loc=)만 꺼내 씁니다. IP 는 개인정보라
     저장하지 않습니다.

     하루에 한 번만 물어보고 저장해 둡니다. 페이지를 열 때마다 부르면
     느려지기만 하고 답은 늘 같습니다. */
  function country() {
    var K = 'studioGeo';
    try {
      var c = JSON.parse(localStorage.getItem(K) || 'null');
      if (c && c.v && Date.now() - c.t < 864e5) return Promise.resolve(c.v);
    } catch (e) {}

    /* 실패하거나 느리면 그냥 국가 없이 기록합니다. 국가 때문에 접속 기록
       자체가 안 남는 일은 없어야 합니다. */
    return new Promise(function (done) {
      var settled = false;
      var finish = function (v) { if (!settled) { settled = true; done(v || null); } };
      setTimeout(function () { finish(null); }, 1500);
      try {
        fetch('/cdn-cgi/trace', { cache: 'no-store' })
          .then(function (r) { return r.text(); })
          .then(function (t) {
            var m = /(^|\n)loc=([A-Z]{2})/.exec(t);
            var v = m ? m[2] : null;
            if (v) { try { localStorage.setItem(K, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {} }
            finish(v);
          }, function () { finish(null); });
      } catch (e) { finish(null); }
    });
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

    ref: refInfo,
    country: country,

    /* 접속 1건 기록 */
    logVisit: function (sb, service, lang) {
      if (!sb) return Promise.resolve();
      var kind = clientKind();
      var base = { device: deviceId(), lang: lang || 'ko' };
      var ua = String(navigator.userAgent || '').slice(0, 300);
      var rf = refInfo();
      return country().then(function (cc) {
        return insertWithFallback(sb, 'visits', [
          { device: base.device, lang: base.lang, service: service, client: kind, ua: ua,
            ref_kind: rf.kind, ref_host: rf.host, ref_name: rf.name, country: cc },
          { device: base.device, lang: base.lang, service: service, client: kind, ua: ua },
          { device: base.device, lang: base.lang, service: service },
          base
        ]);
      });
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
