(function (global) {
  'use strict';

  function row(plan, today) {
    const weeklyTarget = Number(plan && plan.weekly_target);
    const hasTarget = Number.isInteger(weeklyTarget) && weeklyTarget >= 1 && weeklyTarget <= 7;
    const weekdays = !hasTarget && Array.isArray(plan && plan.weekdays)
      ? plan.weekdays.map(Number).filter(function (day) {
          return Number.isInteger(day) && day >= 0 && day <= 6;
        }).filter(function (day, index, list) { return list.indexOf(day) === index; })
      : [];
    const interval = Number(plan && plan.interval_days);
    const normalizedInterval = !hasTarget && !weekdays.length
      && Number.isInteger(interval) && interval >= 1 && interval <= 365 ? interval : 1;

    return {
      animal_id: plan.animal_id || null,
      kind: plan.kind,
      title: plan.title || null,
      detail: plan.detail || null,
      feed_item_id: plan.feed_item_id || null,
      interval_days: hasTarget || weekdays.length ? null : normalizedInterval,
      weekdays: weekdays.length ? weekdays : null,
      weekly_target: hasTarget ? weeklyTarget : null,
      start_date: plan.start_date || today,
      time_of_day: plan.time_of_day || null,
      is_active: plan.is_active !== false,
    };
  }

  global.CarePlanStore = Object.freeze({ row: row });
})(window);
