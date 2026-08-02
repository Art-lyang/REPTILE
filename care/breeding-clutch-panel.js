(function () {
  'use strict';

  // Temperature-based hatch estimates are intentionally Leopard-only;
  // other species require a breeder-entered date rather than a misleading estimate.

  window.createBreedingClutchPanel = function (deps) {
    const S = deps.state;
    const A = deps.app;
    const C = deps.core;
    const $ = deps.element;
    const esc = deps.esc;
    const icon = deps.icon;
    const CORES = deps.cores;
    const act = deps.act;

    function hatchDays(t) {
      t = parseFloat(t) || 28;
      if (t >= 31) return 38;
      if (t >= 29.5) return 45;
      if (t >= 28) return 55;
      if (t >= 26.5) return 68;
      return 80;
    }

    function tabClutch() {
      if (S.edit && S.edit.what === 'clutch') return clutchForm(S.edit.row);
      let h = '<button class="btn wide" data-new="clutch" style="margin-bottom:14px">'
            + icon('bi-plus-lg') + '클러치 등록</button>';
      if (!S.clutches.length) {
        return h + '<div class="pad"><div class="empty">' + icon('bi-egg')
          + '등록된 클러치가 없습니다.</div></div>';
      }
      const today = C.today();
      return h + S.clutches.map(function (c) {
        const pair = S.pairs.filter(p => p.id === c.pairing)[0];
        const left = c.expected_hatch ? C.daysBetween(today, c.expected_hatch) : null;
        return '<div class="card"><div class="thumb">🥚</div><div class="info">'
          + '<div class="nm">' + esc(pair ? (pair.name || '이름 없는 페어링') : '페어링 없음')
          + (left != null && left >= 0 ? '<span class="chip" style="color:var(--teal);border-color:var(--teal)">D-' + left + '</span>'
             : left != null ? '<span class="chip">기한 지남</span>' : '') + '</div>'
          + '<div class="ms">' + (c.laid_date ? '산란 ' + esc(c.laid_date) : '산란일 미입력')
          + (c.egg_count ? ' · ' + c.egg_count + '개' : '')
          + (c.temp ? ' · ' + c.temp + '℃' : '')
          + (c.expected_hatch ? '<br>부화 예정 ' + esc(c.expected_hatch) : '')
          + (c.note ? '<br>' + esc(c.note) : '') + '</div></div>'
          + '<div class="acts"><button class="mini" data-edit="clutch:' + c.id + '">'
          + icon('bi-pencil') + '수정</button></div></div>';
      }).join('');
    }

    function clutchForm(c) {
      c = c || {};
      return '<div class="pad"><div class="lbl">' + (c.id ? '클러치 수정' : '클러치 등록') + '</div>'
        + '<div class="lbl2">페어링</div><select class="in" id="c_p" aria-label="페어링">'
        + '<option value="">선택 안 함</option>'
        + S.pairs.map(p => '<option value="' + p.id + '"' + (c.pairing === p.id ? ' selected' : '') + '>'
            + esc(p.name || '이름 없는 페어링') + '</option>').join('') + '</select>'
        + '<div class="row2"><div><div class="lbl2"><label for="c_laid">산란일</label></div>'
        + '<input class="in" id="c_laid" type="date" value="' + esc(c.laid_date || '') + '"></div>'
        + '<div><div class="lbl2"><label for="c_n">알 개수</label></div>'
        + '<input class="in" id="c_n" type="number" min="0" max="99" inputmode="numeric" value="'
        + esc(c.egg_count == null ? '' : c.egg_count) + '"></div></div>'
        + '<div class="lbl2"><label for="c_t">인큐베이터 온도 (℃)</label></div>'
        + '<input class="in" id="c_t" type="number" step="0.5" inputmode="decimal" value="'
        + esc(c.temp == null ? '' : c.temp) + '">'
        + (S.species === 'gecko'
          ? '<div class="hint">온도를 적으면 부화 예정일을 <b>레오파드 기준</b>으로 자동 계산합니다.</div>'
          : '<div class="hint">부화 예정일 자동 계산은 <b>레오파드 기준</b>입니다. '
            + esc(CORES[S.species].ko) + ' 는 아래에서 직접 적어주세요.</div>')
        + '<div class="lbl2"><label for="c_exp">부화 예정일</label></div>'
        + '<input class="in" id="c_exp" type="date" value="' + esc(c.expected_hatch || '') + '">'
        + '<div class="lbl2"><label for="c_note">메모</label></div>'
        + '<input class="in" id="c_note" value="' + esc(c.note || '') + '">'
        + '<div class="err" id="c_err"></div><div class="formbtns"><button class="btn" id="c_save">'
        + icon('bi-check-lg') + '저장</button><button class="btn ghost" data-cancel="1">취소</button>'
        + (c.id ? '<button class="btn danger" data-del="clutch:' + c.id + '" style="margin-left:auto">'
          + icon('bi-trash3') + '삭제</button>' : '') + '</div></div>';
    }

    function saveClutch() {
      const temp = $('c_t').value ? Number($('c_t').value) : null;
      let exp = $('c_exp').value || null;
      if (!exp && S.species === 'gecko' && $('c_laid').value && temp) {
        exp = C.addDays($('c_laid').value, hatchDays(temp));
      }
      const row = Object.assign({}, S.edit.row || {}, {
        pairing: $('c_p').value || null,
        laid_date: $('c_laid').value || null,
        egg_count: $('c_n').value ? parseInt($('c_n').value, 10) : null,
        temp: temp, expected_hatch: exp,
        note: $('c_note').value.trim() || null
      });
      return act(async () => { await A.saveRow('clutches', row); S.edit = null; }, '저장했습니다');
    }

    return { tabClutch: tabClutch, saveClutch: saveClutch };
  };
})();
