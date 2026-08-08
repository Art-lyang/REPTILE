/* =============================================================================
   혈통서
   -----------------------------------------------------------------------------
   분양할 때 개체와 함께 넘기는 문서입니다. 받는 사람이 알고 싶은 것은 두
   가지입니다 — 어떤 혈통인가, 어떻게 길러졌는가.

   ⚠️ 새 표를 만들지 않습니다. 여기 나오는 값은 전부 이미 있는 것을 읽어
      정리한 것뿐입니다(animals · care_records · care_plans · weight_logs).
      마이그레이션이 0건이라는 뜻이고, supabase_v64.sql 이 스테이징 검증을
      마치기 전까지 그 위에 아무것도 쌓지 않는다는 뜻이기도 합니다.

   소유권·거래가격은 여기 없습니다. 그건 혈통서가 아니라 양도 기록이고,
   plans/transfer-docs-roadmap.md 의 Phase 2 입니다. 자리만 비워 둡니다 —
   나중에 덧붙이려 하면 문서 구조를 다시 짜게 됩니다.

   온도·환경도 담을 필드가 없습니다. 대신 사육자가 쓴 메모를 그대로 싣고,
   문서를 만들 때 '추신' 을 덧붙일 수 있게 했습니다. 환경은 개체마다 문장으로
   쓰는 편이 자연스럽습니다 — '28~30℃, 페이퍼타올, 은신처 3곳' 처럼요.
   ============================================================================= */
(function (global) {
  'use strict';

  /* 추신은 따로 저장할 곳을 만들지 않고 케어 메모로 남깁니다. 이 제목으로
     찾아서 다음 번 문서에도 자동으로 실립니다. */
  const POSTSCRIPT_TITLE = 'pedigree-postscript';

  function build(ctx) {
    const C = ctx.core, I = ctx.i18n, esc = ctx.esc;
    const animal = ctx.animal;
    if (!animal) return null;

    const records = (ctx.records || []).filter(r => r.animal_id === animal.id);
    const plans = (ctx.plans || []).filter(p => p.animal_id === animal.id && p.is_active !== false);
    const weights = (ctx.weights || []).filter(w => w.animal_id === animal.id)
      .slice().sort((a, b) => a.measured_on < b.measured_on ? -1 : 1);

    return {
      animal: animal,
      pedigree: C.buildPedigree(ctx.animals || [], animal.id, 6),
      care: careSummary(records, plans, C, I),
      weights: weights,
      memos: memoLines(records),
      postscript: postscriptOf(records)
    };
  }

  /* 케어 이력 요약.
     '몇 번 먹였다' 만으로는 읽는 사람이 그게 잦은 건지 모릅니다. 계획에 적힌
     주기를 함께 보여 줘야 '3일마다 주기로 두고 실제로 28번' 이 됩니다. */
  function careSummary(records, plans, C, I) {
    const day = C.today();
    const from = C.addDays(day, -180);
    /* 추신은 케어 메모로 저장되지만 사육 행위가 아닙니다. 세면 '메모 2회' 처럼
       기록 횟수가 부풀어, 문서가 스스로를 실적으로 세는 꼴이 됩니다. */
    const recent = records.filter(r => r.done_date && r.done_date >= from
      && r.title !== POSTSCRIPT_TITLE);

    const byKind = {};
    recent.forEach(function (r) {
      const k = byKind[r.kind] || (byKind[r.kind] = { kind: r.kind, count: 0, last: null });
      k.count += 1;
      if (!k.last || r.done_date > k.last) k.last = r.done_date;
    });

    /* 먹인 것 종류별로. 무엇을 먹고 자랐는지가 분양받는 사람에게 가장
       실질적인 정보입니다 — 슈퍼푸드만 먹던 개체에게 갑자기 곤충만 주면
       안 먹습니다. */
    const feeds = {};
    recent.filter(r => r.kind === 'feed' && r.feed_name).forEach(function (r) {
      const f = feeds[r.feed_name] || (feeds[r.feed_name] = { name: r.feed_name, count: 0, category: r.feed_category });
      f.count += 1;
    });

    return {
      days: 180,
      kinds: Object.keys(byKind).map(k => byKind[k]).sort((a, b) => b.count - a.count),
      feeds: Object.keys(feeds).map(k => feeds[k]).sort((a, b) => b.count - a.count),
      plans: plans.map(function (p) {
        return { title: p.title || p.kind, kind: p.kind, cycle: C.cycleText ? C.cycleText(p, I) : null,
                 interval_days: p.interval_days, weekdays: p.weekdays };
      })
    };
  }

  /* 사육 메모. 추신은 따로 뽑으므로 여기서 뺍니다 — 같은 글이 문서에 두 번
     나오면 어느 쪽이 최신인지 알 수 없습니다. */
  function memoLines(records) {
    return records
      .filter(r => r.kind === 'memo' && r.note && r.title !== POSTSCRIPT_TITLE)
      .slice()
      .sort((a, b) => a.done_date < b.done_date ? 1 : -1)
      .slice(0, 12)
      .map(r => ({ date: r.done_date, note: r.note }));
  }

  function postscriptOf(records) {
    const rows = records.filter(r => r.title === POSTSCRIPT_TITLE && r.note)
      .slice().sort((a, b) => a.done_date < b.done_date ? 1 : -1);
    return rows.length ? { date: rows[0].done_date, note: rows[0].note } : null;
  }

  /* 추신 저장. 새 표가 아니라 케어 메모입니다 — 날짜가 함께 남아서, 언제 쓴
     글인지 문서에 그대로 적을 수 있습니다. */
  function savePostscript(app, animalId, text) {
    const note = String(text == null ? '' : text).trim();
    if (!note) return Promise.resolve(null);
    return app.addRecord({ animal_id: animalId, kind: 'memo', title: POSTSCRIPT_TITLE, note: note });
  }

  global.PedigreeCertificate = {
    POSTSCRIPT_TITLE: POSTSCRIPT_TITLE,
    build: build,
    careSummary: careSummary,
    memoLines: memoLines,
    postscriptOf: postscriptOf,
    savePostscript: savePostscript
  };
}(window));
