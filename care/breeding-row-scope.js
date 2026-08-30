(function (w) {
  'use strict';

  function speciesKey(value) {
    return !value || value === 'leopard' ? 'gecko' : String(value);
  }

  function pairings(rows, animals, species) {
    const target = speciesKey(species);
    const animalsById = new Map((animals || []).map(animal => [animal.id, animal]));
    return (rows || []).filter(function (pairing) {
      if (pairing.species) return speciesKey(pairing.species) === target;
      const linked = animalsById.get(pairing.male) || animalsById.get(pairing.female);
      return linked ? speciesKey(linked.species) === target : target === 'gecko';
    });
  }

  function clutches(rows, visiblePairings, species) {
    const target = speciesKey(species);
    const pairingIds = new Set((visiblePairings || []).map(pairing => pairing.id));
    return (rows || []).filter(function (clutch) {
      if (clutch.species) {
        return speciesKey(clutch.species) === target
          && (!clutch.pairing || pairingIds.has(clutch.pairing));
      }
      if (clutch.pairing) return pairingIds.has(clutch.pairing);
      return target === 'gecko';
    });
  }

  w.BreedingRowScope = Object.freeze({ speciesKey, pairings, clutches });
}(window));
