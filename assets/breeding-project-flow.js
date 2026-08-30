(function () {
  'use strict';

  function rows(value) { return Array.isArray(value) ? value : []; }

  function linkedPairings(projectId, pairings) {
    if (typeof projectId !== 'string' || !projectId) return [];
    return rows(pairings).filter(function (pairing) {
      return pairing && pairing.project_id === projectId && typeof pairing.id === 'string';
    }).slice().sort(function (left, right) {
      return (left.project_step || 0) - (right.project_step || 0)
        || left.id.localeCompare(right.id);
    });
  }

  function pairKey(first, second) {
    if (typeof first !== 'string' || typeof second !== 'string' || !first || !second || first === second) return '';
    return first < second ? first + '|' + second : second + '|' + first;
  }

  function offspringForProject(projectId, pairings, animals) {
    const keys = new Set(linkedPairings(projectId, pairings).map(function (pairing) {
      return pairKey(pairing.male, pairing.female);
    }).filter(Boolean));
    return rows(animals).filter(function (animal) {
      return animal && typeof animal.id === 'string' && keys.has(pairKey(animal.parent_a, animal.parent_b));
    }).slice().sort(function (left, right) { return left.id.localeCompare(right.id); });
  }

  function scoreOf(animal, traitId) {
    const scores = animal && animal.line_trait_scores;
    const score = scores && Object.prototype.hasOwnProperty.call(scores, traitId) ? scores[traitId] : null;
    return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
  }

  function assessOffspring(project, animal) {
    const target = project && project.target;
    const morphs = new Set(rows(animal && animal.morphs));
    const traits = rows(target && target.traits).map(function (trait) {
      const held = trait && typeof trait.id === 'string' && morphs.has(trait.id);
      const score = held ? scoreOf(animal, trait.id) : null;
      const status = !held ? 'missing_trait' : score === null ? 'unrated'
        : score >= trait.targetScore ? 'met' : 'below_target';
      return { id: trait && trait.id, status: status, score: score,
        targetScore: trait && trait.targetScore };
    });
    const validShape = target && (target.mode === 'line_fix' || target.mode === 'cross')
      && traits.length === (target.mode === 'cross' ? 2 : 1);
    const status = validShape && traits.every(trait => trait.status === 'met') ? 'selected'
      : validShape && traits.every(trait => trait.status === 'met' || trait.status === 'unrated') ? 'review'
        : 'not_selected';
    return { animalId: animal && animal.id || null, status: status, traits: traits };
  }

  function projectState(project, pairings, animals) {
    const linked = linkedPairings(project && project.id, pairings);
    const animalRows = rows(animals);
    const ids = new Set(animalRows.map(animal => animal && animal.id).filter(Boolean));
    const missingReferences = linked.reduce(function (missing, pairing) {
      const missingParentIds = [pairing.male, pairing.female].filter(id => !ids.has(id));
      if (missingParentIds.length) missing.push({ pairingId: pairing.id, missingParentIds: missingParentIds });
      return missing;
    }, []);
    const offspring = offspringForProject(project && project.id, linked, animalRows);
    const assessments = offspring.map(animal => assessOffspring(project, animal));
    let nextAction = !linked.length ? 'create_pairing' : missingReferences.length ? 'reselect_parents'
      : !offspring.length ? 'await_offspring'
        : assessments.some(item => item.status === 'selected') ? 'select_next_pairing'
          : assessments.some(item => item.status === 'review') ? 'complete_evaluations' : 'continue_selection';
    return { linkedPairings: linked, offspring: offspring, assessments: assessments,
      missingReferences: missingReferences, nextAction: nextAction };
  }

  function pairingDraft(project, candidate) {
    return { male: candidate.parentAId, female: candidate.parentBId, species: project.species,
      project_id: project.id, project_step: 1, name: project.name + ' · 1', target_morph: project.name };
  }

  window.BreedingProjectFlow = Object.freeze({ linkedPairings: linkedPairings,
    offspringForProject: offspringForProject, assessOffspring: assessOffspring,
    projectState: projectState, pairingDraft: pairingDraft });
}());
