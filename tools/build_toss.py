"""앱인토스에 올릴 번들 dist-toss/ 를 만듭니다.  사용법:  python3 tools/build_toss.py

무엇을 만드는가
  종 선택 허브(toss/index.html) 하나 아래에 네 종의 계산기를 붙인 미니앱 한 벌입니다.
  네 종을 따로 올리지 않고 하나로 묶는 이유는 toss/README.md 를 보세요.
  한 줄로 줄이면 — 앱인토스는 '주제만 다른 같은 기능'의 앱을 여러 개 등록하지
  못하게 막습니다.

왜 계산기를 toss/ 안에 복사해 두지 않고 빌드로 만드는가
  ryangstudio.com 과 앱인토스가 같은 계산 엔진을 씁니다. 소스를 두 벌 두면
  ball-core.js 를 고칠 때마다 두 곳을 고쳐야 하고, 한 곳을 잊는 순간 웹과 앱의
  계산 결과가 달라집니다. 그래서 원본은 gecko/ · crested/ · fattail/ ·
  ballpython/ 한 곳에만 두고, 앱인토스용 차이는 여기서 '변환'으로 만듭니다.

무엇을 걷어내는가 (전부 앱인토스 심사 기준 때문입니다)
  · 검색엔진용 메타(canonical·og·robots·ld+json·seo-intro)
      웹뷰 안에는 크롤러가 오지 않습니다. 첫 화면 로딩만 늦춥니다.
  · Supabase 접속(supabase-js · analytics.js · uitext.js)
      계산기는 로그인 없이 도는데 방문 기록만 외부 서버로 나갑니다. 미니앱에서
      외부로 나가는 통신은 전부 심사 대상이라, 필요 없는 것은 아예 끊습니다.
  · 비밀번호 잠금(gate.js)
      볼파이톤의 테스트용 잠금입니다. 미니앱에 잠긴 화면을 낼 수는 없습니다.
  · 앱 밖으로 나가는 링크(스튜디오 홈 · 케어로그 · 브리딩 · mailto)
      '외부 링크는 제한적 허용'이 심사 항목입니다. 홈 버튼은 종 선택 허브로
      돌려놓고 나머지는 뺍니다.
  · 쿠키 안내 바 · 후원 버튼 · 광고 자리
      쿠키 안내는 붙일 통계가 없어졌으니 할 말이 없고, 후원과 외부 광고는
      앱인토스가 자기 결제·자기 광고만 허용합니다.

무엇을 덧붙이는가
  · 라이트 모드 고정 (assets/toss-light.css, 맨 마지막에 읽습니다)
  · 비어 있는 studio-config.js
      지우면 gecko-app.js 가 SUPABASE_URL 을 typeof 없이 읽어서 터집니다.
      키는 빼고 껍데기만 남겨 SB 가 null 이 되게 합니다.

아직 안 되어 있는 것은 toss/README.md 의 '남은 일' 절에 적어 두었습니다.
"""
import io, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist-toss')

# (폴더, 그 폴더에서 복사할 파일들)
#   *-boot.js 는 '코어 파일이 없습니다' 안내입니다. 번들에는 항상 함께 들어가니
#   뜰 일이 없지만, 빠뜨렸을 때 빈 화면 대신 이유를 보여주므로 같이 가져갑니다.
SPECIES = [
    ('gecko',      ['gecko-core.js', 'gecko-ui.js', 'gecko-app.js', 'gecko-boot.js', 'gecko.css']),
    ('crested',    ['crested-core.js', 'crested-ui.js', 'crested-app.js', 'crested-boot.js', 'crested.css']),
    ('fattail',    ['fattail-core.js', 'fattail-ui.js', 'fattail-app.js', 'fattail-boot.js', 'fattail.css']),
    ('ballpython', ['ball-core.js', 'ball-ui.js', 'ball-app.js', 'ball-boot.js', 'ball.css']),
]

# 계산기가 SUPABASE_URL·STUDIO_SERVICES 를 이름으로 읽습니다. 값은 비워 둡니다.
CONFIG_STUB = """/* 앱인토스 번들용 빈 설정 — tools/build_toss.py 가 만듭니다.

   원본 assets/studio-config.js 에는 Supabase 주소와 공개키가 들어 있습니다.
   앱인토스판은 어디에도 접속하지 않으므로 이름만 남기고 값을 비웠습니다.
   지우면 안 됩니다 — gecko-app.js 가 SUPABASE_URL 을 typeof 검사 없이 읽어서
   ReferenceError 로 화면이 통째로 죽습니다. 빈 문자열이면 SB 가 null 이 되고,
   그 뒤 코드는 전부 null 을 확인하고 조용히 건너뜁니다. */
var SUPABASE_URL = '';
var SUPABASE_ANON = '';
var STUDIO_SERVICES = {};
var TURNSTILE_SITE_KEY = '';
"""


def read(path):
    return io.open(path, encoding='utf-8').read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(text)


def drop_lines(html, needles):
    """주어진 조각이 들어 있는 줄을 통째로 지웁니다.
    <script src="..."> 처럼 한 줄에 하나씩 있는 태그에만 씁니다."""
    keep = []
    for line in html.split('\n'):
        if any(n in line for n in needles):
            continue
        keep.append(line)
    return '\n'.join(keep)


def drop_block(html, start_pat, end_pat):
    """여는 조각부터 닫는 조각까지를 지웁니다. 여러 줄에 걸친 덩어리용."""
    return re.sub(start_pat + r'.*?' + end_pat, '', html, flags=re.S)


def drop_tag_with_id(html, tag, ident):
    """id 가 붙은 태그 하나를 여닫는 짝까지 지웁니다.
    <a id="proBtn" ...>...</a> 처럼 안에 다른 같은 태그가 없는 것에만 씁니다."""
    return re.sub(r'<' + tag + r'\b[^>]*\bid="' + ident + r'"[^>]*>.*?</' + tag + r'>',
                  '', html, flags=re.S)


def transform(html, calc):
    # ── 주석 ────────────────────────────────────────────────────────────────
    # 원본의 HTML 주석은 '이 줄을 정식 공개 때 지우세요' 같은 웹사이트 운영 메모라,
    # 앱 번들에 남으면 읽는 사람을 헷갈리게 합니다. 설명은 소스에만 있으면 됩니다.
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)

    # ── 걷어내기: 검색엔진용 ────────────────────────────────────────────────
    html = drop_lines(html, [
        '<meta name="robots"', '<meta name="keywords"',
        '<link rel="canonical"', '<meta property="og:', '<meta name="twitter:',
        '<meta name="naver-site-verification"',
    ])
    html = drop_block(html, r'<script type="application/ld\+json">', r'</script>')
    html = drop_block(html, r'<section class="seo-intro">', r'</section>')

    # ── 걷어내기: 외부로 나가는 통신 ────────────────────────────────────────
    html = drop_lines(html, [
        'supabase-js@2',            # Supabase 클라이언트 CDN
        'assets/analytics.js',      # 방문 기록
        'assets/uitext.js',         # 관리자에서 고친 문구 불러오기 (DB 가 없으니 할 일도 없음)
        'assets/gate.js',           # 볼파이톤 테스트용 비밀번호 잠금
    ])

    # ── 걷어내기: 앱 밖으로 나가거나, 미니앱에서 쓸 수 없는 UI ──────────────
    #
    # ⚠️ 지우기 전에 '그 요소를 JS 가 확인 없이 만지는가'를 봐야 합니다.
    #    <종>-ui.js 는 setH()·setTx() 로 쓸 때는 null 을 걸러주지만, 몇 군데는
    #    getElementById(...).href 처럼 바로 점을 찍습니다. 그런 것을 지우면
    #    applyLang() 이 그 줄에서 죽고 화면 전체가 안 그려집니다.
    #    → 지워도 되는 것은 지우고, JS 가 붙잡고 있는 것은 '숨기기'만 합니다.

    # 갤러리(케어로그)·문의하기 줄. #mailLink 를 ui.js 가 확인 없이 만져서
    # 통째로 지우면 죽습니다. 자리만 감추고 태그는 남깁니다.
    html = html.replace('<div class="bottom-links">',
                        '<div class="bottom-links" style="display:none">', 1)

    # 쿠키 안내 바. 닫는 곳을 </div> 로 잡으면 안쪽 .cb-txt 에서 먼저 끊깁니다.
    # (지워도 안전합니다 — 이걸 여는 코드는 SHOW_LEGAL_LINKS 가 false 라 돌지 않고,
    #  okCookie() 는 방금 지운 버튼에서만 불립니다. gecko-ui.js '쿠키 안내' 절 참고)
    html = drop_block(html, r'<div class="cookiebar" id="cookieBar">', r'</button>\s*</div>')

    html = drop_tag_with_id(html, 'div', 'mailNote')   # '문의하기로 보내주세요' (setH — 안전)
    html = drop_tag_with_id(html, 'a', 'acctBtn')      # 내 정보 (login.html — if(ab) 로 막혀 있음)
    html = drop_tag_with_id(html, 'a', 'proBtn')       # 브리딩 관리 (/care/ — if(pro) 로 막혀 있음)
    html = drop_tag_with_id(html, 'button', 'premBtn') # 프리미엄 코드 (if(btn) 로 막혀 있음)

    # #adSlot 과 .donate-wrap 은 남깁니다 — gecko-ui.js 가 확인 없이 만집니다.
    # 대신 아래 patch_core() 가 AD_ENABLED 를 꺼서 아무것도 그리지 않게 합니다.
    # 후원 버튼은 SHOW_DONATE 가 이미 false 라 스스로 숨습니다.

    # ── 고쳐 쓰기 ───────────────────────────────────────────────────────────
    # 홈 버튼은 스튜디오 대신 종 선택 화면으로. 미니앱 안에서 종을 바꾸는 유일한 길입니다.
    html = html.replace(
        '<a class="blink home" href="/" title="량 스튜디오"><i class="bi bi-house" aria-hidden="true"></i><span>스튜디오</span></a>',
        '<a class="blink home" href="../" title="종 선택"><i class="bi bi-grid" aria-hidden="true"></i><span>종 선택</span></a>')

    # 루트 절대경로(/assets/…)는 미니앱이 도메인 최상위에 놓일 때만 맞습니다.
    # 하위 경로에 올라가도 깨지지 않도록 상대경로로 바꿉니다.
    html = html.replace('src="/assets/', 'src="../assets/').replace('href="/assets/', 'href="../assets/')

    # 화면 폭 — 노치 있는 기기에서 좌우가 잘리지 않게 합니다.
    html = re.sub(r'(<meta name="viewport" content=")([^"]*)(">)',
                  lambda m: m.group(1) + m.group(2) + ', viewport-fit=cover' + m.group(3)
                  if 'viewport-fit' not in m.group(2) else m.group(0), html, count=1)

    # ── 덧붙이기 ────────────────────────────────────────────────────────────
    # 라이트 고정. 반드시 theme.css 뒤에 와야 다크 블록을 덮습니다(toss-light.css 머리말).
    html = html.replace('</head>',
                        '<meta name="color-scheme" content="light">\n'
                        '<link rel="stylesheet" href="../assets/toss-light.css?v=1">\n</head>', 1)

    # 빈 줄이 여러 개 이어지면(위에서 지운 자리) 읽기 어려워집니다.
    html = re.sub(r'\n{3,}', '\n\n', html)
    return html


# 종별 코어에서 앱인토스판만 다르게 가져가야 하는 스위치.
#   (파일, 찾을 것, 바꿀 것, 왜)
# 못 찾으면 빌드를 실패시킵니다. 원본이 바뀌어 조용히 안 먹는 것이 제일 위험합니다 —
# 그대로 제출하면 심사에서야 알게 됩니다.
CORE_PATCHES = [
    ('gecko', 'gecko-core.js',
     'const AD_ENABLED  = true;',
     'const AD_ENABLED  = false;',
     '광고 자리 끄기 — 앱인토스는 자체 인앱 광고만 허용하고, AD_HTML 이 비어 있으면 '
     '"광고 영역" 안내 상자가 그대로 화면에 남습니다'),
]


def patch_core(calc, fname, path):
    for c, f, old, new, why in CORE_PATCHES:
        if c != calc or f != fname:
            continue
        s = read(path)
        if old not in s:
            raise SystemExit(
                '빌드 중단 — %s/%s 에서 다음을 찾지 못했습니다:\n  %s\n'
                '이 치환의 목적: %s\n'
                '원본이 바뀐 것 같습니다. tools/build_toss.py 의 CORE_PATCHES 를 고쳐주세요.'
                % (calc, fname, old, why))
        write(path, s.replace(old, new, 1))
        return True
    return False


def fix_terms(path):
    """약관 문서를 앱 안에서 열리도록 손봅니다. 문장은 건드리지 않습니다."""
    s = read(path)
    # 웹사이트 주소를 가리키는 canonical. 웹뷰 안에서는 의미가 없습니다.
    s = drop_lines(s, ['<link rel="canonical"'])
    # '돌아가기'가 번들에 없는 로그인 화면을 가리킵니다. 종 선택 허브로 돌립니다.
    s = s.replace('<a class="back" href="gecko/login.html">← 돌아가기</a>',
                  '<a class="back" href="./">← 돌아가기</a>')
    write(path, s)


def collect_assets(paths):
    """만들어진 HTML·CSS 가 실제로 가리키는 assets/ 파일 이름만 모읍니다.
    assets/ 를 통째로 복사하면 계산기가 쓰지 않는 TIU 배경(1.1MB)까지 따라옵니다."""
    names = set()
    for p in paths:
        s = read(p)
        for m in re.finditer(r'assets/([A-Za-z0-9._-]+)', s):
            names.add(m.group(1))
    return names


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    made = []

    # 허브
    shutil.copy(os.path.join(ROOT, 'toss', 'index.html'), os.path.join(OUT, 'index.html'))
    shutil.copy(os.path.join(ROOT, 'toss', 'hub.css'), os.path.join(OUT, 'hub.css'))
    made += ['index.html', 'hub.css']

    # 약관 — 앱 안에 두고 링크합니다. 밖으로 내보내면 그 자체가 외부 링크입니다.
    shutil.copy(os.path.join(ROOT, 'terms.html'), os.path.join(OUT, 'terms.html'))
    fix_terms(os.path.join(OUT, 'terms.html'))
    made.append('terms.html')

    # 공용 파일
    os.makedirs(os.path.join(OUT, 'assets'), exist_ok=True)
    shutil.copy(os.path.join(ROOT, 'toss', 'toss-light.css'), os.path.join(OUT, 'assets', 'toss-light.css'))
    write(os.path.join(OUT, 'assets', 'studio-config.js'), CONFIG_STUB)

    # 종별 화면
    html_paths, css_paths = [os.path.join(OUT, 'index.html')], [os.path.join(OUT, 'hub.css')]
    for calc, files in SPECIES:
        src = os.path.join(ROOT, calc)
        dst = os.path.join(OUT, calc)
        os.makedirs(dst, exist_ok=True)
        for f in files:
            shutil.copy(os.path.join(src, f), os.path.join(dst, f))
            patch_core(calc, f, os.path.join(dst, f))
            if f.endswith('.css'):
                css_paths.append(os.path.join(dst, f))
        out_html = os.path.join(dst, 'index.html')
        write(out_html, transform(read(os.path.join(src, 'index.html')), calc))
        html_paths.append(out_html)
        made.append('%s/ (%d개)' % (calc, len(files) + 1))

    # 공용 CSS·JS 는 이름이 고정이라 먼저 넣고, 나머지는 참조를 훑어서 채웁니다.
    for f in ['base.css', 'theme.css']:
        shutil.copy(os.path.join(ROOT, 'assets', f), os.path.join(OUT, 'assets', f))
        css_paths.append(os.path.join(OUT, 'assets', f))

    wanted = collect_assets(html_paths + css_paths)
    copied = 0
    missing = []
    for name in sorted(wanted):
        s = os.path.join(ROOT, 'assets', name)
        d = os.path.join(OUT, 'assets', name)
        if os.path.exists(d):
            continue
        if os.path.exists(s):
            shutil.copy(s, d)
            copied += 1
        else:
            missing.append(name)

    total = sum(len(fs) for _, _, fs in os.walk(OUT))
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)

    print('dist-toss/ 생성 완료')
    for m in made:
        print('  · ' + m)
    print('  · assets/ (%d개 + 공용 4개)' % copied)
    if missing:
        # 조용히 넘어가면 앱에서 그림만 안 나옵니다. 빌드할 때 알아야 합니다.
        print('  ⚠️ assets/ 에서 못 찾음: ' + ', '.join(missing))
    print('  파일 %d개 · %.1f MB' % (total, size / 1048576.0))
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
