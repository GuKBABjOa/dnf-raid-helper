# 데이터 흐름 상세

> **최종 수정:** 2026-04-11 — 전면 갱신 (자동 선택 제거, 전체 후보 정렬 + ← → 네비게이터 구조 반영)

---

## 0. 근본 전제: 단일 신청자 루프

### 0-1. UX 흐름 — "지금 화면에 보이는 1명"

```
[신청창 화면]
  ┌─────────────────────────┐
  │  신청자: 홍길동          │  ← 현재 포커스된 1명만 보임
  │  [← 이전] [다음 →]      │  ← 화살표로 넘김
  └─────────────────────────┘
        │ 공대장이 다음 버튼 클릭
        ▼
  ┌─────────────────────────┐
  │  신청자: 이순신          │  ← 화면이 바뀜
  └─────────────────────────┘
```

**이 도구의 역할:** "지금 화면에 보이는 1명"을 즉시 분석해 옆에 카드로 표시.
신청자가 바뀌면 → 새로운 1명을 다시 분석.
공대장이 같은 신청자를 다시 보면 → 캐시에서 즉시 표시.

### 0-2. "신청자 1명" ≠ "던담 검색 후보 1개"

신청자는 화면에 1명이지만, 던담 검색 결과는 **동명이인이 여러 서버에 존재**할 수 있다.
scraper는 후보 전체(`ScrapedCharacter[]`)를 그대로 반환하고,
**disambiguator**가 OCR 힌트(직업명, 명성, 신뢰도)를 기반으로 후보를 식별한다.

| 역할 | 담당 모듈 | 책임 |
|------|-----------|------|
| 후보 전체 추출 | `scraper/dunjiadam.ts` | `ScrapedCharacter[]` 반환 |
| 후보 정렬 | `modules/disambiguator/index.ts` | OCR 힌트 기반 유사도 내림차순 정렬, `ranked/not_found` 반환 |
| 전체 후보 평가 | `matcher/` + `scorer/` | 정렬된 후보 전원에 대해 수행 |

> **구 구조와의 차이:** 이전에는 `ranker/candidateRanker.ts` 또는 `disambiguator`가 후보 중 1명을 자동 선택했다.
> 현재는 disambiguator가 유사도 순으로 정렬하고, **전체 후보에 match + score를 수행**해 `ScoredCandidate[]`를 반환한다.
> 공대장이 ← → 네비게이터로 후보를 직접 순회하며 판단한다.

---

## 1. src/types 파일 구성 및 타입 목록

| 파일 | 포함 타입 |
|------|-----------|
| `types/ocr.ts` | `CaptureRegion`, `ImageBuffer`, `RawOCRText`, `OCRWarningType`, `OCRWarning`, `ParsedOCRResult` |
| `types/character.ts` | `Role`, `CharacterVisual`, `CharacterStats`, `ScrapedCharacter`, `CharacterData` |
| `types/lookup.ts` | `LookupErrorReason`, `FailedLookup`, `LookupResult` |
| `types/raid.ts` | `SlotId`, `SlotDefinition`, `RaidConfig`, `EligibleSlots` |
| `types/candidate.ts` | `ScoreBreakdownItem`, `ScoredCandidate` |
| `types/pipeline.ts` | `StageDuration`, `PipelineTrigger`, `PipelineResult` |
| `types/ipc.ts` | `IpcChannel`, `CaptureRunRequest`, `CaptureRunResponse`, `ModeChangePayload`, `RectSaveRequest` |
| `config/defaults.ts` | `ScorerConfig` (타입 + 기본값 상수) |

---

## 2. 핵심 타입 구조

### 2-1. character.ts

```
Role = 'dealer' | 'buffer' | 'supporter' | 'unknown'
  // roleMatcher가 jobName 문자열을 보고 결정.
  // scraper는 role을 모른다.

CharacterVisual = {
  fullBodyImageUrl: string | null   // 던담 전신 이미지. 없으면 null.
  jobIconUrl:       string | null   // fallback 직업 아이콘.
}

CharacterStats = {
  type:         'damage' | 'buff'
  primaryValue: number        // 원시 숫자 (정렬/비교용)
  displayLabel: string        // 카드 표시용 포맷 문자열 (예: "2320억 6440만")
}

ScrapedCharacter = {
  name:          string
  server:        string
  jobName:       string            // 던파 원문 직업명 (예: "眞 스트리트파이터")
  adventureName: string | null     // 모험단명. null이면 카드에서 생략.
  renown:        number
  stats:         CharacterStats
  visual:        CharacterVisual
  fetchedAt:     Date              // dunjiadam.ts가 주입. parser는 모른다.
}

CharacterData = ScrapedCharacter & {
  role: Role
}
// matcher가 ScrapedCharacter에 role을 붙여서 만드는 타입.
// disambiguator가 식별 완료 후 선택된 1명에게만 적용된다.
```

---

### 2-2. ocr.ts

```
CaptureRegion = {
  x: number
  y: number
  width: number
  height: number
}

ImageBuffer = {
  data:   Buffer
  width:  number
  height: number
  format: 'png' | 'jpeg'
}

RawOCRText = string

OCRWarningType = 'LOW_CONFIDENCE' | 'NOISE_DETECTED' | 'POSSIBLE_MISREAD'

OCRWarning = {
  type:   OCRWarningType
  detail: string
}

ParsedOCRResult = {
  name:              string | null   // 필수. null이면 pipeline 즉시 'ocr_failed'.
  jobName:           string | null   // 보조. null이어도 진행. disambiguator 힌트.
  renown:            number | null   // 보조. null이어도 진행. disambiguator 힌트.
  confidence:        number          // 0.0 ~ 1.0. toWeight()로 힌트 가중치 결정에 사용.
  rawLines:          string[]        // 디버그/로그용 원시 줄 목록
  warnings:          OCRWarning[]
  needsManualReview: boolean         // confidence < 0.7. UI 경고 배너 트리거.
  fieldConfidences?: {               // 필드별 개별 신뢰도 (없으면 confidence로 대체)
    job?: number
    fame?: number
  }
}
```

**참고:** `jobName`과 `renown`은 OCR이 화면에서 직접 읽은 값이다.
`jobName`, `renown`이 모두 null이면 disambiguator는 힌트 없이 원래 스크래핑 순서를 그대로 반환한다.

---

### 2-3. lookup.ts

```
LookupErrorReason =
  | 'NOT_FOUND'      // 던담에 해당 캐릭터 없음 (200 + 빈 결과)
  | 'NETWORK_ERROR'  // HTTP 오류 또는 fetch 예외
  | 'PARSE_ERROR'    // 응답은 왔으나 파싱 실패 (items 빈 배열)
  | 'RATE_LIMITED'   // HTTP 429
  | 'TIMEOUT'        // 3초 타임아웃 초과

FailedLookup = {
  status:      'failed'
  name:        string
  reason:      LookupErrorReason
  attemptedAt: Date
}

LookupResult =
  | { status: 'ok'; data: ScrapedCharacter[] }   // 후보 전체. 1개 이상 보장.
  | FailedLookup
```

**scraper 계층 내 역할 분리:**

| 파일 | 책임 |
|------|------|
| `scraper/fetcher.ts` | HTTP 요청. transport 오류 → `FetchError` |
| `scraper/parser.ts` | HTML 파싱. `RawSearchItem[]` 반환. `fetchedAt` 없음. |
| `scraper/dunjiadam.ts` | 조합. `fetchedAt` 주입. `LookupResult` 반환. |

`RawSearchItem = Omit<ScrapedCharacter, 'fetchedAt'>` — parser의 출력 타입.
`fetchedAt`은 **dunjiadam.ts에서만 주입**한다.

---

### 2-4. raid.ts

```
SlotId = string

SlotDefinition = {
  id:            SlotId
  label:         string      // 예: "딜러 1", "버퍼"
  eligibleRoles: Role[]      // 이 슬롯에 들어갈 수 있는 역할 목록
  required:      boolean
}

RaidConfig = {
  raidName: string
  slots:    SlotDefinition[]
}

EligibleSlots = SlotId[]
// 특정 캐릭터가 들어갈 수 있는 슬롯 ID 목록.
// slotMatcher의 출력. 비어있으면 현재 공대에 맞는 슬롯 없음.
```

---

### 2-5. candidate.ts

```
ScoreBreakdownItem = {
  label:        string
  rawValue:     number
  weight:       number
  contribution: number   // rawValue 정규화 후 weight 적용값. 카드 툴팁 표시용.
}

ScoredCandidate = CharacterData & {
  eligibleSlots: EligibleSlots
  score:         number                // 총점 (현재: stats.primaryValue)
  breakdown:     ScoreBreakdownItem[]  // 점수 근거
  isWarning:     boolean               // renown < ScorerConfig.warnBelowRenown
}
```

> **`RankedCandidateList`는 현재 사용되지 않는다.**  
> 이전에 `success.data`에 복수 후보 목록을 담던 타입이다. 현재는 `success.data`가 단일 `ScoredCandidate`다.

---

### 2-6. pipeline.ts

```
StageDuration = {
  stage:      'capture' | 'preprocess' | 'recognize' | 'parse' |
              'scrape'  | 'disambiguate' | 'match'   | 'score'
  // 주의: 'rank'는 없다. candidateRanker 제거에 따라 'disambiguate'로 대체됨.
  durationMs: number
}

PipelineTrigger = {
  source:      'manual' | 'monitor'   // manual: Alt+C, monitor: Phase 2 자동 감지
  region:      CaptureRegion
  triggeredAt: Date
}

PipelineResult =
  | {
      status:         'success'
      candidates:     ScoredCandidate[]  // 유사도 내림차순 정렬. index 0 = 가장 유사한 후보.
      ocrResult:      ParsedOCRResult
      cacheHit:       boolean
      durationMs:     number
      stageDurations: StageDuration[]
    }
  | {
      status:    'ocr_failed'
      ocrResult: ParsedOCRResult | null  // 캡처 예외면 null, 파싱 실패면 결과 포함
    }
  | {
      status:    'not_found'
      name:      string
      ocrResult: ParsedOCRResult
    }
  | {
      status:    'network_error'
      name:      string
      reason:    LookupErrorReason
      ocrResult: ParsedOCRResult
    }
```

---

## 3. PipelineResult.status 결정 기준

판별 순서: `ocr_failed` → `not_found / network_error` → `success`

| status | 조건 | UI 반응 |
|--------|------|---------|
| `ocr_failed` | 캡처 예외 또는 `ocrResult.name === null` | ErrorView |
| `not_found` | `lookupResult.reason === 'NOT_FOUND'` 또는 disambiguator `not_found` | ErrorView |
| `network_error` | `lookupResult.reason`이 `NETWORK_ERROR / TIMEOUT / RATE_LIMITED / PARSE_ERROR` | ErrorView (재시도 안내) |
| `success` | disambiguator가 `ranked` 반환 → 전체 후보 match+score 완료 | ResultView (← → 네비게이터) |

**앱은 어떤 자동 선택도 하지 않는다.** 후보를 유사도 순으로 정렬해 보여줄 뿐이며, 판단은 공대장의 몫이다.

---

## 4. 단일 신청자 루프 — 데이터 흐름

```
[신청자 화면 변경]
  │ Alt+C 단축키 (passive mode)  │ Phase 2: watcher 감지
  └──────────────┬───────────────┘
                 │
                 ▼
  [Renderer] resultStore.runCapture(region)  ← candidateIndex = 0 초기화
             │ USE_MOCK=true → MOCK_RESULTS 순환 → UI 즉시 갱신 (이하 스킵)
             │ USE_MOCK=false → IPC 호출
             ▼
  [Main] pipeline.run(trigger)
             │
             │─ Phase 1: OCR (현재 stub)
             │    capture(CaptureRegion)    → ImageBuffer
             │    preprocess(ImageBuffer)   → ImageBuffer
             │    recognize(ImageBuffer)    → RawOCRText
             │    ocrParser(RawOCRText)     → ParsedOCRResult
             │                               { name, jobName, renown, confidence, ... }
             │
             ├─ name === null ─────────────────────────────────────→ ocr_failed
             │
             │─ Phase 2: 스크래퍼
             │    cache.get(name)
             │    ├─ HIT ───────────────────────────────────────┐
             │    └─ MISS                                        │
             │         scraper.lookup(name)                      │ cacheHit
             │         ├─ failed(NOT_FOUND)  ──────────────→ not_found
             │         ├─ failed(NETWORK_ERROR / ...) ───→ network_error
             │         └─ ok: ScrapedCharacter[]                 │
             │              cache.set(name, LookupResult)        │
             │                             ScrapedCharacter[] ◄──┘
             │
             │─ Phase 3: Disambiguator  ← 유사도 정렬 단계
             │    resolve(candidates, {
             │      jobName: ocrResult.jobName,
             │      renown:  ocrResult.renown,
             │    })
             │    ├─ not_found ──────────────────────────────→ not_found
             │    └─ ranked: ScrapedCharacter[] (유사도 내림차순)
             │
             │─ Phase 4+5: 정렬된 전체 후보에 대해 매처 + 스코어러 (map)
             │    candidates.map((c) => {
             │      classifyRole(c.jobName)              → Role
             │      CharacterData = { ...c, role }
             │      matchSlots(characterData, raidConfig) → EligibleSlots
             │      scoreEngine(characterData, eligibleSlots, scorerConfig)
             │                                           → ScoredCandidate
             │    })
             │
             ▼
  PipelineResult {
    status:     'success',
    candidates: ScoredCandidate[],  // 유사도 내림차순. index 0 = 가장 유사한 후보.
    ocrResult:  ParsedOCRResult,
    cacheHit:   boolean,
    ...
  }
             │
             ▼
  IPC 응답 → resultStore.result 갱신 + candidateIndex = 0
             │
             ▼
  [UI] CardStateRouter → 뷰 분기
       success              → ResultView (candidates[candidateIndex] 표시, ← → 네비게이터)
       ocr_failed/not_found/network_error → ErrorView
```

### 핵심 분기

| 경로 | 조건 | 예상 시간 |
|------|------|---------|
| **캐시 히트** | 이미 조회한 신청자 재등장 | 1~2초 (OCR + disambiguate/match/score만) |
| **캐시 미스** | 처음 보는 신청자 | 5~10초 (OCR + 네트워크 + disambiguate/match/score) |
| **OCR 실패** | 캡처 불량 | < 1초 (빠르게 실패) |

---

## 5. 캐시 전략

### 캐시 설계

```
캐시 키:   name: string (캐릭터명)
캐시 값:   LookupResult
             = { status: 'ok'; data: ScrapedCharacter[] }  // 후보 배열째로 저장
             | FailedLookup
TTL:       ok          → 세션 내 유지 (앱 재시작 시 초기화)
           NOT_FOUND   → 60초 (재요청 방지 후 만료)
           NETWORK_ERROR / TIMEOUT / RATE_LIMITED / PARSE_ERROR → 캐시하지 않음
최대 항목: 200명 (LRU)
```

**FailedLookup도 캐시하는 이유:** 이미 NOT_FOUND로 확인된 캐릭터에 대한 반복 네트워크 요청을 방지한다.
단, NETWORK_ERROR / TIMEOUT / RATE_LIMITED / PARSE_ERROR는 일시적 장애이므로 캐시하지 않는다.

---

## 6. 성능 목표 — 1인 기준 반응 시간

| 이벤트 / 단계 | 목표 시간 | 비고 |
|--------------|---------|------|
| 신청자 변경 감지 (Phase 2 watcher) | 500ms 이내 | 폴링 간격 기준 |
| 캡처 + 전처리 + OCR + 파싱 | 3초 이내 | OCR 엔진 선택에 따라 변동 |
| 캐시 히트 시 disambiguate/match/score | 100ms 이내 | 순수 함수. 후보 수 무관. |
| **캐시 히트 전체** | **4초 이내** | OCR 완료 후 즉시 카드 표시 |
| 캐시 미스 시 스크래핑 | 5초 이내 | 타임아웃 3초 설정 후 TIMEOUT 처리 |
| **캐시 미스 전체** | **10초 이내** | |
| OCR 실패 → 실패 메시지 표시 | 1초 이내 | 빠르게 실패 |

---

## 7. 현재 구현 현황

### 구현 완료

| 모듈 | 상태 |
|------|------|
| `scraper/` (dunjiadam, cache, client) | 완료 |
| `modules/disambiguator/` | 완료 — 16개 시나리오 테스트 통과 |
| `modules/matcher/` (roleMatcher, slotMatcher) | 완료 |
| `modules/scorer/` (scoreEngine) | 완료 |
| `pipeline/pipeline.ts` | 완료 — 5단계 파이프라인 |
| `renderer/store/overlayStore` | 완료 |
| `renderer/store/resultStore` | 완료 — runCapture, mock/real 분기, candidateIndex 네비게이션 포함 |
| `renderer/components/CardStateRouter` | 완료 |
| `renderer/components/ResultView` | 완료 — candidates[] + ← → 네비게이터 |
| `renderer/components/ErrorView` | 완료 |

### stub / 미완성

| 모듈 | 상태 |
|------|------|
| `modules/ocr/capture.ts` | stub |
| `modules/ocr/preprocess.ts` | stub |
| `modules/ocr/recognize.ts` | stub |
| `modules/ocr/parser.ts` | 최소 구현 (jobName/renown 항상 null 반환) |
| OCR 엔진 | 미결정 (ADR-003) |

### 다음 작업 순서

1. **OCR 실제 구현** — 엔진 선택(ADR-003) 후 parser.ts 구현
2. **real 모드 검증** — USE_MOCK=false로 실제 게임 연동 E2E 테스트
3. **candidateRanker 정리** — pipeline에서 미사용이므로 삭제 또는 아카이브 결정
4. **disambiguator 테스트 업데이트** — 구 `auto/recommended/manual` API 기반 테스트를 `ranked/not_found` 기반으로 수정
