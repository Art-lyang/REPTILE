/* =============================================================================
   진료 참고 기록 — 병원에 개체를 데려갈 때 함께 내는 문서
   -----------------------------------------------------------------------------
   진료실에서 벌어지는 일은 대체로 이렇습니다. 수의사가 묻습니다.
   "마지막으로 언제 먹었나요?" "몇 그램이었죠?" "언제부터 그랬나요?"
   그리고 사육자는 기억으로 답합니다. 기억은 틀립니다 — 특히 걱정될수록.

   이 문서는 그 질문들에 **날짜로** 답하기 위한 것입니다.

   ⚠️ 이건 진단서가 아닙니다. 우리가 판단한 것은 한 줄도 넣지 않습니다.
      기록을 날짜순으로 정리해 놓을 뿐이고, 읽고 판단하는 것은 수의사입니다.
      화면에도 그렇게 적습니다 — 안 적으면 '앱이 이렇게 말했다' 가 되고,
      그건 우리가 해서는 안 되는 말입니다.

   ⚠️ 새 표를 만들지 않습니다. animals · care_records · weight_logs ·
      care_plans 를 읽어 정리할 뿐입니다. 마이그레이션 0건.

   무엇을 싣는가 — 파충류 진료에서 실제로 묻는 순서대로입니다.
     1. 개체 — 종·성별·나이·현재 체중
     2. 거식 — 마지막 식사일과 그 뒤로 며칠. 여기가 제일 먼저 나와야 합니다
     3. 체중 — 최고점 대비 얼마나 빠졌는가
     4. 증세 — 언제부터 무엇이. 수의사 상담 권고 항목을 위로
     5. 배변·탈피 — 마지막 날짜
     6. 투약·처치 — 건강 기록에 적어 둔 것
     7. 사육 환경 — 계획에 적힌 주기와 먹이
   ============================================================================= */
(function (global) {
  'use strict';

  const WINDOW_DAYS = 90;

  function byDateDesc(a, b) {
    if (a.done_date !== b.done_date) return a.done_date < b.done_date ? 1 : -1;
    return String(a.created_at || '') < String(b.created_at || '') ? 1 : -1;
  }

  function build(ctx) {
    const C = ctx.core;
    const animal = ctx.animal;
    if (!animal || !C) return null;

    const today = ctx.today || C.today();
    const from = C.addDays(today, -WINDOW_DAYS);

    const records = (ctx.records || [])
      .filter(r => r.animal_id === animal.id && r.done_date);
    const weights = (ctx.weights || [])
      .filter(w => w.animal_id === animal.id && w.measured_on)
      .slice().sort((a, b) => a.measured_on < b.measured_on ? -1 : 1);
    const plans = (ctx.plans || [])
      .filter(p => p.animal_id === animal.id && p.is_active !== false);

    const recent = records.filter(r => r.done_date >= from).sort(byDateDesc);

    return {
      days: WINDOW_DAYS,
      today: today,
      animal: animal,
      age: animal.hatch_date && C.ageText ? C.ageText(animal.hatch_date, today) : null,
      feeding: feedingSummary(records, C, today),
      weight: weightSummary(weights, C, today),
      signs: signTimeline(recent, C),
      lastSeen: lastSeenByKind(records, ['poop', 'shed', 'clean', 'water']),
      treatments: treatmentLines(recent),
      environment: environmentSummary(recent, plans, C),
      memos: memoLines(recent)
    };
  }

  /* 거식이 며칠째인가.
     파충류 진료에서 가장 먼저 나오는 숫자입니다. '안 먹은 지 얼마나 됐나요'
     에 "글쎄요 한 2주?" 라고 답하는 것과 "3월 4일이 마지막, 오늘로 19일째"
     라고 답하는 것은 다릅니다. */
  function feedingSummary(records, C, today) {
    const feeds = records.filter(r => r.kind === 'feed').sort(byDateDesc);
    const refusals = records.filter(r => r.kind === 'refusal').sort(byDateDesc);
    const last = feeds[0] || null;

    /* 마지막 식사 이후의 거식 기록만 셉니다. 그 전 것은 이미 끝난 일입니다. */
    const since = last ? refusals.filter(r => r.done_date > last.done_date) : refusals;

    const kinds = {};
    feeds.filter(r => r.feed_name).slice(0, 60).forEach(function (r) {
      const f = kinds[r.feed_name] || (kinds[r.feed_name] = { name: r.feed_name, count: 0 });
      f.count += 1;
    });

    return {
      last: last ? { date: last.done_date, name: last.feed_name || null, note: last.note || null } : null,
      daysSince: last ? C.daysBetween(last.done_date, today) : null,
      refusalsSinceLastMeal: since.length,
      refusals: refusals.slice(0, 10).map(r => ({ date: r.done_date, note: r.note || null })),
      feeds: Object.keys(kinds).map(k => kinds[k]).sort((a, b) => b.count - a.count).slice(0, 6)
    };
  }

  /* 체중은 '지금 몇 그램' 보다 '어디서 얼마나 빠졌나' 가 진단에 쓰입니다. */
  function weightSummary(weights, C, today) {
    if (!weights.length) return null;
    const latest = weights[weights.length - 1];
    let peak = weights[0];
    weights.forEach(function (w) { if (Number(w.grams) > Number(peak.grams)) peak = w; });

    const drop = Number(peak.grams) - Number(latest.grams);
    const pct = Number(peak.grams) > 0 ? drop / Number(peak.grams) * 100 : 0;

    return {
      latest: { date: latest.measured_on, grams: Number(latest.grams) },
      peak: { date: peak.measured_on, grams: Number(peak.grams) },
      /* 최고점이 곧 최신이면 '빠졌다' 는 말 자체가 성립하지 않습니다. */
      dropGrams: peak.measured_on === latest.measured_on ? null : Math.round(drop * 10) / 10,
      dropPercent: peak.measured_on === latest.measured_on ? null : Math.round(pct * 10) / 10,
      daysSince: C.daysBetween(latest.measured_on, today),
      /* 그래프 없이도 흐름이 보이게 최근 12개만 표로 싣습니다. */
      series: weights.slice(-12).map(w => ({ date: w.measured_on, grams: Number(w.grams) }))
    };
  }

  /* 증세는 '언제부터' 가 핵심입니다. 같은 증세가 여러 번 기록됐으면 가장
     오래된 것이 시작일입니다. */
  function signTimeline(recent, C) {
    const rows = recent.filter(r => r.kind === 'symptom' && r.detail);
    const bySign = {};
    rows.forEach(function (r) {
      const s = bySign[r.detail] || (bySign[r.detail] = {
        sign: r.detail, first: r.done_date, last: r.done_date, count: 0, notes: []
      });
      s.count += 1;
      if (r.done_date < s.first) s.first = r.done_date;
      if (r.done_date > s.last) s.last = r.done_date;
      if (r.note && s.notes.length < 3) s.notes.push({ date: r.done_date, note: r.note });
    });

    const SIGNS = (C && C.SIGNS) || {};
    return Object.keys(bySign).map(function (k) {
      const s = bySign[k];
      s.vet = !!(SIGNS[k] && SIGNS[k].vet);
      return s;
      /* 상담 권고 항목을 위로 올립니다. 진료실에서 먼저 봐야 할 줄이라서요. */
    }).sort(function (a, b) {
      if (a.vet !== b.vet) return a.vet ? -1 : 1;
      return a.first < b.first ? -1 : 1;
    });
  }

  function lastSeenByKind(records, kinds) {
    const out = {};
    kinds.forEach(function (kind) {
      const rows = records.filter(r => r.kind === kind).sort(byDateDesc);
      out[kind] = rows.length ? rows[0].done_date : null;
    });
    return out;
  }

  /* 투약·처치. health 기록에 사육자가 적어 둔 글을 날짜와 함께 그대로
     싣습니다. 우리가 요약하지 않습니다 — 약 이름 한 글자가 중요합니다. */
  function treatmentLines(recent) {
    return recent
      .filter(r => r.kind === 'health' && (r.note || r.title))
      .slice(0, 20)
      .map(r => ({ date: r.done_date, title: r.title || null, note: r.note || null }));
  }

  /* 사육 환경. 온도를 담는 칸이 따로 없어서, 계획에 적힌 주기와 최근 먹이로
     대신합니다. 부족한 부분은 메모로 채워집니다. */
  function environmentSummary(recent, plans, C) {
    return {
      plans: plans.map(function (p) {
        return {
          title: p.title || p.kind,
          kind: p.kind,
          interval_days: p.interval_days || null,
          weekdays: p.weekdays || null
        };
      }),
      supplements: recent.filter(r => r.kind === 'supplement')
        .slice(0, 8).map(r => ({ date: r.done_date, title: r.title || null }))
    };
  }

  function memoLines(recent) {
    return recent
      .filter(r => r.kind === 'memo' && r.note)
      .slice(0, 10)
      .map(r => ({ date: r.done_date, note: r.note }));
  }

  global.MedicalReport = {
    WINDOW_DAYS: WINDOW_DAYS,
    build: build,
    feedingSummary: feedingSummary,
    weightSummary: weightSummary,
    signTimeline: signTimeline,
    treatmentLines: treatmentLines
  };
}(window));
