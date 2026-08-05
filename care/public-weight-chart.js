(function (global) {
  'use strict';

  function rows(history) {
    return (Array.isArray(history) ? history : []).map(function (row) {
      return { grams: Number(row.grams), measured_on: String(row.measured_on || '') };
    }).filter(function (row) {
      return Number.isFinite(row.grams) && row.grams > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.measured_on);
    });
  }

  function html(history, i18n, escapeHtml) {
    const points = rows(history);
    if (points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const change = Math.round((last.grams - first.grams) * 10) / 10;
    const signed = (change > 0 ? '+' : '') + change;
    return '<section class="pad pweight"><div class="psection-head">'
      + '<div><div class="lbl">' + escapeHtml(i18n.t('publicWeightTrend')) + '</div>'
      + '<div class="hint">' + escapeHtml(i18n.t('publicWeightSummary', {
        count: i18n.formatNumber(points.length), change: signed
      })) + '</div></div><div class="pweight-now">' + escapeHtml(i18n.formatNumber(last.grams)) + 'g</div></div>'
      + '<canvas data-public-weight-chart height="180" role="img" aria-label="'
      + escapeHtml(i18n.t('weightChartAria')) + '"></canvas>'
      + '<div class="pweight-axis"><span>' + escapeHtml(i18n.formatDate(first.measured_on)) + '</span><span>'
      + escapeHtml(i18n.formatDate(last.measured_on)) + '</span></div></section>';
  }

  function draw(canvas, history) {
    const points = rows(history);
    if (!canvas || points.length < 2) return;
    const box = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.round(box.width || 520));
    const height = 180;
    const ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    const pad = { top: 22, right: 14, bottom: 18, left: 14 };
    const values = points.map(function (point) { return point.grams; });
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (max - min < 1) { min -= 1; max += 1; }
    const x = function (index) {
      return pad.left + index * (width - pad.left - pad.right) / (points.length - 1);
    };
    const y = function (value) {
      return pad.top + (max - value) * (height - pad.top - pad.bottom) / (max - min);
    };
    context.strokeStyle = 'rgba(10,91,75,.14)';
    context.lineWidth = 1;
    [0, 0.5, 1].forEach(function (part) {
      const lineY = pad.top + part * (height - pad.top - pad.bottom);
      context.beginPath(); context.moveTo(pad.left, lineY); context.lineTo(width - pad.right, lineY); context.stroke();
    });
    context.strokeStyle = '#0b6a58';
    context.lineWidth = 3;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) context.moveTo(x(index), y(point.grams));
      else context.lineTo(x(index), y(point.grams));
    });
    context.stroke();
    context.fillStyle = '#fffdf8';
    points.forEach(function (point, index) {
      context.beginPath(); context.arc(x(index), y(point.grams), 4, 0, Math.PI * 2); context.fill(); context.stroke();
    });
  }

  function mount(root, history) {
    const canvas = root && root.querySelector('[data-public-weight-chart]');
    if (!canvas) return;
    draw(canvas, history);
  }

  global.PublicWeightChart = Object.freeze({ html: html, mount: mount, rows: rows });
}(window));
