(function (global) {
  'use strict';

  const Policy = global.LineBreedingSpeciesPolicy;

  function supportsSpecies(species) { return !!Policy && Policy.supportsSpecies(species); }

  function sanitizeTarget(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== 1) throw new TypeError('Target version must be 1');
    let expectedTraits;
    switch (raw.mode) {
      case 'line_fix': expectedTraits = 1; break;
      case 'cross': expectedTraits = 2; break;
      default: throw new TypeError('Target mode must be line_fix or cross');
    }
    if (!Array.isArray(raw.traits) || raw.traits.length !== expectedTraits) throw new TypeError(raw.mode + ' target has an invalid trait count');
    const traits = raw.traits.map(function (entry) {
      if (!entry || typeof entry.id !== 'string' || !Policy || !Policy.trait(entry.id)) throw new TypeError('Target trait id is unsupported');
      if (!Number.isInteger(entry.targetScore) || entry.targetScore < 1 || entry.targetScore > 5) {
        throw new TypeError('Target score must be an integer from 1 through 5');
      }
      return { id: entry.id, targetScore: entry.targetScore };
    });
    if (new Set(traits.map(function (trait) { return trait.id; })).size !== traits.length) {
      throw new TypeError('Cross target traits must be distinct; duplicate ids are invalid');
    }
    return { version: 1, mode: raw.mode, traits: traits };
  }

  function animalIndex(animals) {
    const counts = new Map();
    (Array.isArray(animals) ? animals : []).forEach(function (animal) {
      if (animal && typeof animal.id === 'string' && animal.id) {
        counts.set(animal.id, (counts.get(animal.id) || 0) + 1);
      }
    });
    const index = new Map();
    (Array.isArray(animals) ? animals : []).forEach(function (animal) {
      if (animal && counts.get(animal.id) === 1) index.set(animal.id, animal);
    });
    const duplicateIds = new Set(Array.from(counts).filter(function (entry) { return entry[1] > 1; })
      .map(function (entry) { return entry[0]; }));
    return { index: index, duplicateIds: duplicateIds };
  }

  function ancestry(index, rootId, generations) {
    const depths = new Map();
    const stack = [{ id: rootId, depth: 0, path: new Set([rootId]) }];
    let cycle = false;
    let incomplete = false;
    while (stack.length) {
      const current = stack.pop();
      const animal = index.get(current.id);
      if (!animal) { incomplete = true; continue; }
      if (current.depth >= generations) continue;
      [animal.parent_a, animal.parent_b].forEach(function (parentId) {
        if (parentId === null || parentId === undefined || parentId === '') return;
        if (typeof parentId !== 'string') { incomplete = true; return; }
        if (current.path.has(parentId)) { cycle = true; return; }
        const depth = current.depth + 1;
        if (!depths.has(parentId) || depth < depths.get(parentId)) depths.set(parentId, depth);
        if (!index.has(parentId)) { incomplete = true; return; }
        const path = new Set(current.path);
        path.add(parentId);
        stack.push({ id: parentId, depth: depth, path: path });
      });
    }
    return { depths: depths, cycle: cycle, incomplete: incomplete };
  }

  function relationshipWarnings(input) {
    const parsed = animalIndex(input && input.animals);
    const parentAId = input && typeof input.parentAId === 'string' ? input.parentAId : '';
    const parentBId = input && typeof input.parentBId === 'string' ? input.parentBId : '';
    const requested = input && Number.isInteger(input.generations) ? input.generations : 3;
    const generations = Math.max(1, Math.min(3, requested));
    const left = ancestry(parsed.index, parentAId, generations);
    const right = ancestry(parsed.index, parentBId, generations);
    const warnings = [];
    if (left.depths.has(parentBId) || right.depths.has(parentAId)) {
      warnings.push({ code: 'direct_ancestor', status: 'review' });
    }
    const shared = Array.from(left.depths.keys()).filter(function (id) { return right.depths.has(id); }).sort();
    if (shared.some(function (id) { return left.depths.get(id) === 1 && right.depths.get(id) === 1; })) {
      warnings.push({ code: 'shared_parent', status: 'review' });
    } else if (shared.some(function (id) {
      return left.depths.get(id) <= 2 && right.depths.get(id) <= 2;
    })) {
      warnings.push({ code: 'shared_grandparent', status: 'review' });
    } else if (shared.length) warnings.push({ code: 'shared_ancestor', status: 'review' });
    if (left.cycle || right.cycle) warnings.push({ code: 'pedigree_cycle', status: 'review' });
    if (left.incomplete || right.incomplete || parsed.duplicateIds.has(parentAId)
        || parsed.duplicateIds.has(parentBId)) {
      warnings.push({ code: 'pedigree_incomplete', status: 'review' });
    }
    return warnings;
  }

  function evidenceFor(target, first, second) {
    return target.traits.map(function (trait) {
      const holders = [first, second].map(function (animal) {
        return Array.isArray(animal.morphs) && animal.morphs.includes(trait.id);
      });
      const scores = [first, second].map(function (animal, index) {
        const score = animal.line_trait_scores && animal.line_trait_scores[trait.id];
        return holders[index] && Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
      });
      const requiredHolders = target.mode === 'line_fix' ? holders.every(Boolean) : holders.some(Boolean);
      const holderScores = scores.filter(function (_score, index) { return holders[index]; });
      let assessment = 'target_met';
      if (!requiredHolders) assessment = 'trait_missing';
      else if (holderScores.some(function (score) { return score === null; })) assessment = 'evaluation_required';
      else if (target.mode === 'line_fix'
          ? holderScores.some(function (score) { return score < trait.targetScore; })
          : holderScores.every(function (score) { return score < trait.targetScore; })) {
        assessment = 'below_target';
      }
      return { id: trait.id, name: Policy.trait(trait.id).name,
        targetScore: trait.targetScore, scores: scores, assessment: assessment };
    });
  }

  function buildCandidatePairs(project, animals, target) {
    if (!project || !supportsSpecies(project.species)) return [];
    const parsed = animalIndex(animals);
    const eligible = Array.from(parsed.index.values()).filter(Policy.animalMatchesSpecies)
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    const outcome = Policy.lineOutcome(target);
    const pairs = [];
    for (let i = 0; i < eligible.length; i += 1) {
      for (let j = i + 1; j < eligible.length; j += 1) {
        const one = eligible[i];
        const two = eligible[j];
        if ((one.sex === 'male' || one.sex === 'female') && one.sex === two.sex) continue;
        const first = one.sex === 'male' || two.sex === 'female' ? one : two;
        const second = first === one ? two : one;
        const evidence = evidenceFor(target, first, second);
        const warnings = relationshipWarnings({
          animals: animals, parentAId: first.id, parentBId: second.id, generations: 3 });
        const reasons = [];
        if (first.sex !== 'male' || second.sex !== 'female') reasons.push('sex_unknown');
        warnings.forEach(function (warning) { reasons.push(warning.code); });
        if (evidence.some(function (item) { return item.assessment === 'evaluation_required'; })) {
          reasons.push('evaluation_required');
        }
        const uncoveredCrossParent = target.mode === 'cross' && [first, second].some(function (animal) { return !target.traits.some(function (trait) { return Array.isArray(animal.morphs) && animal.morphs.includes(trait.id); }); });
        const insufficient = uncoveredCrossParent || evidence.some(function (item) {
          return item.assessment === 'trait_missing' || item.assessment === 'below_target';
        });
        pairs.push({
          parentAId: first.id, parentBId: second.id,
          status: insufficient ? 'insufficient' : reasons.length ? 'review' : 'ready',
          reviewReasons: reasons, relationshipWarnings: warnings, traitEvidence: evidence,
          lineOutcome: { name: outcome.name, warning: outcome.warning },
        });
      }
    }
    return pairs.sort(function (a, b) {
      const sexRank = Number(!b.reviewReasons.includes('sex_unknown'))
        - Number(!a.reviewReasons.includes('sex_unknown'));
      const traitRank = Number(b.traitEvidence.every(function (item) { return item.assessment !== 'trait_missing'; }))
        - Number(a.traitEvidence.every(function (item) { return item.assessment !== 'trait_missing'; }));
      const scoreRank = Number(b.traitEvidence.every(function (item) { return item.assessment === 'target_met'; }))
        - Number(a.traitEvidence.every(function (item) { return item.assessment === 'target_met'; }));
      return sexRank || traitRank || scoreRank
        || a.relationshipWarnings.length - b.relationshipWarnings.length
        || (a.parentAId < b.parentAId ? -1 : a.parentAId > b.parentAId ? 1 : 0)
        || (a.parentBId < b.parentBId ? -1 : a.parentBId > b.parentBId ? 1 : 0);
    });
  }

  function candidatePairs(input) {
    const project = input && input.project;
    if (!project || !supportsSpecies(project.species)) return [];
    const target = sanitizeTarget(project.target);
    return buildCandidatePairs(project, input.animals, target);
  }

  function roadmap(input) {
    const project = input && input.project;
    const species = project && typeof project.species === 'string' ? project.species : 'unknown';
    if (!supportsSpecies(species)) return { species: species, supported: false, status: 'unsupported' };
    const target = sanitizeTarget(project.target);
    const candidates = buildCandidatePairs(project, input.animals, target);
    const status = candidates.some(function (pair) { return pair.status === 'ready'; }) ? 'ready'
      : candidates.some(function (pair) { return pair.status === 'review'; }) ? 'review'
        : candidates.length ? 'insufficient' : 'no_candidates';
    return { species: species, supported: true, status: status, target: target, candidates: candidates };
  }

  global.LineBreedingPlanner = Object.freeze({ sanitizeTarget: sanitizeTarget, supportsSpecies: supportsSpecies,
    candidatePairs: candidatePairs, relationshipWarnings: relationshipWarnings, roadmap: roadmap });
})(window);
