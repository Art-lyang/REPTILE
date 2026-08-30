(function (global) {
  'use strict';

  const STAGES = Object.freeze(['baby_unknown', 'juvenile', 'subadult', 'adult']);
  const LABEL_KEYS = Object.freeze({
    baby_unknown: 'stageBabyUnknown',
    juvenile: 'stageJuvenile',
    subadult: 'stageSubadult',
    adult: 'stageAdult'
  });

  function normalize(value) {
    return STAGES.indexOf(value) >= 0 ? value : 'baby_unknown';
  }

  function labelKey(value) {
    return LABEL_KEYS[normalize(value)];
  }

  function expectedSex(role) {
    if (role === 'sire') return 'male';
    if (role === 'dam') return 'female';
    throw new TypeError('Parent role must be sire or dam');
  }

  function isEligibleParent(animal, role) {
    return Boolean(animal)
      && animal.sex === expectedSex(role)
      && animal.life_stage === 'adult';
  }

  function speciesKey(value) {
    return value === 'leopard' ? 'gecko' : value;
  }

  function parentCandidates(animals, child, role) {
    const expected = expectedSex(role);
    const childId = child && child.id;
    const species = child && child.species;
    return (Array.isArray(animals) ? animals : []).filter(function (animal) {
      return animal && animal.id !== childId
        && (!species || speciesKey(animal.species) === speciesKey(species))
        && animal.sex === expected
        && animal.life_stage === 'adult';
    });
  }

  function validateParents(animals, child, sireId, damId) {
    if (sireId && damId && sireId === damId) return 'duplicate';
    if (child && child.id && (sireId === child.id || damId === child.id)) return 'self';
    const index = new Map((Array.isArray(animals) ? animals : []).map(function (animal) {
      return [animal.id, animal];
    }));
    const sire = sireId ? index.get(sireId) : null;
    const dam = damId ? index.get(damId) : null;
    if (sireId && (!sire || sire.sex !== 'male')) return 'sire_role';
    if (sire && sire.life_stage !== 'adult') return 'sire_maturity';
    if (damId && (!dam || dam.sex !== 'female')) return 'dam_role';
    if (dam && dam.life_stage !== 'adult') return 'dam_maturity';
    if (child && child.species && sire && speciesKey(sire.species) !== speciesKey(child.species)) return 'species';
    if (child && child.species && dam && speciesKey(dam.species) !== speciesKey(child.species)) return 'species';
    return null;
  }

  global.AnimalLifeStage = Object.freeze({
    STAGES: STAGES,
    normalize: normalize,
    labelKey: labelKey,
    speciesKey: speciesKey,
    isEligibleParent: isEligibleParent,
    parentCandidates: parentCandidates,
    validateParents: validateParents
  });
}(window));
