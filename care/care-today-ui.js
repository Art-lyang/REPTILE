(function (global) {
  'use strict';

  let renderEnhancer = null;

  function dayIndex(date) {
    return new Date(date + 'T00:00:00Z').getUTCDay();
  }

  function statusLabel(status, day, I) {
    if (status === 'complete') return I.t('completedAll');
    if (status === 'partial') return I.t('partialDone');
    if (status === 'future') return I.t('scheduled');
    if (status === 'idle') return I.t('noSchedule');
    if (status === 'missed') return I.t('overdueSection');
    return I.t('dueCount', { count: I.formatNumber(day.due) });
  }

  function achievementCard(options, plans) {
    const R = options.routine, I = options.i18n, esc = options.escapeHtml;
    const achievement = R.todayAchievement(plans, options.records, options.day, options.streak);
    let streak = I.t('streakStart');
    if (achievement.allDone && achievement.current > 0) {
      streak = I.t('streakAchieved', { count: I.formatNumber(achievement.current) });
    } else if (achievement.current > 0) {
      streak = I.t('streakContinue', { count: I.formatNumber(achievement.next) });
    }
    const progress = achievement.due
      ? I.t('weeklyFlexibleProgress', {
          done: I.formatNumber(achievement.done), target: I.formatNumber(achievement.due),
        })
      : I.t('noSchedule');

    return '<section class="routine-achievement" aria-labelledby="routine-achievement-title">'
      + '<div class="routine-achievement-copy"><span class="routine-kicker" id="routine-achievement-title">'
      + esc(I.t('dailyAchievement')) + '</span><strong>' + esc(streak) + '</strong>'
      + '<span class="routine-progress-copy">' + esc(progress) + '</span></div>'
      + '<div class="routine-streak" aria-hidden="true"><i class="bi bi-fire"></i><b>'
      + esc(I.formatNumber(achievement.current)) + '</b></div></section>';
  }

  function rhythm(options, plans) {
    const R = options.routine, I = options.i18n, esc = options.escapeHtml;
    const days = R.weekOverview(plans, options.records, options.day);
    const cells = days.map(function (day) {
      const label = I.weekdayShort(dayIndex(day.date));
      const status = statusLabel(day.status, day, I);
      const dotCount = Math.min(day.due, 3);
      const dots = Array.from({ length: dotCount }, function (_, index) {
        return '<i class="routine-mini-dot' + (index < day.done ? ' done' : '') + '"></i>';
      }).join('');
      return '<li class="routine-day ' + day.status + (day.date === options.day ? ' today' : '')
        + '" aria-label="' + esc(label + ', ' + status) + '">'
        + '<span class="routine-day-label">' + esc(label) + '</span>'
        + '<span class="routine-day-pill"><i class="routine-main-dot"></i>'
        + '<span class="routine-mini-dots" aria-hidden="true">' + dots + '</span></span></li>';
    }).join('');
    return '<section class="routine-rhythm" aria-labelledby="routine-rhythm-title">'
      + '<div class="routine-section-head"><div><span class="routine-kicker">' + esc(I.t('thisWeek'))
      + '</span><h2 id="routine-rhythm-title">' + esc(I.t('weeklyRhythm')) + '</h2></div>'
      + '<span class="routine-today-date">' + esc(I.formatDate(options.day)) + '</span></div>'
      + '<ol class="routine-week" role="list">' + cells + '</ol></section>';
  }

  function taskRow(options, row, isLate) {
    const p = row.p, st = row.st, I = options.i18n, esc = options.escapeHtml;
    const who = p.animal_id ? options.animalName(p.animal_id) : I.t('all');
    const cls = 'task' + (st.done ? ' did' : (isLate ? ' late' : ''));
    let sub = options.kindTag(p.kind) + esc(who || I.t('all')) + ' · ' + esc(I.cycleLabel(p));
    if (isLate) {
      sub += ' · <span class="late-t">'
        + esc(I.t('daysOverdue', { count: I.formatNumber(st.overdue) })) + '</span>';
    }
    if (p.detail) sub += '<br>' + esc(I.planDetail(p.detail));
    return '<div class="' + cls + '"><button class="tick' + (st.done ? ' on' : '')
      + '" data-tick="' + esc(p.id) + '" aria-label="'
      + esc(options.planName(p) + ' ' + I.t(st.done ? 'taskUndo' : 'taskComplete')) + '">'
      + (st.done ? '<i class="bi bi-check-lg" aria-hidden="true"></i>' : '') + '</button>'
      + '<div class="tinfo"><div class="tname">' + esc(options.planName(p)) + '</div>'
      + '<div class="tsub">' + sub + '</div></div></div>';
  }

  function flexibleTask(options, plan) {
    const R = options.routine, I = options.i18n, esc = options.escapeHtml;
    const progress = R.weeklyProgress(plan, options.records, options.day);
    const today = progress.days.filter(function (day) { return day.today; })[0];
    const todayDone = !!(today && today.done);
    const disabled = progress.complete && !todayDone;
    const who = plan.animal_id ? options.animalName(plan.animal_id) : I.t('all');
    const dots = progress.days.map(function (day) {
      return '<i class="routine-flex-day' + (day.done ? ' done' : '') + (day.today ? ' today' : '')
        + '" aria-hidden="true"></i>';
    }).join('');
    return '<div class="task routine-flex' + (progress.complete ? ' did' : '') + '">'
      + '<button class="tick' + (todayDone || disabled ? ' on' : '') + '"'
      + (disabled ? ' disabled' : ' data-tick="' + esc(plan.id) + '"')
      + ' aria-label="' + esc(options.planName(plan) + ' '
        + I.t(todayDone ? 'taskUndo' : 'taskComplete')) + '">'
      + (todayDone || disabled ? '<i class="bi bi-check-lg" aria-hidden="true"></i>' : '') + '</button>'
      + '<div class="tinfo"><div class="tname">' + esc(options.planName(plan)) + '</div>'
      + '<div class="tsub">' + options.kindTag(plan.kind) + esc(who || I.t('all')) + ' · '
      + esc(I.t('weeklyFlexibleProgress', {
          done: I.formatNumber(progress.done), target: I.formatNumber(progress.target),
        })) + '</div><div class="routine-flex-dots" aria-hidden="true">' + dots + '</div></div></div>';
  }

  function section(title, rows, options, late) {
    if (!rows.length) return '';
    return '<div class="sect"><h2>' + options.i18n.t(title) + '</h2><span class="n">'
      + rows.length + '</span></div>' + rows.map(function (row) {
        return taskRow(options, row, late);
      }).join('');
  }

  function renderBase(options) {
    const I = options.i18n, C = options.core, R = options.routine, esc = options.escapeHtml;
    const plans = (options.plans || []).filter(function (plan) { return plan.is_active !== false; });
    const routinePlans = (options.routinePlans || plans).filter(function (plan) {
      return plan.is_active !== false;
    });
    if (!routinePlans.length) {
      return '<div class="pad"><div class="empty">' + options.icon('bi-calendar-plus')
        + I.t('noPlansTitle') + '<br>' + I.t('noPlansBody') + '</div>'
        + '<button class="btn wide" data-go="plans">' + options.icon('bi-arrow-right-circle')
        + I.t('createPlan') + '</button></div>';
    }
    const fixed = plans.filter(function (plan) { return R.weeklyTarget(plan) === null; });
    const flexible = plans.filter(function (plan) {
      return R.weeklyTarget(plan) !== null && (!plan.start_date || plan.start_date <= options.day);
    });
    const rows = fixed.map(function (plan) {
      const dates = (options.records || []).filter(function (record) { return record.plan_id === plan.id; })
        .map(function (record) { return record.done_date; });
      return { p: plan, st: C.planStatus(plan, options.day, dates) };
    });
    const late = rows.filter(function (row) { return row.st.overdue > 0 && !row.st.done; });
    const now = rows.filter(function (row) { return row.st.due && !row.st.done && row.st.overdue === 0; });
    const did = rows.filter(function (row) { return row.st.done; });
    const routineFixed = routinePlans.filter(function (plan) { return R.weeklyTarget(plan) === null; });
    let html = '<div class="routine-dashboard">' + achievementCard(options, routineFixed)
      + rhythm(options, routineFixed) + '</div>';
    if (!plans.length) {
      return html + '<div class="pad"><div class="empty">' + options.icon('bi-filter-circle')
        + esc(I.t('noPlansForSelection')) + '</div></div>';
    }
    if (flexible.length) {
      html += '<div class="sect"><h2>' + esc(I.t('repeatWeeklyTarget')) + '</h2><span class="n">'
        + flexible.length + '</span></div>' + flexible.map(function (plan) {
          return flexibleTask(options, plan);
        }).join('');
    }
    html += section('overdueSection', late, options, true) + section('today', now, options, false);
    if (!late.length && !now.length && !flexible.length) {
      html += '<div class="pad"><div class="empty">' + options.icon('bi-check2-circle')
        + I.t('allDoneToday') + '</div></div>';
    }
    return html + section('completedSection', did, options, false);
  }

  function render(options) {
    const html = renderBase(options);
    return renderEnhancer ? renderEnhancer(options, html) : html;
  }

  function setEnhancer(enhancer) {
    renderEnhancer = typeof enhancer === 'function' ? enhancer : null;
  }

  global.CareTodayUi = Object.freeze({ render: render, setEnhancer: setEnhancer });
})(window);
