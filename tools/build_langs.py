"""언어별 정적 페이지를 만듭니다.  build.sh 가 dist/ 를 채운 뒤 호출합니다.

왜 필요한가
  계산기는 한 주소에서 JS 로 언어를 바꿉니다. 사람에게는 편하지만 검색엔진에는
  주소가 하나뿐이라, 구글은 한국어판만 색인하고 영어·일본어·중국어 검색에는
  걸리지 않습니다. hreflang 도 주소가 갈려야 붙일 수 있습니다.

무엇을 만드는가
  dist/en/gecko/index.html 처럼 언어별 사본을 만듭니다. 각 사본은
    · <html lang> 과 <title>·description 이 그 언어
    · canonical 이 자기 주소
    · hreflang 로 나머지 언어와 서로를 가리킴
    · 화면 문구가 그 언어로 미리 박혀 있음 (JS 없이도 읽힘)
    · var LANG 을 미리 정해 첫 화면부터 그 언어로 뜸
  JS·CSS·이미지는 복사하지 않고 원래 위치를 절대경로로 가리킵니다. 사본이
  늘어도 실제 파일은 하나뿐이라 고칠 때 한 곳만 보면 됩니다.

한국어는 기존 주소(/gecko/)를 그대로 씁니다. 이미 색인된 주소를 옮기면
그동안 쌓인 것이 날아갑니다.
"""
import io, os, re, subprocess, sys

SITE = 'https://ryangstudio.com'
LANGS = ['ko', 'en', 'ja', 'zh']
HTML_LANG = {'ko': 'ko', 'en': 'en', 'ja': 'ja', 'zh': 'zh-Hans'}
# og:locale 은 html lang 과 형식이 다릅니다(언어_지역). 같은 값을 쓰면
# 공유 미리보기가 언어를 못 알아봅니다.
OG_LOCALE = {'ko': 'ko_KR', 'en': 'en_US', 'ja': 'ja_JP', 'zh': 'zh_CN'}
CALCS = [('gecko', 'gecko/gecko-ui.js'),
         ('crested', 'crested/crested-ui.js'),
         ('fattail', 'fattail/fattail-ui.js'),
         ('ballpython', 'ballpython/ball-ui.js')]

# 비밀번호로 가려 둔(assets/gate.js) 테스트 중인 계산기의 이름을 넣습니다.
# 언어 사본은 그대로 만들되 sitemap 에서만 뺍니다. 잠긴 화면을 구글에 알려주면
# 들어와도 비밀번호 창만 보게 되고, 그 인상이 색인에 남습니다.
#
# 새 계산기를 잠글 때는 세 곳을 함께 손봐야 합니다 —
#   1) 여기에 이름 추가
#   2) 그 계산기 index.html 에 gate.js <script> 한 줄과 robots 의 noindex
#   3) robots.txt 에 Disallow
# 공개할 때도 셋을 함께 되돌립니다. (2026-07-30 ballpython 공개하며 비웠습니다)
GATED = set()


def read_i18n(path):
    """ui.js 의 I18N 리터럴만 잘라 파이썬 쪽에서 값을 꺼냅니다.
    파일 전체를 실행할 수 없어(DOM 을 건드립니다) 문자열만 훑습니다."""
    s = io.open(path, encoding='utf-8').read()
    i = s.index('const I18N')
    j = s.index('{', i)
    depth, end = 0, -1
    for k in range(j, len(s)):
        if s[k] == '{':
            depth += 1
        elif s[k] == '}':
            depth -= 1
            if depth == 0:
                end = k + 1
                break
    blk = s[j:end]

    out = {}
    for lang in LANGS:
        m = re.search(r"\n  " + lang + r":\s*\{", blk)
        if not m:
            continue
        st, depth = m.end(), 1
        fin = len(blk)
        for k in range(st, len(blk)):
            if blk[k] == '{':
                depth += 1
            elif blk[k] == '}':
                depth -= 1
                if depth == 0:
                    fin = k
                    break
        body = blk[st:fin]
        vals = {}
        for mm in re.finditer(r"(\w+)\s*:\s*'", body):
            key, p = mm.group(1), mm.end()
            buf = []
            while p < len(body):
                c = body[p]
                if c == '\\':
                    buf.append(body[p:p + 2]); p += 2; continue
                if c == "'":
                    break
                buf.append(c); p += 1
            vals[key] = ''.join(buf)
        out[lang] = vals
    return out


def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)


def alt_links(calc, cur):
    """네 언어가 서로를 가리키게 합니다. x-default 는 한국어로 둡니다."""
    rows = []
    for L in LANGS:
        href = url_of(calc, L)
        rows.append('  <link rel="alternate" hreflang="%s" href="%s">' % (HTML_LANG[L], href))
    rows.append('  <link rel="alternate" hreflang="x-default" href="%s">' % url_of(calc, 'ko'))
    # 검색엔진은 hreflang 을 보지만, 카카오·페이스북 같은 공유 미리보기는
    # og 만 봅니다. 둘 다 있어야 어느 쪽으로 퍼져도 그 언어로 보입니다.
    for L in LANGS:
        if L != cur:
            rows.append('  <meta property="og:locale:alternate" content="%s">' % OG_LOCALE[L])
    return '\n'.join(rows)


def url_of(calc, lang):
    return '%s/%s/' % (SITE, calc) if lang == 'ko' else '%s/%s/%s/' % (SITE, lang, calc)


# 약관·처리방침 링크 문구. 문서 자체는 한국어뿐이지만(terms.html 상단 안내 참고),
# 링크 글자까지 한국어로 두면 영어 화면에서 어디로 가는 링크인지조차 알 수 없습니다.
# 문서가 한국어라는 것은 눌러서 도착한 페이지가 알려줍니다.
LEGAL_TEXT = {
    'ko': ('이용약관', '개인정보처리방침'),
    'en': ('Terms of Service', 'Privacy Policy'),
    'ja': ('利用規約', 'プライバシーポリシー'),
    'zh': ('服务条款', '隐私政策'),
}


# 쿠키 안내 바. 문구가 index.html 에 그대로 박혀 있고 I18N 에 키가 없어,
# 언어 사본에서도 한국어로 남습니다. 읽을 수 없는 언어로 띄우는 쿠키 안내는
# 안내한 것으로 치기 어렵습니다.
COOKIE_TEXT = {
    'ko': ('이 사이트는 로그인 유지와 이용 통계를 위해 쿠키 및 브라우저 저장소를 사용합니다.',
           '자세히', '확인'),
    'en': ('This site uses cookies and browser storage to keep you signed in and to measure usage.',
           'Details', 'OK'),
    'ja': ('このサイトはログイン状態の保持と利用統計のために Cookie とブラウザストレージを使用します。',
           '詳細', 'OK'),
    'zh': ('本站使用 Cookie 和浏览器存储以保持登录状态并统计使用情况。',
           '详情', '确定'),
}


def localize_legal(html, lang):
    """숨겨진 상태라도 크롤러는 읽고, SHOW_LEGAL_LINKS 를 켜는 순간 그대로 보입니다."""
    terms, privacy = LEGAL_TEXT[lang]
    html = html.replace('<a href="/terms.html#terms">이용약관</a>',
                        '<a href="/terms.html#terms">%s</a>' % terms)
    html = html.replace('<a href="/terms.html#privacy">개인정보처리방침</a>',
                        '<a href="/terms.html#privacy">%s</a>' % privacy)

    body, more, ok = COOKIE_TEXT[lang]
    # 안내 문구와 '자세히' 링크는 한 덩어리로 갈아끼웁니다. 링크 글자만 바꾸면
    # 문장은 한국어인데 링크만 영어인 상태가 됩니다.
    html = re.sub(
        r'(<div class="cb-txt">).*?(</div>)',
        lambda m: '%s%s\n    <a href="/terms.html#privacy">%s</a>%s' % (m.group(1), body, more, m.group(2)),
        html, count=1, flags=re.S)
    html = html.replace('<button class="cb-ok" onclick="okCookie()">확인</button>',
                        '<button class="cb-ok" onclick="okCookie()">%s</button>' % ok)
    return html


def absolutize(html, calc):
    """상대경로를 절대경로로. 언어 사본은 한 단계 깊어서 ../ 계산이 어긋납니다."""
    html = html.replace('href="../assets/', 'href="/assets/')
    html = html.replace('src="../assets/', 'src="/assets/')
    html = html.replace('href="../terms.html', 'href="/terms.html')
    # 같은 폴더의 스크립트·스타일은 원본 폴더를 가리키게
    html = re.sub(r'(src|href)="(?!https?:|/|\.\./|#)([^"]+)"',
                  lambda m: '%s="/%s/%s"' % (m.group(1), calc, m.group(2)), html)
    return html


def build(calc, ui_path, dist):
    base_path = os.path.join(dist, calc, 'index.html')
    if not os.path.exists(base_path):
        print('  건너뜀 %s (없음)' % calc)
        return 0
    base = io.open(base_path, encoding='utf-8').read()
    I = read_i18n(ui_path)
    made = 0

    for lang in LANGS:
        t = I.get(lang)
        if not t:
            continue
        h = base

        # 언어 표시
        h = re.sub(r'<html lang="[^"]*"', '<html lang="%s"' % HTML_LANG[lang], h, count=1)

        # 제목·설명·정규주소
        if t.get('title'):
            h = re.sub(r'<title>.*?</title>',
                       '<title>%s</title>' % (t['title'] + ' · RYANG STUDIO'), h, count=1, flags=re.S)
        if t.get('seoIntro'):
            desc = strip_tags(t['seoIntro'])[:155]
            h = re.sub(r'(<meta name="description" content=")[^"]*(">)',
                       lambda m: m.group(1) + desc + m.group(2), h, count=1)
        h = re.sub(r'(<link rel="canonical" href=")[^"]*(">)',
                   lambda m: m.group(1) + url_of(calc, lang) + m.group(2), h, count=1)
        h = re.sub(r'(<meta property="og:url" content=")[^"]*(">)',
                   lambda m: m.group(1) + url_of(calc, lang) + m.group(2), h, count=1)
        h = re.sub(r'(<meta property="og:title" content=")[^"]*(">)',
                   lambda m: m.group(1) + t.get('title', '') + m.group(2), h, count=1)
        # 이 줄이 빠져 있어서 영어·일본어·중국어 페이지가 전부 ko_KR 이었습니다.
        h = re.sub(r'(<meta property="og:locale" content=")[^"]*(">)',
                   lambda m: m.group(1) + OG_LOCALE[lang] + m.group(2), h, count=1)

        # 언어 교차 링크
        h = h.replace('<link rel="canonical"', alt_links(calc, lang) + '\n  <link rel="canonical"', 1)

        # 화면 문구 — JS 없이도 읽히도록 미리 박습니다
        for eid, key in [('h-title', 'title'), ('h-sub', 'sub'), ('note', 'note'),
                         ('mailNote', 'mailNote'), ('creditNote', 'credit')]:
            if not t.get(key):
                continue
            h = re.sub(r'(id="' + eid + r'"[^>]*>).*?(</(?:div|span|h1|p)>)',
                       lambda m: m.group(1) + t[key] + m.group(2), h, count=1, flags=re.S)
        if t.get('footer'):
            h = re.sub(r'(<footer id="footer">).*?(</footer>)',
                       lambda m: m.group(1) + t['footer'] + m.group(2), h, count=1, flags=re.S)
        if t.get('seoIntro'):
            h = re.sub(r'<section class="seo-intro">.*?</section>',
                       '<section class="seo-intro">\n    <h2>%s</h2>\n    <p>%s</p>\n  </section>'
                       % (t.get('seoIntroH', ''), t['seoIntro']), h, count=1, flags=re.S)

        if lang == 'ko':
            # 한국어는 원래 자리에 그대로 씁니다 (주소를 옮기지 않습니다)
            io.open(base_path, 'w', encoding='utf-8', newline='\n').write(h)
            continue

        # 언어 사본은 경로가 한 단계 깊어집니다
        h = absolutize(h, calc)
        # 약관 링크 문구도 그 언어로. absolutize 뒤에 불러야 합니다 —
        # 그 전에는 주소가 아직 ../terms.html 이라 아래 치환이 빗나갑니다.
        h = localize_legal(h, lang)
        # 첫 화면부터 그 언어로 뜨게
        h = h.replace('<script src="/%s/' % calc,
                      "<script>var LANG='%s';</script>\n<script src=\"/%s/" % (lang, calc), 1)

        outdir = os.path.join(dist, lang, calc)
        os.makedirs(outdir, exist_ok=True)
        io.open(os.path.join(outdir, 'index.html'), 'w', encoding='utf-8', newline='\n').write(h)
        made += 1
    return made


def git_lastmod(paths, fallback):
    """그 페이지를 이루는 파일들이 마지막으로 커밋된 날짜(YYYY-MM-DD).

    예전에는 모든 주소에 빌드한 날짜를 넣었습니다. 그러면 글자 하나 안 고치고
    배포만 해도 "어제 전부 바뀌었다"고 알리는 셈이라, 구글은 그런 사이트의
    lastmod 를 아예 무시합니다. 실제로 고친 페이지만 새 날짜를 갖게 합니다.

    아직 커밋하지 않은 파일은 git 이 날짜를 모릅니다. 그때는 빌드 날짜를 씁니다
    (방금 고쳤다는 뜻이라 결과적으로 맞습니다)."""
    best = ''
    for p in paths:
        try:
            out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', p],
                                 capture_output=True, text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return fallback
        if out > best:
            best = out
    return best or fallback


def write_sitemap(dist, today):
    home = git_lastmod(['index.html', 'home-redesign.css', 'home-redesign.js'], today)
    rows = ['  <url><loc>%s/</loc><lastmod>%s</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>'
            % (SITE, home)]
    for calc, _ in CALCS:
        if calc in GATED:
            continue
        # 언어 사본은 한국어 원본에서 만들어지므로 같은 날짜를 씁니다.
        # assets/ 는 네 계산기가 함께 쓰는 자리라 넣지 않습니다 — 넣으면 공용
        # CSS 를 한 번 고칠 때마다 전 페이지가 동시에 바뀐 것으로 보입니다.
        mod = git_lastmod([calc], today)
        for lang in LANGS:
            rows.append('  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>weekly</changefreq><priority>%s</priority></url>'
                        % (url_of(calc, lang), mod, '0.9' if lang == 'ko' else '0.7'))
    io.open(os.path.join(dist, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + '\n'.join(rows) + '\n</urlset>\n')
    return len(rows)


if __name__ == '__main__':
    dist = sys.argv[1] if len(sys.argv) > 1 else 'dist'
    today = sys.argv[2] if len(sys.argv) > 2 else '2026-07-29'
    total = 0
    for calc, ui in CALCS:
        n = build(calc, ui, dist)
        total += n
        print('  %-8s 언어 사본 %d개' % (calc, n))
    n = write_sitemap(dist, today)
    print('  sitemap %d개 주소' % n)
