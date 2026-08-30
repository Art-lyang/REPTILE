const MESSAGES = Object.freeze({
  ko: '아직 결제를 시작할 수 없습니다. 가맹점 계약과 심사가 완료된 뒤 열립니다.',
  en: 'Payments are not available yet. They will open after merchant approval.',
  zh: '暂未开放支付。商户签约和审核完成后方可使用。',
  ja: 'お支払いはまだご利用いただけません。加盟店契約と審査の完了後に公開します。',
});

export function localeFromRequest(request) {
  const value = String(request.headers.get('Accept-Language') || '').toLowerCase();
  if (value.startsWith('en')) return 'en';
  if (value.startsWith('zh')) return 'zh';
  if (value.startsWith('ja')) return 'ja';
  return 'ko';
}

export function billingUnavailableMessage(request) {
  return MESSAGES[localeFromRequest(request)];
}

