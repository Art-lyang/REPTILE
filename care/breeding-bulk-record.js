/* =============================================================================
   일괄 빠른 기록
   -----------------------------------------------------------------------------
   100마리를 키우면 물 교체 한 번 남기는 데 개체를 하나씩 눌러 들어갔다
   나오기를 100번 해야 했습니다. 개체 목록에서 체크해 한 번에 남깁니다.

   상태·그리기·동작을 한 파일에 둡니다. 개체 패널에 그리기만 두고 동작을
   이벤트 파일에 두면, 고른 개체가 어디 사는지 두 곳을 오가며 찾아야 합니다.

   평소에는 아무것도 안 보입니다. 체크상자가 늘 떠 있으면 목록을 읽기만
   하려는 사람도 매번 지나쳐야 하고, 손가락이 굵으면 잘못 눌립니다.

   메모는 없습니다. 100마리에 똑같이 붙는 글은 메모가 아니고, 글을 받으려면
   막대에 입력칸이 하나 더 붙어야 합니다. 급여는 넣되 먹이 종류·양은 묻지
   않습니다 — 그건 개체마다 다르고 개체 화면에서 남기는 것입니다.
   ============================================================================= */
(function () {
  'use strict';

  window.createBreedingBulkRecord = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const C = deps.core;
    const I18n = deps.i18n;
    const esc = deps.esc;
    const icon = deps.icon;
    const act = deps.act;
    const render = deps.render;

    const KINDS = C.QUICK_KINDS.filter(k => k !== 'memo');

    function state() { return S.bulk || (S.bulk = { on: false, picked: [] }); }
    function on() { return state().on; }
    function picked() { return state().picked; }
    function isPicked(id) { return picked().indexOf(id) >= 0; }

    /* 목록이 한 줄이면 일괄이 아무 뜻이 없습니다. */
    function available() { return (S.animals || []).length > 1; }

    function toggleButton() {
      if (!available()) return '';
      return '<button class="btn ghost wide" data-bulktoggle="1" style="margin-bottom:12px">'
        + icon(on() ? 'bi-x-lg' : 'bi-check2-square')
        + esc(I18n.t(on() ? 'bulkExit' : 'bulkEnter')) + '</button>';
    }

    function barHtml() {
      if (!on() || !available()) return '';
      const none = !picked().length;
      return '<div class="bulkbar' + (none ? ' idle' : '') + '">'
        + '<div class="bulkhead"><b>' + esc(I18n.t('bulkCount', { count: picked().length })) + '</b>'
        + '<div class="bulkpicks">'
        + '<button class="mini" data-bulkall="1">' + esc(I18n.t('bulkSelectAll')) + '</button>'
        + '<button class="mini" data-bulkclear="1">' + esc(I18n.t('bulkClearAll')) + '</button>'
        + '</div></div>'
        + '<div class="hint">' + esc(I18n.t(none ? 'bulkHintEmpty' : 'bulkHint')) + '</div>'
        + '<div class="quick">' + KINDS.map(function (k) {
            const info = C.kindInfo(k);
            return '<button class="qbtn" data-bulkkind="' + k + '"' + (none ? ' disabled' : '')
              + ' style="--qc:' + info.color + '">'
              + icon(info.icon) + '<span>' + esc(I18n.kindName(k)) + '</span></button>';
          }).join('') + '</div></div>';
    }

    /* 카드에 붙일 것 — 체크상자와 테두리 표시 */
    function cardBox(a) {
      if (!on() || !available()) return '';
      return '<label class="bulkpick"><input type="checkbox" data-bulkpick="' + esc(a.id) + '"'
        + (isPicked(a.id) ? ' checked' : '') + ' aria-label="'
        + esc(I18n.t('bulkSelectAria', { name: a.name || I18n.t('unnamed') })) + '"></label>';
    }
    function cardClass(a) {
      if (!on() || !available()) return '';
      return ' card-picking' + (isPicked(a.id) ? ' card-picked' : '');
    }

    return {
      toggleButton: toggleButton,
      barHtml: barHtml,
      cardBox: cardBox,
      cardClass: cardClass,

      mode: function () {
        const b = state();
        b.on = !b.on;
        /* 나갈 때 고른 것을 비웁니다. 남겨 두면 다음에 켰을 때 예전 선택이
           살아 있어, 무엇에 기록되는지 모르는 채로 누르게 됩니다. */
        if (!b.on) b.picked = [];
        render();
      },
      toggle: function (id, checked) {
        const list = picked();
        const at = list.indexOf(id);
        if (checked && at < 0) list.push(id);
        if (!checked && at >= 0) list.splice(at, 1);
        render();
      },
      /* 지금 보이는 종의 목록만 고릅니다. 화면에 없는 개체까지 딸려 들어가면
         무엇에 기록했는지 확인할 방법이 없습니다. */
      all: function () { state().picked = (S.animals || []).map(a => a.id); render(); },
      clear: function () { state().picked = []; render(); },

      record: function (kind) {
        const ids = picked().slice();
        if (!ids.length) return;
        /* 한 번의 insert 로 넣습니다. addRecord 를 100번 부르면 요청도 100번
           나가고, 중간에 하나가 실패하면 어디까지 들어갔는지 알 수 없습니다. */
        return act(function () {
          return A.addRecords(ids.map(id => ({ animal_id: id, kind: kind, title: null })));
        }, I18n.t('bulkDone', { count: ids.length, kind: I18n.kindName(kind) }));
      }
    };
  };
}());
