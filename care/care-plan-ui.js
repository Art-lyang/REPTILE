(function (global) {
  'use strict';

  function repeatMode(plan) {
    if (Number(plan && plan.weekly_target) > 0) return 'target';
    if (Array.isArray(plan && plan.weekdays) && plan.weekdays.length) return 'week';
    return 'days';
  }

  function option(value, selected, label, esc) {
    return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>'
      + label + '</option>';
  }

  function planCard(plan, options) {
    const C = options.core, I = options.i18n, esc = options.escapeHtml;
    const kind = C.kindInfo(plan.kind), inactive = plan.is_active === false;
    return '<div class="card"' + (inactive ? ' style="opacity:.5"' : '') + '>'
      + '<label class="plan-bulk-choice"><input type="checkbox" data-plan-bulk-id="'
      + esc(plan.id) + '" aria-label="' + esc(I.t('planBulkSelectAria', {
        name: options.planName(plan),
      })) + '"><span aria-hidden="true"></span></label>'
      + '<div class="thumb" style="background:' + esc(kind.color) + '1a;border-color:'
      + esc(kind.color) + '33;color:' + esc(kind.color) + '"><i class="bi '
      + esc(kind.icon) + '" aria-hidden="true"></i></div>'
      + '<div class="info"><div class="nm">' + esc(options.planName(plan))
      + (inactive ? '<span class="chip off">' + I.t('disabled') + '</span>' : '') + '</div>'
      + '<div class="ms">' + esc(I.cycleLabel(plan))
      + (plan.time_of_day ? ' · ' + esc(String(plan.time_of_day).slice(0, 5)) : ' · ' + I.t('allDay'))
      + (plan.detail ? ' · ' + esc(I.planDetail(plan.detail)) : '') + '</div></div>'
      + '<div class="acts"><button class="mini" data-editplan="' + esc(plan.id) + '">'
      + options.icon('bi-pencil') + I.t('edit') + '</button><button class="mini del" data-delplan="'
      + esc(plan.id) + '">' + options.icon('bi-trash3') + I.t('delete') + '</button></div></div>';
  }

  function repeatModes(mode, I) {
    return '<div class="lbl2">' + I.t('repeat') + '</div><div class="modes routine-modes" role="group">'
      + [['days', 'repeatEveryDays'], ['week', 'repeatWeekdays'], ['target', 'repeatWeeklyTarget']]
        .map(function (item) {
          return '<button class="mode' + (mode === item[0] ? ' on' : '') + '" data-mode="'
            + item[0] + '" aria-pressed="' + (mode === item[0]) + '">' + I.t(item[1]) + '</button>';
        }).join('') + '</div>';
  }

  function intervalPanel(plan, mode, I) {
    const presets = [[1, 'cycleDaily'], [2, 'every2Days'], [3, 'every3Days'], [4, 'every4Days'],
      [7, 'cycleWeekly'], [14, 'every2Weeks'], [30, 'monthly']];
    return '<div id="m_days" class="repeat-panel"' + (mode === 'days' ? '' : ' hidden') + '>'
      + '<div class="presets">' + presets.map(function (item) {
        return '<button class="preset' + (Number(plan.interval_days) === item[0] ? ' on' : '')
          + '" data-preset="' + item[0] + '">' + I.t(item[1]) + '</button>';
      }).join('') + '</div><div class="lbl2 routine-field-top"><label for="p_interval">'
      + I.t('customDays') + '</label></div><input class="in" id="p_interval" type="number" min="1" '
      + 'max="365" inputmode="numeric" value="' + (plan.interval_days || 1) + '">'
      + '<div class="hint">' + I.t('intervalHint') + '</div></div>';
  }

  function weekdaysPanel(plan, mode, I) {
    const chosen = plan.weekdays || [];
    const presets = [[[1, 4], 'mondayThursday'], [[2, 5], 'tuesdayFriday'],
      [[1, 3, 5], 'mondayWednesdayFriday'], [[0, 6], 'weekend'],
      [[0, 1, 2, 3, 4, 5, 6], 'cycleDaily']];
    return '<div id="m_week" class="repeat-panel"' + (mode === 'week' ? '' : ' hidden') + '>'
      + '<div class="wdays">' + [1, 2, 3, 4, 5, 6, 0].map(function (day) {
        const on = chosen.indexOf(day) >= 0;
        return '<button class="wd' + (on ? ' on' : '') + '" data-wd="' + day
          + '" aria-pressed="' + on + '">' + I.weekdayShort(day) + '</button>';
      }).join('') + '</div><div class="presets">' + presets.map(function (item) {
        return '<button class="preset" data-wdset="' + item[0].join(',') + '">'
          + I.t(item[1]) + '</button>';
      }).join('') + '</div><div class="hint">' + I.t('weekdayHint') + '</div></div>';
  }

  function targetPanel(plan, mode, I, esc) {
    const target = Math.min(7, Math.max(1, Number(plan.weekly_target) || 3));
    const targets = Array.from({ length: 7 }, function (_, index) { return index + 1; });
    return '<div id="m_target" class="repeat-panel"' + (mode === 'target' ? '' : ' hidden') + '>'
      + '<input id="p_weekly_target" type="hidden" value="' + target + '">'
      + '<div class="weekly-targets" role="group" aria-label="' + esc(I.t('repeatWeeklyTarget')) + '">'
      + targets.map(function (value) {
        const on = value === target;
        return '<button class="weekly-target' + (on ? ' on' : '') + '" data-weekly-target="'
          + value + '" aria-pressed="' + on + '">' + value + '</button>';
      }).join('') + '</div><div class="weekly-target-preview" aria-hidden="true">'
      + targets.map(function (value) {
        return '<i class="' + (value <= target ? 'on' : '') + '"></i>';
      }).join('') + '</div><strong class="weekly-target-copy">'
      + esc(I.t('weeklyTargetCount', { count: I.formatNumber(target) })) + '</strong>'
      + '<div class="hint">' + I.t('weeklyTargetHint') + '</div></div>';
  }

  function planForm(plan, options) {
    const C = options.core, I = options.i18n, esc = options.escapeHtml;
    const mode = repeatMode(plan), isNew = !plan.id;
    const kinds = Object.keys(C.CARE_KINDS).map(function (kind) {
      return option(kind, plan.kind === kind, C.CARE_KINDS[kind].emoji + ' ' + esc(I.kindName(kind)), esc);
    }).join('');
    const animals = option('', !plan.animal_id, I.t('wholeHome'), esc)
      + options.animals.map(function (animal) {
        return option(animal.id, plan.animal_id === animal.id,
          options.speciesOf(animal).icon + ' ' + esc(animal.name || I.t('unnamed')), esc);
      }).join('');
    const feeds = option('', !plan.feed_item_id, I.t('noFeedLink'), esc)
      + options.feeds.filter(function (feed) { return feed.is_active !== false; }).map(function (feed) {
        return option(feed.id, plan.feed_item_id === feed.id,
          C.feedKindInfo(feed.kind).emoji + ' ' + esc(feed.name), esc);
      }).join('');

    return '<div class="pad"><div class="lbl">' + I.t(isNew ? 'addPlan' : 'editPlan') + '</div>'
      + '<div class="row2"><div><div class="lbl2">' + I.t('type') + '</div><select class="in" id="p_kind">'
      + kinds + '</select></div><div><div class="lbl2">' + I.t('target')
      + '</div><select class="in" id="p_animal">' + animals + '</select></div></div>'
      + '<div class="lbl2">' + I.t('name') + '</div><input class="in" id="p_title" value="'
      + esc(I.presetTitle(plan.title || '')) + '" placeholder="' + esc(I.t('planNamePlaceholder')) + '">'
      + '<div class="lbl2">' + I.t('planDetail') + '</div><input class="in" id="p_detail" value="'
      + esc(I.planDetail(plan.detail || '')) + '"><div class="lbl2"><label for="p_feed">'
      + I.t('linkedFeed') + '</label></div><select class="in" id="p_feed">' + feeds + '</select>'
      + '<div class="hint">' + (options.feeds.length ? I.t('linkedFeedHint') : I.t('linkFeedFirst')) + '</div>'
      + repeatModes(mode, I) + intervalPanel(plan, mode, I) + weekdaysPanel(plan, mode, I)
      + targetPanel(plan, mode, I, esc)
      + '<div class="row2"><div><div class="lbl2">' + I.t('startDate')
      + '</div><input class="in" id="p_start" type="date" value="'
      + esc(plan.start_date || C.today()) + '"></div><div><div class="lbl2">' + I.t('reminderTime')
      + '</div><input class="in" id="p_time" type="time" value="'
      + esc(plan.time_of_day ? String(plan.time_of_day).slice(0, 5) : '') + '"></div></div>'
      + '<div class="hint">' + I.t('reminderHint') + '</div><div class="lbl2">' + I.t('use')
      + '</div><select class="in" id="p_active">' + option('1', plan.is_active !== false, I.t('active'), esc)
      + option('0', plan.is_active === false, I.t('inactivePlan'), esc) + '</select>'
      + '<div class="err" id="p_err"></div><div class="formbtns"><button class="btn" id="p_save">'
      + options.icon('bi-check-lg') + I.t('save') + '</button><button class="btn ghost" data-cancel="plan">'
      + I.t('cancel') + '</button>' + (isNew ? '' : '<button class="btn danger" data-delplan="'
        + esc(plan.id) + '">' + options.icon('bi-trash3') + I.t('delete') + '</button>') + '</div></div>';
  }

  function list(options) {
    const I = options.i18n, esc = options.escapeHtml;
    const exportable = options.plans.filter(function (plan) {
      return plan.is_active !== false && !(Number(plan.weekly_target) > 0);
    });
    const hasFlexible = options.plans.some(function (plan) {
      return plan.is_active !== false && Number(plan.weekly_target) > 0;
    });
    const calendarEventCount = exportable.length + Math.max(0, Number(options.calendarOrderCount) || 0);
    let html = '<div class="pad"><div class="lbl">' + I.t('exportCalendar') + '</div><div class="hint">'
      + I.t('exportCalendarHint') + '</div>'
      + (hasFlexible ? '<div class="hint">' + esc(I.t('weeklyCalendarHint')) + '</div>' : '')
      + '<button class="btn wide" id="ics"' + (calendarEventCount ? '' : ' disabled') + '>'
      + options.icon('bi-calendar-check') + I.t('downloadCalendar')
      + (calendarEventCount ? ' (' + I.t('countItems', {
          count: I.formatNumber(calendarEventCount),
        }) + ')' : '') + '</button></div><div class="row2 routine-plan-actions">'
      + '<button class="btn" data-newplan="1">' + options.icon('bi-plus-lg') + I.t('addPlan') + '</button>'
      + '<button class="btn ghost" id="preset">' + options.icon('bi-magic') + I.t('speciesDefaults') + '</button></div>'
      + '<div class="routine-plan-bulk-actions"><button class="btn ghost wide" data-plan-bulk-mode>'
      + options.icon('bi-check2-square') + I.t('planBulkMode') + '</button></div>'
      + '<div class="routine-plan-bulk-bar" aria-live="polite"><div><strong data-plan-bulk-count>'
      + I.t('planBulkCount', { count: I.formatNumber(0) }) + '</strong><p>' + I.t('planBulkHint')
      + '</p></div><div class="routine-plan-bulk-buttons"><button class="btn ghost" data-plan-bulk-cancel>'
      + I.t('cancel') + '</button><button class="btn danger" data-plan-bulk-delete disabled>'
      + options.icon('bi-trash3') + '<span data-plan-bulk-delete-label>'
      + I.t('planBulkDeleteAction', { count: I.formatNumber(0) }) + '</span></button></div></div>';
    if (!options.plans.length) {
      return html + '<div class="pad"><div class="empty">' + options.icon('bi-arrow-repeat')
        + I.t('noPlanList') + '<br>' + I.t('noPlanListHint') + '</div></div>';
    }
    const groups = [{ id: '', label: I.t('wholeHome') }].concat(options.animals.map(function (animal) {
      return { id: animal.id, label: options.speciesOf(animal).icon + ' ' + (animal.name || I.t('unnamed')) };
    }));
    groups.forEach(function (group) {
      const plans = options.plans.filter(function (plan) { return (plan.animal_id || '') === group.id; });
      if (!plans.length) return;
      html += '<div class="sect"><h2>' + esc(group.label) + '</h2><span class="n">' + plans.length
        + '</span></div>' + plans.map(function (plan) { return planCard(plan, options); }).join('');
    });
    return html;
  }

  function render(options) {
    return options.editPlan ? planForm(options.editPlan, options) : list(options);
  }

  global.CarePlanUi = Object.freeze({ render: render, repeatMode: repeatMode });
})(window);
