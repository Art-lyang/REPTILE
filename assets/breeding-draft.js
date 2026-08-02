(function (global) {
  'use strict';

  const STORAGE_KEY = 'studioBreedingDraft.v1';
  const SPECIES = new Set(['gecko', 'crested', 'fattail', 'ballpython']);
  const STATES = new Set(['het', 'mm', 'yes', 'line']);

  function text(value, limit) {
    return String(value == null ? '' : value).trim().slice(0, limit);
  }

  function identifier(value) {
    const normalized = text(value, 64);
    return /^[a-z0-9_-]+$/i.test(normalized) ? normalized : '';
  }

  function trait(value) {
    if (!value || typeof value !== 'object') return null;
    const id = identifier(value.id);
    const state = text(value.state, 12);
    const label = text(value.label, 120);
    if (!id || !STATES.has(state) || !label) return null;
    return { id, state, label };
  }

  function parent(value) {
    if (!value || typeof value !== 'object') throw new Error('parent format');
    const traits = Array.isArray(value.traits)
      ? value.traits.slice(0, 64).map(trait).filter(Boolean)
      : [];
    return { label: text(value.label, 240) || '노멀', traits };
  }

  function partialHet(value) {
    if (!value || typeof value !== 'object') return null;
    const name = text(value.name, 120);
    const pct = Number(value.pct);
    if (!name || !Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    return { name, pct: Math.round(pct * 10) / 10 };
  }

  function result(value) {
    if (!value || typeof value !== 'object') return null;
    const label = text(value.label, 240);
    const probability = Number(value.probability);
    if (!label || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      return null;
    }
    return {
      label,
      probability,
      guaranteedHets: Array.isArray(value.guaranteedHets)
        ? value.guaranteedHets.slice(0, 64).map(v => text(v, 120)).filter(Boolean)
        : [],
      partialHets: Array.isArray(value.partialHets)
        ? value.partialHets.slice(0, 64).map(partialHet).filter(Boolean)
        : []
    };
  }

  function lineTrait(value) {
    if (!value || typeof value !== 'object') return null;
    const id = identifier(value.id);
    const label = text(value.label, 120);
    if (!id || !label) return null;
    return { id, label, both: value.both === true };
  }

  function byteLength(value) {
    return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gi, 'x').length;
  }

  function sanitize(input) {
    if (!input || typeof input !== 'object' || input.version !== 1) {
      throw new Error('draft version');
    }
    if (!SPECIES.has(input.species)) throw new Error('unsupported species');
    if (!Array.isArray(input.results) || input.results.length < 1) {
      throw new Error('result required');
    }
    if (input.results.length > 128) throw new Error('result limit exceeded');

    const results = input.results.map(result).filter(Boolean);
    if (!results.length) throw new Error('result format');

    const normalized = {
      version: 1,
      species: input.species,
      calculatedAt: Number.isFinite(Date.parse(input.calculatedAt))
        ? new Date(input.calculatedAt).toISOString()
        : new Date().toISOString(),
      parents: {
        A: parent(input.parents && input.parents.A),
        B: parent(input.parents && input.parents.B)
      },
      results,
      warnings: Array.isArray(input.warnings)
        ? input.warnings.slice(0, 8).map(v => text(v, 400)).filter(Boolean)
        : [],
      lineTraits: Array.isArray(input.lineTraits)
        ? input.lineTraits.slice(0, 64).map(lineTrait).filter(Boolean)
        : []
    };
    if (byteLength(JSON.stringify(normalized)) > 65536) throw new Error('draft size limit');
    return normalized;
  }

  function save(input) {
    const normalized = sanitize(input);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function load(expectedSpecies) {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const normalized = sanitize(JSON.parse(raw));
      return !expectedSpecies || normalized.species === expectedSpecies ? normalized : null;
    } catch (error) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function clear() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  global.BreedingDraft = { storageKey: STORAGE_KEY, sanitize, save, load, clear };
})(window);
