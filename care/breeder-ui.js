(function () {
  'use strict';

  const I = window.CareI18n;
  const C = window.CareCore;
  const Cards = window.PublicAnimalCards;
  const SB = (typeof SUPABASE_URL !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;
  const token = new URLSearchParams(location.search).get('t');
  let profile = null;
  let species = '';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function icon(name) { return '<i class="bi ' + name + '" aria-hidden="true"></i>'; }

  function gate(message) {
    document.getElementById('body').innerHTML = '<div class="gate"><div class="pad"><div class="gicon">'
      + icon('bi-person-x') + '</div><div class="lbl">' + esc(I.t('breederUnavailable')) + '</div>'
      + '<div class="hint">' + esc(message) + '</div><a class="btn ghost wide" href="' + I.url('/') + '">'
      + icon('bi-house') + esc(I.t('studio')) + '</a></div></div>';
  }

  function availableSpecies() {
    return Array.from(new Set((profile.animals || []).map(function (animal) { return animal.species; }))).sort();
  }

  function filters() {
    const options = [['', I.t('breederAllSpecies')]].concat(availableSpecies().map(function (code) {
      return [code, I.speciesName(code)];
    }));
    return '<div class="breeder-filter" role="group" aria-label="' + esc(I.t('breederSpeciesFilter')) + '">'
      + options.map(function (option) {
        return '<button type="button" data-species="' + esc(option[0]) + '" class="'
          + (option[0] === species ? 'on' : '') + '">' + esc(option[1]) + '</button>';
      }).join('') + '</div>';
  }

  function renderGrid() {
    const list = (profile.animals || []).filter(function (animal) {
      return !species || animal.species === species;
    });
    const target = document.getElementById('breederGrid');
    target.innerHTML = list.length ? Cards.grid(list)
      : '<div class="breeder-empty">' + icon('bi-heart') + '<br>' + esc(I.t('breederNoAnimals')) + '</div>';
    Photo.hydrate(target, SB);
  }

  function render() {
    document.title = profile.breeder + ' · ' + I.t('breederProfile');
    document.getElementById('body').innerHTML = '<section class="pad breeder-hero">'
      + '<div class="breeder-mark">' + icon('bi-person-heart') + '</div><div>'
      + '<div class="breeder-eyebrow">' + esc(I.t('breederProfile')) + '</div>'
      + '<h1 class="breeder-name">' + esc(profile.breeder) + '</h1>'
      + '<div class="breeder-meta">' + esc(I.t('breederPublicAnimals', { count: I.formatNumber(profile.total) }))
      + '</div></div></section><section class="pad"><div class="psection-head"><div>'
      + '<div class="lbl">' + esc(I.t('breederAnimals')) + '</div><div class="hint">'
      + esc(I.t('breederProfileHint')) + '</div></div></div>' + filters()
      + '<div id="breederGrid"></div></section><section class="pad" style="text-align:center">'
      + '<div class="hint">' + esc(I.t('breederPrivacy')) + '</div>'
      + '<a class="btn ghost wide" href="' + I.url('/care/p.html', { t: token }) + '">'
      + icon('bi-arrow-left') + esc(I.t('breederBackAnimal')) + '</a></section>';
    renderGrid();
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-species]');
    if (!button || !profile) return;
    species = button.dataset.species || '';
    document.querySelectorAll('[data-species]').forEach(function (item) {
      item.classList.toggle('on', item === button);
    });
    renderGrid();
  });

  (async function boot() {
    if (!SB || !token) { gate(I.t('breederUnavailableHint')); return; }
    try {
      const response = await SB.rpc('public_breeder_profile', {
        p_token: token, p_species: null, p_limit: 60, p_offset: 0
      });
      if (response.error) throw response.error;
      profile = response.data;
    } catch (error) {
      gate(I.t('shareLoadError'));
      return;
    }
    if (!profile) { gate(I.t('breederUnavailableHint')); return; }
    render();
  }());
}());
