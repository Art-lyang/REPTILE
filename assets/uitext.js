/* =============================================================================
   업데이트 노트 · 안내 문구 불러오기 — 두 계산기 공용
   -----------------------------------------------------------------------------
   문구가 코드에 박혀 있어서 오타 하나 고치는 데도 배포가 필요했습니다.
   관리자에서 고친 값이 있으면 그것으로 덮어씁니다.

   표가 없거나(v5 미적용) 비어 있으면 아무것도 하지 않습니다. 즉 코드에 있는
   기본 문구가 그대로 쓰이므로, 언제 실행하든 화면이 깨지지 않습니다.

   쓰는 법:
     StudioText.load(SB, SERVICE_ID, I18N).then(changed => { if(changed) applyLang(); });
   ============================================================================= */
(function (global) {
  'use strict';

  var LANGS = ['ko', 'en', 'ja', 'zh'];

  /* 빈 값은 '안 고침' 으로 봅니다. 한 언어만 채워도 나머지는 기본값이 남습니다. */
  function pick(row, lang) {
    var v = row[lang];
    return (v === null || v === undefined || v === '') ? null : v;
  }

  function applyTexts(rows, I18N) {
    var changed = false;
    (rows || []).forEach(function (r) {
      LANGS.forEach(function (L) {
        var v = pick(r, L);
        /* 사전에 없는 키는 무시합니다. 오타로 넣은 키가 조용히 쌓이는 걸 막고,
           코드에서 쓰지 않는 값이 화면에 새어나오지 않게 합니다. */
        if (v !== null && I18N[L] && Object.prototype.hasOwnProperty.call(I18N[L], r.key)) {
          I18N[L][r.key] = v;
          changed = true;
        }
      });
    });
    return changed;
  }

  function applyNotes(rows, I18N) {
    if (!rows || !rows.length) return false;
    var changed = false;
    LANGS.forEach(function (L) {
      if (!I18N[L]) return;
      ['done', 'soon'].forEach(function (kind) {
        var list = rows
          .filter(function (r) { return r.active !== false && r.kind === kind; })
          .sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); })
          .map(function (r) { return pick(r, L); })
          .filter(function (v) { return v !== null; });
        /* 그 언어로 쓴 항목이 하나도 없으면 손대지 않습니다. 한국어만 적어둔
           상태에서 영어 화면이 텅 비는 걸 막기 위해서입니다. */
        if (list.length) {
          I18N[L][kind === 'done' ? 'updDoneList' : 'updSoonList'] = list;
          changed = true;
        }
      });
    });
    return changed;
  }

  /* 문구가 확정됐음을 알리는 신호.
     -------------------------------------------------------------------------
     화면(*-ui.js)은 app.js 보다 먼저 실행돼서, 코드에 박힌 기본 문구로 업데이트
     노트를 그리고 곧바로 띄웁니다. 그 뒤 app.js 가 서버 문구를 받아 다시 그리기
     때문에, 읽고 있는 도중에 내용이 바뀌었습니다. 자동으로 띄우는 쪽이 이 신호를
     기다렸다 열면 그 깜빡임이 사라집니다.

     resolve 를 setTimeout 0 으로 미루는 이유: load() 의 then 안에서 바로 알리면
     소비자가 걸어 둔 .then(applyLang) 보다 내 콜백이 먼저 깨어납니다(같은
     마이크로태스크 줄에서 내가 앞). 그러면 기다린 보람 없이 기본 문구가 잠깐
     보입니다. 한 틱 미루면 applyLang 이 끝난 뒤에 열립니다. */
  var settled = false;
  var resolveReady;
  var readyPromise = new Promise(function (resolve) { resolveReady = resolve; });

  function markReady(changed) {
    if (settled) return;
    settled = true;
    global.setTimeout(function () { resolveReady(!!changed); }, 0);
  }

  global.StudioText = {
    load: function (sb, service, I18N) {
      if (!sb || !I18N) { markReady(false); return Promise.resolve(false); }
      return Promise.all([
        sb.from('ui_texts').select('*').eq('service', service),
        sb.from('update_notes').select('*').eq('service', service).order('ord')
      ]).then(function (res) {
        var changed = false;
        if (!res[0].error && applyTexts(res[0].data, I18N)) changed = true;
        if (!res[1].error && applyNotes(res[1].data, I18N)) changed = true;
        markReady(changed);
        return changed;
      }).catch(function () { markReady(false); return false; });
    },

    /* 문구가 확정될 때까지 기다립니다. 정해진 시간을 넘기면 기본 문구로 진행합니다.
       느린 회선에서 안내창이 안 뜨는 것보다, 기본 문구로라도 뜨는 편이 낫습니다.
       load() 가 아예 호출되지 않는 경우(백엔드 미설정)도 이 시간제한이 받습니다. */
    whenReady: function (timeoutMs) {
      if (settled) return readyPromise;
      return Promise.race([
        readyPromise,
        new Promise(function (resolve) {
          global.setTimeout(function () { resolve(false); }, timeoutMs || 1200);
        })
      ]);
    }
  };
})(window);
