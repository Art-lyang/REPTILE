#!/usr/bin/env bash
# 배포용 dist/ 를 만듭니다.  사용법:  ./build.sh   그다음  npx wrangler deploy
#
# 저장소 루트에는 사이트 파일 말고도 DB 스키마(supabase_*.sql)와 설계 문서(docs/)가
# 함께 있습니다. 루트를 그대로 배포하면 그것들이 전부 공개됩니다.
# wrangler 의 .assetsignore 로 걸러보려 했지만 4.114 에서 무시돼서(508개가 그대로
# 잡힘) 아예 올릴 것만 담은 디렉터리를 따로 만듭니다.
#
# 목록의 출처는 git 입니다. 디스크를 훑지 않기 때문에 _v2/_v5 같은 작업용 스냅샷이나
# .wrangler 임시 폴더가 섞여 들어갈 일이 없습니다.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist

# core.quotepath=false: 한글 파일명이 "\355\201..." 처럼 따옴표로 감싸여 나오면
# 아래 case 필터를 그냥 통과해 버립니다.
git -c core.quotepath=false ls-files -z | while IFS= read -r -d '' f; do
  case "$f" in
    docs/*|README*|supabase_*|구글로그인*|build.sh|wrangler.jsonc|.assetsignore|tools/*) continue ;;
    # 개발용 설정(로컬 미리보기 서버 등). 사이트 파일이 아니고, 올려두면
    # 우리가 어떤 도구로 작업하는지만 드러납니다.
    .claude/*) continue ;;
    # UI 확인용 하네스. 가짜 백엔드를 물려 화면만 그려보는 파일이라
    # 실제 사이트에 올라가면 안 됩니다. (care/_harness.html)
    */_harness*.html) continue ;;
    # 작업용으로 주고받은 압축본. 안은 이미 풀어서 반영했고, 그대로 두면
    # 누구나 내려받을 수 있는 자리에 옛날 소스가 한 벌 더 남습니다.
    *.zip) continue ;;
  esac
  mkdir -p "dist/$(dirname "$f")"
  cp "$f" "dist/$f"
done

# 언어별 정적 페이지(/en/gecko/ 등)와 sitemap 을 여기서 만듭니다.
# 저장소에는 한국어 원본만 두고, 사본은 배포할 때만 생성합니다.
python3 tools/build_langs.py dist "$(date +%Y-%m-%d)"

echo "dist/ 생성 완료 — $(find dist -type f | wc -l)개 파일"
