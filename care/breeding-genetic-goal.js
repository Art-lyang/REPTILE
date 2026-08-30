(function () {
  'use strict';

  // Genetic reverse lookup answers only whether registered animals hold required alleles.
  // Probability stays in each species calculator so two implementations cannot disagree.

  window.createBreedingGeneticGoal = function (deps) {
    const S = deps.state;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const CORES = deps.cores;
    const otherNote = deps.otherNote;
    const breedSpec = deps.breedSpec;
    const I18n = deps.i18n;

    function tabGoal() {
      const B = breedSpec();
      return BreedingGoalUI.html({
        mode: S.goalMode,
        species: S.species,
        animals: S.animals,
        projects: S.projects,
        pairings: S.pairs,
        traits: B.traitOptions(),
        geneticHtml: geneticGoalPanel()
      });
    }

    function geneticGoalPanel() {
      const B = breedSpec();
      if (!CORES[S.species].goal) {
        return '<div class="pad"><div class="lbl">' + esc(I18n.t('goalTitle')) + '</div>'
          + '<div class="empty" style="margin-top:12px">' + icon('bi-hourglass-split')
          + esc(I18n.t('goalUnsupported', { species: I18n.speciesName(S.species) })) + '</div>'
          + '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="'
          + esc(I18n.calculatorUrl(CORES[S.species].calc || '/')) + '">' + icon('bi-calculator')
          + esc(I18n.t('goalCalculatorCheck', { species: I18n.speciesName(S.species) })) + '</a></div>';
      }
      const opts = B.visualOptions();
      const checks = B.goalCheck(opts.map(o => o[0]), S.animals);
      const badge = {};
      checks.forEach(function (c) {
        if (c.ok) { badge[c.token] = ['ok', I18n.t('goalPossible')]; return; }
        const some = c.paths.some(p => p.needs.some(n => n.holders.length));
        if (some) badge[c.token] = ['part', I18n.t('goalPartial')];
      });
      return '<div class="pad"><div class="lbl">' + esc(I18n.t('goalTitle')) + '</div>'
        + '<div class="hint">' + I18n.html('goalIntro', { species: I18n.speciesName(S.species) }) + '</div>'
        + otherNote()
        + '<div class="hint">' + I18n.html('goalRegistered', { count: S.animals.length }) + '</div>'
        + '<div class="tokgrid">' + opts.map(t => {
            const b = badge[t[0]];
            return '<label class="tokchk"><input type="checkbox" class="g" value="' + esc(t[0]) + '">'
              + esc(t[1]) + (b ? '<span class="ownb ' + b[0] + '">' + esc(b[1]) + '</span>' : '') + '</label>';
          }).join('') + '</div>'
        + '<div class="formbtns"><button class="btn" id="g_run">' + icon('bi-play')
        + esc(I18n.t('goalRun')) + '</button></div><div id="g_out"></div></div>';
    }

    function runGoal() {
      const B = breedSpec();
      const tk = Array.prototype.slice.call(document.querySelectorAll('.g:checked')).map(x => x.value);
      const out = $('g_out');
      if (!tk.length) { out.innerHTML = '<div class="err">' + esc(I18n.t('goalSelectOne')) + '</div>'; return; }
      const res = B.goalCheck(tk, S.animals);
      const combo = B.comboName(tk);
      const blocked = res.filter(r => !r.ok);
      let h = '<div class="pathbox" style="margin-top:12px">'
        + '<b>' + esc(I18n.t('goalTarget')) + '</b><br>'
        + (combo ? '<span class="combotag">' + esc(I18n.t('goalCombo')) + '</span>' + esc(combo) + '<br>' : '')
        + esc(res.map(r => r.name).join(' · ')) + '</div>';
      h += '<div class="note ' + (blocked.length ? 'warn' : 'good') + '">'
        + icon(blocked.length ? 'bi-exclamation-triangle' : 'bi-check2-circle')
        + '<span>' + (blocked.length
          ? esc(I18n.t('goalBlocked', { count: blocked.length, names: blocked.map(r => r.name).join(', ') }))
          : esc(I18n.t('goalReady')))
        + '</span></div>';
      h += res.map(function (r) {
        if (!r.known) {
          return '<div class="pathbox" style="margin-top:8px"><b>' + esc(r.name) + '</b><br>'
            + '<span class="hint">' + esc(I18n.t('goalUnknown')) + '</span></div>';
        }
        if (r.ok) {
          const path = r.paths.filter(p => p.ok)[0];
          return '<div class="pathbox" style="margin-top:8px"><b>' + esc(r.name) + '</b> '
            + icon('bi-check2-circle') + '<br>' + path.needs.map(function (n) {
                return '<span class="hint">' + esc(alleleLabel(n.allele)) + ' '
                  + esc(I18n.t(n.need > 1 ? 'goalBothParents' : 'goalOneParent')) + ' — '
                  + esc(I18n.t('goalHeld', {
                    count: n.holders.length,
                    names: n.holders.slice(0, 3).map(a => a.name || I18n.t('unnamed')).join(', '),
                    more: n.holders.length > 3 ? I18n.t('goalMore') : ''
                  })) + '</span>';
              }).join('<br>') + '</div>';
        }
        return '<div class="pathbox" style="margin-top:8px"><b>' + esc(r.name) + '</b> '
          + icon('bi-x-circle') + '<br>' + r.paths.map(function (p, i) {
              return '<span class="hint">' + (r.paths.length > 1 ? esc(I18n.t('goalPath', { index: i + 1 })) : '')
                + p.needs.map(function (n) {
                    return esc(alleleLabel(n.allele)) + ' '
                      + esc(I18n.t(n.need > 1 ? 'goalBothParents' : 'goalOneParent')) + ' '
                      + (n.ok ? esc(I18n.t('goalHave', { count: n.holders.length }))
                        : I18n.html('goalHaveNeed', { have: n.holders.length, need: n.need }));
                  }).join(' + ') + '</span>';
            }).join('<br>') + '</div>';
      }).join('');
      h += '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="'
        + esc(I18n.calculatorUrl(CORES[S.species].calc)) + '">' + icon('bi-calculator')
        + esc(I18n.t('goalCalculatorOdds')) + '</a>';
      out.innerHTML = h;
    }

    function alleleLabel(allele) {
      const n = breedSpec().morphName(allele);
      return (n && n !== allele) ? n : allele;
    }

    return { tabGoal: tabGoal, runGoal: runGoal };
  };
})();
