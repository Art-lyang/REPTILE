/* =============================================================================
   결과 공유 카드 — 계산 결과를 이미지 한 장으로
   -----------------------------------------------------------------------------
   사람들은 이미 계산 결과를 스크린샷으로 찍어 커뮤니티에 올립니다. 그 그림에
   우리 이름이 없을 뿐입니다. 지금 바깥에서 오는 사람의 대부분이 그 경로로
   옵니다 — 그러니 찍기 좋게 만들어 주는 편이 낫습니다.

   ⚠️ 무료입니다. 프리미엄으로 묶으면 퍼지지 않고, 퍼지지 않으면 이 기능은
      할 이유가 없습니다.

   ⚠️ 화면에 이미 그려진 표를 읽습니다. 계산기 네 개가 저마다 다른 코어를
      쓰지만 결과 표는 같은 모양이라(.rtable / .c-prob / .c-vis), 각 계산기
      내부를 건드리지 않고 한 파일로 넷을 덮습니다. 표가 바뀌면 여기도
      바뀌어야 합니다 — 그래서 못 읽으면 조용히 실패하지 않고 알립니다.

   글꼴은 페이지에 이미 있는 것을 씁니다. 캔버스는 웹폰트가 준비되기 전에
   그리면 기본 글꼴로 나오므로, document.fonts 가 있으면 기다립니다.
   ============================================================================= */
(function (w, d) {
  'use strict';

  const FONT = '"Pretendard Variable", -apple-system, BlinkMacSystemFont, sans-serif';
  const MAX_ROWS = 12;

  /* 화면에 그려진 결과 표에서 확률과 이름을 읽습니다. */
  function readRows(root) {
    const table = (root || d).querySelector('.rtable tbody');
    if (!table) return [];
    return [].slice.call(table.querySelectorAll('tr'))
      .map(function (tr) {
        const p = tr.querySelector('.c-prob');
        const v = tr.querySelector('.c-vis .vtext') || tr.querySelector('.c-vis');
        if (!p || !v) return null;
        /* 칸 안에는 '근거 보기' 같은 버튼도 들어 있습니다. 그대로 읽으면
           모프 이름 뒤에 버튼 글자가 붙습니다 — 복제해서 걷어냅니다. */
        const clone = v.cloneNode(true);
        [].slice.call(clone.querySelectorAll('button, .explainbtn, [role="button"]'))
          .forEach(function (el) { el.remove(); });
        /* 칸 안의 조각들이 붙어 있어서 그냥 읽으면 '콤보랩터' 처럼 한 낱말이
           됩니다. 조각 사이에 공백을 넣고 다시 읽습니다. */
        clone.innerHTML = clone.innerHTML.replace(/<[^>]+>/g, ' $& ');
        const label = clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
        return { pct: p.textContent.replace(/\s+/g, ' ').trim(), label: label };
      })
      .filter(Boolean)
      .slice(0, MAX_ROWS);
  }

  function textOf(sel) {
    if (!sel) return '';
    const el = d.querySelector(sel);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function fitText(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let s = text;
    while (s.length > 4 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }

  async function ready() {
    try { if (d.fonts && d.fonts.ready) await d.fonts.ready; } catch (e) { /* 무시 */ }
  }

  /* opts = { title, pairA, pairB, pairLabelA, pairLabelB, rows, filename, note } */
  async function draw(opts) {
    const rows = opts.rows && opts.rows.length ? opts.rows : readRows();
    if (!rows.length) return null;

    await ready();

    const W = 900;
    const ROW = 58;
    const headH = opts.pairA || opts.pairB ? 150 : 118;
    const H = headH + 54 + rows.length * ROW + 54;

    const cv = d.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    const g = cv.getContext('2d');
    if (!g) return null;
    g.scale(2, 2);
    g.textBaseline = 'alphabetic';

    /* 바탕 */
    g.fillStyle = '#f5f1e8';
    g.fillRect(0, 0, W, H);

    /* 머리 */
    g.fillStyle = '#086850';
    g.fillRect(0, 0, W, headH);
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.lineWidth = 30;
    g.beginPath(); g.arc(830, 12, 108, 0, Math.PI * 2); g.stroke();

    g.fillStyle = '#ffffff';
    g.font = '800 30px ' + FONT;
    g.fillText(fitText(g, opts.title || '', 700), 42, 54);

    if (opts.pairA || opts.pairB) {
      g.font = '600 15px ' + FONT;
      g.fillStyle = 'rgba(255,255,255,.72)';
      const la = (opts.pairLabelA || 'A') + ' · ';
      const lb = (opts.pairLabelB || 'B') + ' · ';
      g.fillText(fitText(g, la + (opts.pairA || '—'), 780), 42, 96);
      g.fillText(fitText(g, lb + (opts.pairB || '—'), 780), 42, 124);
    }

    /* 표 */
    rows.forEach(function (r, i) {
      const y = headH + 34 + i * ROW;
      g.fillStyle = i % 2 ? '#ffffff' : '#fbfaf6';
      g.fillRect(32, y, W - 64, ROW - 8);
      g.fillStyle = '#086850';
      g.font = '800 18px ' + FONT;
      g.fillText(r.pct, 50, y + 32);
      g.fillStyle = '#173f35';
      g.font = '700 17px ' + FONT;
      g.fillText(fitText(g, r.label, 640), 168, y + 32);
    });

    /* 바닥 — 어디서 만든 그림인지. 이게 이 기능의 목적입니다. */
    g.fillStyle = '#7e766a';
    g.font = '600 14px ' + FONT;
    g.fillText('ryangstudio.com', 42, H - 20);
    if (opts.note) {
      g.font = '500 12px ' + FONT;
      g.textAlign = 'right';
      g.fillText(fitText(g, opts.note, 520), W - 42, H - 20);
      g.textAlign = 'left';
    }

    return cv;
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = d.createElement('a');
    a.href = url;
    a.download = filename || 'ryangstudio.png';
    d.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* 내려받기. 폰에서는 공유 창이 뜨면 그쪽이 훨씬 편해서 먼저 시도합니다. */
  async function share(opts) {
    const cv = await draw(opts);
    if (!cv) return false;

    const blob = await new Promise(function (done) { cv.toBlob(done, 'image/png'); });
    if (!blob) return false;

    const filename = opts.filename || 'ryangstudio.png';
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (w.navigator && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: opts.title || '' });
        return true;
      }
    } catch (e) {
      /* 사용자가 공유 창을 닫은 경우도 여기로 옵니다. 내려받기로 넘어가면
         닫았는데 파일이 떨어지므로, 취소는 취소로 둡니다. */
      if (e && e.name === 'AbortError') return true;
    }
    saveBlob(blob, filename);
    return true;
  }

  /* ── 버튼 ────────────────────────────────────────────────────────────────
     문구를 여기 두는 것은 일부러입니다. 계산기 네 개가 저마다 사전을 갖고
     있어서, 거기에 넣으면 16곳을 고쳐야 하고 하나를 빠뜨리면 그 계산기만
     영어로 남습니다. */
  const LABELS = {
    ko: { btn: '결과 이미지 저장', done: '이미지를 저장했습니다', fail: '이미지를 만들지 못했습니다' },
    en: { btn: 'Save as image', done: 'Image saved', fail: 'Could not make the image' },
    ja: { btn: '結果を画像で保存', done: '画像を保存しました', fail: '画像を作成できませんでした' },
    zh: { btn: '保存结果图片', done: '已保存图片', fail: '无法生成图片' }
  };

  function lang() {
    const l = (typeof w.LANG === 'string' && w.LANG) || d.documentElement.lang || 'ko';
    return LABELS[String(l).slice(0, 2)] ? String(l).slice(0, 2) : 'ko';
  }

  function buttonHtml() {
    return '<div class="rcard-bar"><button type="button" class="rcard-btn" data-rcard="1">'
      + '<i class="bi bi-image" aria-hidden="true"></i>' + LABELS[lang()].btn + '</button></div>';
  }

  /* 부모 표시는 계산기마다 id 가 다릅니다(레오는 leoSelA, 나머지는 selA).
     둘 다 물어보고 먼저 잡히는 것을 씁니다. */
  function pairOf(which) {
    const el = d.querySelector('#leoSel' + which + ', #sel' + which);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function titleOf() {
    return String(d.title || '').split('·')[0].trim();
  }

  d.addEventListener('click', function (ev) {
    const btn = ev.target.closest ? ev.target.closest('[data-rcard]') : null;
    if (!btn) return;
    btn.disabled = true;
    const who = d.querySelector('#lbl-sel-a'), who2 = d.querySelector('#lbl-sel-b');
    share({
      title: titleOf(),
      pairA: pairOf('A'), pairB: pairOf('B'),
      pairLabelA: who ? who.textContent.trim() : null,
      pairLabelB: who2 ? who2.textContent.trim() : null,
      filename: (titleOf() || 'ryangstudio').replace(/[^\w가-힣]+/g, '-') + '.png'
    }).then(function (ok) {
      btn.disabled = false;
      if (!ok && w.alert) alert(LABELS[lang()].fail);
    }).catch(function () { btn.disabled = false; if (w.alert) alert(LABELS[lang()].fail); });
  });

  w.StudioResultCard = { draw: draw, share: share, readRows: readRows, textOf: textOf,
    buttonHtml: buttonHtml };
}(window, document));
