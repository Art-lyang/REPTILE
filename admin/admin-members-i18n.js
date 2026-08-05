(function () {
  'use strict';

  const SUPPORTED = ['ko', 'en', 'zh', 'ja'];
  const COPY = {
    ko: {
      title: '회원 관리', description: '회원 상태와 이용 권한을 관리합니다. 모든 변경 사유는 기록됩니다.',
      language: '언어', all: '전체', active: '정상', restricted: '이용 제한', general: '일반', premium: '프리미엄',
      admins: '관리자', members: '전체 회원', search: '이메일·이름·닉네임·연락처 검색', status: '상태', tier: '권한',
      refresh: '새로고침', export: 'CSV 내보내기', loading: '회원 정보를 불러오는 중…', empty: '조건에 맞는 회원이 없습니다.',
      joined: '가입', lastLogin: '최근 로그인', verified: '이메일 인증', notVerified: '미인증', noLogin: '기록 없음',
      marketing: '마케팅', email: '이메일', sms: '문자', thirdParty: '제3자 제공', contact: '연락처', providers: '로그인 수단',
      manage: '관리', protectAdmin: '관리자 탭에서 권한을 관리하세요.', protectSelf: '현재 로그인한 최고관리자 계정입니다.',
      grantPremium: '프리미엄 부여', makeGeneral: '일반으로 변경', restrict: '이용 제한', restore: '제한 해제', delete: '회원 탈퇴 처리',
      actionTitle: '회원 상태 변경', target: '대상', reason: '변경 사유', reasonHint: '신고 내용, 요청 경위 등 2자 이상 입력',
      deleteConfirm: '탈퇴 처리 확인', deleteHint: '되돌릴 수 없습니다. 아래에 회원 이메일을 정확히 입력하세요.',
      cancel: '취소', apply: '적용', processing: '처리 중…', done: '처리했습니다.', loadError: '회원 정보를 불러오지 못했습니다.',
      actionError: '회원 상태를 변경하지 못했습니다.', sessionExpired: '관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.',
      premiumUntil: '프리미엄 만료', unlimited: '무기한', source: '부여 경로', adminSourceNote: '일반으로 변경하면 관리자 수동 부여분만 해제됩니다.',
      premiumGrantType: '부여 유형', trialGrant: '체험판', timedGrant: '기간제 프리미엄', permanentGrant: '무기한 프리미엄',
      durationDays: '이용 기간(일)', durationRange: '1~3650일 사이로 입력해 주세요.', expectedExpiry: '예상 만료',
      sourceAdminTrial: '관리자 · 체험판', sourceAdminTimed: '관리자 · 기간제', sourceAdminPermanent: '관리자 · 무기한',
      sourceAdminLegacy: '관리자 · 기존 수동 부여', sourcePayment: '결제', sourceSubscription: '구독', sourcePremiumCode: '프리미엄 코드',
      statusAll: '모든 상태', tierAll: '모든 권한', consent: '수신 동의', protected: '보호됨', unknown: '-',
    },
    en: {
      title: 'Member management', description: 'Manage member status and access. A reason is recorded for every change.',
      language: 'Language', all: 'All', active: 'Active', restricted: 'Restricted', general: 'General', premium: 'Premium',
      admins: 'Admins', members: 'Members', search: 'Search email, name, nickname, or phone', status: 'Status', tier: 'Access',
      refresh: 'Refresh', export: 'Export CSV', loading: 'Loading members…', empty: 'No members match these filters.',
      joined: 'Joined', lastLogin: 'Last sign-in', verified: 'Email verified', notVerified: 'Not verified', noLogin: 'No record',
      marketing: 'Marketing', email: 'Email', sms: 'SMS', thirdParty: 'Third party', contact: 'Contact', providers: 'Sign-in methods',
      manage: 'Manage', protectAdmin: 'Manage this account from the Admins tab.', protectSelf: 'This is the owner account currently signed in.',
      grantPremium: 'Grant premium', makeGeneral: 'Change to general', restrict: 'Restrict access', restore: 'Restore access', delete: 'Process withdrawal',
      actionTitle: 'Change member status', target: 'Member', reason: 'Reason', reasonHint: 'Enter at least 2 characters, such as a report or request.',
      deleteConfirm: 'Confirm withdrawal', deleteHint: "This cannot be undone. Enter the member's exact email below.",
      cancel: 'Cancel', apply: 'Apply', processing: 'Processing…', done: 'Completed.', loadError: 'Could not load members.',
      actionError: 'Could not update the member.', sessionExpired: 'Your administrator session expired. Sign in again.',
      premiumUntil: 'Premium until', unlimited: 'Unlimited', source: 'Source', adminSourceNote: 'Changing to general removes only the manual admin grant.',
      premiumGrantType: 'Grant type', trialGrant: 'Trial', timedGrant: 'Timed premium', permanentGrant: 'Permanent premium',
      durationDays: 'Duration (days)', durationRange: 'Enter a value from 1 to 3650 days.', expectedExpiry: 'Expected expiry',
      sourceAdminTrial: 'Admin · Trial', sourceAdminTimed: 'Admin · Timed', sourceAdminPermanent: 'Admin · Permanent',
      sourceAdminLegacy: 'Admin · Legacy manual grant', sourcePayment: 'Payment', sourceSubscription: 'Subscription', sourcePremiumCode: 'Premium code',
      statusAll: 'All statuses', tierAll: 'All access', consent: 'Consent', protected: 'Protected', unknown: '-',
    },
    zh: {
      title: '会员管理', description: '管理会员状态与使用权限。每次变更都会记录原因。',
      language: '语言', all: '全部', active: '正常', restricted: '限制使用', general: '普通', premium: '高级',
      admins: '管理员', members: '全部会员', search: '搜索邮箱、姓名、昵称或联系方式', status: '状态', tier: '权限',
      refresh: '刷新', export: '导出 CSV', loading: '正在加载会员信息…', empty: '没有符合条件的会员。',
      joined: '注册', lastLogin: '最近登录', verified: '邮箱已验证', notVerified: '未验证', noLogin: '无记录',
      marketing: '营销', email: '邮箱', sms: '短信', thirdParty: '第三方提供', contact: '联系方式', providers: '登录方式',
      manage: '管理', protectAdmin: '请在管理员标签中管理此账户。', protectSelf: '这是当前登录的最高管理员账户。',
      grantPremium: '授予高级权限', makeGeneral: '改为普通', restrict: '限制使用', restore: '解除限制', delete: '办理注销',
      actionTitle: '更改会员状态', target: '对象', reason: '变更原因', reasonHint: '请输入至少 2 个字符，例如举报内容或申请原因。',
      deleteConfirm: '确认注销', deleteHint: '此操作无法撤销。请在下方准确输入会员邮箱。',
      cancel: '取消', apply: '应用', processing: '处理中…', done: '处理完成。', loadError: '无法加载会员信息。',
      actionError: '无法更改会员状态。', sessionExpired: '管理员登录已过期，请重新登录。',
      premiumUntil: '高级权限到期', unlimited: '无限期', source: '授予方式', adminSourceNote: '改为普通只会撤销管理员手动授予的权限。',
      premiumGrantType: '授予类型', trialGrant: '试用', timedGrant: '限时高级权限', permanentGrant: '永久高级权限',
      durationDays: '使用期限（天）', durationRange: '请输入 1 至 3650 天。', expectedExpiry: '预计到期',
      sourceAdminTrial: '管理员 · 试用', sourceAdminTimed: '管理员 · 限时', sourceAdminPermanent: '管理员 · 永久',
      sourceAdminLegacy: '管理员 · 旧版手动授予', sourcePayment: '付款', sourceSubscription: '订阅', sourcePremiumCode: '高级代码',
      statusAll: '所有状态', tierAll: '所有权限', consent: '接收同意', protected: '受保护', unknown: '-',
    },
    ja: {
      title: '会員管理', description: '会員状態と利用権限を管理します。すべての変更理由が記録されます。',
      language: '言語', all: 'すべて', active: '正常', restricted: '利用制限', general: '一般', premium: 'プレミアム',
      admins: '管理者', members: '全会員', search: 'メール・氏名・ニックネーム・連絡先を検索', status: '状態', tier: '権限',
      refresh: '再読み込み', export: 'CSV出力', loading: '会員情報を読み込んでいます…', empty: '条件に合う会員はいません。',
      joined: '登録', lastLogin: '最終ログイン', verified: 'メール認証済み', notVerified: '未認証', noLogin: '記録なし',
      marketing: 'マーケティング', email: 'メール', sms: 'SMS', thirdParty: '第三者提供', contact: '連絡先', providers: 'ログイン方法',
      manage: '管理', protectAdmin: '管理者タブでこのアカウントを管理してください。', protectSelf: '現在ログイン中の最高管理者アカウントです。',
      grantPremium: 'プレミアム付与', makeGeneral: '一般に変更', restrict: '利用制限', restore: '制限解除', delete: '退会処理',
      actionTitle: '会員状態の変更', target: '対象', reason: '変更理由', reasonHint: '通報内容や申請経緯などを2文字以上入力してください。',
      deleteConfirm: '退会処理の確認', deleteHint: '元に戻せません。下に会員のメールアドレスを正確に入力してください。',
      cancel: 'キャンセル', apply: '適用', processing: '処理中…', done: '処理しました。', loadError: '会員情報を読み込めませんでした。',
      actionError: '会員状態を変更できませんでした。', sessionExpired: '管理者ログインの有効期限が切れました。再ログインしてください。',
      premiumUntil: 'プレミアム期限', unlimited: '無期限', source: '付与経路', adminSourceNote: '一般に変更すると管理者が手動付与した分だけ解除されます。',
      premiumGrantType: '付与タイプ', trialGrant: '体験版', timedGrant: '期間限定プレミアム', permanentGrant: '無期限プレミアム',
      durationDays: '利用期間（日）', durationRange: '1～3650日の範囲で入力してください。', expectedExpiry: '予定期限',
      sourceAdminTrial: '管理者 · 体験版', sourceAdminTimed: '管理者 · 期間限定', sourceAdminPermanent: '管理者 · 無期限',
      sourceAdminLegacy: '管理者 · 旧手動付与', sourcePayment: '決済', sourceSubscription: '購読', sourcePremiumCode: 'プレミアムコード',
      statusAll: 'すべての状態', tierAll: 'すべての権限', consent: '受信同意', protected: '保護対象', unknown: '-',
    },
  };

  function assertDictionaryParity() {
    const keys = Object.keys(COPY.ko).sort().join('|');
    SUPPORTED.forEach(locale => {
      if (Object.keys(COPY[locale]).sort().join('|') !== keys) throw new Error(`ADMIN_MEMBER_I18N_${locale}`);
    });
  }

  assertDictionaryParity();
  window.AdminMemberI18n = { SUPPORTED, COPY, assertDictionaryParity };
}());
