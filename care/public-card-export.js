(function (global) {
  'use strict';

  function clean(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function model(data, url, i18n, lifeStage) {
    const sexKey = data.sex === 'male' ? 'sexMale' : data.sex === 'female' ? 'sexFemale' : 'sexUnknown';
    const parents = data.parents || {};
    const parentText = [
      parents.a && parents.a.name ? i18n.t('parentFather') + ' ' + clean(parents.a.name) : '',
      parents.b && parents.b.name ? i18n.t('parentMother') + ' ' + clean(parents.b.name) : ''
    ].filter(Boolean).join(' · ');
    return {
      name: clean(data.name) || i18n.t('unnamed'),
      species: i18n.speciesName(data.species),
      sex: i18n.t(sexKey),
      stage: data.life_stage ? i18n.t(lifeStage.labelKey(data.life_stage)) : '',
      hatch: data.hatch_date ? i18n.formatDate(data.hatch_date) : '',
      clutch: clean(data.clutch),
      weight: data.latest_weight ? i18n.formatNumber(data.latest_weight.grams) + 'g' : '',
      morphs: (data.morphs || []).map(clean).filter(Boolean).slice(0, 4),
      breeder: clean(data.breeder),
      parents: parentText,
      note: clean(data.note),
      photo: data.photo_url || (data.photos && data.photos[0]) || '',
      url: String(url || ''),
      eyebrow: i18n.t('publicCardEyebrow'),
      scan: i18n.t('publicCardScan'),
      scanHint: i18n.t('publicCardScanHint'),
      noMorph: i18n.t('publicCardNoMorph')
    };
  }

  function filename(name) {
    const safe = clean(name).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
      .replace(/\.+/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return 'ryang-profile-' + (safe || 'animal') + '.png';
  }

  function rounded(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fitted(ctx, value, maxWidth, startSize, weight) {
    let size = startSize;
    do {
      ctx.font = weight + ' ' + size + 'px Pretendard, sans-serif';
      if (ctx.measureText(value).width <= maxWidth) break;
      size -= 2;
    } while (size > 30);
    return size;
  }

  function shorten(ctx, value, maxWidth) {
    let text = clean(value);
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
    return text + '…';
  }

  function cover(ctx, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = (image.height - sourceHeight) / 2;
    ctx.save();
    rounded(ctx, x, y, width, height, 42);
    ctx.clip();
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    ctx.restore();
  }

  async function imageFrom(url) {
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    return new Promise(function (resolve) {
      const image = new Image();
      image.onload = function () { URL.revokeObjectURL(objectUrl); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(objectUrl); resolve(null); };
      image.src = objectUrl;
    });
  }

  function qrCode(ctx, qr, x, y, size) {
    const modules = qr.getModuleCount();
    const quiet = 4;
    const cell = Math.floor(size / (modules + quiet * 2));
    const drawn = cell * (modules + quiet * 2);
    const ox = x + Math.floor((size - drawn) / 2);
    const oy = y + Math.floor((size - drawn) / 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#071f19';
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (qr.isDark(row, col)) ctx.fillRect(ox + (col + quiet) * cell, oy + (row + quiet) * cell, cell, cell);
      }
    }
  }

  function fact(ctx, label, value, x, y, width) {
    rounded(ctx, x, y, width, 92, 22);
    ctx.fillStyle = '#ebe5d8';
    ctx.fill();
    ctx.fillStyle = '#6c756e';
    ctx.font = '700 20px Pretendard, sans-serif';
    ctx.fillText(label, x + 22, y + 30);
    ctx.fillStyle = '#123b31';
    ctx.font = '800 27px Pretendard, sans-serif';
    ctx.fillText(shorten(ctx, value, width - 44), x + 22, y + 67);
  }

  async function blob(options) {
    const doc = options.document || document;
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
    const canvas = doc.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const data = options.model;
    const labels = options.labels;
    const image = await imageFrom(options.photoUrl || data.photo);

    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#dce8da';
    ctx.beginPath(); ctx.arc(982, 72, 230, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a5c49';
    rounded(ctx, 64, 52, 62, 62, 19); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '900 34px Pretendard, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('R', 95, 96); ctx.textAlign = 'left';
    ctx.fillStyle = '#0a5c49';
    ctx.font = '850 25px Pretendard, sans-serif';
    ctx.fillText('RYANG STUDIO', 148, 79);
    ctx.fillStyle = '#6c756e';
    ctx.font = '750 18px Pretendard, sans-serif';
    ctx.fillText(data.eyebrow, 148, 106);

    if (image) cover(ctx, image, 64, 142, 952, 444);
    else {
      rounded(ctx, 64, 142, 952, 444, 42); ctx.fillStyle = '#dce8da'; ctx.fill();
      ctx.fillStyle = '#0a5c49'; ctx.font = '850 42px Pretendard, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(data.species, 540, 376); ctx.textAlign = 'left';
    }

    ctx.fillStyle = '#092f27';
    fitted(ctx, data.name, 690, 62, 900);
    ctx.fillText(shorten(ctx, data.name, 690), 64, 671);
    if (data.breeder) {
      ctx.fillStyle = '#0a745b'; ctx.font = '800 22px Pretendard, sans-serif';
      ctx.fillText(shorten(ctx, data.breeder, 690), 66, 710);
    }
    ctx.fillStyle = '#59675f'; ctx.font = '750 25px Pretendard, sans-serif';
    ctx.fillText([data.species, data.sex, data.stage].filter(Boolean).join(' · '), 64, 756);
    if (data.parents) {
      ctx.fillStyle = '#6c756e'; ctx.font = '700 21px Pretendard, sans-serif';
      ctx.fillText(shorten(ctx, data.parents, 952), 64, 794);
    }

    const morphs = data.morphs.length ? data.morphs : [data.noMorph];
    let pillX = 64;
    ctx.font = '750 21px Pretendard, sans-serif';
    morphs.slice(0, 3).forEach(function (morph) {
      const width = Math.min(270, ctx.measureText(morph).width + 44);
      rounded(ctx, pillX, 820, width, 50, 25); ctx.fillStyle = '#e1eadf'; ctx.fill();
      ctx.fillStyle = '#145344'; ctx.fillText(shorten(ctx, morph, width - 36), pillX + 20, 853);
      pillX += width + 12;
    });

    const facts = [
      [labels.hatch, data.hatch], [labels.clutch, data.clutch], [labels.weight, data.weight]
    ].filter(function (item) { return item[1]; }).slice(0, 3);
    const gap = 14;
    const factWidth = facts.length ? (952 - gap * (facts.length - 1)) / facts.length : 0;
    facts.forEach(function (item, index) { fact(ctx, item[0], item[1], 64 + index * (factWidth + gap), 892, factWidth); });

    rounded(ctx, 64, 1014, 952, 278, 38); ctx.fillStyle = '#073f33'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '850 35px Pretendard, sans-serif';
    ctx.fillText(data.scan, 104, 1094);
    ctx.fillStyle = '#c7ddd5'; ctx.font = '650 22px Pretendard, sans-serif';
    ctx.fillText(shorten(ctx, data.scanHint, 560), 104, 1139);
    ctx.fillStyle = '#8fb9aa'; ctx.font = '650 19px Pretendard, sans-serif';
    ctx.fillText(shorten(ctx, data.url.replace(/^https?:\/\//, ''), 560), 104, 1218);
    qrCode(ctx, options.qr, 754, 1035, 236);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (value) { if (value) resolve(value); else reject(new Error('CARD_BLOB_FAILED')); }, 'image/png');
    });
  }

  async function deliver(imageBlob, name, title, nav, doc) {
    const browser = nav || navigator;
    const page = doc || document;
    const file = typeof File === 'function' ? new File([imageBlob], name, { type: 'image/png' }) : null;
    if (file && browser.share && browser.canShare && browser.canShare({ files: [file] })) {
      try { await browser.share({ files: [file], title: title }); return 'shared'; }
      catch (error) { if (error && error.name === 'AbortError') return 'cancelled'; throw error; }
    }
    const href = URL.createObjectURL(imageBlob);
    const anchor = page.createElement('a');
    anchor.href = href; anchor.download = name; page.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
    return 'downloaded';
  }

  global.PublicCardExport = Object.freeze({ model: model, filename: filename, blob: blob, deliver: deliver });
}(window));
