(function (global) {
  'use strict';

  const Exporter = global.PublicCardExport;
  const I = global.CareI18n;
  const A = global.CareApp;
  const LifeStage = global.AnimalLifeStage;

  function icon(name) {
    return '<i class="bi ' + name + '" aria-hidden="true"></i>';
  }

  function toast(message) {
    const element = document.getElementById('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { element.classList.remove('on'); }, 2400);
  }

  function attach() {
    const qr = document.querySelector('#sh_qr .qrbox img');
    const url = document.getElementById('sh_url');
    if (!qr || !url || document.getElementById('sh_export_card')) return;
    const panel = document.createElement('div');
    panel.className = 'share-export';
    panel.innerHTML = '<div class="share-export-mark">' + icon('bi-image') + '</div>'
      + '<div class="share-export-copy"><strong>' + I.t('publicCardExportTitle') + '</strong>'
      + '<span>' + I.t('publicCardExportHint') + '</span></div>'
      + '<button class="btn wide" id="sh_export_card">' + icon('bi-download')
      + I.t('publicCardExportButton') + '</button>';
    document.getElementById('sh_qr').insertAdjacentElement('afterend', panel);
  }

  async function exportCard(button) {
    const shareUrl = document.getElementById('sh_url').value;
    const token = new URL(shareUrl).searchParams.get('t');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = icon('bi-hourglass-split') + I.t('publicCardExportWorking');
    try {
      const response = await A.sb.rpc('public_animal', { p_token: token });
      if (response.error || !response.data) throw response.error || new Error('PUBLIC_CARD_UNAVAILABLE');
      const data = response.data;
      const photo = await global.Photo.sign(A.sb, data.photo_url || (data.photos && data.photos[0]));
      const qr = global.qrcode(0, 'H');
      qr.addData(shareUrl);
      qr.make();
      const cardModel = Exporter.model(data, shareUrl, I, LifeStage);
      const image = await Exporter.blob({
        model: cardModel,
        photoUrl: photo,
        qr: qr,
        labels: {
          hatch: I.t('hatchFact'), clutch: I.t('clutchFact'),
          weight: I.t('latestWeightFact'), age: I.t('ageFact')
        }
      });
      const result = await Exporter.deliver(image, Exporter.filename(cardModel.name), cardModel.name, navigator, document);
      if (result === 'shared') toast(I.t('publicCardExportShared'));
      if (result === 'downloaded') toast(I.t('publicCardExportDone'));
    } catch (error) {
      toast(I.t('publicCardExportFailed'));
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = icon('bi-download') + I.t('publicCardExportButton');
    }
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('#sh_export_card');
    if (button) exportCard(button);
  });

  new MutationObserver(attach).observe(document.getElementById('body'), { childList: true, subtree: true });
  attach();
}(window));
