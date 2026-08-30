(function (w) {
  'use strict';

  function speciesKey(value) {
    return !value || value === 'leopard' ? 'gecko' : String(value);
  }

  function eligible(animal, role, species) {
    const sex = role === 'male' ? 'male' : 'female';
    return !!animal && animal.sex === sex && animal.life_stage === 'adult'
      && speciesKey(animal.species) === speciesKey(species);
  }

  function uniqueIds(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(String).filter(function (value) {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function candidates(animals, species) {
    const rows = Array.isArray(animals) ? animals : [];
    return {
      males: rows.filter(animal => eligible(animal, 'male', species)).map(animal => animal.id),
      females: rows.filter(animal => eligible(animal, 'female', species)).map(animal => animal.id)
    };
  }

  function normalize(input, animals) {
    input = input || {};
    const species = speciesKey(input.species);
    const byId = new Map((animals || []).map(animal => [String(animal.id), animal]));
    const maleId = String(input.maleId || '');
    const femaleIds = uniqueIds(input.femaleIds);
    const name = String(input.name || '').trim();
    if (!name || name.length > 120) return { ok: false, error: 'name' };
    if (!eligible(byId.get(maleId), 'male', species)) return { ok: false, error: 'male' };
    if (!femaleIds.length) return { ok: false, error: 'female_required' };
    if (femaleIds.length > 12 || femaleIds.some(id => !eligible(byId.get(id), 'female', species))) {
      return { ok: false, error: 'female' };
    }
    return { ok: true, value: { species, maleId, femaleIds, name } };
  }

  function members(groupId, pairings, animals) {
    const byId = new Map((animals || []).map(animal => [String(animal.id), animal]));
    return (pairings || []).filter(pairing => String(pairing.group_id || '') === String(groupId || ''))
      .map(function (pairing) {
        const female = byId.get(String(pairing.female || ''));
        return {
          pairingId: pairing.id,
          femaleId: pairing.female,
          femaleName: female ? (female.name || '') : ''
        };
      }).sort(function (one, two) {
        return String(one.femaleName).localeCompare(String(two.femaleName))
          || String(one.femaleId).localeCompare(String(two.femaleId));
      });
  }

  function lineageRoster(options) {
    options = options || {};
    const grouped = members(options.groupId, options.pairings, options.animals);
    const pairById = new Map((options.pairings || []).map(pairing => [pairing.id, pairing]));
    return grouped.map(function (member) {
      const pairing = pairById.get(member.pairingId);
      const warnings = options.planner && options.planner.relationshipWarnings ? options.planner.relationshipWarnings({
        animals: options.animals || [], parentAId: pairing.male, parentBId: pairing.female,
        generations: options.generations || 3
      }) : [];
      const warningCodes = warnings.map(warning => warning.code);
      const review = warningCodes.some(code => code !== 'pedigree_incomplete');
      return Object.assign({}, member, {
        level: review ? 'review' : warningCodes.includes('pedigree_incomplete') ? 'incomplete' : 'clear',
        warningCodes
      });
    });
  }

  w.BreedingMatingGroups = Object.freeze({
    speciesKey, candidates, normalize, members, lineageRoster
  });
}(window));
