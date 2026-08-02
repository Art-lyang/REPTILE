(function (global) {
  'use strict';

  const supportedSpecies = new Set(['gecko', 'crested', 'fattail']);
  let cachedSpec = null;
  let cachedTraits = new Map();

  function normalizedSpecies(species) { return species === 'leopard' ? 'gecko' : species; }

  function state() {
    const spec = global.BreedSpec;
    if (spec !== cachedSpec) {
      cachedSpec = spec;
      const options = spec && typeof spec.traitOptions === 'function' ? spec.traitOptions() : [];
      cachedTraits = new Map(options.map(function (option) {
        return [option[0], { id: option[0], name: option[1], group: option[2] || option[0] }];
      }));
    }
    return { species: cachedSpec && cachedSpec.id, traits: cachedTraits };
  }

  function supportsSpecies(species) {
    const current = state();
    const normalized = normalizedSpecies(species);
    return supportedSpecies.has(normalized) && normalized === current.species && current.traits.size > 0;
  }

  function animalMatchesSpecies(animal) {
    const current = state();
    if (!animal || typeof animal.species !== 'string' || !animal.species) return current.species === 'gecko';
    return normalizedSpecies(animal.species) === current.species;
  }

  function trait(id) { return state().traits.get(id); }

  function lineOutcome(target) {
    const current = state();
    const metadata = target.traits.map(function (targetTrait) { return current.traits.get(targetTrait.id); });
    if (target.mode === 'line_fix') return { name: metadata[0].name, warning: null };
    const ids = new Set(target.traits.map(function (targetTrait) { return targetTrait.id; }));
    const combo = current.species === 'gecko' && typeof global.matchPolyCombo === 'function'
      ? global.matchPolyCombo(ids) : null;
    if (combo) {
      const language = typeof global.LANG === 'string' ? global.LANG : 'ko';
      return { name: combo[language] || combo.en || combo.ko, warning: null };
    }
    if (current.species === 'gecko' && metadata[0].group === metadata[1].group) {
      const base = current.traits.get(metadata[0].group);
      return { name: base ? base.name : metadata[0].name, warning: 'line_reset' };
    }
    const separator = current.species === 'gecko' ? ' ' : ' × ';
    return { name: metadata.map(function (targetTrait) { return targetTrait.name; }).join(separator), warning: null };
  }

  global.LineBreedingSpeciesPolicy = Object.freeze({ supportsSpecies: supportsSpecies,
    animalMatchesSpecies: animalMatchesSpecies, trait: trait, lineOutcome: lineOutcome });
})(window);
