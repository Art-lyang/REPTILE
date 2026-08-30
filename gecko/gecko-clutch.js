(function (w) {
  'use strict';

  var TEXT = {
    ko: {
      title: '클러치 기준 예상 분포',
      hint: '알 수를 고르면 이론적 확률을 기대 마릿수로 바꿔 보여줍니다.',
      group: '예상 알 수',
      preset: function (n) { return n + '개 알'; },
      custom: '직접 입력',
      input: '예상 알 수 직접 입력',
      expected: function (n) { return '평균 ' + n + '마리'; },
      atLeast: function (p) { return '최소 한 마리 ' + p; },
      disclaimer: '통계적 기대값이며 실제 부화 결과를 보장하지 않습니다.'
    },
    en: {
      title: 'Clutch estimate',
      hint: 'Choose an egg count to turn theoretical odds into expected hatchlings.',
      group: 'Expected egg count',
      preset: function (n) { return n + ' eggs'; },
      custom: 'Custom',
      input: 'Enter expected egg count',
      expected: function (n) { return 'Average ' + n + ' hatchling' + (n === '1' ? '' : 's'); },
      atLeast: function (p) { return 'At least one ' + p; },
      disclaimer: 'These are statistical expectations, not a guarantee of actual hatch results.'
    },
    zh: {
      title: '按蛋数估算分布',
      hint: '选择蛋数，将理论概率换算为预计个体数。',
      group: '预计蛋数',
      preset: function (n) { return n + ' 枚'; },
      custom: '自定义',
      input: '输入预计蛋数',
      expected: function (n) { return '平均 ' + n + ' 只'; },
      atLeast: function (p) { return '至少一只 ' + p; },
      disclaimer: '这是统计期望值，不保证实际孵化结果。'
    },
    ja: {
      title: '卵数ごとの予想分布',
      hint: '卵数を選ぶと、理論確率を予想個体数に換算します。',
      group: '予想卵数',
      preset: function (n) { return n + '個'; },
      custom: '直接入力',
      input: '予想卵数を入力',
      expected: function (n) { return '平均 ' + n + '匹'; },
      atLeast: function (p) { return '1匹以上 ' + p; },
      disclaimer: '統計上の期待値であり、実際の孵化結果を保証するものではありません。'
    }
  };
  var currentSize = 2;
  var currentResults = [];
  var currentLanguage = 'ko';

  function normalizeSize(value) {
    var parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return 2;
    return Math.min(99, Math.max(1, parsed));
  }

  function statistics(probability, size) {
    var chance = Math.min(1, Math.max(0, Number(probability) || 0));
    var count = normalizeSize(size);
    return {
      expected: chance * count,
      atLeastOne: 1 - Math.pow(1 - chance, count)
    };
  }

  function language(value) {
    var key = String(value || 'ko').toLowerCase().split('-')[0];
    return TEXT[key] ? key : 'ko';
  }

  function locale(key) {
    return { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[key];
  }

  function number(value, key) {
    return new Intl.NumberFormat(locale(key), { maximumFractionDigits: 1 }).format(value);
  }

  function percent(value, key) {
    return new Intl.NumberFormat(locale(key), {
      style: 'percent',
      maximumFractionDigits: 1
    }).format(value);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function validResults(results) {
    return (Array.isArray(results) ? results : []).slice(0, 128).map(function (result) {
      return {
        label: String(result && result.label || ''),
        probability: Math.min(1, Math.max(0, Number(result && result.probability) || 0))
      };
    }).filter(function (result) { return result.label; });
  }

  function resultRows(results, key, text) {
    return results.map(function (result) {
      var values = statistics(result.probability, currentSize);
      return '<div class="gc-row"><b>' + esc(result.label) + '</b><div class="gc-stats">'
        + '<span>' + esc(text.expected(number(values.expected, key))) + '</span>'
        + '<span>' + esc(text.atLeast(percent(values.atLeastOne, key))) + '</span>'
        + '</div></div>';
    }).join('');
  }

  function html(results, lang) {
    currentResults = validResults(results);
    currentLanguage = language(lang);
    if (!currentResults.length) return '';
    var text = TEXT[currentLanguage];
    var presets = [2, 4, 6].map(function (size) {
      var selected = currentSize === size;
      return '<button type="button" data-clutch-size="' + size + '" aria-pressed="'
        + selected + '">' + esc(text.preset(size)) + '</button>';
    }).join('');
    return '<section class="gc-clutch" data-gecko-clutch aria-labelledby="gcTitle">'
      + '<div class="gc-head"><h3 id="gcTitle">' + esc(text.title) + '</h3><p>' + esc(text.hint) + '</p></div>'
      + '<div class="gc-sizes" role="group" aria-label="' + esc(text.group) + '">' + presets
      + '<label><span>' + esc(text.custom) + '</span><input data-clutch-custom type="number" inputmode="numeric"'
      + ' min="1" max="99" value="' + currentSize + '" aria-label="' + esc(text.input) + '"></label></div>'
      + '<div class="gc-results" data-clutch-results aria-live="polite">'
      + resultRows(currentResults, currentLanguage, text) + '</div>'
      + '<p class="gc-disclaimer"><i class="bi bi-info-circle" aria-hidden="true"></i>'
      + esc(text.disclaimer) + '</p></section>';
  }

  function refresh(section, syncCustom) {
    var text = TEXT[currentLanguage];
    section.querySelectorAll('[data-clutch-size]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(currentSize === Number(button.dataset.clutchSize)));
    });
    var custom = section.querySelector('[data-clutch-custom]');
    if (syncCustom) custom.value = currentSize;
    section.querySelector('[data-clutch-results]').innerHTML =
      resultRows(currentResults, currentLanguage, text);
  }

  function bind(root) {
    var section = root && root.querySelector ? root.querySelector('[data-gecko-clutch]') : null;
    if (!section || section.dataset.bound === '1') return;
    section.dataset.bound = '1';
    section.querySelectorAll('[data-clutch-size]').forEach(function (button) {
      button.addEventListener('click', function () {
        currentSize = normalizeSize(button.dataset.clutchSize);
        refresh(section, true);
      });
    });
    var custom = section.querySelector('[data-clutch-custom]');
    custom.addEventListener('input', function () {
      if (custom.value === '') return;
      currentSize = normalizeSize(custom.value);
      refresh(section, false);
    });
    custom.addEventListener('change', function () {
      currentSize = normalizeSize(custom.value);
      refresh(section, true);
    });
  }

  w.GeckoClutch = {
    normalizeSize: normalizeSize,
    statistics: statistics,
    html: html,
    bind: bind
  };
})(window);
