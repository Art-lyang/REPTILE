(function (w) {
  'use strict';

  var MAX_EXTRA = 3;
  var TEXT = {
    ko: {
      photos: '개체 사진',
      cover: '프로필 사진',
      extras: '추가 사진',
      extra: '추가 사진 {n}',
      choose: '사진 선택',
      replace: '사진 변경',
      remove: '지우기',
      empty: '사진 없음',
      hint: '프로필 1장과 추가 사진 3장까지 저장할 수 있습니다. 저장할 때 자동으로 줄여서 올립니다.',
      ready: '선택했습니다. 저장을 눌러야 반영됩니다.',
      uploading: '{label} 올리는 중…',
      imageOnly: 'JPG, PNG, WebP 이미지 파일을 골라주세요.',
      cleanupWarning: '저장됐지만 교체한 이전 사진 일부를 정리하지 못했습니다.',
      rollbackWarning: '저장에 실패했고 새로 올린 사진 정리도 완료하지 못했습니다. 다시 시도해 주세요.',
      photoNumber: '개체 사진 {n}'
    },
    en: {
      photos: 'Animal photos',
      cover: 'Profile photo',
      extras: 'Additional photos',
      extra: 'Additional photo {n}',
      choose: 'Choose photo',
      replace: 'Replace photo',
      remove: 'Remove',
      empty: 'No photo',
      hint: 'Save one profile photo and up to three additional photos. Images are resized on save.',
      ready: 'Selected. Save the animal to apply it.',
      uploading: 'Uploading {label}…',
      imageOnly: 'Choose a JPG, PNG, or WebP image.',
      cleanupWarning: 'Saved, but some replaced photos could not be removed.',
      rollbackWarning: 'Saving failed and the new upload could not be fully cleaned up. Try again.',
      photoNumber: 'Animal photo {n}'
    },
    ja: {
      photos: '個体写真',
      cover: 'プロフィール写真',
      extras: '追加写真',
      extra: '追加写真 {n}',
      choose: '写真を選択',
      replace: '写真を変更',
      remove: '削除',
      empty: '写真なし',
      hint: 'プロフィール1枚と追加写真3枚まで保存できます。保存時に自動で縮小します。',
      ready: '選択しました。保存すると反映されます。',
      uploading: '{label}をアップロード中…',
      imageOnly: 'JPG、PNG、WebP画像を選択してください。',
      cleanupWarning: '保存しましたが、置き換えた写真の一部を削除できませんでした。',
      rollbackWarning: '保存に失敗し、新しい写真の後片付けも完了できませんでした。再試行してください。',
      photoNumber: '個体写真 {n}'
    },
    zh: {
      photos: '个体照片',
      cover: '头像照片',
      extras: '附加照片',
      extra: '附加照片 {n}',
      choose: '选择照片',
      replace: '更换照片',
      remove: '删除',
      empty: '暂无照片',
      hint: '可保存1张头像和最多3张附加照片，保存时会自动压缩。',
      ready: '已选择，保存个体后生效。',
      uploading: '正在上传{label}…',
      imageOnly: '请选择 JPG、PNG 或 WebP 图片。',
      cleanupWarning: '已保存，但部分被替换的旧照片未能删除。',
      rollbackWarning: '保存失败，且新上传照片未能完全清理，请重试。',
      photoNumber: '个体照片 {n}'
    }
  };
  var state = null;

  function language() {
    var raw = (document.documentElement.lang || 'ko').toLowerCase().split('-')[0];
    return TEXT[raw] ? raw : 'ko';
  }

  function t(key, values) {
    var value = TEXT[language()][key] || TEXT.ko[key] || key;
    Object.keys(values || {}).forEach(function (name) {
      value = value.replace('{' + name + '}', values[name]);
    });
    return value;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function normalize(animal) {
    animal = animal || {};
    var cover = typeof animal.photo_url === 'string' && animal.photo_url.trim()
      ? animal.photo_url.trim() : null;
    var used = {};
    if (cover) used[cover] = true;
    var extras = [];
    (Array.isArray(animal.photos) ? animal.photos : []).forEach(function (url) {
      if (extras.length >= MAX_EXTRA || typeof url !== 'string') return;
      url = url.trim();
      if (!url || used[url]) return;
      used[url] = true;
      extras.push(url);
    });
    return { photo_url: cover, photos: extras };
  }

  function entry(url) {
    return url ? { url: url, file: null, preview: url } : null;
  }

  function begin(animal, app) {
    var original = normalize(animal);
    state = {
      app: app,
      original: original,
      cover: entry(original.photo_url),
      extras: [0, 1, 2].map(function (index) { return entry(original.photos[index]); }),
      prepared: {},
      status: ''
    };
    return values();
  }

  function slotEntry(slot) {
    if (!state) return null;
    if (slot === 'cover') return state.cover;
    var match = /^extra-([0-2])$/.exec(slot);
    return match ? state.extras[Number(match[1])] : null;
  }

  function setSlot(slot, value) {
    if (slot === 'cover') state.cover = value;
    else state.extras[Number(slot.slice(-1))] = value;
  }

  function resolvedUrl(slot) {
    var current = slotEntry(slot);
    if (!current) return null;
    return state.prepared[slot] || current.url || null;
  }

  function values() {
    if (!state) return { photo_url: null, photos: [] };
    return normalize({
      photo_url: resolvedUrl('cover'),
      photos: [0, 1, 2].map(function (index) {
        return resolvedUrl('extra-' + index);
      }).filter(Boolean)
    });
  }

  function revoke(item) {
    if (item && item.file && item.preview) URL.revokeObjectURL(item.preview);
  }

  async function select(slot, file) {
    if (!state || !/^(cover|extra-[0-2])$/.test(slot)) return false;
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) {
      throw new Error(t('imageOnly'));
    }
    if (!w.PhotoCropper || !w.PhotoCropper.open) {
      throw new Error(t('imageOnly'));
    }
    var cropped = await w.PhotoCropper.open(file, { profile: slot === 'cover' });
    if (!cropped) return false;
    revoke(slotEntry(slot));
    setSlot(slot, { url: null, file: cropped, preview: URL.createObjectURL(cropped) });
    delete state.prepared[slot];
    state.status = t('ready');
    return true;
  }

  function remove(slot) {
    if (!state || !/^(cover|extra-[0-2])$/.test(slot)) return false;
    revoke(slotEntry(slot));
    setSlot(slot, null);
    delete state.prepared[slot];
    state.status = t('ready');
    return true;
  }

  function setMessage(message) {
    if (state) state.status = message;
    var node = document.getElementById ? document.getElementById('animal_photo_msg') : null;
    if (node) node.textContent = message;
  }

  async function prepare() {
    if (!state) throw new Error('photo editor is not active');
    var slots = ['cover', 'extra-0', 'extra-1', 'extra-2'];
    try {
      for (var index = 0; index < slots.length; index += 1) {
        var slot = slots[index];
        var current = slotEntry(slot);
        if (!current || !current.file || state.prepared[slot]) continue;
        var label = slot === 'cover' ? t('cover') : t('extra', { n: Number(slot.slice(-1)) + 1 });
        var url = await state.app.uploadPhoto(current.file, function (message) {
          setMessage(message || t('uploading', { label: label }));
        });
        state.prepared[slot] = url;
      }
      return values();
    } catch (error) {
      await rollback();
      throw error;
    }
  }

  async function removeUrls(urls) {
    var unique = urls.filter(function (url, index, all) {
      return url && all.indexOf(url) === index;
    });
    if (!unique.length) return { ok: true, failed: [] };
    if (!w.Photo || !w.Photo.removeMany) return { ok: false, failed: unique };
    var result = await w.Photo.removeMany(state && state.app ? state.app.sb : null, unique);
    return { ok: !result.failed.length, failed: result.failed };
  }

  async function rollback() {
    if (!state) return { ok: true, failed: [] };
    var pending = Object.keys(state.prepared).map(function (slot) { return state.prepared[slot]; });
    var result = await removeUrls(pending);
    var retry = {};
    Object.keys(state.prepared).forEach(function (slot) {
      if (result.failed.indexOf(state.prepared[slot]) >= 0) retry[slot] = state.prepared[slot];
    });
    state.prepared = retry;
    return result;
  }

  function finish() {
    if (!state) return;
    revoke(state.cover);
    state.extras.forEach(revoke);
    state = null;
  }

  async function cancel() {
    var result = await rollback();
    finish();
    return result;
  }

  async function commit(saved) {
    if (!state) return { ok: true, failed: [] };
    var keep = [].concat(saved.photo_url ? [saved.photo_url] : [], saved.photos || []);
    var old = [].concat(state.original.photo_url ? [state.original.photo_url] : [], state.original.photos);
    var prepared = Object.keys(state.prepared).map(function (slot) { return state.prepared[slot]; });
    var stale = old.concat(prepared).filter(function (url) { return keep.indexOf(url) < 0; });
    var result = await removeUrls(stale);
    finish();
    return result;
  }

  function slotHtml(slot, label, current, cover) {
    var hasPhoto = Boolean(current);
    var preview = hasPhoto
      ? w.Photo.tag(current.preview, label, 'cphoto-image')
      : '<span class="cphoto-empty"><i class="bi bi-image" aria-hidden="true"></i>' + esc(t('empty')) + '</span>';
    return '<div class="cphoto-slot' + (cover ? ' cover' : '') + '">'
      + '<div class="cphoto-label">' + esc(label) + '</div>'
      + '<div class="cphoto-preview">' + preview + '</div>'
      + '<div class="cphoto-actions"><label class="mini" for="care_' + slot + '">'
      + '<i class="bi bi-image" aria-hidden="true"></i>' + esc(hasPhoto ? t('replace') : t('choose')) + '</label>'
      + '<input id="care_' + slot + '" data-care-photo-pick="' + slot
      + '" type="file" accept="image/jpeg,image/png,image/webp" hidden>'
      + (hasPhoto ? '<button type="button" class="mini del" data-care-photo-remove="' + slot + '">'
        + '<i class="bi bi-x-lg" aria-hidden="true"></i>' + esc(t('remove')) + '</button>' : '')
      + '</div></div>';
  }

  function editorHtml(animal, app) {
    if (!state) begin(animal || {}, app);
    return '<div class="lbl2">' + esc(t('photos')) + '</div><div class="cphoto-editor" id="animalPhotoEditor">'
      + slotHtml('cover', t('cover'), state.cover, true)
      + '<div class="cphoto-extras"><div class="cphoto-group-title">' + esc(t('extras')) + '</div>'
      + '<div class="cphoto-grid">' + [0, 1, 2].map(function (index) {
        return slotHtml('extra-' + index, t('extra', { n: index + 1 }), state.extras[index], false);
      }).join('') + '</div></div>'
      + '<div class="hint cphoto-hint" id="animal_photo_msg">' + esc(state.status || t('hint')) + '</div></div>';
  }

  function refresh(root, sb) {
    var editor = root && root.querySelector ? root.querySelector('#animalPhotoEditor') : null;
    if (!editor || !state) return;
    var shell = document.createElement('div');
    shell.innerHTML = editorHtml();
    editor.replaceWith(shell.querySelector('#animalPhotoEditor'));
    w.Photo.hydrate(root, sb);
  }

  function stripHtml(animal, fallbackIcon) {
    var normalized = normalize(animal);
    var all = [].concat(normalized.photo_url ? [normalized.photo_url] : [], normalized.photos);
    if (!all.length) return '<div class="pnophoto">' + esc(fallbackIcon || '🦎') + '</div>';
    var main = '<div class="pphoto">' + w.Photo.tag(all[0], t('photoNumber', { n: 1 })) + '</div>';
    if (all.length === 1) return main;
    return main + '<div class="pthumbs">' + all.slice(1, 4).map(function (url, index) {
      return '<button type="button" class="pth" data-care-photo-view="1" aria-label="'
        + esc(t('photoNumber', { n: index + 2 })) + '">' + w.Photo.tag(url, '') + '</button>';
    }).join('') + '</div>';
  }

  function galleryHtml(animal, fallbackIcon) {
    return '<div class="phead animal-photo-gallery">' + stripHtml(animal, fallbackIcon) + '</div>';
  }

  function swap(button) {
    var main = button && button.closest ? button.closest('.phead').querySelector('.pphoto img') : null;
    var thumb = button && button.querySelector ? button.querySelector('img') : null;
    if (!main || !thumb) return false;
    var current = main.getAttribute('src');
    main.setAttribute('src', thumb.getAttribute('src'));
    thumb.setAttribute('src', current);
    return true;
  }

  async function deleteAnimalPhotos(animal, app) {
    var prior = state;
    state = { app: app };
    var normalized = normalize(animal);
    var result = await removeUrls([].concat(
      normalized.photo_url ? [normalized.photo_url] : [],
      normalized.photos
    ));
    state = prior;
    return result;
  }

  w.CarePhotos = {
    MAX_EXTRA: MAX_EXTRA,
    t: t,
    normalize: normalize,
    begin: begin,
    values: values,
    select: select,
    remove: remove,
    prepare: prepare,
    rollback: rollback,
    cancel: cancel,
    commit: commit,
    editorHtml: editorHtml,
    refresh: refresh,
    stripHtml: stripHtml,
    galleryHtml: galleryHtml,
    swap: swap,
    deleteAnimalPhotos: deleteAnimalPhotos
  };
})(window);
