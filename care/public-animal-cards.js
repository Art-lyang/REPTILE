(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function card(animal) {
    const core = global.CareCore;
    const i18n = global.CareI18n;
    const species = core.SPECIES[animal.species] || core.SPECIES.other;
    const sex = animal.sex === 'male' ? ' ♂' : animal.sex === 'female' ? ' ♀' : '';
    const stage = global.AnimalLifeStage && animal.life_stage
      ? i18n.t(global.AnimalLifeStage.labelKey(animal.life_stage)) : '';
    const morphs = (animal.morphs || []).slice(0, 2);
    return '<a class="gcard breeder-animal" href="' + i18n.url('/care/p.html', { t: animal.token }) + '">'
      + '<div class="gphoto">' + (animal.photo ? global.Photo.tag(animal.photo, animal.name || '')
        : '<span class="gnone">' + species.icon + '</span>') + '</div>'
      + '<div class="ginfo"><div class="gname">' + escapeHtml(animal.name || i18n.t('unnamed'))
      + '<span class="gsex">' + sex + '</span></div>'
      + '<div class="gsp">' + species.icon + ' ' + escapeHtml(i18n.speciesName(animal.species))
      + (stage ? ' · ' + escapeHtml(stage) : '') + '</div>'
      + (morphs.length ? '<div class="gmorphs">' + morphs.map(function (morph) {
        return '<span>' + escapeHtml(morph) + '</span>';
      }).join('') + '</div>' : '') + '</div></a>';
  }

  function grid(animals) {
    return '<div class="ggrid breeder-grid">' + (animals || []).map(card).join('') + '</div>';
  }

  global.PublicAnimalCards = Object.freeze({ card: card, grid: grid });
}(window));
