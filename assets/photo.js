/* =============================================================================
   photo.js — 개체 사진 주소 만들기 (비공개 버킷 · 서명 주소)
   -----------------------------------------------------------------------------
   개체 사진은 animal-photos 버킷에 있고 이 버킷은 비공개입니다. 그래서
   주소를 그냥 <img src> 에 넣으면 안 보입니다. 읽을 권한이 있는 쪽이
   '서명 주소' 를 받아야 하고, 그 주소는 정해진 시간이 지나면 죽습니다.

   그 덕분에 공개를 끄면 사진도 따라 닫힙니다. 예전에는 버킷이 공개라
   한 번 나간 주소를 회수할 방법이 없었습니다. (supabase_v25.sql 머리말)

   ---------------------------------------------------------------------------
   쓰는 법 — 그리는 쪽은 두 줄만 바꾸면 됩니다
   ---------------------------------------------------------------------------
   화면은 대부분 innerHTML 로 한 번에 그립니다. 거기에 await 를 끼워 넣으면
   그리는 코드가 전부 비동기가 되어 버립니다. 그래서 순서를 뒤집었습니다.
   먼저 빈 <img> 를 자리만 잡아 그려두고, 다 그린 뒤 한 번에 채웁니다.

       html += Photo.tag(a.photo_url, '이름');   // 그릴 때
       ...
       host.innerHTML = html;
       Photo.hydrate(host, SB);                  // 다 그린 뒤 한 번

   hydrate 는 화면 안의 사진을 모아 한 번에 서명을 받습니다. 사진이 스무 장
   있어도 왕복은 한 번입니다.

   ---------------------------------------------------------------------------
   왜 전체 주소를 그대로 들고 다니나
   ---------------------------------------------------------------------------
   animals.photo_url / photos 에는 예전부터 전체 주소가 들어 있습니다.
   경로만 저장하도록 바꾸면 깔끔하지만 기존 행을 전부 고쳐야 합니다.
   주소의 끝부분이 곧 파일 경로라, 여기서 잘라 씁니다.

   옛 사진(morph-images 버킷)은 공개라 서명이 필요 없습니다. 주소를 보고
   어느 버킷인지 가려서, 옛 사진은 그대로 씁니다. 그래야 v25 를 돌린 뒤
   사진을 다시 올리기 전까지 화면이 비지 않습니다.
   ============================================================================= */
(function (w) {
  'use strict';

  var BUCKET   = 'animal-photos';
  var TTL      = 3600;          // 서명 유효시간(초). 정책이 바뀌면 이만큼은 늦게 반영됩니다.
  var REFRESH  = 3000;          // 이만큼 남으면 다시 받습니다 (초)

  /* 받아둔 서명을 기억합니다. 같은 사진이 목록과 상세에 겹쳐 나오는 일이
     흔해서, 없으면 같은 파일을 여러 번 서명하게 됩니다. */
  var cache = {};               // path -> { url: '...', until: 초 }

  function now() { return Math.floor(Date.now() / 1000); }

  /* 주소에서 파일 경로를 뽑습니다. 비공개 버킷 것이 아니면 null 을 돌려주고,
     그때는 부르는 쪽이 원래 주소를 그대로 씁니다. */
  function pathOf(url) {
    if (!url || typeof url !== 'string') return null;
    var mark = '/' + BUCKET + '/';
    var i = url.indexOf(mark);
    if (i < 0) return null;
    var p = url.slice(i + mark.length);
    /* 이미 서명된 주소가 다시 들어오는 경우 — 물음표 뒤를 떼어냅니다 */
    var q = p.indexOf('?');
    if (q >= 0) p = p.slice(0, q);
    return p ? decodeURIComponent(p) : null;
  }

  /* 화면에 그릴 <img> 태그. 아직 주소를 모르므로 data-ph 에 넣어두고
     hydrate 가 채웁니다. 서명이 필요 없는 주소면 바로 src 로 넣습니다. */
  function tag(url, alt, cls) {
    var a = ' alt="' + esc(alt || '') + '"';
    var c = cls ? ' class="' + esc(cls) + '"' : '';
    if (!url) return '';
    if (!pathOf(url)) return '<img' + c + ' src="' + esc(url) + '"' + a + '>';
    /* 빈 src 는 브라우저가 현재 페이지를 다시 요청하게 만듭니다.
       투명 1픽셀을 넣어 그 요청을 막습니다. */
    return '<img' + c + ' src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="'
         + ' data-ph="' + esc(url) + '"' + a + '>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x];
    });
  }

  /* 주소 하나를 서명해 돌려줍니다. 서명이 필요 없으면 원래 주소 그대로. */
  async function sign(sb, url) {
    var p = pathOf(url);
    if (!p) return url;
    var hit = cache[p];
    if (hit && hit.until - now() > REFRESH) return hit.url;
    if (!sb) return null;
    try {
      var r = await sb.storage.from(BUCKET).createSignedUrl(p, TTL);
      if (r.error || !r.data || !r.data.signedUrl) return null;
      cache[p] = { url: r.data.signedUrl, until: now() + TTL };
      return r.data.signedUrl;
    } catch (e) { return null; }
  }

  /* root 안의 data-ph 를 한 번에 채웁니다. 왕복 한 번이면 끝나도록
     createSignedUrls(복수) 를 씁니다. */
  async function hydrate(root, sb) {
    if (!root) return;
    var els = Array.prototype.slice.call(root.querySelectorAll('img[data-ph]'));
    if (!els.length) return;

    var need = {}, ready = [];
    els.forEach(function (el) {
      var p = pathOf(el.getAttribute('data-ph'));
      if (!p) { el.removeAttribute('data-ph'); return; }
      var hit = cache[p];
      if (hit && hit.until - now() > REFRESH) ready.push([el, hit.url]);
      else (need[p] = need[p] || []).push(el);
    });

    ready.forEach(function (pair) { put(pair[0], pair[1]); });

    var paths = Object.keys(need);
    if (!paths.length || !sb) { paths.forEach(function (p) { need[p].forEach(fail); }); return; }

    try {
      var r = await sb.storage.from(BUCKET).createSignedUrls(paths, TTL);
      if (r.error || !r.data) { paths.forEach(function (p) { need[p].forEach(fail); }); return; }
      var by = {};
      r.data.forEach(function (d) {
        /* 실패한 항목은 signedUrl 이 없습니다. 통째로 버리지 않고
           성공한 것만 채웁니다 — 한 장 때문에 전부 안 보이면 안 됩니다. */
        if (d && d.path && d.signedUrl) by[d.path] = d.signedUrl;
      });
      paths.forEach(function (p) {
        var u = by[p];
        if (u) { cache[p] = { url: u, until: now() + TTL }; need[p].forEach(function (el) { put(el, u); }); }
        else need[p].forEach(fail);
      });
    } catch (e) {
      paths.forEach(function (p) { need[p].forEach(fail); });
    }
  }

  function put(el, url) {
    el.removeAttribute('data-ph');
    el.setAttribute('src', url);
  }

  /* 서명을 못 받은 경우 — 공개가 꺼졌거나, 지워졌거나, 남의 사진입니다.
     깨진 이미지 아이콘 대신 자리를 비웁니다. 부르는 쪽이 CSS 로
     빈 자리를 처리할 수 있게 표시만 남깁니다. */
  function fail(el) {
    el.removeAttribute('data-ph');
    el.setAttribute('data-ph-fail', '1');
    el.removeAttribute('src');
    el.style.display = 'none';
  }

  w.Photo = { BUCKET: BUCKET, TTL: TTL, pathOf: pathOf, tag: tag, sign: sign, hydrate: hydrate };
})(window);
