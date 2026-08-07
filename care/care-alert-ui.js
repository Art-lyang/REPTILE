(function (global) {
  'use strict';

  function iconFor(alert) {
    const icons = {
      plan_overdue: 'bi-calendar-x', symptom_open: 'bi-heart-pulse', refusal_pattern: 'bi-slash-circle',
      weight_drop: 'bi-graph-down-arrow', weight_stale: 'bi-speedometer2',
    };
    return icons[alert.type] || 'bi-bell';
  }

  function titleFor(alert, i18n) {
    const titles = {
      plan_overdue: 'alertPlanOverdueTitle', symptom_open: 'alertSymptomOpenTitle',
      refusal_pattern: 'alertRefusalPatternTitle', weight_drop: 'alertWeightDropTitle',
      weight_stale: 'alertWeightStaleTitle',
    };
    return i18n.t(titles[alert.type] || 'alertCenter');
  }

  function detailFor(alert, i18n) {
    if (alert.type === 'plan_overdue') {
      return i18n.t('alertPlanOverdueDetail', { name: alert.planTitle, days: i18n.formatNumber(alert.overdue) });
    }
    if (alert.type === 'symptom_open') {
      return i18n.t('alertSymptomOpenDetail', { sign: i18n.signName ? i18n.signName(alert.signCode) : alert.signCode, days: i18n.formatNumber(alert.days) });
    }
    if (alert.type === 'refusal_pattern') return i18n.t('alertRefusalPatternDetail', { count: i18n.formatNumber(alert.count) });
    if (alert.type === 'weight_drop') return i18n.t('alertWeightDropDetail', { percent: i18n.formatNumber(alert.percent), before: i18n.formatNumber(alert.before), after: i18n.formatNumber(alert.after) });
    return i18n.t('alertWeightStaleDetail', { days: i18n.formatNumber(alert.days) });
  }

  function hrefFor(alert, i18n) {
    const action = alert.action || (alert.type === 'weight_drop' || alert.type === 'weight_stale'
      ? 'weight' : alert.type === 'plan_overdue' ? 'plans' : 'health');
    if (action === 'weight' && alert.animalId) return i18n.url('/care/animal.html?id=' + encodeURIComponent(alert.animalId) + '#weight');
    if (action === 'plans') return i18n.url('/care/#plans');
    return i18n.url('/care/#health');
  }

  function render(options) {
    const alerts = (options.alerts || []).slice(0, 5);
    if (!alerts.length) return '';
    const I = options.i18n;
    const esc = options.escapeHtml;
    const rows = alerts.map(function (alert) {
      const name = alert.animalName ? I.t('alertForAnimal', { name: alert.animalName }) : I.t('allAnimals');
      return '<a class="care-alert ' + esc(alert.severity) + '" href="' + esc(hrefFor(alert, I)) + '">'
        + '<span class="care-alert-icon"><i class="bi ' + esc(iconFor(alert)) + '" aria-hidden="true"></i></span>'
        + '<span class="care-alert-copy"><strong>' + esc(titleFor(alert, I)) + '</strong><span>'
        + esc(detailFor(alert, I)) + '</span><em>' + esc(name) + '</em></span>'
        + '<i class="bi bi-chevron-right care-alert-arrow" aria-hidden="true"></i></a>';
    }).join('');
    return '<section class="care-alert-center" aria-labelledby="care-alert-title"><div class="care-alert-head">'
      + '<div><span class="routine-kicker">' + esc(I.t('alertKicker')) + '</span><h2 id="care-alert-title">'
      + esc(I.t('alertCenter')) + '</h2></div><span class="care-alert-count">' + esc(I.t('alertCount', { count: I.formatNumber(alerts.length) }))
      + '</span></div><div class="care-alert-list">' + rows + '</div><p>' + esc(I.t('alertSafetyNote')) + '</p></section>';
  }

  function cacheMethod(app, cache, method, key, isGlobalList) {
    const original = app && app[method];
    if (typeof original !== 'function') return;
    app[method] = function () {
      const args = arguments;
      return Promise.resolve(original.apply(app, args)).then(function (value) {
        if (!isGlobalList || !args.length || !args[0]) cache[key] = Array.isArray(value) ? value : [];
        return value;
      });
    };
  }

  function installTodayBridge() {
    const app = global.CareApp;
    const todayUi = global.CareTodayUi;
    const alerts = global.CareAlerts;
    if (!app || !todayUi || !alerts || typeof todayUi.setEnhancer !== 'function'
      || global.__careAlertTodayBridgeInstalled) return;
    const cache = { animals: [], plans: [], records: [], weights: [] };
    cacheMethod(app, cache, 'listAnimals', 'animals', false);
    cacheMethod(app, cache, 'listPlans', 'plans', false);
    cacheMethod(app, cache, 'listRecords', 'records', false);
    cacheMethod(app, cache, 'listWeights', 'weights', true);
    todayUi.setEnhancer(function (options, originalHtml) {
      const alertRows = alerts.build({
        today: options.day, core: options.core, animals: cache.animals,
        plans: cache.plans.length ? cache.plans : options.routinePlans || options.plans,
        records: cache.records.length ? cache.records : options.records, weights: cache.weights,
        /* 무료 한도를 넘어 잠긴 개체의 알림은 멈춥니다(care-alerts.js 참고). */
        activeAnimalIds: typeof app.activeAnimalIds === 'function' ? app.activeAnimalIds() : null,
      });
      return render({ alerts: alertRows, i18n: options.i18n, escapeHtml: options.escapeHtml }) + originalHtml;
    });
    global.__careAlertTodayBridgeInstalled = true;
  }

  global.CareAlertUi = Object.freeze({ render: render, installTodayBridge: installTodayBridge });
  installTodayBridge();
})(window);
