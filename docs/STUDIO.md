# 량 스튜디오 — 구조와 관리자 페이지 계획

여러 서비스를 한 도메인 아래로 모으면서 정리한 문서입니다.
새 서비스를 추가하거나 관리자 기능을 손볼 때 **먼저 이 문서를 읽고**, 바꾼 내용을 반영해 주세요.

- 최초 작성 2026-07-27
- 도메인 `ryangstudio.com` · 호스팅 Cloudflare Pages · 백엔드 Supabase

> `[구현]` 코드에 반영됨 · `[설계]` 결정됐으나 미구현 · `[검토]` 아직 결정 안 됨

---

## 1. 주소 구조

```
ryangstudio.com/            스튜디오 허브 (포트폴리오)
ryangstudio.com/gecko/      레오파드 게코 모프 계산기
ryangstudio.com/gecko/#admin  관리자
pygmytest.com/              피그미다람쥐 모프 테스트 (별도 도메인 유지)
```

### 왜 게코를 하위 경로에 두는가

**같은 출처(origin)라야 로그인이 한 번으로 통하기 때문입니다.**
Supabase 세션은 브라우저 저장소에 origin 단위로 저장됩니다.
`ryangstudio.com` 과 `art-lyang.github.io` 는 다른 origin 이라 세션이 공유되지 않습니다.
앞으로 추가할 도구도 **모두 `ryangstudio.com/<이름>/` 아래**에 두어야 계정이 하나로 유지됩니다.

### 피그미는 왜 옮기지 않는가

`pygmytest.com` 은 분양·사육 관련 검색 키워드로 SEO 자산이 쌓여 있습니다.
도메인을 옮기면 그 순위가 흔들립니다. 대신 허브에서 상호 링크만 겁니다.

**단, 피그미도 Supabase 는 같은 프로젝트를 쓸 수 있습니다.**
Supabase 는 API 호출이라 origin 제약이 없습니다.
즉 **로그인은 공유 못 해도 통계·회원 데이터는 한 곳에 모을 수 있습니다.**

---

## 2. 관리자 페이지 — 현재와 목표

### 지금 `[구현]`

게코 계산기 안에 있습니다 (`gecko/index.html` 의 `#admin`).
탭은 한눈에 · 회원 · 통계 · 코드 · 모프 · 콤보 6개이고, **전부 게코 기준**입니다.

| 탭 | 다루는 것 | 서비스 구분 |
|---|---|---|
| 한눈에 | 접속·회원·코드·브리딩 요약 | 없음 (게코 전용) |
| 회원 | profiles 목록·동의·CSV | 스튜디오 공용 (계정은 하나) |
| 통계 | visits, top_combos | 없음 (게코 전용) |
| 코드 | access_codes 발급·차단 | 게코 전용 |
| 모프·콤보 | morphs, combos | 게코 전용 |

### 문제

서비스가 늘면 **어느 서비스의 숫자인지 구분이 안 됩니다.**
지금 `visits` 테이블에는 어떤 사이트에서 온 접속인지 표시가 없습니다.

---

## 3. 해결 방향 `[설계]`

### 3.1 모든 로그에 `service` 값을 붙인다

가장 먼저 할 일입니다. 나중에 붙이면 **그 전 데이터는 영영 구분할 수 없습니다.**

```sql
alter table public.visits        add column if not exists service text default 'gecko';
alter table public.combo_queries add column if not exists service text default 'gecko';
```

각 서비스는 자기 이름을 함께 보냅니다.

| 값 | 서비스 |
|---|---|
| `gecko` | 레오파드 게코 모프 계산기 |
| `crested` | 크레스티드 모프 계산기 (준비 중) |
| `pygmy` | 피그미다람쥐 모프 테스트 |
| `studio` | 허브 페이지 |

`gecko-core.js` 에 `SERVICE_ID` 상수를 두고 `logVisit()` 에서 함께 전송합니다.

### 3.2 관리자 페이지를 허브로 옮긴다

게코 안에 있는 관리자는 게코가 사라지면 같이 사라집니다.
**`ryangstudio.com/admin/` 으로 분리**하고, 서비스별 탭을 두는 구조로 바꿉니다.

```
/admin/               한눈에 (전 서비스 통합)
/admin/#members       회원 (공용)
/admin/#gecko         게코 — 모프·콤보·코드·통계
/admin/#crested       크레스티드
/admin/#pygmy         피그미 — 통계만 (콘텐츠는 별도 저장소)
```

**주의** — 관리자 페이지를 옮겨도 `is_admin()` 기반 권한은 그대로 씁니다.
관리자 판정은 화면이 아니라 **DB 정책(RLS)** 에서 이뤄지므로,
페이지를 옮긴다고 보안이 약해지지 않습니다.

### 3.3 한눈에 탭 — 서비스별로 나눠 보여준다

```
전체
  오늘 접속 / 7일 / 누적          (service 무관 합계)
  전체 회원 / 신규 / 마케팅 동의   (공용)
서비스별
  🦎 게코    접속 · 등록 개체 · 프리미엄
  🐿 피그미  접속 · 테스트 완료 수
  🦎 크레스티드 …
```

---

## 4. 피그미를 관리자에 붙이려면 `[설계]`

지금 피그미는 GA4 만 씁니다. 관리자에서 보려면 **Supabase 로도 함께 기록**해야 합니다.

1. `pygmytest.com` 의 `index.html` 에 Supabase 클라이언트 추가
2. 테스트 시작·완료 시 `visits` / 결과 로그를 `service='pygmy'` 로 전송
3. 관리자 [피그미] 탭에서 조회

**주의할 것** — 피그미는 로그인이 없으므로 개인 식별 정보를 보내면 안 됩니다.
기기 식별값과 결과 모프 정도만 남기고, 개인정보처리방침에도 반영해야 합니다.

> GA4 를 그대로 두고 관리자에서는 안 보는 선택지도 있습니다.
> 지금 규모에서는 GA4 만으로 충분할 수 있으니, 굳이 서두를 필요는 없습니다. `[검토]`

---

## 5. 이전 시 함께 바꿔야 하는 것 `[중요]`

도메인이 바뀌면 **인증이 먼저 깨집니다.** 배포 전에 반드시 처리하세요.

| 위치 | 바꿀 내용 |
|---|---|
| Supabase → Authentication → URL Configuration | **Site URL** 을 `https://ryangstudio.com/gecko/` 로 |
| 같은 화면 → Redirect URLs | `https://ryangstudio.com/**` 추가 |
| Google Cloud Console → 사용자 인증 정보 | **승인된 자바스크립트 원본** 에 `https://ryangstudio.com` 추가 |
| Google — 승인된 리디렉션 URI | **그대로 둡니다.** Supabase 콜백 주소라 도메인과 무관합니다 |

기존 `art-lyang.github.io` 항목은 **당장 지우지 마세요.**
옛 주소로 들어오는 사용자가 남아 있을 수 있으니, 한동안 둘 다 열어두는 편이 안전합니다.

### 이미 반영한 것 `[구현]`

- 결과 이미지 워터마크 `art-lyang.github.io/REPTILE` → `ryangstudio.com/gecko`
- 허브·사이트맵의 링크를 `/gecko/` 로
- `_redirects` 로 `/REPTILE/*` → `/gecko/*` 301 (옛 경로 링크 대비)

---

## 6. 배포 방법 (Cloudflare Pages)

깃 없이 **폴더를 끌어다 놓는 방식**입니다.

```
ryangstudio-deploy/
  index.html          허브
  robots.txt  sitemap.xml  ads.txt  _redirects
  gecko/
    index.html  gecko-core.js  breeding.html  login.html  terms.html
    crested.html  crested-core.js
```

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages → **Upload assets**
2. `ryangstudio-deploy` 폴더를 드래그
3. Custom domains 에서 `ryangstudio.com` 연결 (네임서버를 Cloudflare 로 옮기면 자동 설정)

수정할 때마다 같은 방식으로 다시 올리면 됩니다.
나중에 자동 배포가 필요하면 GitHub 저장소를 연결하는 방식으로 바꿀 수 있습니다.

> `CNAME` 파일은 GitHub Pages 전용이라 이 폴더에는 넣지 않았습니다.

---

## 7. 작업 순서 제안

1. **Cloudflare Pages 에 올리고 도메인 연결** — 먼저 떠야 나머지를 확인할 수 있음
2. **Supabase · Google OAuth 주소 갱신** (5장) — 안 하면 로그인이 안 됨
3. **`service` 컬럼 추가** (3.1) — 늦을수록 손해
4. 관리자 페이지를 `/admin/` 으로 분리 (3.2)
5. 한눈에 탭을 서비스별로 분리 (3.3)
6. 크레스티드 계산기 완성 후 허브에 추가
7. 피그미 Supabase 연동 여부 결정 (4장)

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-27 | 최초 작성. 주소 구조 확정, 관리자 확장 계획, 이전 체크리스트 |

---

## 접속 통계 · 방문자 종류 (2026-07-28)

### 파일 구성
- `assets/studio-config.js` — Supabase 접속 정보. 예전에는 `gecko/gecko-core.js`
  안에만 있어서 그 파일을 읽지 않는 크레스티드는 접속 기록을 남기지 못했습니다.
- `assets/analytics.js` — 접속·조합 기록과 사람/수집기 판별. 두 계산기가 공용.
- `crested/crested-app.js` — 크레스티드의 백엔드 연결. `calculate()` 를 감싸서
  계산 결과는 그대로 두고 기록만 덧붙입니다.

새 도구를 추가할 때: `studio-config.js` → 코어에서 `SERVICE_ID` 정의 →
`analytics.js` 순서로 읽히게 하고, `STUDIO_SERVICES` 에 이름을 등록하면
관리자 화면의 도구 선택에 자동으로 나타납니다.

### 방문자 종류 판별의 한계 ⚠️
`analytics.js` 는 브라우저에서 도는 코드입니다. **JS 를 실행하지 않는 수집기는
이 코드까지 오지 않으므로 아예 집계되지 않습니다.** GPTBot·Googlebot 대부분이
여기 해당합니다. 지금 잡히는 것은 헤드리스 브라우저로 JS 까지 실행하는 수집기와
User-Agent 를 감추지 않는 자동화 도구뿐입니다.

전부 세려면 Cloudflare Worker 에서 요청을 받을 때 기록해야 합니다. 지금은 정적
자산만 있는 Worker 라 `fetch` 핸들러가 없고, 이를 추가하면 배포 구조가 바뀝니다.
필요해지면 그때 작업합니다.

### 크레스티드 모프 관리 (supabase_v4.sql)

표가 넷입니다. 레오파드의 `morphs` 하나로 안 되는 이유:

| 표 | 쓰임 |
|---|---|
| `cr_genes` | 유전자. 이름 4개 언어, 슈퍼폼·헷 이름, 검증 수준, 색, 사진 |
| `cr_genos` | 유전형별 이름. **카푸치노·세이블이 같은 자리**라 nn/Cn/Sn/CC/SS/CS 여섯 가지에 각각 이름이 붙습니다(루왁 등). 레오파드에는 없는 구조입니다 |
| `cr_traits` | 라인브리딩 형질. 확률 계산 대상이 아니고 그룹으로 묶여 표시만 됨 |
| `cr_combos` | 여러 유전자가 만나야 생기는 이름 (프라푸치노 등) |

**유전 구조는 DB 에 두지 않았습니다.** 대립유전자 목록이나 계산 규칙을 화면에서
잘못 고치면 확률이 조용히 틀리는데, 그건 쓰는 사람이 알아챌 수 없는 오류입니다.
구조를 바꾸려면 `crested-core.js` 를 고쳐 배포하세요. 관리자에서 고치는 것은
이름·색·사진·표시 순서·노출 여부입니다.

표가 비어 있으면 계산기는 내장 데이터를 그대로 씁니다. 관리자의
**현재 앱 목록 가져오기**를 눌러야 내장 값이 DB 로 들어갑니다.

#### 관리자에서 crested-core.js 를 왜 fetch 로 읽나
`gecko-core.js` 와 `crested-core.js` 가 둘 다 최상위에서 `const SERVICE_ID` 를
선언합니다. `<script>` 로 같이 두면 *Identifier 'SERVICE_ID' has already been
declared* 로 페이지 전체가 죽습니다. 그래서 `admin-crested.js` 는 파일을
텍스트로 받아 함수 안에서 실행하고 필요한 값만 꺼냅니다.

### 아직 안 된 것
- 크레스티드 유전자를 관리자에서 **새로 추가**하면 구조 필드가 없어 가장 흔한
  형태(bi · incdom)로 잡힙니다. 열성이나 3중 대립인자를 추가하려면
  `crested-core.js` 를 고쳐야 합니다.
