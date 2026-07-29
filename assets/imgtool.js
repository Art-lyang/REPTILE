/* =============================================================================
   사진 줄이기 — 량 스튜디오 공용
   -----------------------------------------------------------------------------
   폰으로 찍은 사진은 4~12MB 입니다. 그대로 올리면 무료 저장소가 금방 차고,
   목록 화면에서 사진 20장을 받느라 한참 걸립니다. 올리기 전에 줄입니다.

   원래 gecko-core.js 안에만 있어서 레오파드 화면에서만 쓸 수 있었습니다.
   케어·브리딩 화면이 종을 가리지 않게 되면서 크레스티드·팻테일·볼파이썬
   에서도 필요해져 여기로 옮겼습니다. gecko-core.js 의 resizeImage 는 이제
   이 파일로 넘깁니다 — 구현을 두 벌 두면 한쪽만 고쳐집니다.

   ⚠️ 이 파일을 읽지 않은 페이지에서 사진 업로드를 부르면 분명한 오류가
      납니다. 조용히 원본을 올리지 않습니다 — 그게 더 나쁩니다.

   쓰는 법
       const blob = await ImgTool.resize(file, 900);
       // opt: { maxBytes: 350*1024, minQ: 0.5 }
   ============================================================================= */
(function (global) {
  'use strict';

  async function resize(file, max, opt) {
    opt = opt || {};
    const maxBytes = opt.maxBytes || 350 * 1024;   // 목표 용량
    const minQ     = opt.minQ     || 0.5;          // 최저 화질
    max = max || 900;

    if (!file || !/^image\//.test(file.type || '')) throw new Error('이미지 파일이 아니에요.');

    /* 1) 디코딩. createImageBitmap 은 EXIF 회전을 반영해 줍니다 — 이게 없으면
          세로로 찍은 폰 사진이 눕습니다. */
    let src = null, useBitmap = false;
    try {
      if (global.createImageBitmap) {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
        useBitmap = true;
      }
    } catch (e) { src = null; }
    if (!src) {
      src = await new Promise(function (res, rej) {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('이미지를 열 수 없어요.'));
        i.src = URL.createObjectURL(file);
      });
    }

    let sw = src.width, sh = src.height;
    if (!sw || !sh) throw new Error('이미지 크기를 읽을 수 없어요.');

    /* 2) 목표 크기 */
    const scale = Math.min(1, max / Math.max(sw, sh));
    const tw = Math.max(1, Math.round(sw * scale));
    const th = Math.max(1, Math.round(sh * scale));

    /* 3) 단계적 축소. 한 번에 1/2 이하로 줄이면 계단현상이 생겨서 반씩 줄입니다. */
    let cur = document.createElement('canvas');
    cur.width = sw; cur.height = sh;
    cur.getContext('2d').drawImage(src, 0, 0);
    if (useBitmap && src.close) src.close();

    let cw = sw, ch = sh;
    while (cw > tw * 2 || ch > th * 2) {
      const nw = Math.max(tw, Math.round(cw / 2)), nh = Math.max(th, Math.round(ch / 2));
      const nx = document.createElement('canvas');
      nx.width = nw; nx.height = nh;
      const cx = nx.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(cur, 0, 0, nw, nh);
      cur = nx; cw = nw; ch = nh;
    }
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    const ox = out.getContext('2d');
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(cur, 0, 0, tw, th);

    /* 4) 그래도 크면 화질을 낮춰 다시 인코딩 */
    const encode = q => new Promise(function (res, rej) {
      out.toBlob(b => (b ? res(b) : rej(new Error('이미지 변환에 실패했어요.'))), 'image/jpeg', q);
    });
    let q = 0.85, blob = await encode(q);
    while (blob.size > maxBytes && q > minQ) {
      q = Math.max(minQ, q - 0.12);
      blob = await encode(q);
    }
    return blob;
  }

  global.ImgTool = { resize: resize };
})(window);
