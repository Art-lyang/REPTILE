/* =============================================================================
   진료 참고 기록 — 화면과 인쇄본
   -----------------------------------------------------------------------------
   값을 고르는 일은 medical-report.js 가 합니다. 여기서는 종이에 맞는 모양으로
   올릴 뿐입니다.

   혈통서와 같은 방식으로 개체 화면 안에 접어 둡니다. 새 창을 열면 팝업
   차단에 걸리고, 별도 주소로 만들면 로그인과 사진 서명을 다시 받아야 합니다.
   인쇄를 누르면 @media print 가 이 문서만 남깁니다 — 브라우저의 'PDF로 저장'
   이 그대로 PDF 가 됩니다.

   ⚠️ 맨 위에 '진단서가 아니다' 를 반드시 답니다. 이 문서는 병원에서 남에게
      건네지는 종이입니다. 그 종이에 우리 판단이 실린 것처럼 보이면 안 됩니다.
   ============================================================================= */
(function (global) {
  'use strict';

  function icon(name) { return '<i class="bi ' + name + '" aria-hidden="true"></i>'; }

  function section(title, body) {
    if (!body) return '';
    return '<section class="mr-sec"><h3>' + title + '</h3>' + body + '</section>';
  }

  function rows(list) {
    if (!list.length) return '';
    return '<table class="mr-tbl"><tbody>' + list.join('') + '</tbody></table>';
  }

  function row(k, v) {
    return v == null || v === '' ? '' : '<tr><th>' + k + '</th><td>' + v + '</td></tr>';
  }

  /* 식사 — 문서에서 제일 먼저 나옵니다. 진료실에서 제일 먼저 묻습니다. */
  function feedingHtml(f, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    if (!f.last && !f.refusals.length) return '<p class="mr-empty">' + esc(I.t('mrNone')) + '</p>';

    const big = f.daysSince == null ? '' :
      '<div class="mr-big"><span class="mr-num">' + f.daysSince + '</span>'
      + '<span class="mr-unit">' + esc(I.t('mrDaysUnit')) + '</span>'
      + '<span class="mr-cap">' + esc(I.t('mrSinceLastMeal')) + '</span></div>';

    const list = [];
    if (f.last) {
      list.push(row(esc(I.t('mrLastMeal')),
        esc(I.formatDate(f.last.date)) + (f.last.name ? ' · ' + esc(f.last.name) : '')
        + (f.last.note ? '<br><span class="mr-dim">' + esc(f.last.note) + '</span>' : '')));
    }
    if (f.refusalsSinceLastMeal) {
      list.push(row(esc(I.t('mrRefusalsAfter')),
        esc(I.t('mrCountTimes', { count: f.refusalsSinceLastMeal }))));
    }
    if (f.feeds.length) {
      list.push(row(esc(I.t('mrFedItems')),
        f.feeds.map(x => esc(x.name) + ' ' + esc(I.t('mrCountTimes', { count: x.count }))).join('<br>')));
    }
    if (f.refusals.length) {
      list.push(row(esc(I.t('mrRefusalDates')),
        f.refusals.map(x => esc(I.formatDate(x.date))
          + (x.note ? ' · <span class="mr-dim">' + esc(x.note) + '</span>' : '')).join('<br>')));
    }
    return big + rows(list);
  }

  function weightHtml(w, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    if (!w) return '<p class="mr-empty">' + esc(I.t('mrNone')) + '</p>';

    const list = [
      row(esc(I.t('mrLatestWeight')),
        w.latest.grams + 'g · ' + esc(I.formatDate(w.latest.date))),
      row(esc(I.t('mrPeakWeight')),
        w.peak.grams + 'g · ' + esc(I.formatDate(w.peak.date)))
    ];
    if (w.dropGrams != null && w.dropGrams > 0) {
      list.push(row(esc(I.t('mrDropped')),
        '<b>' + w.dropGrams + 'g (' + w.dropPercent + '%)</b>'));
    }
    const series = w.series.map(p =>
      '<tr><td>' + esc(I.formatDate(p.date)) + '</td><td>' + p.grams + 'g</td></tr>').join('');

    return rows(list)
      + '<table class="mr-tbl mr-series"><tbody>' + series + '</tbody></table>';
  }

  function signsHtml(list, ctx) {
    const I = ctx.i18n, esc = ctx.esc;
    if (!list.length) return '<p class="mr-empty">' + esc(I.t('mrNone')) + '</p>';
    return '<ul class="mr-signs">' + list.map(function (s) {
      const name = I.signName ? I.signName(s.sign) : s.sign;
      return '<li' + (s.vet ? ' class="mr-vet"' : '') + '>'
        + '<b>' + esc(name) + '</b>'
        + (s.vet ? '<span class="mr-tag">' + esc(I.t('mrVetFlag')) + '</span>' : '')
        + '<div class="mr-dim">' + esc(I.t('mrSignRange', {
            first: I.formatDate(s.first), last: I.formatDate(s.last), count: s.count
          })) + '</div>'
        + (s.notes.length ? '<div class="mr-dim">' + s.notes.map(n =>
            esc(I.formatDate(n.date)) + ' — ' + esc(n.note)).join('<br>') + '</div>' : '')
        + '</li>';
    }).join('') + '</ul>';
  }

  function html(ctx) {
    const Doc = global.MedicalReport;
    if (!Doc) return '';
    const data = Doc.build(ctx);
    if (!data) return '';

    const I = ctx.i18n, esc = ctx.esc;
    const a = data.animal;

    /* 라벨은 이 문서 전용 키를 씁니다. 다른 화면과 키를 나눠 쓰면 그쪽
       문구를 다듬을 때 이 종이가 같이 바뀝니다. */
    const head = rows([
      row(esc(I.t('mrName')), esc(a.name || I.t('unnamed'))),
      row(esc(I.t('mrSpecies')), esc(I.speciesName ? I.speciesName(a.species) : a.species || '')),
      row(esc(I.t('mrSex')), esc(a.sex ? I.t('sex_' + a.sex) : '')),
      row(esc(I.t('mrHatch')), a.hatch_date
        ? esc(I.formatDate(a.hatch_date)) + (data.age ? ' · ' + esc(data.age) : '') : ''),
      row(esc(I.t('mrMorphs')), (a.morphs || []).length ? esc((a.morphs || []).join(', ')) : '')
    ]);

    const seen = data.lastSeen;
    const seenRows = rows([
      row(esc(I.kindName('poop')), seen.poop ? esc(I.formatDate(seen.poop)) : esc(I.t('mrNone'))),
      row(esc(I.kindName('shed')), seen.shed ? esc(I.formatDate(seen.shed)) : esc(I.t('mrNone'))),
      row(esc(I.kindName('clean')), seen.clean ? esc(I.formatDate(seen.clean)) : esc(I.t('mrNone')))
    ]);

    const treat = data.treatments.length
      ? rows(data.treatments.map(t => row(esc(I.formatDate(t.date)),
          (t.title ? '<b>' + esc(t.title) + '</b>' : '')
          + (t.note ? (t.title ? '<br>' : '') + esc(t.note) : ''))))
      : '';

    const env = [];
    if (data.environment.plans.length) {
      env.push(row(esc(I.t('mrPlans')), data.environment.plans.map(p =>
        esc(p.title) + (p.interval_days
          ? ' · ' + esc(I.t('cycleEveryDays', { count: p.interval_days })) : '')).join('<br>')));
    }
    if (data.environment.supplements.length) {
      env.push(row(esc(I.t('mrSupplements')), data.environment.supplements.map(s =>
        esc(I.formatDate(s.date)) + (s.title ? ' · ' + esc(s.title) : '')).join('<br>')));
    }

    const memos = data.memos.length
      ? rows(data.memos.map(m => row(esc(I.formatDate(m.date)), esc(m.note))))
      : '';

    return '<details class="pad mr-wrap" id="mrBox">'
      + '<summary><span class="lbl">' + icon('bi-file-medical') + esc(I.t('mrTitle')) + '</span>'
      + '<span class="mr-sum">' + esc(I.t('mrWindow', { n: data.days })) + '</span></summary>'

      + '<div class="mr-doc" id="mrDoc">'
      + '<header class="mr-head">'
      + '<h2>' + esc(I.t('mrTitle')) + '</h2>'
      + '<p class="mr-dim">' + esc(I.t('mrPrepared', { date: I.formatDate(data.today) }))
      + ' · ' + esc(I.t('mrWindow', { n: data.days })) + '</p>'
      /* 진단서가 아니라는 말을 문서 맨 위에 둡니다. 아래에 두면 종이를
         받아든 사람이 못 보고 지나갑니다. */
      + '<p class="mr-disc">' + icon('bi-info-circle') + esc(I.t('mrDisclaimer')) + '</p>'
      + '</header>'

      + section(esc(I.t('mrAnimalSec')), head)
      + section(esc(I.t('mrFeedingSec')), feedingHtml(data.feeding, ctx))
      + section(esc(I.t('mrWeightSec')), weightHtml(data.weight, ctx))
      + section(esc(I.t('mrSignsSec')), signsHtml(data.signs, ctx))
      + section(esc(I.t('mrRoutineSec')), seenRows)
      + section(esc(I.t('mrTreatmentSec')), treat)
      + section(esc(I.t('mrEnvSec')), rows(env))
      + section(esc(I.t('mrMemoSec')), memos)
      + '</div>'

      + '<div class="mr-acts">'
      + '<button class="btn" id="mr_print" type="button">'
      + icon('bi-printer') + esc(I.t('mrPrint')) + '</button>'
      + '</div>'
      + '<p class="mr-dim mr-tip">' + esc(I.t('mrPrintTip')) + '</p>'
      + '</details>';
  }

  global.MedicalReportUi = { html: html };
}(window));
