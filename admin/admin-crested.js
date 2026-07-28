/* =============================================================================
   관리자 · 크레스티드 게코 모프 관리
   -----------------------------------------------------------------------------
   레오파드는 morphs/combos 두 표로 끝나지만 크레스티드는 넷입니다.
   왜 나눠야 했는지는 supabase_v4.sql 위쪽에 적어두었습니다.

   ⚠️ crested-core.js 를 <script> 로 그냥 불러올 수 없습니다.
      gecko-core.js 와 crested-core.js 가 둘 다 최상위에서 const SERVICE_ID 를
      선언해서, 한 페이지에 같이 두면 "Identifier 'SERVICE_ID' has already been
      declared" 로 페이지 전체가 죽습니다. 그래서 파일을 텍스트로 받아 함수
      안에서 실행해 필요한 값만 꺼내옵니다. 관리자 전역은 건드리지 않습니다.
   ============================================================================= */
(function (global) {
  'use strict';

  var BUILTIN = null;      // crested-core.js 에서 꺼낸 내장 데이터
  var sub = 'genes';       // 하위 화면: genes | genos | traits | combos
  var editing = null;      // 편집 중인 행

  /* ---------- 내장 데이터 읽기 ---------- */
  function loadBuiltin() {
    if (BUILTIN) return Promise.resolve(BUILTIN);
    return fetch('../crested/crested-core.js').then(function (r) {
      if (!r.ok) throw new Error('crested-core.js 를 읽지 못했습니다 (' + r.status + ')');
      return r.text();
    }).then(function (src) {
      var pick = new Function(src + '\nreturn {' +
        'genes: CR_ALL_GENES(), traits: CR_TRAITS, combos: CR_COMBOS,' +
        'groups: CR_TRAIT_GROUPS, color: CR_COLOR };');
      BUILTIN = pick();
      return BUILTIN;
    });
  }

  /* ---------- 내장 → DB 행으로 변환 ---------- */
  var L4 = ['ko', 'en', 'ja', 'zh'];
  function up(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function geneRows(b) {
    return b.genes.map(function (g, i) {
      var r = { id: g.id, kind: g.kind || 'bi', type: g.type || 'incdom',
                core: g.core !== false, proof: g.proof || 'partial', ord: g.order || i,
                no_super: !!g.noSuper, super_non_viable: !!g.superNonViable,
                approx: !!g.approx, warn_on_super: g.warnOnSuper || null,
                note: g.note || null, color: b.color[g.id] || null, active: true };
      L4.forEach(function (L) {
        r[L] = g[L] || null;
        r['super_' + L] = g['super' + up(L)] || null;
        r['het_' + L] = g['het' + up(L)] || null;
      });
      return r;
    });
  }
  function genoRows(b) {
    var out = [];
    b.genes.forEach(function (g) {
      if (!g.genos) return;
      var i = 0;
      Object.keys(g.genos).forEach(function (k) {
        var t = g.genos[k];
        var r = { gene_id: g.id, geno: k, token: t.token || null,
                  warn: t.warn || null, health: !!t.health, ord: i++ };
        L4.forEach(function (L) { r[L] = t[L] || null; });
        out.push(r);
      });
    });
    return out;
  }
  function traitRows(b) {
    return b.traits.map(function (t, i) {
      var r = { id: t.id, grp: t.grp || 'base', fake_super: !!t.fakeSuper,
                color: b.color[t.id] || null, ord: i, active: true };
      L4.forEach(function (L) { r[L] = t[L] || null; });
      return r;
    });
  }
  function comboRows(b) {
    return b.combos.map(function (c, i) {
      var r = { tokens: c.tokens || [], proof: c.proof || 'partial',
                warn: c.warn || null, ord: i, active: true };
      L4.forEach(function (L) { r[L] = c[L] || null; });
      return r;
    });
  }

  /* ---------- 화면 ---------- */
  function render(ctx) {
    var SB = ctx.SB, esc = ctx.esc, body = ctx.body;
    body.innerHTML = '<div class="asub">불러오는 중…</div>';

    Promise.all([
      loadBuiltin().catch(function (e) { return { err: e.message }; }),
      SB.from('cr_genes').select('*').order('ord'),
      SB.from('cr_genos').select('*').order('ord'),
      SB.from('cr_traits').select('*').order('ord'),
      SB.from('cr_combos').select('*').order('ord')
    ]).then(function (res) {
      var b = res[0], G = res[1], N = res[2], T = res[3], C = res[4];

      if (G.error) {
        body.innerHTML = '<div class="aerr"><b>크레스티드 표가 아직 없습니다.</b><br><br>'
          + 'Supabase SQL Editor 에서 <b>supabase_v4.sql</b> 을 실행해 주세요.<br>'
          + '<span class="asub">' + esc(G.error.message) + '</span></div>';
        return;
      }

      var counts = { genes: (G.data || []).length, genos: (N.data || []).length,
                     traits: (T.data || []).length, combos: (C.data || []).length };
      var total = counts.genes + counts.traits + counts.combos;

      var tabs = [['genes', '유전자'], ['genos', '유전형'], ['traits', '라인브리딩'], ['combos', '콤보']];
      var h = '<div class="abar">'
        + '<button class="abtn sm ghost" id="crSeed">현재 앱 목록 가져오기</button>'
        + '<button class="abtn sm ghost" id="crExp">백업</button></div>'
        + '<div class="asvcbar">' + tabs.map(function (t) {
            return '<button class="asvc' + (sub === t[0] ? ' on' : '') + '" data-cs="' + t[0] + '">'
                 + t[1] + ' <span class="asub">' + counts[t[0]] + '</span></button>'; }).join('')
        + '</div>';

      if (!total) {
        h += '<div class="aempty"><b>아직 DB 에 크레스티드 모프가 없습니다.</b><br>'
          + '지금은 앱에 내장된 기본 목록'
          + (b.err ? '' : '(유전자 ' + b.genes.length + ' · 라인브리딩 ' + b.traits.length
              + ' · 콤보 ' + b.combos.length + '개)')
          + '이 쓰이고 있어요.<br><br><b>현재 앱 목록 가져오기</b>를 누르면 지금 값이 그대로 '
          + 'DB 에 들어가고, 그때부터 여기서 이름·색·사진을 고칠 수 있습니다.'
          + '<br><br><span class="asub">유전 구조(대립유전자·계산 규칙)는 DB 에 두지 않았습니다. '
          + '화면에서 잘못 고치면 확률이 조용히 틀리기 때문입니다. 구조를 바꾸려면 '
          + 'crested-core.js 를 고쳐 배포하세요.</span></div>';
      } else {
        h += listOf(sub, { genes: G.data, genos: N.data, traits: T.data, combos: C.data }, esc);
      }
      body.innerHTML = h;

      body.querySelectorAll('[data-cs]').forEach(function (btn) {
        btn.onclick = function () { sub = btn.dataset.cs; render(ctx); };
      });
      document.getElementById('crExp').onclick = function () {
        ctx.download('crested-morphs-backup.json', JSON.stringify(
          { genes: G.data, genos: N.data, traits: T.data, combos: C.data }, null, 1));
      };
      document.getElementById('crSeed').onclick = function (e) {
        if (b.err) { alert(b.err); return; }
        if (total && !confirm('이미 ' + total + '건이 들어 있습니다.\n같은 id 는 덮어쓰고, 없던 것은 새로 넣습니다.\n계속할까요?')) return;
        var btn = e.target; btn.textContent = '가져오는 중…'; btn.disabled = true;
        seed(SB, b).then(function (n) { alert(n + '건을 DB 에 넣었습니다.'); render(ctx); })
          .catch(function (x) { alert('실패: ' + x.message); btn.textContent = '현재 앱 목록 가져오기'; btn.disabled = false; });
      };
      body.querySelectorAll('[data-ed]').forEach(function (btn) {
        btn.onclick = function () {
          var set = { genes: G.data, genos: N.data, traits: T.data, combos: C.data }[sub];
          editing = set[Number(btn.dataset.ed)];
          form(ctx, editing);
        };
      });
    });
  }

  function listOf(kind, data, esc) {
    var rows = data[kind] || [];
    if (!rows.length) return '<div class="aempty">이 항목은 비어 있습니다.</div>';
    return '<div class="alist">' + rows.map(function (r, i) {
      var title, sub2, tags = '';
      if (kind === 'genes') {
        title = r.ko || r.id;
        sub2 = (r.en || '') + ' · ' + r.id;
        tags = '<span class="atag">' + esc(r.type || '') + '</span>'
             + (r.core ? '' : '<span class="atag sub">추가</span>')
             + (r.super_non_viable ? '<span class="atag rev">치사</span>' : '')
             + (r.proof === 'contested' ? '<span class="atag rev">논쟁</span>' : '');
      } else if (kind === 'genos') {
        title = (r.ko || r.geno);
        sub2 = r.gene_id + ' · ' + r.geno + (r.token ? ' → ' + r.token : '');
        tags = r.health ? '<span class="atag rev">건강주의</span>' : '';
      } else if (kind === 'traits') {
        title = r.ko || r.id;
        sub2 = (r.en || '') + ' · ' + r.id;
        tags = '<span class="atag">' + esc(r.grp || '') + '</span>'
             + (r.fake_super ? '<span class="atag sub">이름만 슈퍼</span>' : '');
      } else {
        title = r.ko || '(이름 없음)';
        sub2 = (r.tokens || []).join(' + ');
        tags = '<span class="atag">' + esc(r.proof || '') + '</span>';
      }
      return '<div class="arow' + (r.active === false ? ' off' : '') + '">'
        + '<div class="arow-main"><b>' + esc(title) + '</b>' + tags
        + '<div class="asub">' + esc(sub2) + '</div></div>'
        + '<div class="arow-act"><button class="mini" data-ed="' + i + '">수정</button></div></div>';
    }).join('') + '</div>';
  }

  /* ---------- 편집 폼 ---------- */
  function form(ctx, r) {
    var esc = ctx.esc, body = ctx.body, SB = ctx.SB;
    var isGeno = (sub === 'genos'), isCombo = (sub === 'combos');
    var name = function (L, label) {
      return '<label class="alabel2">' + label + '</label>'
        + '<input class="ain" id="f_' + L + '" value="' + esc(r[L] || '') + '">';
    };
    var h = '<div class="abar"><button class="abtn sm ghost" id="fBack">← 목록</button></div>'
      + '<div class="alabel">' + esc(isGeno ? (r.gene_id + ' · ' + r.geno)
                                            : (r.id || (r.tokens || []).join(' + '))) + '</div>'
      + '<div class="asub" style="margin-bottom:10px">이름·색·사진·순서만 고칠 수 있습니다. '
      + '유전 구조는 crested-core.js 에 있습니다.</div>'
      + name('ko', '한국어') + name('en', 'English') + name('ja', '日本語') + name('zh', '中文');

    if (sub === 'genes') {
      h += '<div class="alabel2">슈퍼폼 이름 (한국어)</div><input class="ain" id="f_super_ko" value="' + esc(r.super_ko || '') + '">'
         + '<div class="alabel2">헷 이름 (한국어)</div><input class="ain" id="f_het_ko" value="' + esc(r.het_ko || '') + '">'
         + '<div class="alabel2">검증 수준</div><select class="ain" id="f_proof">'
         + ['established:검증됨', 'partial:부분검증', 'contested:논쟁중'].map(function (o) {
             var v = o.split(':');
             return '<option value="' + v[0] + '"' + (r.proof === v[0] ? ' selected' : '') + '>' + v[1] + '</option>';
           }).join('') + '</select>'
         + '<div class="alabel2">기본 노출</div><select class="ain" id="f_core">'
         + '<option value="1"' + (r.core !== false ? ' selected' : '') + '>기본 유전자로 보임</option>'
         + '<option value="0"' + (r.core === false ? ' selected' : '') + '>추가 유전자(접힘)</option></select>';
    }
    if (sub === 'traits') {
      h += '<div class="alabel2">그룹</div><select class="ain" id="f_grp">'
         + ['base:베이스 모프', 'pattern:패턴', 'struct:구조 형질', 'color:베이스 컬러'].map(function (o) {
             var v = o.split(':');
             return '<option value="' + v[0] + '"' + (r.grp === v[0] ? ' selected' : '') + '>' + v[1] + '</option>';
           }).join('') + '</select>';
    }
    if (isCombo) {
      h += '<div class="alabel2">구성 (쉼표로 구분)</div>'
         + '<input class="ain" id="f_tokens" value="' + esc((r.tokens || []).join(',')) + '">'
         + '<div class="asub">예: cappuccino,lilly — 결과에 이 조합이 나오면 위 이름으로 표시됩니다.</div>';
    }
    if (!isGeno && !isCombo) {
      h += '<div class="alabel2">칩 색 (#RRGGBB)</div><input class="ain" id="f_color" value="' + esc(r.color || '') + '">'
         + '<div class="alabel2">사진 주소</div><input class="ain" id="f_image" value="' + esc(r.image_url || '') + '">';
    }
    h += '<div class="alabel2">표시 순서</div><input class="ain" id="f_ord" type="number" value="' + (r.ord || 0) + '">';
    if (!isGeno) {
      h += '<div class="alabel2">노출</div><select class="ain" id="f_active">'
         + '<option value="1"' + (r.active !== false ? ' selected' : '') + '>보임</option>'
         + '<option value="0"' + (r.active === false ? ' selected' : '') + '>숨김</option></select>';
    }
    h += '<div class="aformbtns"><button class="abtn" id="fSave">저장</button></div><div class="aerr" id="fErr"></div>';
    body.innerHTML = h;

    document.getElementById('fBack').onclick = function () { render(ctx); };
    document.getElementById('fSave').onclick = function () {
      var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : undefined; };
      var patch = { ko: v('f_ko'), en: v('f_en'), ja: v('f_ja'), zh: v('f_zh'), ord: Number(v('f_ord') || 0) };
      if (sub === 'genes') {
        patch.super_ko = v('f_super_ko') || null; patch.het_ko = v('f_het_ko') || null;
        patch.proof = v('f_proof'); patch.core = v('f_core') === '1';
      }
      if (sub === 'traits') patch.grp = v('f_grp');
      if (isCombo) patch.tokens = (v('f_tokens') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!isGeno && !isCombo) { patch.color = v('f_color') || null; patch.image_url = v('f_image') || null; }
      if (!isGeno) patch.active = v('f_active') === '1';

      var table = { genes: 'cr_genes', genos: 'cr_genos', traits: 'cr_traits', combos: 'cr_combos' }[sub];
      var q = SB.from(table).update(patch);
      q = isGeno ? q.eq('gene_id', r.gene_id).eq('geno', r.geno) : q.eq('id', r.id);
      document.getElementById('fErr').textContent = '저장 중…';
      q.then(function (res) {
        if (res.error) document.getElementById('fErr').textContent = '저장 실패: ' + res.error.message;
        else render(ctx);
      });
    };
  }

  /* ---------- 내장 목록을 DB 로 ---------- */
  function seed(SB, b) {
    var jobs = [
      SB.from('cr_genes').upsert(geneRows(b), { onConflict: 'id' }),
      SB.from('cr_traits').upsert(traitRows(b), { onConflict: 'id' })
    ];
    return Promise.all(jobs).then(function (r) {
      var bad = r.filter(function (x) { return x.error; })[0];
      if (bad) throw new Error(bad.error.message);
      /* genos 는 gene 이 먼저 있어야 외래키가 걸립니다. */
      return SB.from('cr_genos').upsert(genoRows(b), { onConflict: 'gene_id,geno' });
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      /* combos 는 id 가 uuid 라 upsert 기준이 없습니다. 통째로 갈아끼웁니다. */
      return SB.from('cr_combos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }).then(function () {
      return SB.from('cr_combos').insert(comboRows(b));
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return geneRows(b).length + genoRows(b).length + traitRows(b).length + comboRows(b).length;
    });
  }

  global.CrestedAdmin = { render: render };
})(window);
