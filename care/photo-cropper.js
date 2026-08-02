(function (w) {
  'use strict';

  var geometry = w.PhotoCropperGeometry;
  var clamp = geometry.clamp;
  var metrics = geometry.metrics;
  var sourceRect = geometry.sourceRect;
  var t = w.PhotoCropperI18n.t;
  var activeCancel = null;

  function open(file, options) {
    options = options || {};
    if (activeCancel) activeCancel();
    return new Promise(function (resolve, reject) {
      var profile = Boolean(options.profile);
      var priorFocus = document.activeElement;
      var objectUrl = URL.createObjectURL(file);
      var modal = document.createElement('div');
      modal.className = 'pcrop-modal' + (profile ? ' pcrop-profile' : '');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'pcropTitle');
      modal.innerHTML = '<div class="pcrop-shell">'
        + '<div class="pcrop-head"><button type="button" class="pcrop-icon" data-pcrop-cancel aria-label="' + t('cancel') + '">'
        + '<i class="bi bi-x-lg" aria-hidden="true"></i></button><h2 id="pcropTitle">'
        + (profile ? t('coverTitle') : t('title')) + '</h2>'
        + '<button type="button" class="pcrop-icon apply" data-pcrop-apply aria-label="' + t('apply') + '">'
        + '<i class="bi bi-check-lg" aria-hidden="true"></i></button></div>'
        + '<div class="pcrop-work"><div class="pcrop-stage" data-pcrop-stage>'
        + '<img class="pcrop-image" data-pcrop-image alt="" draggable="false">'
        + '<div class="pcrop-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'
        + (profile ? '<div class="pcrop-safe" aria-hidden="true"></div>' : '')
        + '</div><div class="pcrop-copy"><strong>' + t('guide') + '</strong><span>'
        + (profile ? t('profileGuide') : t('dragHint')) + '</span></div></div>'
        + '<div class="pcrop-controls"><label for="pcropZoom">' + t('zoom') + '</label>'
        + '<div class="pcrop-zoom"><i class="bi bi-image" aria-hidden="true"></i>'
        + '<input id="pcropZoom" data-pcrop-zoom type="range" min="1" max="3" step="0.01" value="1">'
        + '<i class="bi bi-zoom-in" aria-hidden="true"></i></div>'
        + '<button type="button" class="pcrop-reset" data-pcrop-reset><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>'
        + t('reset') + '</button><div class="pcrop-status" data-pcrop-status role="status" aria-live="polite"></div></div>'
        + '</div>';
      document.body.appendChild(modal);
      document.body.classList.add('cropper-open');

      var stage = modal.querySelector('[data-pcrop-stage]');
      var image = modal.querySelector('[data-pcrop-image]');
      var slider = modal.querySelector('[data-pcrop-zoom]');
      var applyButton = modal.querySelector('[data-pcrop-apply]');
      var status = modal.querySelector('[data-pcrop-status]');
      var state = { zoom: 1, offsetX: 0, offsetY: 0 };
      var pointers = new Map();
      var gesture = null;
      var closed = false;

      function fitted() {
        var box = stage.getBoundingClientRect();
        return metrics({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          stageWidth: box.width,
          stageHeight: box.height,
          zoom: state.zoom
        });
      }

      function render() {
        if (!image.naturalWidth) return;
        var size = fitted();
        state.offsetX = clamp(state.offsetX, -size.maxX, size.maxX);
        state.offsetY = clamp(state.offsetY, -size.maxY, size.maxY);
        image.style.width = size.renderWidth + 'px';
        image.style.height = size.renderHeight + 'px';
        image.style.transform = 'translate(-50%,-50%) translate('
          + state.offsetX + 'px,' + state.offsetY + 'px)';
        slider.value = String(state.zoom);
      }

      function seedGesture() {
        var points = Array.from(pointers.values());
        if (points.length === 1) {
          gesture = { kind: 'drag', x: points[0].x, y: points[0].y, ox: state.offsetX, oy: state.offsetY };
        } else if (points.length >= 2) {
          var dx = points[1].x - points[0].x;
          var dy = points[1].y - points[0].y;
          gesture = {
            kind: 'pinch',
            distance: Math.max(1, Math.hypot(dx, dy)),
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2,
            zoom: state.zoom,
            ox: state.offsetX,
            oy: state.offsetY
          };
        } else gesture = null;
      }

      function close(value, error) {
        if (closed) return;
        closed = true;
        activeCancel = null;
        URL.revokeObjectURL(objectUrl);
        document.body.classList.remove('cropper-open');
        w.removeEventListener('keydown', onKeydown);
        w.removeEventListener('resize', render);
        if (w.visualViewport) w.visualViewport.removeEventListener('resize', render);
        modal.remove();
        if (priorFocus && priorFocus.focus) priorFocus.focus();
        if (error) reject(error);
        else resolve(value);
      }

      function onKeydown(event) {
        if (event.key === 'Escape') close(null);
        if (event.key !== 'Tab') return;
        var focusable = Array.from(modal.querySelectorAll('button,input'));
        var index = focusable.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!event.shiftKey && index === focusable.length - 1) {
          event.preventDefault();
          focusable[0].focus();
        }
      }

      stage.addEventListener('pointerdown', function (event) {
        stage.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        seedGesture();
      });
      stage.addEventListener('pointermove', function (event) {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        var points = Array.from(pointers.values());
        if (points.length === 1 && gesture && gesture.kind === 'drag') {
          state.offsetX = gesture.ox + points[0].x - gesture.x;
          state.offsetY = gesture.oy + points[0].y - gesture.y;
        } else if (points.length >= 2 && gesture && gesture.kind === 'pinch') {
          var dx = points[1].x - points[0].x;
          var dy = points[1].y - points[0].y;
          var centerX = (points[0].x + points[1].x) / 2;
          var centerY = (points[0].y + points[1].y) / 2;
          state.zoom = clamp(gesture.zoom * Math.hypot(dx, dy) / gesture.distance, 1, 3);
          state.offsetX = gesture.ox + centerX - gesture.x;
          state.offsetY = gesture.oy + centerY - gesture.y;
        }
        render();
      });
      function releasePointer(event) {
        pointers.delete(event.pointerId);
        seedGesture();
      }
      stage.addEventListener('pointerup', releasePointer);
      stage.addEventListener('pointercancel', releasePointer);
      slider.addEventListener('input', function () {
        state.zoom = Number(slider.value);
        render();
      });
      modal.querySelector('[data-pcrop-reset]').addEventListener('click', function () {
        state.zoom = 1;
        state.offsetX = 0;
        state.offsetY = 0;
        render();
      });
      modal.querySelector('[data-pcrop-cancel]').addEventListener('click', function () { close(null); });
      applyButton.addEventListener('click', function () {
        var box = stage.getBoundingClientRect();
        var crop = sourceRect({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          stageWidth: box.width,
          stageHeight: box.height,
          zoom: state.zoom,
          offsetX: state.offsetX,
          offsetY: state.offsetY
        });
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.min(1200, Math.round(crop.sw)));
        canvas.height = Math.max(1, Math.round(canvas.width * 3 / 4));
        canvas.getContext('2d').drawImage(
          image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height
        );
        applyButton.disabled = true;
        status.textContent = t('working');
        canvas.toBlob(function (blob) {
          if (!blob) return close(null, new Error(t('cropError')));
          var name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '-crop.jpg';
          close(typeof w.File === 'function'
            ? new w.File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
            : blob);
        }, 'image/jpeg', 0.92);
      });

      image.addEventListener('load', function () {
        stage.classList.add('ready');
        render();
        modal.querySelector('[data-pcrop-cancel]').focus();
      });
      image.addEventListener('error', function () { close(null, new Error(t('loadError'))); });
      image.src = objectUrl;
      w.addEventListener('keydown', onKeydown);
      w.addEventListener('resize', render);
      if (w.visualViewport) w.visualViewport.addEventListener('resize', render);
      activeCancel = function () { close(null); };
    });
  }

  w.PhotoCropper = {
    open: open,
    t: t,
    geometry: geometry
  };
})(window);
