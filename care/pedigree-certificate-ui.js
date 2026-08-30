/* =============================================================================
   혈통서 — 화면과 인쇄본
   -----------------------------------------------------------------------------
   값을 고르는 일은 pedigree-certificate.js 가 합니다. 여기서는 그것을 문서
   모양으로 올릴 뿐입니다.

   따로 페이지를 만들지 않고 개체 화면 안에 접어 둡니다. 새 창으로 열면 팝업
   차단에 걸리고, 별도 주소로 만들면 사진 서명을 다시 받아야 합니다.
   인쇄할 때는 @media print 가 문서만 남기고 나머지를 숨깁니다.

   소유권·거래가격 자리는 비워 두고 그렇게 적습니다. 지금 없는 것을 아예
   안 그리면, 받는 사람은 그런 항목이 있는 줄도 모릅니다.
   ============================================================================= */
(function (global) {
  'use strict';

  const Doc = global.PedigreeCertificate;

  function icon(name) { return '<i class="bi ' + name + '" aria-hidden="true"></i>'; }

  function section(title, body, note) {
    return '<section class="pc-sec"><h3>' + title + '</h3>'
      + (note ? '<p class="pc-note">' + note + '</p>' : '') + body + '</section>';
  }

  /* 혈통. 가로로 넓은 나무는 종이에 안 들어갑니다. 문서에서는 세대별 목록으로
     폅니다 — 인쇄해서 건네는 것이 목적이라 종이에 맞는 모양이 먼저입니다. */
  function pedigreeHtml(p, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    if (!p || !p.up.length) return '<p class="pc-empty">' + esc(I.t('pcNoPedigree')) + '</p>';
    const rows = p.up.map(function (row, gen) {
      const names = row.map(function (node) {
        const name = node.animal ? (node.animal.name || I.t('unnamed')) : I.t('deletedAnimal');
        return '<li' + (node.repeated ? ' class="pc-repeat"' : '') + '>' + esc(name) + '</li>';
      }).join('');
      return '<div class="pc-gen"><h4>' + esc(I.t('pcGeneration', { n: gen + 1 }))
        + ' <span>' + row.length + '/' + Math.pow(2, gen + 1) + '</span></h4>'
        + '<ul>' + names + '</ul></div>';
    }).join('');
    const warn = p.repeats.length
      ? '<p class="pc-warn">' + icon('bi-exclamation-triangle') + esc(I.t('pcRepeated', {
          names: p.repeats.map(r => (r.name || I.t('unnamed'))
            + ' ' + I.t('countTimes', { count: r.count })).join(', ')
        })) + '</p>'
      : '';
    return rows + warn
      + '<p class="pc-note">' + esc(I.t('pcKnown', { filled: p.known.filled, total: p.known.total })) + '</p>';
  }

  function careHtml(care, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    const rows = [];
    if (care.plans.length) {
      rows.push('<tr><th>' + esc(I.t('pcPlans')) + '</th><td>'
        + care.plans.map(p => esc(p.title) + (p.interval_days
            ? ' · ' + esc(I.t('cycleEveryDays', { count: p.interval_days })) : '')).join('<br>')
        + '</td></tr>');
    }
    if (care.feeds.length) {
      rows.push('<tr><th>' + esc(I.t('pcFed')) + '</th><td>'
        + care.feeds.map(f => esc(f.name) + ' ' + I.t('countTimes', { count: f.count })).join(' · ')
        + '</td></tr>');
    }
    care.kinds.forEach(function (k) {
      if (k.kind === 'memo') return;      /* 메모는 아래 절에 따로 실립니다 */
      rows.push('<tr><th>' + esc(I.kindName(k.kind)) + '</th><td>'
        + I.t('countTimes', { count: k.count })
        + (k.last ? ' · ' + esc(I.t('pcLast', { date: I.formatDate(k.last) })) : '') + '</td></tr>');
    });
    if (!rows.length) return '<p class="pc-empty">' + esc(I.t('pcNoCare')) + '</p>';
    return '<table class="pc-table">' + rows.join('') + '</table>';
  }

  function weightHtml(weights, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    if (!weights.length) return '<p class="pc-empty">' + esc(I.t('pcNoWeight')) + '</p>';
    const first = weights[0], last = weights[weights.length - 1];
    return '<table class="pc-table">'
      + '<tr><th>' + esc(I.t('pcFirstWeight')) + '</th><td>' + esc(I.formatDate(first.measured_on))
      + ' · ' + first.grams + 'g</td></tr>'
      + '<tr><th>' + esc(I.t('pcLastWeight')) + '</th><td>' + esc(I.formatDate(last.measured_on))
      + ' · ' + last.grams + 'g</td></tr>'
      + '<tr><th>' + esc(I.t('pcWeighCount')) + '</th><td>'
      + I.t('countTimes', { count: weights.length }) + '</td></tr></table>';
  }

  function memoHtml(memos, post, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    let h = '';
    if (memos.length) {
      h += '<ul class="pc-memos">' + memos.map(m => '<li><b>' + esc(I.formatDate(m.date))
        + '</b> ' + esc(m.note) + '</li>').join('') + '</ul>';
    }
    if (post) {
      h += '<div class="pc-post"><b>' + esc(I.t('pcPostscript')) + '</b>'
        + '<p>' + esc(post.note) + '</p>'
        + '<span class="pc-note">' + esc(I.formatDate(post.date)) + '</span></div>';
    }
    return h || '<p class="pc-empty">' + esc(I.t('pcNoMemo')) + '</p>';
  }

  /* 사육자가 문서를 만들면서 덧붙이는 글. 온도·환경처럼 담을 필드가 없는 것을
     여기에 문장으로 씁니다 — '28~30℃, 페이퍼타올, 은신처 3곳' 처럼요. */
  function postscriptForm(post, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    return '<div class="pc-postform no-print">'
      + '<label for="pc_post">' + esc(I.t('pcPostLabel')) + '</label>'
      + '<p class="pc-note">' + esc(I.t('pcPostHint')) + '</p>'
      + '<textarea class="in" id="pc_post" rows="3" maxlength="500" placeholder="'
      + esc(I.t('pcPostPlaceholder')) + '">' + esc(post ? post.note : '') + '</textarea>'
      + '<button class="mini" id="pc_post_save">' + icon('bi-check2') + esc(I.t('save')) + '</button>'
      + '</div>';
  }

  function html(ctx) {
    const doc = Doc.build(ctx);
    if (!doc) return '';
    const I = ctx.i18n, esc = ctx.esc, C = ctx.core;
    const a = doc.animal;
    const sp = C.SPECIES[a.species] || C.SPECIES.other;

    const facts = [
      [I.t('species'), I.speciesName(a.species)],
      [I.t('sex'), a.sex === 'male' ? I.t('sexMale') : a.sex === 'female' ? I.t('sexFemale') : I.t('sexUnknown')],
      [I.t('lifeStage'), I.t(ctx.lifeStage.labelKey(a.life_stage))],
      [I.t('hatchAdoptionDate'), a.hatch_date ? I.formatDate(a.hatch_date) : null],
      [I.t('clutchLabel'), a.clutch_label || null],
      [I.t('morph'), (a.morphs || []).join(' · ') || null]
    ].filter(f => f[1]);

    return '<div class="pad pc-root" id="pedigree-certificate">'
      + '<div class="lbl no-print">' + esc(I.t('pcTitle')) + '</div>'
      + '<div class="hint no-print">' + esc(I.t('pcHint')) + '</div>'
      + '<article class="pc-doc">'
      + '<header class="pc-head"><h2>' + esc(a.name || I.t('unnamed')) + '</h2>'
      + '<p>' + sp.icon + ' ' + esc(I.speciesName(a.species))
      + ' · ' + esc(I.t('pcIssued', { date: I.formatDate(C.today()) })) + '</p></header>'

      + section(esc(I.t('pcIdentity')),
          '<table class="pc-table">' + facts.map(f => '<tr><th>' + esc(f[0]) + '</th><td>'
            + esc(f[1]) + '</td></tr>').join('') + '</table>')

      + section(esc(I.t('pedigree')), pedigreeHtml(doc.pedigree, ctx))
      + section(esc(I.t('pcCare')), careHtml(doc.care, ctx), esc(I.t('pcCareWindow', { days: doc.care.days })))
      + section(esc(I.t('weight')), weightHtml(doc.weights, ctx))
      + section(esc(I.t('pcMemo')), memoHtml(doc.memos, doc.postscript, ctx))

      /* 비워 두고 그렇게 적습니다. 아예 안 그리면 받는 사람은 그런 항목이
         있는 줄도 모릅니다. */
      + section(esc(I.t('pcOwnership')),
          '<p class="pc-empty">' + esc(I.t('pcOwnershipSoon')) + '</p>')

      + '<footer class="pc-foot">' + esc(I.t('pcDisclaimer')) + '</footer>'
      + '</article>'
      + postscriptForm(doc.postscript, ctx)
      + '<div class="pc-acts no-print">'
      + '<button class="btn ghost wide" id="pc_print">' + icon('bi-printer')
      + esc(I.t('pcPrint')) + '</button></div></div>';
  }

  global.PedigreeCertificateUi = { html: html };
}(window));
