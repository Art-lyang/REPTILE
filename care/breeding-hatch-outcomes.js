(function (w) {
  'use strict';

  function count(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
  }

  function status(value) {
    if (value.outcome_closed) {
      if (value.hatched_count === value.egg_count) return 'hatched';
      if (value.hatched_count === 0 && value.unknown_count === 0) return 'failed';
      return 'closed';
    }
    return value.hatched_count > 0 ? 'partially_hatched' : 'incubating';
  }

  function normalize(input) {
    const eggCount = count(input.eggCount);
    const fertile = count(input.fertile);
    const infertile = count(input.infertile);
    const stopped = count(input.stopped);
    const hatched = count(input.hatched);
    if ([eggCount, fertile, infertile, stopped, hatched].some(value => value < 0)) {
      return { ok: false, error: 'count' };
    }
    const known = fertile + infertile + stopped + hatched;
    if (!eggCount || known > eggCount) return { ok: false, error: 'count' };
    const hatchDate = input.actualHatchDate || null;
    if (hatched > 0 && !hatchDate) return { ok: false, error: 'hatch_date' };
    if (hatchDate && input.laidDate && hatchDate < input.laidDate) {
      return { ok: false, error: 'hatch_date' };
    }
    const value = {
      egg_count: eggCount,
      fertile_count: fertile,
      infertile_count: infertile,
      stopped_count: stopped,
      hatched_count: hatched,
      unknown_count: eggCount - known,
      actual_hatch_date: hatchDate,
      outcome_closed: Boolean(input.closed)
    };
    return { ok: true, value: {
      fertile_count: value.fertile_count,
      infertile_count: value.infertile_count,
      stopped_count: value.stopped_count,
      hatched_count: value.hatched_count,
      unknown_count: value.unknown_count,
      actual_hatch_date: value.actual_hatch_date,
      outcome_closed: value.outcome_closed,
      outcome_status: status(value)
    } };
  }

  function summary(clutch, registeredCount) {
    const eggCount = Math.max(0, count(clutch.egg_count));
    const fertile = Math.max(0, count(clutch.fertile_count));
    const infertile = Math.max(0, count(clutch.infertile_count));
    const stopped = Math.max(0, count(clutch.stopped_count));
    const hatched = Math.max(0, count(clutch.hatched_count));
    const known = Math.min(eggCount, fertile + infertile + stopped + hatched);
    const registered = Math.max(0, count(registeredCount));
    const value = {
      egg_count: eggCount,
      hatched_count: hatched,
      unknown_count: eggCount - known,
      outcome_closed: Boolean(clutch.outcome_closed)
    };
    return {
      eggCount,
      knownCount: known,
      unknownCount: value.unknown_count,
      hatchedCount: hatched,
      registeredCount: registered,
      registrationRemaining: Math.max(0, hatched - registered),
      status: status(value)
    };
  }

  function offspringDraft(options) {
    const clutch = options.clutch;
    const pairing = options.pairing;
    const group = options.group;
    const step = pairing.project_step == null ? null : Math.min(12, Number(pairing.project_step) + 1);
    const labelBase = group && group.name ? group.name : (pairing.name || clutch.laid_date || 'Clutch');
    return {
      species: clutch.species,
      sex: 'unknown',
      life_stage: 'baby_unknown',
      hatch_date: clutch.actual_hatch_date || null,
      parent_a: pairing.male,
      parent_b: pairing.female,
      clutch_id: clutch.id,
      breeding_project_id: pairing.project_id || null,
      breeding_project_step: step,
      clutch_label: labelBase + ' · #' + options.nextNumber,
      morphs: [],
      hets: []
    };
  }

  w.BreedingHatchOutcomes = Object.freeze({ normalize, summary, offspringDraft });
}(window));
