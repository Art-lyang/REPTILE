(function (w) {
  'use strict';

  function safeId(value) {
    value = String(value || '');
    return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
  }

  function requestedId(locationLike) {
    try {
      return safeId(new URL(locationLike.href).searchParams.get('edit'));
    } catch (error) { return null; }
  }

  function editUrl(id, i18n) {
    id = safeId(id);
    return id ? i18n.url('/care/#animals', { edit: id }) : i18n.url('/care/#animals');
  }

  function activate(state, photos, app, locationLike, historyLike) {
    var id = requestedId(locationLike);
    if (!id) return false;
    var animal = (state.animals || []).filter(function (row) { return row.id === id; })[0];
    if (!animal) return false;
    state.tab = 'animals';
    state.editAnimal = animal;
    photos.begin(animal, app);
    try {
      var current = new URL(locationLike.href);
      current.searchParams.delete('edit');
      historyLike.replaceState(null, '', current.pathname + current.search + '#animals');
    } catch (error) {}
    return true;
  }

  w.CareAnimalEditRoute = { requestedId: requestedId, editUrl: editUrl, activate: activate };
}(window));
