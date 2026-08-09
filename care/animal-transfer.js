/* =============================================================================
   양도 — 보내는 쪽 (supabase_v65 · v66)
   -----------------------------------------------------------------------------
   개체를 다른 회원에게 넘깁니다. 링크(또는 QR)를 받은 사람이 수락하면 그쪽
   계정에 개체가 새로 만들어지고, 내 쪽 개체는 잠깁니다.

   ⚠️ 왜 옮기지 않고 복사하는가.
      animals.user_id 를 바꿔 버리면 그 개체를 부모로 둔 내 다른 개체들이
      저장되지 않습니다 — save_row 가 개체를 고칠 때 delete 후 재insert 하는데
      (supabase_v54), 부모가 남의 것이 되면 그 참조가 깨집니다. 그래서 받는
      쪽에는 새 줄을 만들고 내 쪽은 transferred_at 을 찍어 읽기 전용으로
      둡니다. 내 혈통 기록은 그대로 남습니다.

   ⚠️ 발의는 개체당 하나만 삽니다. 새로 만들면 이전 링크는 그 자리에서
      죽습니다 — QR 을 여러 장 뿌려 놓고 누가 먼저 찍는지 겨루게 두면
      안 됩니다(서버가 그렇게 합니다, v65).

   ⚠️ CITES 서류가 없는 개체는 서버가 막습니다(assert_cites_transferable).
      화면에서 미리 막지 않습니다 — 판정은 한 곳에서만 해야 어긋나지
      않습니다. 막히면 그 이유를 그대로 보여 줍니다.
   ============================================================================= */
(function (global) {
  'use strict';

  /* 서버가 errcode 42501 에 실어 보내는 이름들. 사람 말로 바꿔 보여 줍니다. */
  const REASONS = {
    ALREADY_TRANSFERRED: 'tfErrAlready',
    ANIMAL_NOT_FOUND: 'tfErrNotFound',
    AUTH_REQUIRED: 'tfErrAuth',
    CITES_DOCS_REQUIRED: 'tfErrCites'
  };

  function reasonKey(error) {
    const msg = String((error && error.message) || '');
    const hit = Object.keys(REASONS).filter(k => msg.indexOf(k) >= 0)[0];
    return hit ? REASONS[hit] : null;
  }

  /* 이 개체의 양도 상태. 없으면 null 입니다.
     my_animal_transfers 는 내가 보낸 것과 받은 것을 모두 주므로 여기서
     이 개체 것만 고릅니다. */
  async function load(sb, animalId) {
    if (!sb || !animalId) return null;
    const r = await sb.rpc('my_animal_transfers');
    if (r.error) return null;
    const rows = (r.data || []).filter(x => x.animal_id === animalId);
    if (!rows.length) return null;

    /* 수락된 것이 있으면 그게 결론입니다. 그다음이 대기 중. */
    return rows.filter(x => x.status === 'accepted')[0]
      || rows.filter(x => x.status === 'pending')[0]
      || null;
  }

  function start(sb, animalId, opts) {
    opts = opts || {};
    return sb.rpc('start_animal_transfer', {
      p_animal: animalId,
      p_gens: opts.gens || 3,
      p_note: opts.note || null,
      p_price: opts.price == null || opts.price === '' ? null : Number(opts.price)
    });
  }

  function cancel(sb, animalId) {
    return sb.rpc('cancel_animal_transfer', { p_animal: animalId });
  }

  /* 받는 사람이 열 주소. p.html(공개 프로필)이 아니라 양수 화면입니다 —
     공개 프로필은 누구나 보는 것이고 이건 한 번 쓰고 사라지는 것입니다. */
  function linkOf(token, i18n) {
    const path = i18n && i18n.url ? i18n.url('/care/transfer.html', { t: token })
                                  : '/care/transfer.html?t=' + encodeURIComponent(token);
    return (global.location ? global.location.origin : '') + path;
  }

  global.AnimalTransfer = {
    load: load,
    start: start,
    cancel: cancel,
    linkOf: linkOf,
    reasonKey: reasonKey
  };
}(window));
