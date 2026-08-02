(function () {
  'use strict';

  // Species cores declare colliding globals, so boot must load exactly one core from ?species=.

  const C = window.CareCore;
  const A = window.CareApp;
  const D = window.BreedingDraft;
  const CarePhotos = window.CarePhotos;
  const LineTraitScores = window.LineTraitScores;
  const $ = id => document.getElementById(id);
  const CORES = {
    gecko: { ko: '레오파드 게코', src: '/gecko/gecko-core.js', calc: '/gecko/', goal: true },
    crested: { ko: '크레스티드 게코', src: '/crested/crested-core.js', calc: '/crested/', goal: true },
    fattail: { ko: '아프리카 팻테일 게코', src: '/fattail/fattail-core.js', calc: '/fattail/', goal: true },
    ballpython: { ko: '볼파이톤', src: '/ballpython/ball-core.js', calc: '/ballpython/', goal: false }
  };
  const S = { species: 'gecko', tab: 'animals', goalMode: 'genetic', animals: [], pairs: [],
    clutches: [], projects: [], edit: null, busy: false };
  let B = null;
  let animalPanel, pairingPanel, clutchPanel, geneticGoal;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x];
    });
  }
  function icon(n) { return '<i class="bi ' + n + '" aria-hidden="true"></i>'; }
  function speciesKey(value) { return !value || value === 'leopard' ? 'gecko' : value; }
  function toast(message) {
    const target = $('toast');
    target.textContent = message;
    target.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => target.classList.remove('on'), 2200);
  }

  async function loadAll() {
    const [animals, pairs, clutches, projects] = await Promise.all([
      A.listAnimals(), A.listRows('pairings'), A.listRows('clutches'), A.listBreedingProjects(S.species)
    ]);
    S.animals = animals.filter(a => speciesKey(a.species) === S.species);
    S.others = animals.length - S.animals.length;
    const animalsById = new Map(animals.map(a => [a.id, a]));
    S.pairs = pairs.filter(p => {
      if (p.species) return speciesKey(p.species) === S.species;
      const linked = animalsById.get(p.male) || animalsById.get(p.female);
      return linked ? speciesKey(linked.species) === S.species : S.species === 'gecko';
    });
    const pairingIds = new Set(S.pairs.map(p => p.id));
    S.clutches = clutches.filter(c => !c.pairing || pairingIds.has(c.pairing));
    S.projects = projects;
  }

  async function act(fn, ok) {
    if (S.busy) return;
    S.busy = true;
    try {
      const result = await fn();
      await loadAll();
      render();
      if (ok) toast(typeof ok === 'function' ? ok(result) : ok);
      return result;
    } catch (e) { toast(A.friendly(e)); }
    finally { S.busy = false; }
  }

  function nameById(id) {
    const animal = S.animals.filter(item => item.id === id)[0];
    return animal ? (animal.name || '이름 없음') : '-';
  }
  function projectById(id) { return S.projects.filter(project => project.id === id)[0] || null; }
  function goalText(key) {
    return window.BreedingGoalUI && BreedingGoalUI.t ? BreedingGoalUI.t(key) : key;
  }
  function otherNote() {
    return S.others ? '<div class="hint">' + icon('bi-info-circle') + ' 다른 종 ' + S.others
      + '마리는 위에서 종을 바꾸거나 <a href="/care/">크리처 케어로그</a>에서 볼 수 있어요.</div>' : '';
  }

  function render() {
    document.querySelectorAll('.tab').forEach(tab =>
      tab.classList.toggle('on', tab.getAttribute('data-t') === S.tab));
    $('body').innerHTML = ({
      animals: animalPanel.tabAnimals,
      pair: pairingPanel.tabPair,
      clutch: clutchPanel.tabClutch,
      goal: geneticGoal.tabGoal,
      analysis: pairingPanel.tabAnalysis
    }[S.tab])();
    Photo.hydrate($('body'), A.sb);
    if (S.tab === 'analysis' && window.BreedingWorkspace) {
      BreedingWorkspace.bind($('body'), { onImport: pairingPanel.openCalculationAsPair });
    }
    if (S.tab === 'goal' && window.BreedingGoalUI) {
      BreedingGoalUI.bind($('body'), {
        onModeChange: mode => { S.goalMode = mode; },
        createProject: async project => { await A.createBreedingProject(project); await loadAll(); render(); },
        updateProject: async (project, changes) => {
          await A.updateBreedingProject(project, changes); await loadAll(); render();
        },
        deleteProject: async project => { await A.deleteBreedingProject(project); await loadAll(); render(); },
        pairCandidate: async (project, candidate) => {
          S.edit = { what: 'pair', row: BreedingProjectFlow.pairingDraft(project, candidate) };
          S.tab = 'pair';
          try { history.replaceState(null, '', '?species=' + S.species + '#pair'); } catch (error) {}
          render();
        }
      });
    }
  }

  function assembleModules() {
    const base = { state: S, app: A, core: C, draft: D, photos: CarePhotos,
      lineTraitScores: LineTraitScores, photo: window.Photo, element: $, esc: esc, icon: icon,
      cores: CORES, act: act, render: render, breedSpec: () => B };
    animalPanel = window.createBreedingAnimalPanel(Object.assign({}, base, {
      nameById: nameById, otherNote: otherNote
    }));
    pairingPanel = window.createBreedingPairingPanel(Object.assign({}, base, {
      nameById: nameById, projectById: projectById, goalText: goalText
    }));
    clutchPanel = window.createBreedingClutchPanel(base);
    geneticGoal = window.createBreedingGeneticGoal(Object.assign({}, base, { otherNote: otherNote }));
    window.createBreedingEvents(Object.assign({}, base, {
      toast: toast, animalPanel: animalPanel, pairingPanel: pairingPanel,
      clutchPanel: clutchPanel, geneticGoal: geneticGoal
    })).bind();
  }

  function loadScript(src) {
    return new Promise(function (done, fail) {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => done();
      script.onerror = () => fail(new Error(src + ' 를 불러오지 못했습니다'));
      document.head.appendChild(script);
    });
  }
  function gate(iconName, title, body, href, label) {
    $('body').innerHTML = '<div class="gate"><div class="pad"><div class="gicon">' + icon(iconName)
      + '</div><div class="lbl">' + title + '</div><div class="hint">' + body + '</div>'
      + (href ? '<a class="btn wide" style="text-decoration:none;margin-top:16px" href="' + href + '">'
        + icon('bi-arrow-right') + label + '</a>' : '') + '</div></div>';
  }

  async function boot() {
    if (!A.ready) { gate('bi-plug', '백엔드가 설정되지 않았습니다', 'assets/studio-config.js 를 확인해 주세요.', '/care/', '케어로'); return; }
    const querySpecies = new URLSearchParams(location.search).get('species');
    S.species = CORES[querySpecies] ? querySpecies : 'gecko';
    const hash = (location.hash || '').replace('#', '');
    if (['animals', 'pair', 'clutch', 'goal', 'analysis'].indexOf(hash) >= 0) S.tab = hash;
    await A.boot();
    A.logVisit();
    if (!A.user) { gate('bi-person-lock', '로그인이 필요합니다', '브리딩 기록은 계정에 저장됩니다.', '/gecko/login.html', '로그인'); return; }
    if (!A.premium.active) { gate('bi-gem', '프리미엄 기능입니다', '개체·페어링·클러치·역산을 이용할 수 있습니다.', '/gecko/login.html', '프리미엄 코드 입력'); return; }
    try {
      // The adapter inspects the selected core, and the planner inspects the adapter.
      await loadScript(CORES[S.species].src + '?v=13');
      await loadScript('breeding-spec.js?v=13');
      await loadScript('/assets/linebreeding-planner.js?v=20260802b');
    } catch (e) {
      gate('bi-exclamation-triangle', '계산기 데이터를 불러오지 못했습니다', esc(e.message), '/care/', '케어로');
      return;
    }
    B = window.BreedSpec;
    if (!B) {
      gate('bi-exclamation-triangle', '종 데이터를 읽지 못했습니다',
        esc(CORES[S.species].ko) + ' 코어에서 유전 정보를 찾지 못했습니다.', '/care/', '케어로');
      return;
    }
    $('btitle').textContent = CORES[S.species].ko + ' 브리딩';
    $('bsub').textContent = '개체 · 페어링 · 클러치 · 계산 분석을 관리합니다';
    $('species').innerHTML = Object.keys(CORES).map(key => '<option value="' + key + '"'
      + (key === S.species ? ' selected' : '') + '>' + esc(CORES[key].ko) + '</option>').join('');
    $('spbar').style.display = '';
    $('tabs').style.display = '';
    try { await loadAll(); }
    catch (e) { gate('bi-exclamation-triangle', '불러오지 못했습니다', esc(A.friendly(e)), '/care/', '케어로'); return; }
    const incoming = D ? BreedingDraft.load(S.species) : null;
    if (incoming) { pairingPanel.openCalculationAsPair(incoming); return; }
    render();
  }

  assembleModules();
  boot();
})();
