(function (w) {
  'use strict';

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function metrics(input) {
    var baseScale = Math.max(
      input.stageWidth / input.imageWidth,
      input.stageHeight / input.imageHeight
    );
    var zoom = clamp(Number(input.zoom) || 1, 1, 3);
    var scale = baseScale * zoom;
    var renderWidth = input.imageWidth * scale;
    var renderHeight = input.imageHeight * scale;
    return {
      scale: scale,
      renderWidth: renderWidth,
      renderHeight: renderHeight,
      maxX: Math.max(0, (renderWidth - input.stageWidth) / 2),
      maxY: Math.max(0, (renderHeight - input.stageHeight) / 2)
    };
  }

  function sourceRect(input) {
    var fitted = metrics(input);
    var offsetX = clamp(Number(input.offsetX) || 0, -fitted.maxX, fitted.maxX);
    var offsetY = clamp(Number(input.offsetY) || 0, -fitted.maxY, fitted.maxY);
    function rounded(value) { return Math.round(value * 1000000) / 1000000; }
    return {
      sx: rounded(((fitted.renderWidth - input.stageWidth) / 2 - offsetX) / fitted.scale),
      sy: rounded(((fitted.renderHeight - input.stageHeight) / 2 - offsetY) / fitted.scale),
      sw: rounded(input.stageWidth / fitted.scale),
      sh: rounded(input.stageHeight / fitted.scale)
    };
  }

  w.PhotoCropperGeometry = {
    clamp: clamp,
    metrics: metrics,
    sourceRect: sourceRect
  };
})(window);
