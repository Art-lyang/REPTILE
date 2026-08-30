(function (global) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  function toEpoch(date) {
    const parts = date.split('-').map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  }

  function fromEpoch(epoch) {
    return new Date(epoch).toISOString().slice(0, 10);
  }

  function addDays(date, amount) {
    return fromEpoch(toEpoch(date) + amount * DAY_MS);
  }

  function weekday(date) {
    return new Date(toEpoch(date)).getUTCDay();
  }

  function weeklyTarget(plan) {
    const target = Number(plan && plan.weekly_target);
    return Number.isInteger(target) && target >= 1 && target <= 7 ? target : null;
  }

  function mondayStart(date) {
    const daysAfterMonday = (weekday(date) + 6) % 7;
    return addDays(date, -daysAfterMonday);
  }

  function weekDates(date) {
    const monday = mondayStart(date);
    return Array.from({ length: 7 }, function (_, index) {
      return addDays(monday, index);
    });
  }

  function fixedDue(plan, date) {
    if (!plan || plan.is_active === false) return false;
    const start = plan.start_date || '1970-01-01';
    if (date < start) return false;

    if (Array.isArray(plan.weekdays) && plan.weekdays.length) {
      return plan.weekdays.map(Number).indexOf(weekday(date)) >= 0;
    }

    const interval = Number(plan.interval_days);
    if (!Number.isInteger(interval) || interval < 1) return false;
    const elapsed = (toEpoch(date) - toEpoch(start)) / DAY_MS;
    return Number.isInteger(elapsed) && elapsed % interval === 0;
  }

  function completionDates(plan, records) {
    if (!plan || plan.id == null) return new Set();
    return new Set((records || [])
      .filter(function (record) { return record.plan_id === plan.id; })
      .map(function (record) { return record.done_date; }));
  }

  function weeklyProgress(plan, records, date) {
    const target = weeklyTarget(plan);
    const completed = completionDates(plan, records);
    const start = plan && plan.start_date ? plan.start_date : '1970-01-01';
    const days = weekDates(date).map(function (day) {
      const available = day >= start;
      return {
        date: day,
        done: available && completed.has(day),
        available: available,
        future: day > date,
        today: day === date,
      };
    });
    const done = target === null ? 0 : days.filter(function (day) { return day.done; }).length;

    return {
      target: target,
      done: done,
      remaining: target === null ? 0 : Math.max(0, target - done),
      complete: target !== null && done >= target,
      days: days,
    };
  }

  function fixedPlans(plans) {
    return (plans || []).filter(function (plan) {
      return plan && plan.is_active !== false && weeklyTarget(plan) === null;
    });
  }

  function achievementOn(plans, records, date) {
    const duePlans = plans.filter(function (plan) { return fixedDue(plan, date); });
    const completedPlanIds = new Set((records || [])
      .filter(function (record) { return record.done_date === date; })
      .map(function (record) { return record.plan_id; }));
    const done = duePlans.filter(function (plan) {
      return plan.id != null && completedPlanIds.has(plan.id);
    }).length;

    return {
      due: duePlans.length,
      done: done,
      allDone: duePlans.length > 0 && done === duePlans.length,
    };
  }

  function todayAchievement(plans, records, date, streakOverride) {
    const scheduled = fixedPlans(plans);
    const today = achievementOn(scheduled, records, date);
    if (Number.isInteger(streakOverride) && streakOverride >= 0) {
      return {
        due: today.due,
        done: today.done,
        allDone: today.allDone,
        current: streakOverride,
        next: streakOverride + 1,
      };
    }
    if (!scheduled.length) {
      return { due: 0, done: 0, allDone: false, current: 0, next: 1 };
    }
    let cursor = today.allDone ? date : addDays(date, -1);
    let current = 0;

    for (let checked = 0; checked < 3660; checked += 1) {
      const achievement = achievementOn(scheduled, records, cursor);
      if (achievement.due === 0) {
        cursor = addDays(cursor, -1);
      } else if (achievement.allDone) {
        current += 1;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    }

    return {
      due: today.due,
      done: today.done,
      allDone: today.allDone,
      current: current,
      next: current + 1,
    };
  }

  function weekOverview(plans, records, date) {
    const scheduled = fixedPlans(plans);
    return weekDates(date).map(function (day) {
      const achievement = achievementOn(scheduled, records, day);
      let status = 'idle';
      if (achievement.due > 0 && achievement.allDone) status = 'complete';
      else if (achievement.due > 0 && achievement.done > 0) status = 'partial';
      else if (achievement.due > 0 && day > date) status = 'future';
      else if (achievement.due > 0 && day === date) status = 'pending';
      else if (achievement.due > 0) status = 'missed';

      return {
        date: day,
        due: achievement.due,
        done: achievement.done,
        status: status,
      };
    });
  }

  global.CareRoutine = Object.freeze({
    weeklyTarget: weeklyTarget,
    mondayStart: mondayStart,
    weekDates: weekDates,
    weeklyProgress: weeklyProgress,
    fixedDue: fixedDue,
    todayAchievement: todayAchievement,
    weekOverview: weekOverview,
  });
})(window);
