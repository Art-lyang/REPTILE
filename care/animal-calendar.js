(function (w) {
  'use strict';

  function ymd(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
      + '-' + String(date.getDate()).padStart(2, '0');
  }

  function parse(value) {
    var parts = String(value).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function monthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function monthsFor(days) {
    var seen = {};
    (days || []).forEach(function (day) { seen[String(day.date).slice(0, 7)] = true; });
    return Object.keys(seen).sort();
  }

  function recordParts(record, options) {
    var info = options.kindInfo(record.kind);
    var kindName = options.i18n.kindName(record.kind);
    var values = [];
    if (record.kind === 'feed' && record.feed_name) {
      values.push(record.feed_name);
      if (record.feed_category) values.push(options.i18n.feedCategoryName(record.feed_category));
      if (record.feed_state) values.push(options.i18n.feedStateName(record.feed_state));
      if (record.offered_amount != null && record.feed_unit) {
        values.push(options.i18n.formatNumber(record.offered_amount) + ' ' + options.i18n.feedUnitName(record.feed_unit));
      }
      if (record.feeding_result) values.push(options.i18n.feedingResultName(record.feeding_result));
    } else if (record.kind === 'symptom') {
      if (record.detail) values.push(options.i18n.signName(record.detail));
      if (record.title === 'resolved' || record.title === '해소') values.push(options.i18n.t('resolved'));
    } else {
      if (record.title && record.title !== info.ko && record.title !== kindName) values.push(record.title);
      if (record.detail) values.push(record.detail);
    }
    if (record.note) values.push(record.note);
    var seen = {};
    return values.map(function (value) { return String(value).trim(); }).filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function recordRow(record, options) {
    var esc = options.escapeHtml;
    var info = options.kindInfo(record.kind);
    var parts = recordParts(record, options);
    return '<li class="animal-cal-record"><span class="animal-cal-record-kind">'
      + '<i class="bi ' + esc(info.icon) + '" aria-hidden="true"></i>'
      + esc(options.i18n.kindName(record.kind)) + '</span>'
      + '<span class="animal-cal-record-text' + (parts.length ? '' : ' muted') + '">'
      + (parts.length ? parts.map(esc).join('<span aria-hidden="true"> · </span>')
        : esc(options.i18n.t('calendarNoDetail'))) + '</span></li>';
  }

  function monthDetails(key, recordsByDate, selectedDate, options) {
    var esc = options.escapeHtml;
    return Object.keys(recordsByDate).filter(function (date) {
      return date.slice(0, 7) === key;
    }).sort().map(function (date) {
      var records = recordsByDate[date];
      return '<section class="animal-cal-detail" data-calendar-detail="' + date + '"'
        + (date === selectedDate ? '' : ' hidden') + '><div class="animal-cal-detail-head"><strong>'
        + esc(options.i18n.formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' }))
        + '</strong><span>' + options.i18n.t('countItems', {
          count: options.i18n.formatNumber(records.length)
        }) + '</span></div><ul>' + records.map(function (record) {
          return recordRow(record, options);
        }).join('') + '</ul></section>';
    }).join('');
  }

  function render(options) {
    var days = options.days || [];
    var records = options.records || [];
    var i18n = options.i18n;
    var esc = options.escapeHtml;
    var byDate = {};
    var recordsByDate = {};
    days.forEach(function (day) { byDate[day.date] = day; });
    records.forEach(function (record) {
      if (!byDate[record.done_date]) return;
      (recordsByDate[record.done_date] || (recordsByDate[record.done_date] = [])).push(record);
    });
    var max = Math.max(1, Math.max.apply(null, days.map(function (day) { return day.count; })));
    var today = days.length ? days[days.length - 1].date : '';
    var selectedDate = days.slice().reverse().find(function (day) {
      return recordsByDate[day.date] && recordsByDate[day.date].length;
    });
    selectedDate = selectedDate ? selectedDate.date : '';

    var cards = monthsFor(days).map(function (key) {
      var parts = key.split('-').map(Number);
      var first = new Date(parts[0], parts[1] - 1, 1);
      var last = new Date(parts[0], parts[1], 0);
      var leading = (first.getDay() + 6) % 7;
      var cells = new Array(leading).fill('<span class="animal-cal-day outside" aria-hidden="true"></span>');
      for (var dayNumber = 1; dayNumber <= last.getDate(); dayNumber += 1) {
        var date = new Date(parts[0], parts[1] - 1, dayNumber);
        var dateKey = ymd(date);
        var value = byDate[dateKey];
        if (!value) {
          cells.push('<span class="animal-cal-day outside"><span>' + dayNumber + '</span></span>');
          continue;
        }
        var level = value.count === 0 ? 0 : Math.min(4, Math.ceil(value.count / max * 4));
        var label = i18n.formatDate(dateKey) + ' · '
          + i18n.t('countItems', { count: i18n.formatNumber(value.count) });
        var hasDetails = recordsByDate[dateKey] && recordsByDate[dateKey].length;
        var classes = 'animal-cal-day l' + level + (dateKey === today ? ' today' : '')
          + (dateKey === selectedDate ? ' selected' : '');
        var content = '<span class="animal-cal-number">' + dayNumber + '</span>'
          + (value.count ? '<span class="animal-cal-count">' + i18n.formatNumber(value.count) + '</span>' : '');
        cells.push(hasDetails
          ? '<button type="button" class="' + classes + '" data-date="' + dateKey
            + '" aria-pressed="' + (dateKey === selectedDate ? 'true' : 'false')
            + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + content + '</button>'
          : '<span class="' + classes + '" data-date="' + dateKey + '" aria-label="' + esc(label)
            + '" title="' + esc(label) + '">'
            + content + '</span>');
      }
      var weekdays = [1, 2, 3, 4, 5, 6, 0].map(function (weekday) {
        return '<span>' + esc(i18n.weekdayShort(weekday)) + '</span>';
      }).join('');
      return '<section class="animal-calendar" data-month="' + key + '"><h3>'
        + esc(i18n.formatDate(ymd(first), { year: 'numeric', month: 'long' })) + '</h3>'
        + '<div class="animal-cal-weekdays">' + weekdays + '</div>'
        + '<div class="animal-cal-grid">' + cells.join('') + '</div>'
        + '<div class="animal-cal-details" aria-live="polite">'
        + monthDetails(key, recordsByDate, selectedDate, options) + '</div></section>';
    }).join('');

    return '<div class="animal-calendar-shell"><div class="animal-calendars">' + cards + '</div>'
      + '<div class="heatlg"><span>' + i18n.t('less') + '</span>'
      + [0, 1, 2, 3, 4].map(function (level) {
          return '<span class="animal-cal-legend l' + level + '"></span>';
        }).join('') + '<span>' + i18n.t('more') + '</span></div></div>';
  }

  function selectDate(button) {
    var shell = button.closest('.animal-calendar-shell');
    if (!shell) return;
    var date = button.dataset.date;
    shell.querySelectorAll('.animal-cal-day[aria-pressed]').forEach(function (day) {
      var selected = day.dataset.date === date;
      day.classList.toggle('selected', selected);
      day.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    shell.querySelectorAll('[data-calendar-detail]').forEach(function (detail) {
      detail.hidden = detail.dataset.calendarDetail !== date;
    });
  }

  function bind(root) {
    if (root.__animalCalendarBound) return;
    root.__animalCalendarBound = true;
    root.addEventListener('click', function (event) {
      var button = event.target.closest('button.animal-cal-day[data-date]');
      if (button) selectDate(button);
    });
  }

  if (w.document) bind(w.document);
  w.AnimalCalendar = {
    render: render, monthsFor: monthsFor, monthKey: monthKey, parse: parse,
    recordParts: recordParts, selectDate: selectDate, bind: bind
  };
}(window));
