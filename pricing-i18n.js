/* 요금 안내 페이지의 문구.
   ---------------------------------------------------------------------------
   이 페이지는 다른 화면과 달리 스크립트가 하나도 없었습니다. 사전을 언어별
   파일로 쪼개면 요청이 다섯 개로 늘어나는데, 이 페이지 하나 때문에 그럴 것은
   없어서 한 파일에 담았습니다.

   적용 방식은 케어·로그인 화면과 같습니다.
     data-pt="키"  → textContent  (글자만)
     data-ph="키"  → innerHTML    (<b>·<br> 이 든 문장)
   innerHTML 로 넣는 것은 우리가 쓴 문구뿐입니다. 사용자 입력은 여기 오지
   않습니다 — 온다면 반드시 data-pt 로 넣어야 합니다.

   ✓ 와 — 는 번역하지 않습니다. 어느 언어에서나 같은 뜻으로 읽힙니다. */
(function (w) {
  'use strict';

  var L = {};

  L.ko = {
    htmlLang: 'ko', ogLocale: 'ko_KR',
    pageTitle: '요금 안내 · RYANG STUDIO',
    metaDesc: '크리처 케어로그의 무료 이용 범위와 프리미엄 기능을 비교해 안내합니다. 개체 등록 수, 브리딩 관리, 공개 프로필 등 차이를 확인하세요.',
    ogDesc: '무료로 어디까지 쓸 수 있고, 프리미엄에서 무엇이 열리는지 정리했습니다.',
    back: '← 스튜디오', h1: '요금 안내',
    sub: '크리처 케어로그를 무료로 어디까지 쓸 수 있고,<br>프리미엄에서 무엇이 열리는지 정리했습니다.',
    language: '언어',

    noticeTitle: '프리미엄 결제는 아직 준비 중입니다.',
    noticeBody: '가맹점 계약과 심사가 끝난 뒤에 열립니다. 그때까지는 발급받은 <b>프리미엄 코드</b>로 이용하실 수 있고, 요금은 확정되는 대로 이 페이지에 올립니다.',

    freeName: '무료', freeTag: '지금 이용 가능', freePrice: '0원',
    freeWho: '반려 개체를 기록하는 분께 필요한 만큼',
    f1: '개체 <b>10마리</b>까지 등록', f2: '급여·청소·영양제 주기 관리',
    f3: '체중 기록과 그래프', f4: '건강 관찰 기록', f5: '케어 신호 알림',
    f6: '모프 계산기 4종 전부', fNo1: '브리딩 관리', fNo2: '공개 브리더 프로필',
    freeCta: '케어로그 시작하기',

    proName: '프리미엄', proTag: '준비 중', proPrice: '준비 중', proPriceSub: '요금 확정 후 공개',
    proWho: '여러 개체를 번식까지 관리하는 분께',
    p1: '개체 <b>50마리</b>까지 등록', p2: '무료의 모든 기능',
    p3: '<b>브리딩 관리</b> — 페어링·클러치·해칭', p4: '<b>라인브리딩 플래너</b>',
    p5: '<b>공개 브리더 프로필</b>', p6: '<b>개체 카드 내보내기</b> — 분양용',
    p7: '캘린더 내보내기', proCta: '프리미엄 코드 입력',

    cmpTitle: '기능 비교', thFeature: '기능', thFree: '무료', thPro: '프리미엄',
    r1: '개체 등록', r1free: '10마리', r1pro: '50마리',
    r2: '급여·청소·영양제 주기', r3: '체중 기록·그래프', r4: '건강 관찰 기록',
    r5: '케어 신호 알림', r6: '사진 등록',
    r7: '모프 계산기 (레오·크레·펫테일·볼파이톤)',
    r8: '브리딩 관리 (페어링·클러치·해칭)', r9: '메이팅 그룹',
    r10: '라인브리딩 플래너', r11: '공개 브리더 프로필',
    r12: '개체 카드 내보내기', r13: '캘린더 내보내기',

    emQ: '<b>결제를 멈추면 기록은 어떻게 되나요?</b>',
    emA1: '기록은 <b>지우지 않습니다.</b> 다만 무료 범위(10마리)를 넘는 개체는 잠깁니다. 잠긴 개체는 <b>보기와 삭제만</b> 되고, 수정과 계획 지정은 막히며 알림도 멈춥니다.',
    emA2: '어떤 10마리를 계속 쓸지는 <b>직접 고르실 수 있습니다.</b> 처음 등록한 순서가 기본이지만, 개체 목록에서 <b>활성으로</b> 를 눌러 바꾸면 됩니다.',

    faqTitle: '자주 묻는 것',
    q1: '모프 계산기도 돈을 내야 하나요?',
    a1: '아니요. 레오파드 게코·크레스티드 게코·펫테일 게코·볼파이톤 계산기는 로그인 없이 누구나 무료로 쓸 수 있고, 앞으로도 그럴 계획입니다.',
    q2: '프리미엄 코드는 어떻게 받나요?',
    a2: '지금은 테스트 기간이라 개별로 발급하고 있습니다. <a href="mailto:kmc612000@gmail.com">문의</a>로 연락 주시면 안내드립니다.',
    q3: '50마리보다 많이 키우는데요.',
    a3: '우선 50마리로 두었습니다. 더 필요하신 분이 계시면 별도로 안내드릴 예정이니 <a href="mailto:kmc612000@gmail.com">문의</a>로 알려주세요.',
    q4: '탈퇴하면 기록은 어떻게 되나요?',
    a4: '탈퇴하시면 기록도 함께 지워집니다. 남은 이용 기간은 환불되지 않고 사용한 코드는 다시 쓸 수 없으니, 잠시 쉬시는 경우에는 로그아웃을 권합니다. 자세한 내용은 <a href="/terms.html#terms">이용약관</a>에 있습니다.',

    footTerms: '이용약관', footPrivacy: '개인정보처리방침', footContact: '문의하기',
  };

  L.en = {
    htmlLang: 'en', ogLocale: 'en_US',
    pageTitle: 'Plans · RYANG STUDIO',
    metaDesc: 'Compare what the Creature Care Log gives you for free with what premium adds — animal limit, breeding management, public breeder profile, and more.',
    ogDesc: 'What you get for free, and what premium opens up.',
    back: '← Studio', h1: 'Plans',
    sub: 'How far the Creature Care Log goes for free,<br>and what premium adds.',
    language: 'Language',

    noticeTitle: 'Premium checkout is not open yet.',
    noticeBody: 'It opens once the merchant agreement and review are complete. Until then you can use an issued <b>premium code</b>, and the price will be posted here as soon as it is set.',

    freeName: 'Free', freeTag: 'Available now', freePrice: '$0',
    freeWho: 'Enough for keeping records of your own animals',
    f1: 'Up to <b>10 animals</b>', f2: 'Feeding, cleaning, supplement schedules',
    f3: 'Weight records and charts', f4: 'Health observation notes', f5: 'Care reminders',
    f6: 'All four morph calculators', fNo1: 'Breeding management', fNo2: 'Public breeder profile',
    freeCta: 'Start the Care Log',

    proName: 'Premium', proTag: 'Coming soon', proPrice: 'Coming soon', proPriceSub: 'Posted once the price is set',
    proWho: 'For keeping many animals through to breeding',
    p1: 'Up to <b>50 animals</b>', p2: 'Everything in Free',
    p3: '<b>Breeding management</b> — pairings, clutches, hatching', p4: '<b>Line-breeding planner</b>',
    p5: '<b>Public breeder profile</b>', p6: '<b>Animal card export</b> — for rehoming',
    p7: 'Calendar export', proCta: 'Enter a premium code',

    cmpTitle: 'Feature comparison', thFeature: 'Feature', thFree: 'Free', thPro: 'Premium',
    r1: 'Animals', r1free: '10', r1pro: '50',
    r2: 'Feeding, cleaning, supplement schedules', r3: 'Weight records and charts',
    r4: 'Health observation notes', r5: 'Care reminders', r6: 'Photos',
    r7: 'Morph calculators (Leopard, Crested, Fat-Tailed, Ball Python)',
    r8: 'Breeding management (pairings, clutches, hatching)', r9: 'Mating groups',
    r10: 'Line-breeding planner', r11: 'Public breeder profile',
    r12: 'Animal card export', r13: 'Calendar export',

    emQ: '<b>What happens to my records if I stop paying?</b>',
    emA1: 'Your records are <b>not deleted.</b> Animals beyond the free limit (10) are locked instead. A locked animal can only be <b>viewed and deleted</b> — editing and scheduling are blocked, and its reminders stop.',
    emA2: 'You <b>choose which 10</b> stay active. Registration order is the default, but you can change it from the animal list with <b>Make active</b>.',

    faqTitle: 'Common questions',
    q1: 'Do I have to pay for the morph calculators?',
    a1: 'No. The Leopard Gecko, Crested Gecko, African Fat-Tailed Gecko, and Ball Python calculators are free for anyone without an account, and we plan to keep them that way.',
    q2: 'How do I get a premium code?',
    a2: 'We issue them individually during the test period. <a href="mailto:kmc612000@gmail.com">Contact us</a> and we will walk you through it.',
    q3: 'I keep more than 50 animals.',
    a3: 'We set the limit at 50 for now. If you need more, get in touch through <a href="mailto:kmc612000@gmail.com">contact</a> and we will arrange it.',
    q4: 'What happens to my records if I delete my account?',
    a4: 'Deleting the account deletes the records with it. Remaining time is not refunded and a used code cannot be reused, so if you are only taking a break we recommend logging out instead. Details are in the <a href="/terms.html#terms">Terms of Service</a>.',

    footTerms: 'Terms of Service', footPrivacy: 'Privacy Policy', footContact: 'Contact',
  };

  L.ja = {
    htmlLang: 'ja', ogLocale: 'ja_JP',
    pageTitle: '料金案内 · RYANG STUDIO',
    metaDesc: 'クリーチャー・ケアログの無料範囲とプレミアム機能を比較してご案内します。個体登録数、ブリーディング管理、公開プロフィールなどの違いをご確認ください。',
    ogDesc: '無料でどこまで使えて、プレミアムで何が開くのかをまとめました。',
    back: '← スタジオ', h1: '料金案内',
    sub: 'クリーチャー・ケアログを無料でどこまで使えるか、<br>プレミアムで何が開くのかをまとめました。',
    language: '言語',

    noticeTitle: 'プレミアムの決済はまだ準備中です。',
    noticeBody: '加盟店契約と審査が終わってから開きます。それまでは発行された<b>プレミアムコード</b>でご利用いただけます。料金は決まり次第このページに掲載します。',

    freeName: '無料', freeTag: '今すぐ利用可', freePrice: '0円',
    freeWho: '飼っている個体を記録する方に必要なだけ',
    f1: '個体 <b>10匹</b>まで登録', f2: '給餌・清掃・サプリの周期管理',
    f3: '体重記録とグラフ', f4: '健康観察の記録', f5: 'ケア通知',
    f6: 'モーフ計算機 4種すべて', fNo1: 'ブリーディング管理', fNo2: '公開ブリーダープロフィール',
    freeCta: 'ケアログを始める',

    proName: 'プレミアム', proTag: '準備中', proPrice: '準備中', proPriceSub: '料金確定後に公開',
    proWho: '複数の個体を繁殖まで管理する方に',
    p1: '個体 <b>50匹</b>まで登録', p2: '無料のすべての機能',
    p3: '<b>ブリーディング管理</b> — ペアリング・クラッチ・ハッチング', p4: '<b>ラインブリーディング・プランナー</b>',
    p5: '<b>公開ブリーダープロフィール</b>', p6: '<b>個体カード書き出し</b> — 譲渡用',
    p7: 'カレンダー書き出し', proCta: 'プレミアムコードを入力',

    cmpTitle: '機能比較', thFeature: '機能', thFree: '無料', thPro: 'プレミアム',
    r1: '個体登録', r1free: '10匹', r1pro: '50匹',
    r2: '給餌・清掃・サプリの周期', r3: '体重記録・グラフ', r4: '健康観察の記録',
    r5: 'ケア通知', r6: '写真登録',
    r7: 'モーフ計算機（ヒョウモン・クレス・ニシアフ・ボールパイソン）',
    r8: 'ブリーディング管理（ペアリング・クラッチ・ハッチング）', r9: 'メイティンググループ',
    r10: 'ラインブリーディング・プランナー', r11: '公開ブリーダープロフィール',
    r12: '個体カード書き出し', r13: 'カレンダー書き出し',

    emQ: '<b>支払いをやめると記録はどうなりますか？</b>',
    emA1: '記録は<b>消しません。</b>ただし無料の範囲（10匹）を超える個体はロックされます。ロックされた個体は<b>閲覧と削除のみ</b>可能で、編集と計画の指定はできず、通知も止まります。',
    emA2: 'どの10匹を使い続けるかは<b>ご自身で選べます。</b>登録した順が既定ですが、個体一覧で<b>有効にする</b>を押して変更できます。',

    faqTitle: 'よくある質問',
    q1: 'モーフ計算機も有料ですか？',
    a1: 'いいえ。ヒョウモントカゲモドキ・クレステッドゲッコー・ニシアフリカトカゲモドキ・ボールパイソンの計算機はログインなしで誰でも無料で使え、今後もそのままの予定です。',
    q2: 'プレミアムコードはどうすればもらえますか？',
    a2: '現在はテスト期間のため個別に発行しています。<a href="mailto:kmc612000@gmail.com">お問い合わせ</a>からご連絡ください。',
    q3: '50匹より多く飼っています。',
    a3: 'まずは50匹としています。それ以上必要な方には別途ご案内しますので、<a href="mailto:kmc612000@gmail.com">お問い合わせ</a>からお知らせください。',
    q4: '退会すると記録はどうなりますか？',
    a4: '退会すると記録も一緒に消えます。残りの利用期間は返金されず、使用済みのコードは再利用できませんので、しばらく休むだけならログアウトをおすすめします。詳しくは<a href="/terms.html#terms">利用規約</a>をご覧ください。',

    footTerms: '利用規約', footPrivacy: 'プライバシーポリシー', footContact: 'お問い合わせ',
  };

  L.zh = {
    htmlLang: 'zh', ogLocale: 'zh_CN',
    pageTitle: '价格说明 · RYANG STUDIO',
    metaDesc: '对比生物照护日志的免费范围与高级功能，包括个体登记数量、繁育管理、公开繁育者主页等差异。',
    ogDesc: '免费能用到哪里，高级版又能开启什么。',
    back: '← 工作室', h1: '价格说明',
    sub: '生物照护日志免费能用到哪里，<br>以及高级版会开启什么。',
    language: '语言',

    noticeTitle: '高级版支付尚未开放。',
    noticeBody: '需在商户签约与审核完成后开放。在此之前可使用已发放的<b>高级代码</b>，价格确定后会在本页公布。',

    freeName: '免费', freeTag: '现在可用', freePrice: '0 元',
    freeWho: '记录自家个体所需的功能都在这里',
    f1: '登记最多 <b>10 只</b>个体', f2: '喂食·清洁·营养剂周期管理',
    f3: '体重记录与图表', f4: '健康观察记录', f5: '照护提醒',
    f6: '四种形态计算器全部', fNo1: '繁育管理', fNo2: '公开繁育者主页',
    freeCta: '开始使用照护日志',

    proName: '高级版', proTag: '筹备中', proPrice: '筹备中', proPriceSub: '价格确定后公布',
    proWho: '适合管理多只个体直至繁育',
    p1: '登记最多 <b>50 只</b>个体', p2: '免费版全部功能',
    p3: '<b>繁育管理</b> — 配对·窝次·孵化', p4: '<b>系族繁育规划器</b>',
    p5: '<b>公开繁育者主页</b>', p6: '<b>个体卡片导出</b> — 用于转让',
    p7: '日历导出', proCta: '输入高级代码',

    cmpTitle: '功能对比', thFeature: '功能', thFree: '免费', thPro: '高级版',
    r1: '个体登记', r1free: '10 只', r1pro: '50 只',
    r2: '喂食·清洁·营养剂周期', r3: '体重记录·图表', r4: '健康观察记录',
    r5: '照护提醒', r6: '照片上传',
    r7: '形态计算器（豹纹·睫角·肥尾·球蟒）',
    r8: '繁育管理（配对·窝次·孵化）', r9: '交配组',
    r10: '系族繁育规划器', r11: '公开繁育者主页',
    r12: '个体卡片导出', r13: '日历导出',

    emQ: '<b>停止付费后记录会怎样？</b>',
    emA1: '记录<b>不会删除。</b>但超出免费范围（10 只）的个体会被锁定。被锁定的个体<b>只能查看和删除</b>，无法编辑或指定计划，提醒也会停止。',
    emA2: '保留哪 10 只由<b>您自己决定。</b>默认按登记顺序，也可在个体列表中点击<b>设为有效</b>来更改。',

    faqTitle: '常见问题',
    q1: '形态计算器也要付费吗？',
    a1: '不需要。豹纹守宫、睫角守宫、非洲肥尾守宫和球蟒计算器无需登录即可免费使用，今后也会保持免费。',
    q2: '如何获得高级代码？',
    a2: '目前处于测试期，采用单独发放的方式。请通过<a href="mailto:kmc612000@gmail.com">联系我们</a>与我们取得联系。',
    q3: '我养的超过 50 只。',
    a3: '目前先设为 50 只。如需更多，请通过<a href="mailto:kmc612000@gmail.com">联系我们</a>告知，我们会另行安排。',
    q4: '注销账户后记录会怎样？',
    a4: '注销账户会一并删除记录。剩余期限不予退款，已使用的代码也无法再次使用，若只是暂时休息，建议改为退出登录。详情请见<a href="/terms.html#terms">服务条款</a>。',

    footTerms: '服务条款', footPrivacy: '隐私政策', footContact: '联系我们',
  };

  var SUPPORTED = { ko: 1, en: 1, ja: 1, zh: 1 };

  function normalized(value) {
    var code = String(value || '').toLowerCase().split('-')[0];
    return SUPPORTED[code] ? code : 'ko';
  }

  /* 언어를 정하는 순서: 주소의 ?lang → 저장해 둔 선택 → 브라우저 설정.
     계산기에서 영어로 보다가 요금 안내를 누르면 ?lang=en 이 따라옵니다.
     저장값을 먼저 보면 그 흐름이 끊깁니다. */
  function pick() {
    var q = '';
    try { q = new URLSearchParams(w.location.search).get('lang') || ''; } catch (e) { q = ''; }
    if (q && SUPPORTED[normalized(q)] && normalized(q) === String(q).toLowerCase().split('-')[0]) {
      return normalized(q);
    }
    var saved = '';
    try { saved = w.localStorage.getItem('ryang-lang') || ''; } catch (e) { saved = ''; }
    if (saved && SUPPORTED[saved]) return saved;
    var nav = (w.navigator && (w.navigator.language || w.navigator.userLanguage)) || 'ko';
    return normalized(nav);
  }

  var lang = pick();
  var dict = L[lang] || L.ko;

  function t(key) {
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key]
      : Object.prototype.hasOwnProperty.call(L.ko, key) ? L.ko[key] : key;
  }

  function meta(selector, value) {
    var node = w.document.querySelector(selector);
    if (node) node.setAttribute('content', value);
  }

  function apply() {
    var d = w.document;
    d.documentElement.lang = t('htmlLang');
    d.title = t('pageTitle');
    meta('meta[name="description"]', t('metaDesc'));
    meta('meta[property="og:title"]', t('pageTitle'));
    meta('meta[property="og:description"]', t('ogDesc'));
    meta('meta[property="og:locale"]', t('ogLocale'));

    d.querySelectorAll('[data-pt]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-pt'));
    });
    d.querySelectorAll('[data-ph]').forEach(function (node) {
      node.innerHTML = t(node.getAttribute('data-ph'));
    });

    /* 다른 페이지로 나가는 우리 링크에 지금 언어를 실어 보냅니다. 안 그러면
       요금 안내를 영어로 보던 사람이 케어로그로 갔을 때 한국어로 돌아갑니다.
       mailto: 와 바깥 주소, 페이지 안 앵커(#)는 건드리지 않습니다. */
    if (lang !== 'ko') {
      d.querySelectorAll('a[href^="/"]').forEach(function (node) {
        var href = node.getAttribute('href');
        if (!href || href.indexOf('?') >= 0) return;
        var hash = '';
        var cut = href.indexOf('#');
        if (cut >= 0) { hash = href.slice(cut); href = href.slice(0, cut); }
        node.setAttribute('href', href + '?lang=' + lang + hash);
      });
    }

    var picker = d.getElementById('langPick');
    if (picker) {
      picker.value = lang;
      picker.onchange = function () {
        var next = normalized(picker.value);
        try { w.localStorage.setItem('ryang-lang', next); } catch (e) { /* 사생활 보호 모드 */ }
        var url = new URL(w.location.href);
        url.searchParams.set('lang', next);
        w.location.href = url.toString();
      };
    }
  }

  w.PricingI18n = { language: function () { return lang; }, t: t, apply: apply, locales: L };
  if (w.document.readyState === 'loading') {
    w.document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
}(window));
