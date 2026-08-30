(function (global) {
  'use strict';

  const REFUSAL_WINDOW_DAYS = 14;
  const REFUSAL_THRESHOLD = 2;
  const WEIGHT_STALE_DAYS = 30;
  const WEIGHT_DROP_WINDOW_DAYS = 30;
  const WEIGHT_DROP_PERCENT = 8;
  const SEVERITY_ORDER = { urgent: 0, attention: 1, info: 2 };

  function dateDays(from, to) {
    const start = Date.parse(String(from || '') + 'T00:00:00Z');
    const end = Date.parse(String(to || '') + 'T00:00:00Z');
    return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : 0;
  }

  function animalIndex(animals) {
    return (animals || []).reduce(function (index, animal) {
      index[animal.id] = animal;
      return index;
    }, {});
  }

  function animalName(index, animalId) {
    return index[animalId] && index[animalId].name ? index[animalId].name : '';
  }

  function recordDates(records, planId) {
    return (records || []).filter(function (record) {
      return record.plan_id === planId;
    }).map(function (record) { return record.done_date; });
  }

  function pushAlert(list, seen, alert) {
    if (seen[alert.id]) return;
    seen[alert.id] = true;
    list.push(alert);
  }

  function overdueAlerts(input, index, list, seen) {
    (input.plans || []).filter(function (plan) { return plan.is_active !== false; }).forEach(function (plan) {
      const status = input.core.planStatus(plan, input.today, recordDates(input.records, plan.id));
      if (!status || status.done || !(status.overdue > 0)) return;
      pushAlert(list, seen, {
        id: 'plan:' + plan.id,
        type: 'plan_overdue', severity: 'urgent', action: 'plans', animalId: plan.animal_id || null,
        animalName: animalName(index, plan.animal_id), planTitle: plan.title || '', overdue: status.overdue,
      });
    });
  }

  function symptomAlerts(input, index, list, seen) {
    (input.animals || []).forEach(function (animal) {
      const records = (input.records || []).filter(function (record) { return record.animal_id === animal.id; });
      const statuses = input.core.signStatus ? input.core.signStatus(records, input.today) : [];
      statuses.filter(function (status) {
        const definition = input.core.SIGNS && input.core.SIGNS[status.code];
        return status.open && definition && definition.vet;
      }).forEach(function (status) {
        pushAlert(list, seen, {
          id: 'symptom:' + animal.id + ':' + status.code,
          type: 'symptom_open', severity: 'urgent', action: 'health', animalId: animal.id,
          animalName: animalName(index, animal.id), signCode: status.code, days: status.days,
        });
      });
    });
  }

  function refusalAlerts(input, index, list, seen) {
    const start = input.core.addDays(input.today, -(REFUSAL_WINDOW_DAYS - 1));
    (input.animals || []).forEach(function (animal) {
      const days = new Set((input.records || []).filter(function (record) {
        return record.animal_id === animal.id && record.kind === 'refusal'
          && record.done_date >= start && record.done_date <= input.today;
      }).map(function (record) { return record.done_date; }));
      if (days.size < REFUSAL_THRESHOLD) return;
      pushAlert(list, seen, {
        id: 'refusal:' + animal.id,
        type: 'refusal_pattern', severity: 'attention', action: 'health', animalId: animal.id,
        animalName: animalName(index, animal.id), count: days.size,
      });
    });
  }

  function sortWeights(weights) {
    return (weights || []).slice().sort(function (left, right) {
      const leftKey = [left.measured_on || '', left.measured_at || left.created_at || ''].join('|');
      const rightKey = [right.measured_on || '', right.measured_at || right.created_at || ''].join('|');
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  }

  function weightAlerts(input, index, list, seen) {
    (input.animals || []).forEach(function (animal) {
      const history = sortWeights((input.weights || []).filter(function (weight) {
        return weight.animal_id === animal.id;
      }));
      if (!history.length) return;
      const latest = history[history.length - 1];
      const age = dateDays(latest.measured_on, input.today);
      if (age > WEIGHT_STALE_DAYS) {
        pushAlert(list, seen, {
          id: 'weight-stale:' + animal.id,
          type: 'weight_stale', severity: 'attention', action: 'weight', animalId: animal.id,
          animalName: animalName(index, animal.id), days: age,
        });
      }
      if (history.length < 2) return;
      const previous = history[history.length - 2];
      const before = Number(previous.grams);
      const after = Number(latest.grams);
      const span = dateDays(previous.measured_on, latest.measured_on);
      const percent = before > 0 ? Math.round((before - after) / before * 100) : 0;
      if (span < 0 || span > WEIGHT_DROP_WINDOW_DAYS || percent < WEIGHT_DROP_PERCENT) return;
      pushAlert(list, seen, {
        id: 'weight-drop:' + animal.id + ':' + latest.id,
        type: 'weight_drop', severity: 'attention', action: 'weight', animalId: animal.id,
        animalName: animalName(index, animal.id), percent: percent, before: before, after: after,
      });
    });
  }

  /* 무료 한도를 넘어 잠긴 개체는 알림에서 뺍니다.
     수정도 못 하고 완료 표시도 못 하는데 "오늘 급여할 시간입니다" 가 계속 뜨면,
     그건 알림이 아니라 잔소리가 됩니다. 대신 개체 목록에서 왜 멈췄는지 보여
     줍니다(care-ui.js 의 card-locked).

     activeAnimalIds 를 넘기지 않으면 아무것도 거르지 않습니다 — 한도가 없던
     시절과 프리미엄 사용자가 여기에 해당합니다. */
  function onlyActive(input) {
    const active = input.activeAnimalIds;
    if (!Array.isArray(active)) return input;
    const allowed = {};
    active.forEach(function (id) { allowed[id] = true; });
    const keep = function (row) { return !row || !row.animal_id || allowed[row.animal_id]; };
    return Object.assign({}, input, {
      animals: (input.animals || []).filter(function (a) { return !a || allowed[a.id]; }),
      plans: (input.plans || []).filter(keep),
      records: (input.records || []).filter(keep),
      weights: (input.weights || []).filter(keep),
    });
  }

  function build(rawInput) {
    const input = onlyActive(rawInput || {});
    if (!input || !input.core || !input.today) return [];
    const index = animalIndex(input.animals);
    const alerts = [];
    const seen = {};
    overdueAlerts(input, index, alerts, seen);
    symptomAlerts(input, index, alerts, seen);
    refusalAlerts(input, index, alerts, seen);
    weightAlerts(input, index, alerts, seen);
    return alerts.sort(function (left, right) {
      return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    });
  }

  global.CareAlerts = Object.freeze({
    build: build,
    settings: Object.freeze({
      refusalWindowDays: REFUSAL_WINDOW_DAYS,
      refusalThreshold: REFUSAL_THRESHOLD,
      weightStaleDays: WEIGHT_STALE_DAYS,
      weightDropWindowDays: WEIGHT_DROP_WINDOW_DAYS,
      weightDropPercent: WEIGHT_DROP_PERCENT,
    }),
  });
})(window);
