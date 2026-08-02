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
        return '<div class="pad"><div class="lbl">목표 모프 역산</div>'
          + '<div class="empty" style="margin-top:12px">' + icon('bi-hourglass-split')
          + esc(CORES[S.species].ko) + ' 역산은 아직 준비 중입니다.</div>'
          + '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="'
          + esc(CORES[S.species].calc || '/') + '">' + icon('bi-calculator')
          + esc(CORES[S.species].ko) + ' 계산기에서 조합 확인</a></div>';
      }
      const opts = B.visualOptions();
      const checks = B.goalCheck(opts.map(o => o[0]), S.animals);
      const badge = {};
      checks.forEach(function (c) {
        if (c.ok) { badge[c.token] = ['ok', '가능']; return; }
        const some = c.paths.some(p => p.needs.some(n => n.holders.length));
        if (some) badge[c.token] = ['part', '일부'];
      });
      return '<div class="pad"><div class="lbl">목표 모프 역산</div>'
        + '<div class="hint">만들고 싶은 모프를 고르면 <b>내가 등록한 '
        + esc(CORES[S.species].ko) + '</b> 로 닿을 수 있는지, 없다면 무엇이 없는지 알려줍니다. '
        + '확률은 계산하지 않습니다 — 그건 계산기가 합니다.</div>'
        + otherNote()
        + '<div class="hint">등록된 개체 <b>' + S.animals.length + '마리</b></div>'
        + '<div class="tokgrid">' + opts.map(t => {
            const b = badge[t[0]];
            return '<label class="tokchk"><input type="checkbox" class="g" value="' + esc(t[0]) + '">'
              + esc(t[1]) + (b ? '<span class="ownb ' + b[0] + '">' + b[1] + '</span>' : '') + '</label>';
          }).join('') + '</div>'
        + '<div class="formbtns"><button class="btn" id="g_run">' + icon('bi-play')
        + '가능한지 보기</button></div><div id="g_out"></div></div>';
    }

    function runGoal() {
      const B = breedSpec();
      const tk = Array.prototype.slice.call(document.querySelectorAll('.g:checked')).map(x => x.value);
      const out = $('g_out');
      if (!tk.length) { out.innerHTML = '<div class="err">목표 모프를 하나 이상 고르세요.</div>'; return; }
      const res = B.goalCheck(tk, S.animals);
      const combo = B.comboName(tk);
      const blocked = res.filter(r => !r.ok);
      let h = '<div class="pathbox" style="margin-top:12px">'
        + '<b>목표</b><br>' + (combo ? '<span class="combotag">콤보</span>' + esc(combo) + '<br>' : '')
        + esc(res.map(r => r.name).join(' · ')) + '</div>';
      h += '<div class="note ' + (blocked.length ? 'warn' : 'good') + '">'
        + icon(blocked.length ? 'bi-exclamation-triangle' : 'bi-check2-circle')
        + '<span>' + (blocked.length
          ? '지금 개체로는 ' + blocked.length + '가지가 안 됩니다 — ' + esc(blocked.map(r => r.name).join(', '))
          : '필요한 유전자를 모두 보유하고 있습니다. 실제 확률은 계산기에서 확인하세요.')
        + '</span></div>';
      h += res.map(function (r) {
        if (!r.known) {
          return '<div class="pathbox" style="margin-top:8px"><b>' + esc(r.name) + '</b><br>'
            + '<span class="hint">이 종의 유전 정보에서 찾지 못한 항목입니다.</span></div>';
        }
        if (r.ok) {
          const path = r.paths.filter(p => p.ok)[0];
          return '<div class="pathbox" style="margin-top:8px"><b>' + esc(r.name) + '</b> '
            + icon('bi-check2-circle') + '<br>' + path.needs.map(function (n) {
                return '<span class="hint">' + esc(alleleLabel(n.allele)) + ' '
                  + (n.need > 1 ? '양쪽 부모' : '한쪽 부모') + ' — 보유 '
                  + n.holders.length + '마리 ('
                  + esc(n.holders.slice(0, 3).map(a => a.name || '이름 없음').join(', '))
                  + (n.holders.length > 3 ? ' 외' : '') + ')</span>';
              }).join('<br>') + '</div>';
        }
        return '<div class="pathbox" style="margin-top:8px"><b>' + esc(r.name) + '</b> '
          + icon('bi-x-circle') + '<br>' + r.paths.map(function (p, i) {
              return '<span class="hint">' + (r.paths.length > 1 ? '경로 ' + (i + 1) + ' — ' : '')
                + p.needs.map(function (n) {
                    return esc(alleleLabel(n.allele)) + ' '
                      + (n.need > 1 ? '양쪽 부모' : '한쪽 부모') + ' '
                      + (n.ok ? '(보유 ' + n.holders.length + ')'
                        : '<b>보유 ' + n.holders.length + ' / 필요 ' + n.need + '</b>');
                  }).join(' + ') + '</span>';
            }).join('<br>') + '</div>';
      }).join('');
      h += '<a class="btn ghost wide" style="text-decoration:none;margin-top:12px" href="'
        + esc(CORES[S.species].calc) + '">' + icon('bi-calculator') + '계산기에서 확률 보기</a>';
      out.innerHTML = h;
    }

    function alleleLabel(allele) {
      const n = breedSpec().morphName(allele);
      return (n && n !== allele) ? n : allele;
    }

    return { tabGoal: tabGoal, runGoal: runGoal };
  };
})();
