(function () {
  'use strict';

  const SPECIES = new Set(['gecko', 'crested', 'fattail', 'ballpython']);
  const STATUSES = new Set(['draft', 'active', 'complete', 'archived']);

  function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be an object');
    }
    return value;
  }

  function exactKeys(value, allowed, label) {
    const keys = Object.keys(value);
    if (keys.some(key => !allowed.includes(key))) throw new TypeError(label + ' has unknown fields');
  }

  function sanitizeTarget(raw) {
    record(raw, 'target');
    exactKeys(raw, ['version', 'mode', 'traits'], 'target');
    if (raw.version !== 1) throw new TypeError('target version must be 1');
    if (raw.mode !== 'line_fix' && raw.mode !== 'cross') throw new TypeError('invalid target mode');
    const count = raw.mode === 'line_fix' ? 1 : 2;
    if (!Array.isArray(raw.traits) || raw.traits.length !== count) {
      throw new TypeError('invalid target trait count');
    }
    const traits = raw.traits.map(function (trait) {
      record(trait, 'trait');
      exactKeys(trait, ['id', 'targetScore'], 'trait');
      if (typeof trait.id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(trait.id)) {
        throw new TypeError('invalid target trait id');
      }
      if (!Number.isInteger(trait.targetScore) || trait.targetScore < 1 || trait.targetScore > 5) {
        throw new TypeError('invalid target score');
      }
      return { id: trait.id, targetScore: trait.targetScore };
    });
    if (new Set(traits.map(trait => trait.id)).size !== traits.length) {
      throw new TypeError('target traits must be distinct');
    }
    const target = { version: 1, mode: raw.mode, traits: traits };
    if (JSON.stringify(target).length > 4096) throw new TypeError('target is too large');
    return target;
  }

  function optionalText(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : null;
  }

  function sanitizeProject(raw) {
    record(raw, 'project');
    const species = raw.species;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '';
    const status = raw.status || 'draft';
    if (!SPECIES.has(species)) throw new TypeError('invalid project species');
    if (!name) throw new TypeError('project name is required');
    if (!STATUSES.has(status)) throw new TypeError('invalid project status');
    return {
      id: optionalText(raw.id, 128),
      user_id: optionalText(raw.user_id, 128),
      species: species,
      name: name,
      target: sanitizeTarget(raw.target),
      status: status,
      created_at: optionalText(raw.created_at, 64),
      updated_at: optionalText(raw.updated_at, 64),
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  window.BreedingProjectContract = Object.freeze({
    sanitizeTarget: sanitizeTarget,
    sanitizeProject: sanitizeProject,
    escapeHtml: escapeHtml,
  });
}());
