# 라인브리딩·크로스 목표 역산 MVP 구현 계획

## TL;DR

> **목표**: 레오파드게코 브리딩 관리의 기존 `목표 역산`에 `라인 고정`과 `두 라인 크로스`를 추가해, 보유 개체 중 부모 후보·혈통 주의·새끼 선발 기준·다음 세대 조건을 안내하고 프로젝트로 저장한다.
>
> **핵심 원칙**: 멘델 유전 확률과 라인브리딩 선발 계획을 분리한다. 라인 형질에는 확률이나 가짜 고정률을 표시하지 않는다.
>
> **산출물**:
> - 형질별 1~5 수동 평가와 레거시 `color_grade` 호환
> - 다종 확장형 순수 플래너 엔진과 레오파드 어댑터
> - 인증 사용자 전용 브리딩 프로젝트 저장소 및 페어링 연결
> - `유전 모프 / 라인브리딩·크로스` 목표 UI, ko/en/zh/ja 문구
> - 3세대 관계 경고와 조건부 3단계 로드맵
> - 단위·스키마·보안·브라우저·모바일 회귀검사
>
> **예상 규모**: Large
> **병렬 실행**: 가능 — 기반 계약 확정 후 엔진과 DB 작업을 분리할 수 있음
> **핵심 경로**: 계약 테스트 → DB/엔진 → 개체 평가 → 목표 UI → 실제 페어링/새끼 연동 → 전체 QA/배포

## Context

### 요청 배경

- 특정 색상이나 형질을 강화·고정하려는 라인브리딩, 두 방향을 섞어 크로스 개체를 만드는 계획을 기존 역산 기능과 연결한다.
- 공개 모프 계산기는 계산기 역할만 유지하고, 장기 계획은 크리처 케어로그/브리딩 관리에서 다룬다.
- 레오파드게코로 먼저 완성하되 크레스티드·팻테일 등으로 확장 가능한 구조를 만든다.
- I18n, 향후 계정·카카오 로그인·유료 기능을 방해하지 않는 데이터 경계를 유지한다.

### 현재 구현 상태

- `care/breeding-spec.js:57-88`에 gecko/crested/fattail/ballpython 종 어댑터가 있고, `care/breeding-spec.js:182-184`는 라인 형질을 `[id, 이름, 그룹]`으로 제공한다.
- 기존 역산은 `care/breeding-spec.js:186-205`, `care/breeding-ui.js:441-545`처럼 대립유전자 보유 여부만 검사한다. 실제 가능한 암수 조합, 라인 형질 강도, 혈통은 평가하지 않는다.
- 레오파드 라인 형질과 계열은 `gecko/gecko-core.js:130-174`, 크로스 명칭은 `gecko/gecko-core.js:319-347`, 같은 계열의 다른 라인을 섞을 때 라인명이 풀리는 규칙은 `gecko/gecko-core.js:624-647`에 이미 있다.
- 개체는 `supabase_setup.sql:87-98`의 `morphs`, `color_grade`, `parent_a`, `parent_b`를 갖지만 `color_grade`는 여러 라인 형질 중 무엇의 평가인지 구분하지 못한다.
- 계산 기록 비교는 `assets/pairing-compare-metrics.js:25-51`의 확률 기반 도구다. 라인 플래너를 여기에 섞으면 비확률 형질이 확률처럼 보일 수 있다.
- 계산기 전달 계약인 `assets/breeding-draft.js:73-105`는 허용 필드만 보존하므로 장기 프로젝트 저장소로 확장하지 않는다.
- 혈통 그래프와 순환/중복 방지는 `care/care-core.js:726-790`에 있으며, 새 플래너는 같은 부모 링크를 사용해 두 후보 사이의 공통 조상을 별도로 판정한다.
- 브리딩 분석의 다국어 패턴은 `assets/breeding-workspace-i18n.js:4-69`, 브라우저 가짜 백엔드는 `care/_harness-breed.html:1-94`에 있다.
- 최신 마이그레이션은 `supabase_v30.sql`; 새 DB 변경은 `supabase_v31.sql`로 추가하고 `supabase_setup.sql`과 동기화한다.

### 확정한 MVP 경계

- 활성 종: 레오파드게코(`gecko`)만. 다른 종은 같은 어댑터 계약을 통과하되 번역된 `준비 중` 상태를 표시한다.
- 목표 유형:
  - `line_fix`: 한 라인 형질을 강화·선발
  - `cross`: 두 라인 형질을 가진 부모 방향을 조합
- 별도 `gene_intro` 모드는 제외한다. 유전 모프는 기존 `goalCheck`와 계산기로 계속 처리한다.
- 후보 출처: 선택한 종의 내 등록 개체만. 계산 기록 텍스트나 외부 마켓 개체는 후보로 사용하지 않는다.
- 평가: 라인 형질별 사용자가 입력한 1~5 점수. 숫자는 관찰 기록이며 유전 확률이 아니다.
- 관계 경고: 등록 혈통 기준 최대 3세대. 직계, 동일 부모, 공통 조부모를 구분하되 정확한 근친계수는 주장하지 않는다.
- 로드맵: `기초 페어링 → 새끼 선발 기준 → 실제 새끼 등록 후 다음 분기`까지만 제공한다. 특정 F세대에서 고정된다고 약속하지 않는다.
- 저장: 계산 기록이 아닌 별도 `breeding_projects`에 목표를 저장하고 실제 `pairings`를 연결한다.

## 목표와 비목표

### 기능 목표

1. 기존 목표 화면에서 `유전 모프`와 `라인브리딩·크로스`를 명확히 전환한다.
2. 라인 목표를 만들고, 등록 개체 중 조건에 맞는 암수 후보를 결정적인 순서로 추천한다.
3. 후보마다 형질 보유, 형질별 평가, 성별, 정보 누락, 3세대 관계 주의를 근거로 보여준다.
4. 추천 결과를 실제 페어링으로 저장하고 프로젝트의 첫 단계에 연결한다.
5. 해당 부모 조합에서 태어난 개체가 `parent_a/parent_b`로 등록되면 선발 후보로 다시 분석한다.
6. 레오파드의 멜라니스틱 × 탠저린은 `멜라텐져린`, 만다린 × 탠저린은 기본 탠저린 방향과 `라인 리셋` 주의를 표시한다.

### 비기능 목표

- 새 기능 문구는 ko/en/zh/ja를 동시에 제공한다.
- 사용자 입력은 텍스트 렌더링 전 이스케이프하고, JSON 크기·키·값 범위를 브라우저와 DB 양쪽에서 제한한다.
- 프로젝트는 본인만 읽고 쓸 수 있으며 다른 사용자의 프로젝트를 페어링에 연결할 수 없다.
- 모바일 360px 이상에서 가로 스크롤 없이 사용 가능하고, 탭/버튼은 키보드·스크린리더 상태를 가진다.
- 기존 공개 계산기, 계산 기록, 확률 비교 기능은 동작과 배치가 바뀌지 않는다.

### 명시적 비목표

- 사진을 이용한 자동 형질 판독 또는 자동 점수화
- 정밀 근친계수/COI 계산
- 외부 개체·마켓 후보 등록
- 결과 라인의 발현 확률 또는 고정 확률 계산
- 무제한 F2/F3 자동 시뮬레이션
- 이번 작업에서 크레스티드·팻테일 규칙 구현
- 결제, 카카오 로그인, 공개 계산기 화면 변경

## 설계 계약

### 1. 역할 분리

| 영역 | 책임 | 금지 사항 |
|---|---|---|
| 기존 `BreedSpec.goalCheck` | 멘델 유전 목표의 보유 대립유전자 확인 | 라인 형질 점수·혈통 추천을 계산하지 않음 |
| 새 `LineBreedingPlanner` | 라인 목표, 후보 조합, 관계 경고, 조건부 로드맵 | 결과 확률 또는 고정률을 만들지 않음 |
| `BreedingDraft` | 공개 계산기에서 브리딩 관리로 보내는 계산 스냅샷 | 프로젝트 상태를 저장하지 않음 |
| `PairingCompareMetrics` | 계산 결과의 비주얼/보인자 확률 비교 | 폴리제닉 평가 점수를 확률로 변환하지 않음 |
| `breeding_projects` | 장기 목표와 진행 상태 저장 | 계산 기록 전체를 복제하지 않음 |

### 2. 개체별 라인 평가 계약

- `animals.line_trait_scores jsonb not null default '{}'`
- 저장 예: `{ "blacknight": 4, "tangerine": 3 }`
- 서버 제한:
  - JSON object만 허용
  - 최대 32개 키, 전체 4KB 이하
  - 키는 소문자 영숫자·`_`·`-`, 최대 64자
  - 값은 정수 1~5
- `color_grade`는 삭제하지 않는다. `line_trait_scores`가 비어 있고 선택 라인 형질이 정확히 하나일 때만 화면에서 레거시 보조값으로 읽고, 다음 저장 때 해당 형질 키로 명시적으로 기록한다.

### 3. 프로젝트 계약

`breeding_projects`는 인증 사용자 전용 테이블로 둔다.

- 주요 칼럼: `id`, `user_id`, `species`, `name`, `target jsonb`, `status`, `created_at`, `updated_at`
- `status`: `draft | active | complete | archived`
- `target` v1 예:

```json
{
  "version": 1,
  "mode": "cross",
  "traits": [
    { "id": "blacknight", "targetScore": 4 },
    { "id": "tangerine", "targetScore": 4 }
  ]
}
```

- `line_fix`는 trait 1개, `cross`는 중복되지 않은 trait 2개만 허용한다.
- 프로젝트는 계산된 후보 목록을 저장하지 않는다. 최신 개체·혈통·평가를 읽어 다시 계산한다.
- 수정은 `updated_at` 조건을 함께 보내 충돌 시 덮어쓰지 않고 새로고침을 안내한다.
- `pairings`에는 nullable `project_id`와 `project_step`(1~3)을 추가한다. 프로젝트 삭제 시 페어링 기록은 보존하고 링크만 `set null` 처리한다.
- DB 트리거는 페어링과 프로젝트의 `user_id/species`가 같을 때만 연결을 허용한다.

### 4. 플래너 출력 계약

- 표시 상태: `ready | review | insufficient`
- 내부 정렬은 결정적이어야 하지만 사용자에게 백분율 점수를 노출하지 않는다.
- 후보 조합마다 다음을 반환한다.
  - 부모 A/B id
  - 목표 라인 보유·평가 근거
  - 성별 적합/미확인
  - 관계 경고와 발견된 공통 조상
  - 누락 정보
  - 레오파드 라인 결과 이름/라인 리셋 주의
- 로드맵은 세 단계의 조건문으로 반환한다.
  1. 현재 등록 개체로 가능한 기초 페어링
  2. 태어난 개체에서 기록해야 할 목표 형질과 최소 사용자 평가
  3. 실제 선발 개체가 있으면 같은 방향 강화·우선 라인 백크로스·새 후보 확보 중 하나를 안내

## 검증 전략

### TDD 원칙

각 작업은 다음 순서로 진행한다.

1. 실패하는 Node 테스트 또는 브라우저 하네스 시나리오를 먼저 추가한다.
2. 해당 작업 범위만 구현해 테스트를 통과시킨다.
3. 관련 기존 회귀검사와 전체 `tests/*.test.js`를 실행한다.
4. UI 작업은 390×844 모바일과 1440×900 데스크톱에서 실제 렌더링을 확인한다.

### 핵심 검증 명령

```bash
node --test tests/linebreeding-planner.test.js
node --test tests/breeding-projects-schema.test.js
node --test tests/breeding-goal-ui.test.js
node --test tests/*.test.js
bash build.sh
npx wrangler deploy --dry-run
```

### 반드시 통과할 대표 시나리오

- 블랙나이트 4점 수컷 + 블랙나이트 5점 암컷: `line_fix` 추천 가능, 확률 문구 없음.
- 블랙나이트 + 탠저린: `cross` 결과가 멜라텐져린 방향으로 표시됨.
- 만다린 + 탠저린: 만다린 고정으로 단정하지 않고 기본 탠저린 방향과 라인 리셋 주의 표시.
- 목표 형질은 있으나 점수가 없음: 후보를 숨기지 않고 `평가 필요`로 표시.
- 동일 개체/동성 확정 조합: 추천 제외. 성별 미확인은 `검토 필요`로 유지.
- 동일 부모 또는 공통 조부모: 관계 주의 표시, 정확한 COI 백분율은 없음.
- 다른 계정 프로젝트 id를 페어링에 넣기: DB에서 거부.
- 잘못된 target JSON, 33개 점수, 1~5 밖 값, HTML 입력: 브라우저/DB 경계에서 거부 또는 안전한 텍스트로 표시.
- crested/fattail/ballpython: 오류 없이 번역된 준비 중 상태.
- 공개 gecko 계산기: 플래너 UI/프로젝트 스크립트가 추가되지 않음.

## 실행 웨이브

### Wave 1 — 계약 고정

- Task 1: 실패 테스트와 종·데이터·출력 계약 확정

### Wave 2 — 병렬 기반 구현

- Task 2: 순수 플래너 엔진과 레오파드 어댑터
- Task 3: Supabase v31 프로젝트/점수/보안 스키마

### Wave 3 — 사용자 데이터와 UI

- Task 4: 개체 형질별 평가 입력·저장
- Task 5: 목표 탭의 프로젝트 UI와 I18n

### Wave 4 — 실제 브리딩 흐름 연결

- Task 6: 추천 페어링 저장, 새끼 선발, 다음 단계 갱신

### Wave 5 — 통합 검증과 배포

- Task 7: 보안·회귀·접근성·모바일 QA
- Task 8: Supabase 적용, 프로덕션 빌드·Cloudflare 배포·라이브 스모크

## 의존성 표

| Task | 선행 작업 | 후속 차단 |
|---|---|---|
| 1 | 없음 | 2, 3, 4, 5, 6 |
| 2 | 1 | 5, 6 |
| 3 | 1 | 4, 5, 6, 8 |
| 4 | 1, 3 | 5, 6 |
| 5 | 1, 2, 3, 4 | 6, 7 |
| 6 | 2, 3, 4, 5 | 7, 8 |
| 7 | 5, 6 | 8 |
| 8 | 3, 6, 7 | 완료 |

## TODO

### Task 1. 테스트 우선으로 계약과 경계를 고정

**작업 파일**

- 새 파일: `tests/linebreeding-planner.test.js`
- 새 파일: `tests/breeding-projects-schema.test.js`
- 새 파일: `tests/breeding-goal-ui.test.js`
- 참고: `tests/breeding-handoff.test.js:29-57`
- 참고: `tests/planning-tools-relocation.test.js:70-98`
- 참고: `care/_harness-breed.html:1-94`

**구현 내용**

- 최소 fixture를 `animals`, `project`, `pairings`의 실제 칼럼명으로 작성한다.
- `line_fix`, 서로 다른 계열 cross, 같은 계열 cross/라인 리셋, 미평가, 성별 미확인, 친족 관계, 순환 혈통을 Given/When/Then 테스트로 먼저 고정한다.
- `BreedingDraft`와 `PairingCompareMetrics`가 새 프로젝트 책임을 떠안지 않는 회귀검사를 추가한다.
- 공개 `gecko/index.html`에 목표 플래너 파일이 포함되지 않는지 검사한다.
- 새 문구 모듈에 ko/en/zh/ja 키 집합이 동일한지 검사한다.

**완료 조건**

- 새 테스트가 구현 전 의도한 이유로 실패한다.
- 테스트 fixture가 확률 필드를 요구하지 않는다.
- 다른 종의 미지원 상태도 계약에 포함된다.

**QA 시나리오**

- Given 두 블랙나이트 후보, When line_fix를 분석, Then 평가·혈통 근거를 가진 추천 결과 계약이 요구된다.
- Given 계산기 전달 스냅샷, When 새 계약 테스트를 실행, Then 기존 version 1 sanitizer 동작은 그대로 유지된다.

**커밋**: `test: define line-breeding planner contracts`

### Task 2. 다종 확장형 순수 플래너 엔진과 레오파드 규칙 구현

**작업 파일**

- 새 파일: `assets/linebreeding-planner.js`
- 수정: `care/breeding-spec.js:57-88`, `care/breeding-spec.js:181-184`
- 필요 시 최소 수정: `gecko/gecko-core.js:319-347`, `gecko/gecko-core.js:624-647`
- 테스트: `tests/linebreeding-planner.test.js`

**구현 내용**

- DOM/Supabase에 의존하지 않는 `sanitizeTarget`, `candidatePairs`, `relationshipWarnings`, `roadmap` API를 만든다.
- 어댑터 계약에 `linePlanning.supported`, trait metadata, group lookup, localized line outcome/line-reset warning을 추가한다.
- 레오파드는 기존 `POLY`, `polyLineOf`, `matchPolyCombo`의 의미를 재사용한다. 크로스 명칭 규칙을 새 파일에 복제하지 않는다.
- 후보 필터:
  - 같은 개체를 양쪽에 쓰지 않음
  - 확정 동성 조합 제외
  - 성별 미확인은 review
  - 목표 형질 미보유는 insufficient
- 정렬 우선순위는 `성별 확정 → 목표 형질 충족 → 형질별 평가 충족 → 관계 경고 적음 → 안정된 id 순`으로 고정한다.
- 관계 탐색은 양쪽 조상을 각각 최대 3세대 방문하고, 순환을 끊으며 직계/동일 부모/공통 조부모를 구분한다.
- 사용자 출력에는 내부 정렬값을 내보내지 않고 상태와 이유만 반환한다.

**완료 조건**

- 핵심 fixture 결과가 입력 순서와 무관하게 동일하다.
- 멜라텐져린과 같은 계열 라인 리셋 결과가 기존 코어 규칙과 일치한다.
- 어떤 반환값에도 `probability`, `fixedPercent`, `inbreedingCoefficient`가 없다.
- 미지원 종은 예외가 아니라 `supported:false` 계약을 반환한다.

**QA 시나리오**

- Given blacknight/tangerine 후보, When cross 분석, Then 멜라텐져린 방향과 두 형질 선발 기준이 반환된다.
- Given mandarin/tangerine 후보, When cross 분석, Then Mandarin 고정이라고 표시하지 않고 line reset 이유가 반환된다.
- Given 조상 순환 데이터, When 관계 분석, Then 무한 반복 없이 review 경고가 반환된다.

**커밋**: `feat: add species-aware line-breeding planner`

### Task 3. Supabase v31 스키마와 소유권 경계 구현

**작업 파일**

- 새 파일: `supabase_v31.sql`
- 수정: `supabase_setup.sql:87-130`, 최종 RLS/RPC/회원탈퇴 정의 구간
- 수정: `docs/STUDIO.md:299-307` 및 마이그레이션 표
- 테스트: `tests/breeding-projects-schema.test.js`
- 참고: `supabase_v19.sql:107-172`
- 참고: `supabase_v24.sql:62-119`
- 참고: `supabase_v28.sql:19-59`
- 참고: `supabase_v30.sql:8-96`

**구현 내용**

- `animals.line_trait_scores`와 구조 검증 함수를 추가한다. 함수 권한은 public/anon/authenticated에서 회수한다.
- `breeding_projects`를 만들고 `user_id = auth.uid()` RLS, authenticated CRUD grant, anon/public revoke를 명시한다.
- `target`의 version/mode/trait 수/중복/키/점수/전체 크기와 name/status/species를 DB에서 제한한다.
- `updated_at` 자동 갱신 트리거를 둔다.
- `pairings.project_id` FK(`on delete set null`)와 `project_step 1..3`을 추가한다.
- 페어링 연결 전 프로젝트와 페어링의 user/species가 일치하는지 검증하는 트리거를 둔다.
- 회원 탈퇴 함수에 `breeding_projects` 삭제를 포함하고 기존 사진·먹이·개체 삭제를 누락하지 않는다.
- 새 프로젝트는 로그인 전 device 이전 대상에 포함하지 않는다. 현재 가입 잠금과 향후 Supabase/Kakao 인증 모두 `auth.uid()` 한 경계로 처리한다.
- `supabase_setup.sql` fresh install 결과가 v1~v31 순차 적용 결과와 같게 동기화한다.

**완료 조건**

- anon은 프로젝트 테이블과 RPC를 읽고 쓸 수 없다.
- 인증 사용자 A가 사용자 B의 프로젝트를 읽거나 수정하거나 자기 페어링에 연결할 수 없다.
- 잘못된 `line_trait_scores`와 target JSON이 DB check/trigger에서 거부된다.
- 프로젝트 삭제 후 페어링은 남고 project 링크만 null이다.
- 회원 탈퇴 후 해당 사용자의 프로젝트가 남지 않는다.

**QA 시나리오**

- Given user A/B, When A가 B project id로 pairing을 저장, Then 트랜잭션이 거부된다.
- Given active project, When 동일 updated_at으로 한 번 수정 후 오래된 값으로 재수정, Then 클라이언트가 충돌로 처리할 수 있다.
- Given line_trait_scores 33개 또는 6점, When 저장, Then DB가 거부한다.

**커밋**: `feat: add secure breeding project schema`

### Task 4. 개체 편집에 형질별 평가를 추가

**작업 파일**

- 수정: `care/breeding-ui.js:181-255`
- 수정: `care/care-app.js:157-173` 부근 데이터 API
- 수정: `care/breeding.html` 스크립트 의존성
- 테스트: `tests/breeding-goal-ui.test.js`
- 하네스: `care/_harness-breed.html`

**구현 내용**

- 체크한 라인 형질마다 1~5 선택 또는 `미평가`를 표시한다.
- 형질 체크를 끄면 해당 점수도 저장 payload에서 제거한다.
- 여러 형질은 각각 독립 점수를 저장한다. 기존 단일 `color_grade` 입력은 새 UI에서 숨기되 DB 칼럼은 유지한다.
- 레거시 행은 선택 라인 형질이 정확히 하나이고 새 점수가 없을 때만 `color_grade`를 초기 표시값으로 사용한다.
- 설명 문구에 `사용자 관찰값`, `유전 확률 아님`을 명시한다.
- 저장 payload는 허용 trait id와 1~5 정수만 포함하도록 정규화한다.

**완료 조건**

- blacknight 4, tangerine 2처럼 한 개체에 둘 이상의 평가를 저장·재조회할 수 있다.
- 선택하지 않은 trait의 과거 점수가 조용히 남지 않는다.
- 레거시 단일 평가가 데이터 손실 없이 새 구조로 전환된다.
- 모바일에서 라벨·선택창이 카드 밖으로 넘치지 않는다.

**QA 시나리오**

- Given color_grade=4와 blacknight 하나인 레거시 개체, When 편집을 열어 저장, Then `line_trait_scores.blacknight=4`가 저장된다.
- Given 두 라인 trait, When 각기 다른 점수를 입력, Then 재진입 시 각각 유지된다.

**커밋**: `feat: record per-trait line assessments`

### Task 5. 목표 탭 프로젝트 UI와 I18n 구현

**작업 파일**

- 새 파일: `care/breeding-goal-ui.js`
- 새 파일: `assets/breeding-goal-i18n.js`
- 새 파일: `assets/breeding-project-contract.js`
- 수정: `care/breeding-ui.js:441-545`, `care/breeding-ui.js:553-565`
- 수정: `care/care-app.js`에 project list/create/update/delete API
- 수정: `care/breeding.html`
- 테스트: `tests/breeding-goal-ui.test.js`
- 하네스: `care/_harness-breed.html`

**구현 내용**

- 기존 목표 탭 상단에 접근 가능한 세그먼트 탭 `유전 모프 / 라인브리딩·크로스`를 둔다.
- 기존 `tabGoal/runGoal`은 유전 모프 패널로 동작을 유지하고 새 파일에 대규모 UI를 분리한다.
- 프로젝트 생성 폼:
  - 이름
  - `라인 고정` 또는 `두 라인 크로스`
  - 종 어댑터가 제공한 라인 trait 1개 또는 2개
  - trait별 목표 평가 1~5
- 결과 카드:
  - 추천 가능/검토 필요/정보 부족
  - 부모 후보와 근거
  - 관계 주의 및 누락 정보
  - 결과 라인 방향과 조건부 3단계 로드맵
- 프로젝트 목록은 draft/active/complete/archived 상태와 updated_at을 표시한다.
- 저장 계약은 별도 sanitizer로 target version/문자열/배열/크기를 제한하고 모든 표시값을 이스케이프한다.
- 새 문자열은 ko/en/zh/ja 키를 같은 구조로 제공한다. 새 UI 파일에 사용자용 한국어 하드코딩을 남기지 않는다.
- crested/fattail/ballpython은 같은 UI 입구에서 번역된 준비 중 설명만 보여준다.

**완료 조건**

- 기존 유전 역산 결과와 클릭 동작이 바뀌지 않는다.
- 새 프로젝트를 저장하고 새로고침한 뒤 다시 열 수 있다.
- 오래된 updated_at 충돌은 덮어쓰기 대신 번역된 재로딩 안내를 표시한다.
- 360px 폭에서 후보 카드와 로드맵이 한 열로 정리되고 가로 스크롤이 없다.
- 탭은 `role=tab`, `aria-selected`, 키보드 포커스를 갖고 결과 갱신은 live region으로 알린다.

**QA 시나리오**

- Given 등록된 레오파드 개체, When line_fix 프로젝트를 만들고 분석, Then 후보와 3단계 안내가 한 화면에 나온다.
- Given crested URL, When 라인 플래너 탭을 선택, Then 오류나 빈 화면 대신 준비 중 상태가 나온다.
- Given `<img onerror>`가 포함된 프로젝트명, When 렌더, Then 코드가 실행되지 않고 텍스트로 보인다.

**커밋**: `feat: add localized line-breeding goal workspace`

### Task 6. 추천 결과를 실제 페어링·새끼·다음 단계에 연결

**작업 파일**

- 수정: `care/breeding-ui.js:273-315`, 저장/삭제 이벤트 구간
- 수정: `care/breeding-goal-ui.js`
- 수정: `assets/linebreeding-planner.js`
- 수정: `care/care-app.js`
- 테스트: `tests/linebreeding-planner.test.js`, `tests/breeding-goal-ui.test.js`

**구현 내용**

- 추천 카드의 `페어링으로 저장`은 male/female, species, project_id, project_step=1을 채운 기존 페어링 폼을 연다.
- 저장된 페어링 카드는 연결된 프로젝트/단계를 표시하고 프로젝트 상세로 돌아갈 수 있다.
- 프로젝트의 실제 새끼 후보는 `parent_a/parent_b`가 연결 페어링의 두 부모와 일치하는 등록 개체로 계산한다. 부모 순서는 무관하게 처리한다.
- 새끼가 아직 없으면 `부화/등록 대기`, 있으면 목표 형질·점수 누락과 선발 후보를 표시한다.
- 선발 후보가 있으면 다음 조건을 안내한다.
  - line_fix: 같은 목표 방향 강화 후보를 찾되 관계 경고 우선 확인
  - cross: 두 형질 유지 개체 선발 후 어느 방향을 우선할지 사용자에게 선택지를 설명
- 개체/페어링/프로젝트가 삭제되어 링크가 끊겨도 화면이 실패하지 않고 `데이터 없음/재선택 필요`로 복구한다.
- 프로젝트를 complete/archived로 바꿔도 기존 페어링 기록은 유지한다.

**완료 조건**

- 추천 부모가 기존 페어링 등록 흐름으로 전달되고 저장 후 프로젝트에 나타난다.
- 부모 링크로 등록한 새끼가 자동으로 프로젝트 선발 목록에 나타난다.
- 실제 새끼가 없는데 F2 결과를 단정하거나 확률을 표시하지 않는다.
- 삭제·누락 참조가 런타임 오류를 만들지 않는다.

**QA 시나리오**

- Given active cross project, When 추천 부모로 pairing 저장 후 그 둘을 부모로 가진 새끼를 등록, Then 프로젝트가 새끼를 선발 후보로 표시한다.
- Given linked animal 삭제, When project를 다시 열기, Then `재선택 필요`가 표시되고 다른 프로젝트는 정상 동작한다.

**커밋**: `feat: connect line goals to real breeding records`

### Task 7. 보안·I18n·접근성·모바일 회귀검수

**작업 파일**

- 수정/추가: `tests/account-lockdown.test.js`
- 수정/추가: `tests/planning-tools-relocation.test.js`
- 수정/추가: `tests/breeding-handoff.test.js`
- 수정/추가: `tests/breeding-projects-schema.test.js`
- 수정/추가: `tests/breeding-goal-ui.test.js`
- 수정: `care/_harness-breed.html`

**구현 내용**

- 전체 Node 테스트를 실행하고 작업 시작 기준선인 기존 59개 회귀검사와 새 검사를 모두 통과시킨다.
- 보안 검사:
  - anon 접근 차단
  - cross-owner read/write/link 차단
  - JSON 크기/형식 제한
  - project 삭제/회원 탈퇴 정리
  - XSS 입력 이스케이프
- I18n 검사: 4개 언어 키 동등성, fallback, 사용자용 하드코딩 누락, 숫자/날짜 locale 표시.
- 실제 브라우저에서 390×844와 1440×900을 검사하고 필요하면 360px도 확인한다.
- 키보드만으로 목표 모드 전환, 프로젝트 생성, 후보 선택, 페어링 이동이 가능한지 확인한다.
- 공개 계산기와 기존 분석 화면의 배치가 바뀌지 않았는지 스크린샷으로 비교한다.

**완료 조건**

- `node --test tests/*.test.js` 전체 통과.
- 콘솔 오류, 미처리 Promise, 가로 스크롤, 잘린 메뉴가 없다.
- 모든 새 버튼/탭/입력에 이름과 포커스 상태가 있다.
- 보안 회귀검사에서 실패가 하나라도 있으면 배포 단계로 넘어가지 않는다.

**QA 시나리오**

- Given 390px iPhone형 viewport, When project 생성부터 pairing 저장까지 수행, Then 모든 컨트롤이 화면 안에서 조작 가능하다.
- Given 영어/중국어/일본어, When 동일 흐름 수행, Then 한국어 잔여 문구나 undefined 키가 없다.

**커밋**: `test: verify secure localized line-breeding workflow`

### Task 8. DB 적용, 프로덕션 빌드, Cloudflare 배포와 라이브 확인

**작업 파일/대상**

- `supabase_v31.sql`
- `build.sh:14-46`
- `wrangler.jsonc`
- 라이브: `https://ryangstudio.com/care/breeding.html?species=gecko#goal`

**구현 내용**

- Supabase에 v31을 먼저 적용하고 테이블, 칼럼, 제약, RLS, grant, trigger, 함수 본문을 검증한다.
- 테스트용 두 계정 또는 SQL 역할 검증으로 교차 소유 연결 차단을 확인한다.
- `bash build.sh` 후 `dist/`에 새 공개 JS만 포함되고 SQL/tests/harness가 제외됐는지 확인한다.
- `npx wrangler deploy --dry-run`을 통과한 뒤 Cloudflare에 배포한다.
- 라이브에서 로그인 가능한 테스트 계정으로 목표 생성→후보 분석→페어링 저장→재조회까지 스모크한다.
- 공개 `/gecko/`에 새 프로젝트 UI가 노출되지 않고 기존 계산이 정상인지 확인한다.

**완료 조건**

- Supabase v31 적용 확인 전에는 프런트만 먼저 라이브 배포하지 않는다.
- Cloudflare 배포가 성공하고 라이브 자산 버전이 갱신된다.
- 모바일·데스크톱 라이브 스모크와 공개 계산기 회귀 확인이 모두 통과한다.
- 실패 시 이전 배포로 롤백하고 DB는 추가 마이그레이션으로만 복구한다. 적용된 migration을 역으로 수정하지 않는다.

**QA 시나리오**

- Given production DB와 새 배포, When active project를 새로고침, Then 목표와 연결 페어링이 그대로 보인다.
- Given 익명 브라우저, When 프로젝트 API를 직접 호출, Then 인증 오류가 나고 데이터가 노출되지 않는다.

**커밋**: `chore: prepare line-breeding planner release`

## 최종 검증 웨이브

다음 네 검증을 가능한 한 독립적으로 실행하고 모두 통과해야 완료로 판단한다.

1. **기능/회귀**: `node --test tests/*.test.js`
2. **DB/보안**: v31 구조·RLS·교차 소유·회원 탈퇴·JSON 제한 확인
3. **브라우저/디자인**: 모바일/데스크톱, 4개 언어, 키보드, 공개 계산기 비변경 확인
4. **빌드/배포**: `bash build.sh`, Wrangler dry-run, Cloudflare 배포, 라이브 스모크

## 성공 기준

- 사용자가 레오파드 라인 목표를 저장하고 내 개체 중 부모 후보를 근거와 함께 볼 수 있다.
- 라인 고정과 크로스가 멘델 확률과 명확히 분리되어 보인다.
- 블랙나이트 × 탠저린 및 같은 계열 라인 혼합 규칙이 현재 레오파드 코어와 일치한다.
- 실제 페어링과 등록 새끼가 프로젝트의 다음 단계로 연결된다.
- 다른 종 확장 시 엔진을 복제하지 않고 어댑터 규칙과 번역만 추가할 수 있다.
- 보안·I18n·모바일·전체 회귀검사를 통과한 뒤에만 라이브로 배포된다.
