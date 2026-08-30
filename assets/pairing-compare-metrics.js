(function (w) {
  'use strict';

  function normalized(value) {
    return String(value || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
  }
  function geneKey(value) {
    return normalized(value).replace(/^(visual|비주얼|表现|ビジュアル)\s+/i, '');
  }
  function sanitize(snapshot) {
    if (!w.BreedingDraft || typeof w.BreedingDraft.sanitize !== 'function') {
      throw new Error('BreedingDraft is required');
    }
    return w.BreedingDraft.sanitize(snapshot);
  }
  function snapshotKey(snapshot) {
    return JSON.stringify([
      snapshot.species, snapshot.parents.A.label, snapshot.parents.B.label,
      snapshot.results.map(function (result) { return [result.label, result.probability]; })
    ]);
  }
  function isNormal(label) {
    return ['노멀', 'normal', '普通', 'ノーマル'].indexOf(normalized(label)) >= 0;
  }
  function metrics(input, target) {
    var snapshot = sanitize(input);
    var targetKey = geneKey(target);
    var visualProbability = 0;
    var carrierProbability = 0;
    snapshot.results.forEach(function (result) {
      var visual = geneKey(result.label) === targetKey;
      if (visual) visualProbability += result.probability;
      if (visual) return;
      var guaranteed = result.guaranteedHets.some(function (name) {
        return geneKey(name) === targetKey;
      });
      if (guaranteed) {
        carrierProbability += result.probability;
        return;
      }
      var partial = result.partialHets.find(function (item) {
        return geneKey(item.name) === targetKey;
      });
      if (partial) carrierProbability += result.probability * partial.pct / 100;
    });
    return {
      visualProbability: Math.min(1, visualProbability),
      carrierProbability: Math.min(1, carrierProbability),
      warningCount: snapshot.warnings.length,
      lineLabels: snapshot.lineTraits.map(function (trait) { return trait.label; })
    };
  }

  w.PairingCompareMetrics = {
    geneKey: geneKey,
    isNormal: isNormal,
    metrics: metrics,
    normalized: normalized,
    sanitize: sanitize,
    snapshotKey: snapshotKey
  };
})(window);
