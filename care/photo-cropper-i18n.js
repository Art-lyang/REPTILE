(function (w) {
  'use strict';

  var TEXT = {
    ko: {
      coverTitle: '프로필 사진 조정',
      title: '사진 조정',
      cancel: '취소',
      apply: '적용',
      guide: '4:3 비율로 저장됩니다.',
      profileGuide: '원 안은 프로필에 안전하게 보이는 영역입니다.',
      dragHint: '사진을 움직이고 확대해 구도를 맞춰보세요.',
      zoom: '사진 확대',
      reset: '원래대로',
      working: '사진 만드는 중…',
      loadError: '사진을 불러오지 못했습니다.',
      cropError: '사진을 자르지 못했습니다. 다시 시도해 주세요.'
    },
    en: {
      coverTitle: 'Adjust profile photo',
      title: 'Adjust photo',
      cancel: 'Cancel',
      apply: 'Apply',
      guide: 'Saved in a 4:3 ratio.',
      profileGuide: 'The circle marks the profile-safe area.',
      dragHint: 'Move and zoom the photo to set the frame.',
      zoom: 'Photo zoom',
      reset: 'Reset',
      working: 'Preparing photo…',
      loadError: 'Could not load this photo.',
      cropError: 'Could not crop this photo. Please try again.'
    },
    ja: {
      coverTitle: 'プロフィール写真を調整',
      title: '写真を調整',
      cancel: 'キャンセル',
      apply: '適用',
      guide: '4:3の比率で保存されます。',
      profileGuide: '円の内側はプロフィールに安全に表示される範囲です。',
      dragHint: '写真を動かし、拡大して構図を調整してください。',
      zoom: '写真の拡大',
      reset: '元に戻す',
      working: '写真を作成中…',
      loadError: '写真を読み込めませんでした。',
      cropError: '写真を切り抜けませんでした。もう一度お試しください。'
    },
    zh: {
      coverTitle: '调整头像照片',
      title: '调整照片',
      cancel: '取消',
      apply: '应用',
      guide: '将以 4:3 比例保存。',
      profileGuide: '圆形内为头像安全显示区域。',
      dragHint: '移动并缩放照片以调整构图。',
      zoom: '照片缩放',
      reset: '重置',
      working: '正在处理照片…',
      loadError: '无法加载这张照片。',
      cropError: '无法裁剪照片，请重试。'
    }
  };

  function language() {
    var raw = (document.documentElement.lang || 'ko').toLowerCase().split('-')[0];
    return TEXT[raw] ? raw : 'ko';
  }

  function t(key) {
    return TEXT[language()][key] || TEXT.ko[key] || key;
  }

  w.PhotoCropperI18n = { t: t };
})(window);
