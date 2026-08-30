(function (w) {
  'use strict';

  var STORAGE_KEY = 'studioCalculationHistory.v1';
  var LANGUAGES = { ko: true, en: true, zh: true, ja: true };
  var MAX_RECENT = 5;
  var MAX_FAVORITES = 12;
  var MAX_RECORDS = 64;
  var MAX_BYTES = 2500000;
  var lastStamp = 0;
  var memory = [];

  if (!w.BreedingDraft) throw new Error('BreedingDraft is required');

  function language(value) {
    var key = String(value || 'ko').toLowerCase().split('-')[0];
    return LANGUAGES[key] ? key : 'ko';
  }
  function sanitize(input) {
    return w.BreedingDraft.sanitize(input);
  }
  function parentKey(parent) {
    var traits = parent.traits.map(function (trait) {
      return trait.id + ':' + trait.state;
    }).sort();
    return traits.length ? traits.join(',') : 'normal';
  }
  function fingerprint(input) {
    var snapshot = sanitize(input);
    var parents = [
      parentKey(snapshot.parents.A),
      parentKey(snapshot.parents.B)
    ].sort();
    return snapshot.species + ':' + parents.join('~');
  }
  function entryKey(snapshot, lang) {
    return language(lang) + '|' + fingerprint(snapshot);
  }
  function validStamp(value, fallback) {
    var number = Number(value);
    if (Number.isFinite(number) && number > 0) return Math.floor(number);
    var parsed = Date.parse(fallback);
    return Number.isFinite(parsed) ? parsed : 1;
  }
  function cleanEntry(value) {
    if (!value || typeof value !== 'object') return null;
    try {
      var snapshot = sanitize(value.snapshot);
      var lang = language(value.language);
      return {
        key: entryKey(snapshot, lang),
        language: lang,
        favorite: value.favorite === true,
        savedAt: validStamp(value.savedAt, snapshot.calculatedAt),
        snapshot: snapshot
      };
    } catch (error) {
      return null;
    }
  }
  function dedupe(values) {
    var byKey = {};
    values.forEach(function (entry) {
      var prior = byKey[entry.key];
      if (!prior || entry.savedAt > prior.savedAt) {
        if (prior && prior.favorite) entry.favorite = true;
        byKey[entry.key] = entry;
      } else if (entry.favorite) {
        prior.favorite = true;
      }
    });
    return Object.keys(byKey).map(function (key) { return byKey[key]; });
  }
  function scope(entry) {
    return entry.snapshot.species + '|' + entry.language;
  }
  function trim(values) {
    var groups = {};
    values.forEach(function (entry) {
      var key = scope(entry);
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    var kept = [];
    Object.keys(groups).forEach(function (key) {
      var group = groups[key].sort(function (a, b) { return b.savedAt - a.savedAt; });
      var recent = group.slice(0, MAX_RECENT);
      var favorites = group.filter(function (entry) { return entry.favorite; }).slice(0, MAX_FAVORITES);
      var ids = {};
      recent.concat(favorites).forEach(function (entry) {
        if (!ids[entry.key]) {
          ids[entry.key] = true;
          kept.push(entry);
        }
      });
    });
    kept.sort(function (a, b) { return b.savedAt - a.savedAt; });
    if (kept.length <= MAX_RECORDS) return kept;
    var favorite = kept.filter(function (entry) { return entry.favorite; });
    var regular = kept.filter(function (entry) { return !entry.favorite; });
    return favorite.concat(regular).slice(0, MAX_RECORDS);
  }
  function read() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return memory.slice();
    }
    if (!raw) return memory.slice();
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('history format');
      var cleaned = trim(dedupe(parsed.map(cleanEntry).filter(Boolean)));
      memory = cleaned;
      if (cleaned.length !== parsed.length) write(cleaned);
      return cleaned.slice();
    } catch (error) {
      memory = [];
      try { localStorage.removeItem(STORAGE_KEY); } catch (ignore) {}
      return [];
    }
  }
  function serialized(values) {
    var next = values.slice();
    var raw = JSON.stringify(next);
    while (next.length > 1 && encodeURIComponent(raw).length > MAX_BYTES) {
      next.pop();
      raw = JSON.stringify(next);
    }
    return { values: next, raw: raw };
  }
  function write(values) {
    var payload = serialized(trim(dedupe(values)));
    memory = payload.values;
    try {
      localStorage.setItem(STORAGE_KEY, payload.raw);
      return true;
    } catch (error) {
      return false;
    }
  }
  function record(input, lang) {
    var snapshot = sanitize(input);
    var key = entryKey(snapshot, lang);
    var values = read();
    var prior = values.find(function (entry) { return entry.key === key; });
    values = values.filter(function (entry) { return entry.key !== key; });
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    var entry = {
      key: key,
      language: language(lang),
      favorite: !!(prior && prior.favorite),
      savedAt: lastStamp,
      snapshot: snapshot
    };
    values.unshift(entry);
    write(values);
    return entry;
  }
  function list(species, lang) {
    var key = String(species || '');
    var locale = language(lang);
    var values = read().filter(function (entry) {
      return entry.snapshot.species === key && entry.language === locale;
    }).sort(function (a, b) { return b.savedAt - a.savedAt; });
    return {
      recent: values.slice(0, MAX_RECENT),
      favorites: values.filter(function (entry) { return entry.favorite; }).slice(0, MAX_FAVORITES)
    };
  }
  function get(key) {
    return read().find(function (entry) { return entry.key === String(key); }) || null;
  }
  function toggleFavorite(key) {
    var values = read();
    var entry = values.find(function (item) { return item.key === String(key); });
    if (!entry) return false;
    entry.favorite = !entry.favorite;
    write(values);
    return entry.favorite;
  }

  w.CalculationHistoryStore = {
    storageKey: STORAGE_KEY,
    fingerprint: fingerprint,
    entryKey: entryKey,
    record: record,
    list: list,
    get: get,
    toggleFavorite: toggleFavorite
  };
})(window);
