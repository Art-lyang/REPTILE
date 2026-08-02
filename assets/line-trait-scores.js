(function () {
  'use strict';

  const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  function safeIds(allowedIds) {
    if (!Array.isArray(allowedIds)) return [];
    return allowedIds.filter(function (id, index, all) {
      return typeof id === 'string'
        && !BLOCKED_KEYS.has(id)
        && /^[a-z0-9_-]{1,64}$/.test(id)
        && all.indexOf(id) === index;
    });
  }

  function validScore(value) {
    return Number.isInteger(value) && value >= 1 && value <= 5;
  }

  function normalize(raw, allowedIds) {
    const result = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    safeIds(allowedIds).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(raw, id)) return;
      if (validScore(raw[id])) result[id] = raw[id];
    });
    return result;
  }

  function fromForm(selectedTraitIds, valueById) {
    const parsed = {};
    if (!valueById || typeof valueById !== 'object' || Array.isArray(valueById)) return parsed;
    safeIds(selectedTraitIds).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(valueById, id)) return;
      const value = Number(valueById[id]);
      if (validScore(value)) parsed[id] = value;
    });
    return parsed;
  }

  function forAnimal(animal, selectedTraitIds) {
    const ids = safeIds(selectedTraitIds);
    const explicit = normalize(animal && animal.line_trait_scores, ids);
    if (Object.keys(explicit).length || ids.length !== 1) return explicit;
    const legacy = animal && animal.color_grade;
    return validScore(legacy) ? { [ids[0]]: legacy } : explicit;
  }

  window.LineTraitScores = Object.freeze({
    normalize: normalize,
    forAnimal: forAnimal,
    fromForm: fromForm,
  });
}());
