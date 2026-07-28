/* =============================================================================
   관리자 · 업데이트 노트 / 안내 문구
   -----------------------------------------------------------------------------
   모프·콤보는 진작 관리자에서 고칠 수 있었는데 문구만 코드에 박혀 있어서,
   오타 하나 고치는 데도 배포가 필요했습니다. 이 화면이 그걸 없앱니다.

   ⚠️ 각 계산기의 번역 사전(I18N)을 <script> 로 불러올 수 없습니다.
      gecko-ui.js 와 crested-ui.js 가 둘 다 최상위에서 const I18N 을 선언해서
      한 페이지에 같이 두면 "Identifier 'I18N' has already been declared" 로
      관리자 전체가 죽습니다. admin-crested.js 와 같은 방식으로, 파일을
      텍스트로 받아 함수 안에서 실행해 필요한 값만 꺼냅니다.
   ============================================================================= */
(function (global) {
  'use strict';

  /* 관리자에서 고칠 수 있게 열어둘 문구.
     여기 없는 키는 화면에 나오지 않습니다. 계산 결과나 표 머리글처럼 짧고
     구조적인 문구까지 열면 실수로 깨뜨리기 쉬워서 안내성 문구만 골랐습니다. */
  var KEYS = [
    ['title',          '페이지 제목'],
    ['sub',            '페이지 한 줄 설명'],
    ['note',           '하단 참고 (유전 안내)'],
    ['comboNote',      '콤보 이름 설명'],
    ['crossNote',      '크로스 표기 안내'],
    ['polyDesc',       '라인브리딩 설명'],
    ['polyToggleHint', '옵션 — 라인브리딩 포함'],
    ['partialHint',    '옵션 — 가능성 헷'],
    ['vintageHint',    '옵션 — 추억의 모프'],
    ['emptyStart',     '빈 화면 — 시작 안내'],
    ['emptyNone',      '빈 화면 — 선택 없음'],
    ['optNote',        '표시 옵션 설명'],
    ['fakeSuperNote',  '이름만 슈퍼인 형질 안내'],
    ['footer',         '하단 면책 문구']
  ];
  var SRC = { gecko: '../gecko/gecko-ui.js', crested: '../crested/crested-ui.js' };
  var LANGS = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh', '中文']];

  var svc = 'gecko';
  var sub = 'notes';          // notes | texts
  var BUILTIN = {};           // service → I18N

  function builtin(service) {
    if (BUILTIN[service]) return Promise.resolve(BUILTIN[service]);
    return fetch(SRC[service]).then(function (r) {
      if (!r.ok) throw new Error(SRC[service] + ' 를 읽지 못했습니다 (' + r.status + ')');
      return r.text();
    }).then(function (code) {
      /* 파일 전체를 실행하면 DOM 을 건드리는 줄에서 죽습니다. I18N 선언부만
         잘라내 실행합니다. const I18N = { ... }; 까지가 대상입니다. */
      var start = code.indexOf('const I18N');
      if (start < 0) throw new Error('I18N 을 찾지 못했습니다.');
      var i = code.indexOf('{', start), depth = 0, end = -1;
      for (var j = i; j < code.length; j++) {
        if (code[j] === '{') depth++;
        else if (code[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
      }
      if (end < 0) throw new Error('I18N 범위를 찾지 못했습니다.');
      BUILTIN[service] = new Function('return ' + code.slice(i, end) + ';')();
      return BUILTIN[service];
    });
  }

  /* ---------- 화면 ---------- */
  function render(ctx) {
    var SB = ctx.SB, esc = ctx.esc, body = ctx.body;
    body.innerHTML = '<div class="asub">불러오는 중…</div>';

    Promise.all([
      builtin(svc).catch(function (e) { return { __err: e.message }; }),
      SB.from('ui_texts').select('*').eq('service', svc).order('ord'),
      SB.from('update_notes').select('*').eq('service', svc).order('ord')
    ]).then(function (res) {
      var B = res[0], T = res[1], N = res[2];

      if (T.error) {
        body.innerHTML = '<div class="aerr"><b>문구 표가 아직 없습니다.</b><br><br>'
          + 'Supabase SQL Editor 에서 <b>supabase_v5.sql</b> 을 실행해 주세요.<br>'
          + '<span class="asub">' + esc(T.error.message) + '</span></div>';
        return;
      }

      var svcName = (typeof STUDIO_SERVICES !== 'undefined' && STUDIO_SERVICES[svc]) || svc;
      var h = '<div class="asvcbar">'
        + Object.keys(SRC).map(function (k) {
            var nm = (typeof STUDIO_SERVICES !== 'undefined' && STUDIO_SERVICES[k]) || k;
            return '<button class="asvc' + (svc === k ? ' on' : '') + '" data-tsvc="' + k + '">' + esc(nm) + '</button>';
          }).join('') + '</div>'
        + '<div class="abar">'
        + '<button class="abtn sm ghost" id="txSeed">현재 앱 문구 가져오기</button>'
        + '<button class="abtn sm" id="txNew">+ 업데이트 항목</button></div>'
        + '<div class="asvcbar">'
        + [['notes', '업데이트 노트'], ['texts', '안내 문구']].map(function (t) {
            return '<button class="asvc' + (sub === t[0] ? ' on' : '') + '" data-tsub="' + t[0] + '">' + t[1] + '</button>';
          }).join('') + '</div>';

      if (B.__err) h += '<div class="aerr">' + esc(B.__err) + '</div>';

      if (sub === 'notes') {
        var notes = N.data || [];
        h += notes.length
          ? ['done', 'soon'].map(function (kind) {
              var list = notes.filter(function (r) { return r.kind === kind; });
              return '<div class="alabel2">' + (kind === 'done' ? '✅ 업데이트 됨' : '🔜 업데이트 예정') + '</div>'
                + (list.length ? '<div class="alist">' + list.map(function (r) {
                    return '<div class="arow' + (r.active === false ? ' off' : '') + '">'
                      + '<div class="arow-main"><b>' + esc(r.ko || '(내용 없음)') + '</b>'
                      + '<div class="asub">' + esc(r.en || '') + '</div></div>'
                      + '<div class="arow-act"><button class="mini" data-ned="' + r.id + '">수정</button>'
                      + '<button class="mini del" data-ndel="' + r.id + '">삭제</button></div></div>';
                  }).join('') + '</div>' : '<div class="asub">비어 있습니다.</div>');
            }).join('')
          : '<div class="aempty"><b>아직 업데이트 노트가 없습니다.</b><br>'
            + '<b>현재 앱 문구 가져오기</b>를 누르면 지금 계산기에 보이는 항목이 그대로 들어옵니다.<br>'
            + '<b>+ 업데이트 항목</b>으로 새로 추가할 수도 있어요.</div>';
      } else {
        var byKey = {}; (T.data || []).forEach(function (r) { byKey[r.key] = r; });
        /* 계산기마다 쓰는 문구가 조금 다릅니다. 그 계산기 사전에 없는 키를
           보여주면 고쳐도 아무 데도 반영되지 않아 혼란스럽습니다. */
        var avail = B.__err ? KEYS
          : KEYS.filter(function (k) { return B.ko && Object.prototype.hasOwnProperty.call(B.ko, k[0]); });
        h += '<div class="alist">' + avail.map(function (k) {
          var r = byKey[k[0]], cur = r && r.ko;
          var base = (!B.__err && B.ko && B.ko[k[0]]) || '';
          var shown = cur || base;
          return '<div class="arow">'
            + '<div class="arow-main"><b>' + k[1] + '</b>'
            + (cur ? '<span class="atag new">수정됨</span>' : '<span class="atag">기본</span>')
            + '<div class="asub">' + esc(String(shown).replace(/<[^>]+>/g, '').slice(0, 78)) + '</div></div>'
            + '<div class="arow-act"><button class="mini" data-ted="' + k[0] + '">수정</button></div></div>';
        }).join('') + '</div>'
          + '<div class="ahint">‘기본’은 코드에 있는 문구를 그대로 쓰는 중이라는 뜻입니다. '
          + '수정하면 그때부터 DB 값이 우선합니다. 비워서 저장하면 기본으로 돌아갑니다.</div>';
      }

      body.innerHTML = h;

      body.querySelectorAll('[data-tsvc]').forEach(function (b) {
        b.onclick = function () { svc = b.dataset.tsvc; render(ctx); };
      });
      body.querySelectorAll('[data-tsub]').forEach(function (b) {
        b.onclick = function () { sub = b.dataset.tsub; render(ctx); };
      });
      body.querySelectorAll('[data-ted]').forEach(function (b) {
        b.onclick = function () {
          var key = b.dataset.ted;
          textForm(ctx, key, (T.data || []).filter(function (r) { return r.key === key; })[0], B);
        };
      });
      body.querySelectorAll('[data-ned]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          noteForm(ctx, (N.data || []).filter(function (r) { return r.id === b.dataset.ned; })[0]);
        };
      });
      body.querySelectorAll('[data-ndel]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('이 항목을 지울까요?')) return;
          SB.from('update_notes').delete().eq('id', b.dataset.ndel).then(function () { render(ctx); });
        };
      });
      document.getElementById('txNew').onclick = function () { noteForm(ctx, null); };
      document.getElementById('txSeed').onclick = function (e) {
        if (B.__err) { alert(B.__err); return; }
        var btn = e.target; btn.textContent = '가져오는 중…'; btn.disabled = true;
        seed(SB, B).then(function (n) { alert(n + '건을 넣었습니다.'); render(ctx); })
          .catch(function (x) { alert('실패: ' + x.message); render(ctx); });
      };
    });
  }

  /* ---------- 안내 문구 편집 ---------- */
  function textForm(ctx, key, row, B) {
    var esc = ctx.esc, body = ctx.body, SB = ctx.SB;
    var label = (KEYS.filter(function (k) { return k[0] === key; })[0] || [key, key])[1];
    var h = '<div class="abar"><button class="abtn sm ghost" id="tBack">← 목록</button></div>'
      + '<div class="alabel">' + esc(label) + '</div>'
      + '<div class="asub" style="margin-bottom:10px">비워두면 코드에 있는 기본 문구를 씁니다. '
      + '&lt;b&gt; 같은 간단한 태그를 넣어도 됩니다.</div>';
    LANGS.forEach(function (L) {
      var cur = row ? (row[L[0]] || '') : '';
      var base = (B && B[L[0]] && B[L[0]][key]) || '';
      h += '<div class="alabel2">' + L[1] + '</div>'
        + '<textarea class="ain" id="tf_' + L[0] + '" rows="3">' + esc(cur) + '</textarea>'
        + (base ? '<div class="ahint">기본: ' + esc(String(base).slice(0, 120)) + '</div>' : '');
    });
    h += '<div class="aformbtns"><button class="abtn" id="tSave">저장</button></div><div class="aerr" id="tErr"></div>';
    body.innerHTML = h;
    document.getElementById('tBack').onclick = function () { render(ctx); };
    document.getElementById('tSave').onclick = function () {
      var v = function (L) { return document.getElementById('tf_' + L).value.trim() || null; };
      var patch = { service: svc, key: key, label: label,
                    ko: v('ko'), en: v('en'), ja: v('ja'), zh: v('zh') };
      document.getElementById('tErr').textContent = '저장 중…';
      SB.from('ui_texts').upsert(patch, { onConflict: 'service,key' }).then(function (r) {
        if (r.error) document.getElementById('tErr').textContent = '저장 실패: ' + r.error.message;
        else render(ctx);
      });
    };
  }

  /* ---------- 업데이트 항목 편집 ---------- */
  function noteForm(ctx, row) {
    var esc = ctx.esc, body = ctx.body, SB = ctx.SB;
    row = row || { kind: 'done', ord: 0, active: true };
    var h = '<div class="abar"><button class="abtn sm ghost" id="nBack">← 목록</button></div>'
      + '<div class="alabel">' + (row.id ? '업데이트 항목 수정' : '새 업데이트 항목') + '</div>'
      + '<div class="alabel2">구분</div><select class="ain" id="nf_kind">'
      + '<option value="done"' + (row.kind === 'done' ? ' selected' : '') + '>✅ 업데이트 됨</option>'
      + '<option value="soon"' + (row.kind === 'soon' ? ' selected' : '') + '>🔜 업데이트 예정</option></select>';
    LANGS.forEach(function (L) {
      h += '<div class="alabel2">' + L[1] + '</div>'
        + '<textarea class="ain" id="nf_' + L[0] + '" rows="2">' + esc(row[L[0]] || '') + '</textarea>';
    });
    h += '<div class="ahint">한국어만 적어도 됩니다. 비운 언어는 그 언어 화면에서 이 줄이 빠집니다.</div>'
      + '<div class="alabel2">표시 순서</div><input class="ain" id="nf_ord" type="number" value="' + (row.ord || 0) + '">'
      + '<div class="alabel2">노출</div><select class="ain" id="nf_active">'
      + '<option value="1"' + (row.active !== false ? ' selected' : '') + '>보임</option>'
      + '<option value="0"' + (row.active === false ? ' selected' : '') + '>숨김</option></select>'
      + '<div class="aformbtns"><button class="abtn" id="nSave">저장</button></div><div class="aerr" id="nErr"></div>';
    body.innerHTML = h;
    document.getElementById('nBack').onclick = function () { render(ctx); };
    document.getElementById('nSave').onclick = function () {
      var v = function (id) { return document.getElementById('nf_' + id).value.trim(); };
      var patch = { service: svc, kind: v('kind'), ord: Number(v('ord') || 0),
                    active: v('active') === '1',
                    ko: v('ko') || null, en: v('en') || null, ja: v('ja') || null, zh: v('zh') || null };
      document.getElementById('nErr').textContent = '저장 중…';
      var q = row.id ? SB.from('update_notes').update(patch).eq('id', row.id)
                     : SB.from('update_notes').insert(patch);
      q.then(function (r) {
        if (r.error) document.getElementById('nErr').textContent = '저장 실패: ' + r.error.message;
        else render(ctx);
      });
    };
  }

  /* ---------- 현재 앱 문구를 DB 로 ---------- */
  function seed(SB, B) {
    var texts = KEYS.filter(function (k) {
      return B.ko && Object.prototype.hasOwnProperty.call(B.ko, k[0]);
    }).map(function (k, i) {
      return { service: svc, key: k[0], label: k[1], ord: i,
               ko: (B.ko && B.ko[k[0]]) || null, en: (B.en && B.en[k[0]]) || null,
               ja: (B.ja && B.ja[k[0]]) || null, zh: (B.zh && B.zh[k[0]]) || null };
    }).filter(function (r) { return r.ko || r.en; });

    var notes = [];
    ['done', 'soon'].forEach(function (kind) {
      var listKey = kind === 'done' ? 'updDoneList' : 'updSoonList';
      var ko = (B.ko && B.ko[listKey]) || [];
      ko.forEach(function (_, i) {
        notes.push({ service: svc, kind: kind, ord: i, active: true,
          ko: (B.ko && B.ko[listKey] && B.ko[listKey][i]) || null,
          en: (B.en && B.en[listKey] && B.en[listKey][i]) || null,
          ja: (B.ja && B.ja[listKey] && B.ja[listKey][i]) || null,
          zh: (B.zh && B.zh[listKey] && B.zh[listKey][i]) || null });
      });
    });

    return SB.from('ui_texts').upsert(texts, { onConflict: 'service,key' }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      /* 업데이트 노트는 id 가 uuid 라 덮어쓸 기준이 없습니다. 이 서비스 것만
         지우고 다시 넣습니다. 다른 계산기 항목은 건드리지 않습니다. */
      return SB.from('update_notes').delete().eq('service', svc);
    }).then(function () {
      return notes.length ? SB.from('update_notes').insert(notes) : { error: null };
    }).then(function (r) {
      if (r && r.error) throw new Error(r.error.message);
      return texts.length + notes.length;
    });
  }

  global.TextAdmin = { render: render };
})(window);
