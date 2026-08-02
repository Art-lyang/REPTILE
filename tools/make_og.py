"""공유 카드(og:image)를 만듭니다.  사용법:  python3 tools/make_og.py

왜 필요한가
  헤더에 쓰는 hero 그림은 배경을 파낸 PNG(투명)입니다. 화면에서는 페이지
  배경이 비쳐서 예쁘지만, 카카오톡·X·슬랙은 공유 카드를 만들 때 투명한 자리를
  검정으로 메웁니다. 베이지 배경을 전제로 그린 그림이 검은 판 위에 얹히면
  테두리가 그대로 드러납니다.

  크기도 문제입니다. 공유 카드 권장은 1200x630 인데 hero 는 640~920px 이라
  큰 카드로 뜨지 않거나 흐리게 늘어납니다.

무엇을 만드는가
  assets/og-<계산기>-v1.jpg — 1200x630, 불투명, 사이트 배경색(#EDEAE1) 위에
  hero 를 얹은 그림. 원본 hero 는 그대로 두고 새 파일로만 씁니다.

  글자는 넣지 않습니다. 제목·설명은 og:title / og:description 으로 카드 옆에
  이미 표시되고, 그림에까지 넣으면 같은 말이 두 번 보입니다.
"""
import io, os, sys
from PIL import Image

W, H = 1200, 630
BG = (0xED, 0xEA, 0xE1)   # --bg 라이트 테마. 네 계산기가 모두 같은 값을 씁니다.
FIT = 0.92                # 캔버스 가장자리에 여백을 조금 남깁니다

SOURCES = [
    ('gecko',      'assets/leopard-hero-v1.png'),
    ('crested',    'assets/crested-hero-v2.png'),
    ('fattail',    'assets/fattail-hero-v1.png'),
    ('ballpython', 'assets/ballpython-hero-v1.png'),
]


def build(name, src, root):
    im = Image.open(os.path.join(root, src)).convert('RGBA')

    # 투명한 테두리를 잘라냅니다. hero 는 화면 배치용이라 위아래에 빈 줄이
    # 남아 있는 경우가 있고, 그대로 두면 카드 가운데가 어긋납니다.
    box = im.getchannel('A').getbbox()
    if box:
        im = im.crop(box)

    scale = min(W * FIT / im.width, H * FIT / im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))),
                   Image.LANCZOS)

    canvas = Image.new('RGB', (W, H), BG)
    canvas.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im)

    out = os.path.join(root, 'assets', 'og-%s-v1.jpg' % name)
    canvas.save(out, 'JPEG', quality=88, optimize=True, progressive=True)
    return out, os.path.getsize(out)


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for name, src in SOURCES:
        out, size = build(name, src, root)
        print('  %-28s %dKB' % (os.path.relpath(out, root).replace('\\', '/'), size // 1024))
