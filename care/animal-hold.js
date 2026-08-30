/* =============================================================================
   보류 안내 — 회원 쪽
   -----------------------------------------------------------------------------
   관리자가 사진을 보류하거나 지웠으면, 회원이 관리 페이지에 들어왔을 때 왜
   그렇게 됐는지 보여야 합니다. 안 알리면 회원에게 남는 것은 '내 사진이 왜
   사라졌지' 뿐이고, 그 질문은 우리에게 오지 않고 다른 데로 갑니다.

   판정은 서버가 합니다(supabase_v69 의 my_animal_hold). 여기서는 받은 것을
   그릴 뿐입니다.

   ⚠️ purge_after 가 비어 있으면 '확인 대기' 입니다.
      회원은 이미 고쳤고 우리를 기다리는 중입니다. 그때 남은 기한을 보여 주면
      회원이 또 뭘 해야 하는 줄 압니다. '확인 중' 이라고 적어야 합니다.
   ============================================================================= */
(function (global) {
  'use strict';

  /* 사유 분류는 supabase_v68 의 animals_held_category_ck 와 같아야 합니다. */
  const CATEGORIES = ['adult', 'gambling', 'illegal', 'harm', 'unrelated', 'copyright', 'other'];

  function daysLeft(purgeAfter, today) {
    if (!purgeAfter) return null;
    const a = new Date(purgeAfter + 'T00:00:00');
    const b = new Date(today + 'T00:00:00');
    return Math.max(0, Math.round((a - b) / 86400000));
  }

  global.AnimalHold = {
    CATEGORIES: CATEGORIES,
    daysLeft: daysLeft,

    load: function (sb, animalId) {
      return sb.rpc('my_animal_hold', { p_animal: animalId }).then(function (r) {
        if (r.error) throw r.error;
        return r.data;      /* 보류가 아니면 null */
      });
    },

    notices: function (sb) {
      return sb.rpc('my_moderation_notices').then(function (r) {
        if (r.error) throw r.error;
        return r.data || [];
      });
    },

    /* 닫기. 기록(moderation_log)은 그대로 남습니다 — 회원이 닫았다고 무엇을
       왜 했는지가 사라지면 안 됩니다. */
    dismiss: function (sb, noticeId) {
      return sb.from('moderation_notices')
        .update({ seen_at: new Date().toISOString() })
        .eq('id', noticeId)
        .then(function (r) { if (r.error) throw r.error; return true; });
    },

    /* 배너 한 덩어리. 개체 화면과 목록 카드가 같은 문구를 쓰도록 여기서 만듭니다. */
    html: function (hold, ctx) {
      if (!hold) return '';
      const I = ctx.i18n, esc = ctx.esc;
      const left = daysLeft(hold.purge_after, ctx.today);
      const why = hold.reason
        ? esc(hold.reason)
        : esc(I.t('hold_' + (hold.category || 'other')));

      return '<div class="holdbanner" id="animal-hold">'
        + '<div class="hold-top"><i class="bi bi-exclamation-octagon-fill" aria-hidden="true"></i>'
        + '<b>' + esc(I.t('holdTitle')) + '</b></div>'
        + '<p class="hold-why">' + why + '</p>'
        + '<p class="hold-what">' + esc(I.t(hold.waiting ? 'holdWaiting' : 'holdDeadline',
            { days: left == null ? 0 : left })) + '</p>'
        + '<div class="hold-acts">'
        + '<a class="mini" href="' + esc(I.url('/care/#animals')) + '">'
        + '<i class="bi bi-pencil" aria-hidden="true"></i>' + esc(I.t('holdFix')) + '</a>'
        + '<a class="mini" href="mailto:' + esc(ctx.contact || 'ryangstudio@naver.com')
        + '?subject=' + encodeURIComponent(I.t('holdAppealSubject')) + '">'
        + '<i class="bi bi-envelope" aria-hidden="true"></i>' + esc(I.t('holdAppeal')) + '</a>'
        + '</div></div>';
    }
  };
}(window));
