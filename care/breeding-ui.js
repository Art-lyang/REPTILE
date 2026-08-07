(function () {
  'use strict';

  // Species cores declare colliding globals, so boot must load exactly one core from ?species=.

  const C = window.CareCore;
  const A = window.CareApp;
  const D = window.BreedingDraft;
  const CarePhotos = window.CarePhotos;
  const LineTraitScores = window.LineTraitScores;
  const I18n = window.BreedingI18n;
  const BreedingRowScope = window.BreedingRowScope;
  const HatchOutcomes = window.BreedingHatchOutcomes;
  const $ = id => document.getElementById(id);
  const CORES = {
    gecko: { src: '/gecko/gecko-core.js', calc: '/gecko/', goal: true },
    crested: { src: '/crested/crested-core.js', calc: '/crested/', goal: true },
    fattail: { src: '/fattail/fattail-core.js', calc: '/fattail/', goal: true },
    ballpython: { src: '/ballpython/ball-core.js', calc: '/ballpython/', goal: false }
  };
  const S = { species: 'gecko', tab: 'animals', goalMode: 'genetic', animals: [], pairs: [],
    clutches: [], projects: [], groups: [], matingEvents: [], edit: null, busy: false };
  let B = null;
  let animalPanel, pairingPanel, matingPanel, hatchPanel, clutchPanel, geneticGoal;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x];
    });
  }
  function icon(n) { return '<i class="bi ' + n + '" aria-hidden="true"></i>'; }
  function toast(message) {
    const target = $('toast');
    target.textContent = message;
    target.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => target.classList.remove('on'), 2200);
  }

  async function loadAll() {
    const [animals, pairs, clutches, projects, groups] = await Promise.all([
      A.listAnimals(), A.listRows('pairings'), A.listRows('clutches'), A.listBreedingProjects(S.species),
      A.listMatingGroups(S.species)
    ]);
    S.animals = animals.filter(a => BreedingRowScope.speciesKey(a.species) === S.species);
    S.others = animals.length - S.animals.length;
    S.pairs = BreedingRowScope.pairings(pairs, animals, S.species);
    S.clutches = BreedingRowScope.clutches(clutches, S.pairs, S.species);
    S.projects = projects;
    S.groups = groups;
    S.matingEvents = await A.listMatingEvents(groups.map(group => group.id));
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
    } catch (e) { toast(I18n.friendly(e)); }
    finally { S.busy = false; }
  }

  function nameById(id) {
    const animal = S.animals.filter(item => item.id === id)[0];
    return animal ? (animal.name || I18n.t('unnamed')) : '-';
  }
  function projectById(id) { return S.projects.filter(project => project.id === id)[0] || null; }
  function goalText(key) {
    return window.BreedingGoalUI && BreedingGoalUI.t ? BreedingGoalUI.t(key) : key;
  }
  function otherNote() {
    return S.others ? '<div class="hint">' + icon('bi-info-circle')
      + ' ' + I18n.html('otherSpecies', { count: S.others }) + '</div>' : '';
  }

  function render() {
    document.querySelectorAll('.tab').forEach(tab =>
      tab.classList.toggle('on', tab.getAttribute('data-t') === S.tab));
    $('body').innerHTML = ({
      animals: animalPanel.tabAnimals,
      pair: matingPanel.tabMating,
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
          try { history.replaceState(null, '', I18n.managementUrl(S.species, 'pair')); } catch (error) {}
          render();
        }
      });
    }
  }

  function assembleModules() {
    const base = { state: S, app: A, core: C, draft: D, photos: CarePhotos,
      lineTraitScores: LineTraitScores, photo: window.Photo, element: $, esc: esc, icon: icon,
      cores: CORES, i18n: I18n, lifeStage: window.AnimalLifeStage,
      hatchOutcomes: HatchOutcomes, act: act, render: render, breedSpec: () => B };
    animalPanel = window.createBreedingAnimalPanel(Object.assign({}, base, {
      nameById: nameById, otherNote: otherNote
    }));
    pairingPanel = window.createBreedingPairingPanel(Object.assign({}, base, {
      nameById: nameById, projectById: projectById, goalText: goalText
    }));
    matingPanel = window.createBreedingMatingPanel(Object.assign({}, base, {
      matingGroups: window.BreedingMatingGroups, nameById: nameById,
      projectById: projectById, pairingPanel: pairingPanel
    }));
    hatchPanel = window.createBreedingHatchPanel(Object.assign({}, base, {
      nameById: nameById, toast: toast
    }));
    clutchPanel = window.createBreedingClutchPanel(Object.assign({}, base, {
      nameById: nameById, hatchPanel: hatchPanel
    }));
    geneticGoal = window.createBreedingGeneticGoal(Object.assign({}, base, { otherNote: otherNote }));
    window.createBreedingEvents(Object.assign({}, base, {
      toast: toast, animalPanel: animalPanel, pairingPanel: pairingPanel,
      matingPanel: matingPanel, hatchPanel: hatchPanel, clutchPanel: clutchPanel, geneticGoal: geneticGoal
    })).bind();
  }

  function loadScript(src) {
    return new Promise(function (done, fail) {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => done();
      script.onerror = () => fail(new Error(I18n.t('scriptLoadError', { src: src })));
      document.head.appendChild(script);
    });
  }
  function gate(iconName, title, body, href, label) {
    $('body').innerHTML = '<div class="gate"><div class="pad"><div class="gicon">' + icon(iconName)
      + '</div><div class="lbl">' + title + '</div><div class="hint">' + body + '</div>'
      + (href ? '<a class="btn wide" style="text-decoration:none;margin-top:16px" href="' + href + '">'
        + icon('bi-arrow-right') + label + '</a>' : '') + '</div></div>';
  }

  function loginUrl() {
    const query = new URLSearchParams();
    if (I18n.language() !== 'ko') query.set('lang', I18n.language());
    query.set('next', location.pathname + location.search + location.hash);
    return '/gecko/login.html?' + query.toString();
  }

  async function boot() {
    I18n.initialize();
    if (!A.ready) { gate('bi-plug', I18n.t('backendTitle'), I18n.t('backendBody'), '/care/', I18n.t('careAction')); return; }
    const querySpecies = new URLSearchParams(location.search).get('species');
    S.species = CORES[querySpecies] ? querySpecies : 'gecko';
    const hash = (location.hash || '').replace('#', '');
    if (['animals', 'pair', 'clutch', 'goal', 'analysis'].indexOf(hash) >= 0) S.tab = hash;
    await A.boot();
    A.logVisit(I18n.language());
    if (!A.user) { gate('bi-person-lock', I18n.t('loginTitle'), I18n.t('loginBody'), loginUrl(), I18n.t('loginAction')); return; }
    /* 무료 회원이 브리딩 관리를 눌렀을 때 닿는 자리입니다. 예전에는 로그인
       화면으로 보냈는데, 여기 온 사람은 이미 로그인한 상태라 눌러 봐야 자기
       계정 화면만 나왔습니다. 무엇이 더 열리는지 알려면 요금 안내여야 합니다.
       요금 안내는 한국어 전용이라 lang 을 붙이지 않습니다. */
    if (!A.premium.active) { gate('bi-gem', I18n.t('premiumTitle'), I18n.t('premiumBody'), '/pricing.html', I18n.t('premiumAction')); return; }
    try {
      // The adapter inspects the selected core, and the planner inspects the adapter.
      await loadScript(CORES[S.species].src + '?v=13');
      await loadScript('breeding-spec.js?v=13');
      await loadScript('/assets/linebreeding-planner.js?v=20260802b');
    } catch (e) {
      gate('bi-exclamation-triangle', I18n.t('calculatorLoadTitle'), esc(e.message), '/care/', I18n.t('careAction'));
      return;
    }
    B = window.BreedSpec;
    if (!B) {
      gate('bi-exclamation-triangle', I18n.t('speciesDataTitle'),
        I18n.html('speciesDataBody', { species: I18n.speciesName(S.species) }), '/care/', I18n.t('careAction'));
      return;
    }
    $('btitle').textContent = I18n.t('headerTitle', { species: I18n.speciesName(S.species) });
    $('bsub').textContent = I18n.t('headerSubtitle');
    $('species').innerHTML = Object.keys(CORES).map(key => '<option value="' + key + '"'
      + (key === S.species ? ' selected' : '') + '>' + esc(I18n.speciesName(key)) + '</option>').join('');
    $('spbar').style.display = '';
    $('tabs').style.display = '';
    try { await loadAll(); }
    catch (e) { gate('bi-exclamation-triangle', I18n.t('loadTitle'), esc(I18n.friendly(e)), '/care/', I18n.t('careAction')); return; }
    const incoming = D ? BreedingDraft.load(S.species) : null;
    if (incoming) { pairingPanel.openCalculationAsPair(incoming); return; }
    render();
  }

  assembleModules();
  boot();
})();
