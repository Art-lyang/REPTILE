(function (global) {
  'use strict';

  const TEXT = {
    ko: {
      open: '유전 근거 보기', close: '유전 근거 닫기', openCompact: '근거', closeCompact: '닫기', title: '이 결과가 나온 이유',
      normal: '노멀', visual: '비주얼', nonVisual: '비주얼 아님', carrier: 'het',
      parentA: '부모 A', parentB: '부모 B', passes: '전달', distribution: '전체 분포',
      outcome: '이 결과', resultChance: '결과 확률', rec: '열성', incdom: '불완전우성', dom: '우성',
      carrierResult: p => '이 결과는 ' + p + ' het 보인자',
      product: p => '독립된 유전자 자리별 확률을 곱해 이 결과는 ' + p + '입니다.',
      combo: '콤보 이름의 근거', comboReason: names => names + '가 함께 비주얼로 발현되어 붙은 이름입니다.',
      lineTitle: '라인브리딩 형질', riskTitle: '건강 주의 근거',
      risk: names => names + '가 이 결과에 발현됩니다. 결과 상단의 건강 주의 경고를 확인하세요.',
      line: '두 형질 모두 라인브리딩 형질이므로 멘델 유전 확률을 계산할 수 없습니다. 결과의 100% 표기는 계산 가능한 단일 유전자 결과가 같다는 뜻이며, 모든 새끼가 동일한 색감과 발현 정도를 보인다는 의미는 아닙니다.',
      banner: '라인브리딩 계열의 100%는 모든 새끼가 동일한 색감과 발현 정도를 보인다는 뜻이 아닙니다.'
    },
    en: {
      open: 'Why this result?', close: 'Close genetics', openCompact: 'Why', closeCompact: 'Close', title: 'Why this result appears',
      normal: 'Normal', visual: 'Visual', nonVisual: 'Not visual', carrier: 'het',
      parentA: 'Parent A', parentB: 'Parent B', passes: 'passes', distribution: 'Full distribution',
      outcome: 'This result', resultChance: 'Result chance', rec: 'Recessive', incdom: 'Incomplete dominant', dom: 'Dominant',
      carrierResult: p => 'This result is ' + p + ' het carrier',
      product: p => 'The independent locus probabilities multiply to ' + p + ' for this result.',
      combo: 'Why this combo name appears', comboReason: names => 'The name applies because ' + names + ' are visually expressed together.',
      lineTitle: 'Line-bred traits', riskTitle: 'Health caution',
      risk: names => names + ' is expressed in this result. Check the health warning above the results.',
      line: 'These are line-bred traits, so Mendelian expression odds cannot be calculated. The 100% result only means the calculable single-gene outcome is the same; it does not mean every hatchling will have identical colour or expression.',
      banner: 'For line-bred traits, 100% does not mean every hatchling will have identical colour or expression.'
    },
    zh: {
      open: '查看遗传依据', close: '收起遗传依据', openCompact: '依据', closeCompact: '收起', title: '为何会出现此结果',
      normal: '普通', visual: '表现型', nonVisual: '未表现', carrier: 'het',
      parentA: '亲本 A', parentB: '亲本 B', passes: '可传递', distribution: '完整分布',
      outcome: '此结果', resultChance: '结果概率', rec: '隐性', incdom: '不完全显性', dom: '显性',
      carrierResult: p => '此结果为 ' + p + ' het 携带者',
      product: p => '各独立基因位点的概率相乘后，此结果为 ' + p + '。',
      combo: '组合名称依据', comboReason: names => names + ' 同时表现，因此使用此组合名称。',
      lineTitle: '线育性状', riskTitle: '健康风险依据',
      risk: names => names + ' 在此结果中表现，请查看结果上方的健康警告。',
      line: '这些属于线育性状，无法计算孟德尔表现概率。结果中的 100% 只表示可计算的单基因结果相同，并不代表所有后代的颜色与表现程度完全一致。',
      banner: '线育结果中的 100% 不代表所有后代的颜色与表现程度完全一致。'
    },
    ja: {
      open: '遺伝の根拠を見る', close: '遺伝の根拠を閉じる', openCompact: '根拠', closeCompact: '閉じる', title: 'この結果になる理由',
      normal: 'ノーマル', visual: 'ビジュアル', nonVisual: '非ビジュアル', carrier: 'het',
      parentA: '親 A', parentB: '親 B', passes: '伝達', distribution: '全体の分布',
      outcome: 'この結果', resultChance: '結果確率', rec: '劣性', incdom: '不完全優性', dom: '優性',
      carrierResult: p => 'この結果は ' + p + ' het 保因',
      product: p => '独立した各遺伝子座の確率を掛け合わせると、この結果は ' + p + ' です。',
      combo: 'コンボ名の根拠', comboReason: names => names + ' が同時にビジュアル発現するため、この名前が付きます。',
      lineTitle: 'ラインブリード形質', riskTitle: '健康上の注意',
      risk: names => names + ' がこの結果に発現します。結果上部の健康警告を確認してください。',
      line: 'これらはラインブリード形質のため、メンデル遺伝の発現確率は計算できません。結果の 100% は計算可能な単一遺伝子の結果が同じという意味で、すべての仔が同じ色や発現度になるという意味ではありません。',
      banner: 'ラインブリード結果の 100% は、すべての仔が同じ色や発現度になるという意味ではありません。'
    }
  };

  function tr(language) {
    return TEXT[language] || TEXT.ko;
  }

  function pct(value) {
    const percent = Number(value || 0) * 100;
    return (percent >= 9.95 ? percent.toFixed(0) : percent.toFixed(1)) + '%';
  }

  function nameOf(gene, language) {
    return gene[language] || gene.en || gene.ko || gene.id;
  }

  function superNameOf(gene, language) {
    const key = 'super' + language.charAt(0).toUpperCase() + language.slice(1);
    return gene[key] || gene.superEn || nameOf(gene, language);
  }

  function stateLabel(gene, state, language) {
    const t = tr(language);
    if (state === 'nn') return t.normal + ' (N/N)';
    if (gene.type === 'rec') return (state === 'mm' ? t.visual : t.carrier) + (state === 'mm' ? ' (m/m)' : ' (N/m)');
    if (gene.type === 'incdom') return (state === 'mm' ? superNameOf(gene, language) : nameOf(gene, language)) + (state === 'mm' ? ' (m/m)' : ' (N/m)');
    return nameOf(gene, language) + (state === 'mm' ? ' (m/m)' : ' (N/m)');
  }

  function alleles(state) {
    if (state === 'nn') return 'N 100%';
    if (state === 'het') return 'N 50% · m 50%';
    return 'm 100%';
  }

  function distribution(gene, dist, language) {
    const t = tr(language);
    const rows = [];
    const push = (probability, label) => {
      if (probability > 0) rows.push(pct(probability) + ' ' + label);
    };
    if (gene.type === 'rec') {
      push(dist.mm, t.visual + ' (m/m)');
      push(dist.Nm, t.carrier + ' (N/m)');
      push(dist.NN, t.normal + ' (N/N)');
    } else if (gene.type === 'incdom') {
      push(dist.NN, t.normal + ' (N/N)');
      push(dist.Nm, nameOf(gene, language) + ' (N/m)');
      push(dist.mm, superNameOf(gene, language) + ' (m/m)');
    } else {
      push(dist.NN, t.normal + ' (N/N)');
      push(dist.Nm + dist.mm, nameOf(gene, language) + ' (N/m / m/m)');
    }
    return rows;
  }

  function locus(input, item) {
    const language = input.language || 'ko';
    const t = tr(language);
    const gene = item.g;
    const dist = item.dist;
    const tokens = new Set(input.row.tokens || []);
    let outcome;
    let probability;
    let carrier = null;
    if (gene.type === 'rec') {
      if (tokens.has(gene.id)) {
        outcome = t.visual + ' (m/m)';
        probability = dist.mm;
      } else {
        probability = dist.NN + dist.Nm;
        outcome = t.nonVisual + ' (N/N / N/m)';
        if (dist.Nm > 0) carrier = t.carrierResult(pct(dist.Nm / probability));
      }
    } else if (gene.type === 'incdom') {
      const isSuper = tokens.has('super_' + gene.id);
      const isVisual = tokens.has(gene.id);
      outcome = isSuper ? superNameOf(gene, language) + ' (m/m)'
        : isVisual ? nameOf(gene, language) + ' (N/m)' : t.normal + ' (N/N)';
      probability = isSuper ? dist.mm : isVisual ? dist.Nm : dist.NN;
    } else {
      const isVisual = tokens.has(gene.id);
      outcome = isVisual ? nameOf(gene, language) + ' (N/m / m/m)' : t.normal + ' (N/N)';
      probability = isVisual ? dist.Nm + dist.mm : dist.NN;
    }
    return {
      geneId: gene.id,
      name: nameOf(gene, language),
      inheritance: t[gene.type],
      parentA: stateLabel(gene, input.states.A[gene.id], language),
      parentB: stateLabel(gene, input.states.B[gene.id], language),
      allelesA: alleles(input.states.A[gene.id]),
      allelesB: alleles(input.states.B[gene.id]),
      distribution: distribution(gene, dist, language),
      outcome,
      probability,
      carrier
    };
  }

  function explain(input) {
    const language = input.language || 'ko';
    const tokens = new Set(input.row.tokens || []);
    const loci = (input.dists || []).map(item => locus(input, item));
    const components = (input.dists || [])
      .filter(item => tokens.has(item.g.id) || tokens.has('super_' + item.g.id))
      .map(item => tokens.has('super_' + item.g.id) ? superNameOf(item.g, language) : nameOf(item.g, language));
    const riskIds = new Set((input.warnings || []).map(item => item.geneId).filter(Boolean));
    const risks = loci.filter(item => riskIds.has(item.geneId) && (tokens.has(item.geneId) || tokens.has('super_' + item.geneId))).map(item => item.name);
    return {
      probability: input.row.probability == null ? input.row.prob : input.row.probability,
      loci,
      combo: input.row.combo ? { name: input.row.combo, components } : null,
      risks,
      lineBreeding: (input.poly || []).length ? tr(language).line : null
    };
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function button(language, index) {
    const t = tr(language);
    return '<button type="button" class="gx-toggle" data-gx-index="' + index + '" data-gx-lang="' + esc(language) + '" aria-label="' + esc(t.open) + '" aria-expanded="false" aria-controls="gx-panel-' + index + '">'
      + '<span class="gx-label-full">' + esc(t.open) + '</span>'
      + '<span class="gx-label-compact" aria-hidden="true">' + esc(t.openCompact) + '</span>'
      + '<i class="bi bi-chevron-down" aria-hidden="true"></i></button>';
  }

  function panel(input, index) {
    const t = tr(input.language || 'ko');
    const model = explain(input);
    let html = '<tr class="gx-row" id="gx-panel-' + index + '" hidden><td colspan="3"><div class="gx-panel">'
      + '<div class="gx-head"><b>' + esc(t.title) + '</b><span>' + esc(t.resultChance) + ' ' + pct(model.probability) + '</span></div>';
    model.loci.forEach(item => {
      html += '<section class="gx-locus"><div class="gx-locus-title"><b>' + esc(item.name) + '</b><span>' + esc(item.inheritance) + '</span></div>'
        + '<div class="gx-parents"><div><span>' + esc(t.parentA) + '</span><b>' + esc(item.parentA) + '</b><small>' + esc(t.passes) + ': ' + esc(item.allelesA) + '</small></div>'
        + '<div><span>' + esc(t.parentB) + '</span><b>' + esc(item.parentB) + '</b><small>' + esc(t.passes) + ': ' + esc(item.allelesB) + '</small></div></div>'
        + '<div class="gx-dist"><span>' + esc(t.distribution) + '</span>' + item.distribution.map(value => '<b>' + esc(value) + '</b>').join('') + '</div>'
        + '<div class="gx-outcome"><span>' + esc(t.outcome) + '</span><b>' + esc(item.outcome) + ' · ' + pct(item.probability) + '</b>'
        + (item.carrier ? '<small>' + esc(item.carrier) + '</small>' : '') + '</div></section>';
    });
    if (model.loci.length) html += '<div class="gx-note">' + esc(t.product(pct(model.probability))) + '</div>';
    if (model.combo) html += '<div class="gx-note combo"><b>' + esc(t.combo) + ' · ' + esc(model.combo.name) + '</b><br>' + esc(t.comboReason(model.combo.components.join(' + '))) + '</div>';
    if (model.lineBreeding) html += '<div class="gx-note line"><b>' + esc(t.lineTitle) + '</b><br>' + esc(model.lineBreeding) + '</div>';
    if (model.risks.length) html += '<div class="gx-note risk"><b>' + esc(t.riskTitle) + '</b><br>' + esc(t.risk(model.risks.join(', '))) + '</div>';
    return html + '</div></td></tr>';
  }

  function lineBanner(language) {
    return tr(language).banner;
  }

  function bind(host) {
    if (!host || host.dataset.gxBound) return;
    host.dataset.gxBound = '1';
    host.addEventListener('click', event => {
      const control = event.target.closest('[data-gx-index]');
      if (!control || !host.contains(control)) return;
      const panelElement = document.getElementById('gx-panel-' + control.dataset.gxIndex);
      if (!panelElement) return;
      const open = panelElement.hidden;
      const labels = tr(control.dataset.gxLang);
      panelElement.hidden = !open;
      control.setAttribute('aria-expanded', open ? 'true' : 'false');
      control.setAttribute('aria-label', open ? labels.close : labels.open);
      control.querySelector('.gx-label-full').textContent = open ? labels.close : labels.open;
      control.querySelector('.gx-label-compact').textContent = open ? labels.closeCompact : labels.openCompact;
    });
  }

  global.GeckoExplain = { explain, button, panel, lineBanner, bind };
})(window);
