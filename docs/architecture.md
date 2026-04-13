# 아키텍처 설계 — DNF 공대장 도우미

> **문서 목적:** 구현 전 합의 기준점. 코드보다 의도와 경계를 먼저 정의한다.  
> **최종 수정:** 2026-04-11  
> **Phase:** MVP(Phase 1) 기준. Phase 2 확장 지점 명시.

---

## 1. 사용자 시나리오

### 게임 UI 구조 이해 (선행 지식)

던파의 파티 신청 흐름은 다음과 같다.

```
공대장 화면에 "파티 참가 요청" 팝업이 뜸
  ├─ 상단: 신청자 정보 (캐릭터 아이콘, 이름, 레벨, 명성 등)
  └─ 하단: ◄ ► 화살표 — 다음/이전 신청자로 넘김

즉, 신청자는 한 명씩 이 팝업에 표시된다.
공대장은 ◄ ► 로 넘기면서 신청자를 검토한다.
```

캡처 대상은 이 팝업의 **상단 정보 영역**이다.

```
[캡처 대상 영역 예시]
┌─────────────────────────────────────┐
│ [아이콘] Lv.110  명황  [D]眞 스트리트파 │  ← 캐릭터명, 레벨, 직업명 (신청창에서 잘림)
│  고수    코인: 1212개   피로도: 176    │
│   28    스태미나: 100   명성: 45901   │  ← 명성 (disambiguator 힌트로 활용)
└─────────────────────────────────────┘
```

### 기본 흐름 (Happy Path)

```
[공대장: 게임 실행 중, 파티 신청 팝업이 화면에 표시됨]
        │
        ▼
[앱 실행] → 오버레이 UI가 게임 화면 위에 표시됨
        │     ├─ CaptureRect: 파티 신청 팝업 상단 영역에 맞춰 배치
        │     └─ CardRect:    결과 카드 표시 영역 (화면 우측 또는 창 밖)
        │
        ▼ [passive mode — 게임 클릭 투과 중]
        │
[공대장: 파티 신청 팝업에 신청자가 표시됨]
        │
        ▼
[공대장: Alt+C 단축키로 캡처 (passive mode 유지)]
        │
        ▼
[OCR → 캐릭터명/직업명/명성 추출 → 던담 검색 → disambiguator로 후보 식별]
        │
        ▼
[CardRect 안에 1순위 후보 카드 표시]
        │     ├─ 캐릭터 전신 이미지 (신청자 시각적 식별)
        │     └─ 딜 숫자 또는 버프점수 (핵심 수치)
        │
        ▼
[공대장: 카드 확인 → 게임에서 ◄ ► 로 다음 신청자로 이동]
        │
        └─ 위 과정 반복
```

### 보조 흐름

| 시나리오 | 처리 |
|----------|------|
| OCR 실패 | "인식 실패" + 수동 입력창 |
| 후보 없음 | "검색 결과 없음" + 수동 입력 유도 |
| 후보 여럿 | 유사도 내림차순 정렬 → 1순위 후보 즉시 표시, ← → 네비게이터로 순회 (2명 이상일 때) |
| 창모드 플레이 | CardRect를 게임 창 밖으로 드래그해 배치 |
| UI 재배치 필요 | edit mode 진입 → 두 Rect 이동/리사이즈 → passive mode 복귀 |

---

## 2. 오버레이 상태 모델

오버레이는 두 가지 모드를 전환한다. 모드는 전역 단일 상태이며 두 Rect가 동시에 공유한다.

### 모드 정의

```
┌─────────────────────────────────────────────────────────┐
│                    passive mode (기본)                   │
│                                                         │
│  • 윈도우: setIgnoreMouseEvents(true, { forward: true })│
│  • 마우스 이벤트: 게임으로 투과                          │
│  • CaptureRect: 반투명 테두리만 표시                     │
│  • CardRect: 결과 카드 표시 (클릭 불가)                  │
│  • Alt+C 단축키: 캡처 트리거 (passive 중에도 동작)        │
│  • 진입 트리거: 글로벌 단축키 (Alt+Z 기본)               │
└────────────────────┬────────────────────────────────────┘
                     │  글로벌 단축키 (Alt+Z)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    edit mode                            │
│                                                         │
│  • 윈도우: setIgnoreMouseEvents(false)                  │
│  • 마우스 이벤트: 오버레이가 직접 수신                  │
│  • CaptureRect: 이동/리사이즈 핸들 표시                 │
│  • CardRect: 이동/리사이즈 핸들 표시                    │
│  • 종료 트리거: ESC 또는 단축키 재입력 (토글)            │
└─────────────────────────────────────────────────────────┘
```

### 상태 전환 표

| 전환 | 트리거 | 비고 |
|------|--------|------|
| passive → edit | 글로벌 단축키 (Alt+Z) | 게임 포커스 중에도 동작 |
| edit → passive | ESC | |
| edit → passive | 글로벌 단축키 재입력 (토글) | |

> **MVP 결정:** 글로벌 단축키 하나로만 전환. 호버 감지는 Phase 2 옵션.

---

## 3. UI 컴포넌트 구조

### 3-1. 전체 구조

> **현재 코드 기준 (2026-04-11)**

```
OverlayApp (Electron BrowserWindow — frameless, always-on-top, transparent)
├── OverlayModeController          # passive/edit 상태, 글로벌 단축키 수신
│
├── CaptureOverlayRect             # 캡처 대상 영역 UI
│   ├── ResizableDragFrame         # 이동 + 리사이즈 (edit mode만 활성)
│   │   └── [라벨] "캡처 영역 (Alt+C로 캡처)"  # edit mode에서만 표시
│   └── [Alt+C 단축키 리스너]       # passive mode에서 Alt+C → runCapture(capture)
│
└── CardOverlayRect                # 결과 카드 표시 영역
    └── ResizableDragFrame         # 이동 + 리사이즈 (edit mode만 활성)
        └── CardStateRouter        # result + isRunning으로 뷰 분기
            ├── [idle]             # result===null && !isRunning → "캡처 대기 중 (Alt+C)"
            ├── [loading]          # result===null && isRunning  → "분석 중..."
            ├── ResultView         # status: 'success' — candidates[] + 네비게이터
            └── ErrorView          # status: 'ocr_failed' | 'not_found' | 'network_error'
```

**Store 구조:**

| Store | 상태 | 주요 액션 |
|-------|------|-----------|
| `overlayStore` | `mode` (passive/edit), `capture` (RectBounds), `card` (RectBounds) | `updateCapture`, `updateCard` |
| `resultStore` | `result`, `isRunning`, `mockIdx`, `candidateIndex` | `runCapture(region)`, `clearResult`, `nextCandidate`, `prevCandidate` |

### 3-2. ResultView — 카드 레이아웃 스케치

```
┌──────────────────────────┐
│   Ria_PAIN [아린]        │  ← 캐릭터명 + 서버
│   眞 스트리트파이터       │  ← 직업명
│   명성 104,330           │  ← 명성
│   ──────────────────     │
│   2,320억 6,440만        │  ← 딜 숫자 (딜러)
│   또는 7,513,277         │  ← 버프점수 (버퍼)
│                          │
│   ◀  1 / 3  ▶           │  ← 후보 2명 이상일 때만 표시
└──────────────────────────┘
```

> **← → 네비게이터:** 후보가 2명 이상일 때만 카드 하단에 표시. 양 끝(index 0, 마지막)에서 버튼 비활성화(opacity 0.25).  
> index 0 = 유사도 가장 높은 후보. 공대장이 직접 순회하며 판단한다.

이미지 없을 때 fallback:
```
이미지 없음 → 직업 아이콘 + 색상 배경으로 대체
직업 아이콘도 없음 → 직업명 텍스트
```

### 3-3. ResizableDragFrame 공통 컴포넌트

```typescript
interface ResizableDragFrameProps {
  bounds: RectBounds;          // { x, y, width, height }
  isActive: boolean;           // edit mode일 때만 true
  minWidth: number;
  minHeight: number;
  borderColor: string;
  onBoundsChange: (bounds: RectBounds) => void;
  onDragEnd: (bounds: RectBounds) => void;
  children: React.ReactNode;
}
```

- 8방향 리사이즈 핸들 (모서리 4 + 엣지 4)
- 최소 크기: CaptureRect `100×40`, CardRect `180×280`
- 위치/크기는 앱 재시작 후에도 영속화 (`electron-store`)
- **위치 제약 없음:** CardRect는 화면 경계 밖에 배치 가능 (창모드 지원)

---

## 4. 내부 데이터 흐름

### 4-1. 수동 캡처 파이프라인 (Phase 1)

> **현재 코드 기준 (2026-04-11)**

```
[사용자: 캡처 버튼 클릭]
        │
        ▼
 CaptureOverlayRect → resultStore.runCapture(region)
        │
        ▼ [USE_MOCK=true: MOCK_RESULTS 순환 반환, 이하 스킵]
        │ [USE_MOCK=false: 실제 IPC 호출]
        ▼
 Renderer → IPC('capture:run', captureRegion)
        │
        ▼ [Main Process: pipeline.run()]
        │
        ├─▶ Phase 1: OCR 모듈 (현재 stub 수준)
        │     capture(region)         → ImageBuffer
        │     preprocess(buf)         → ImageBuffer
        │     recognize(buf)          → RawOCRText
        │     parse(text)             → ParsedOCRResult
        │                               { name, jobName, renown, confidence, ... }
        │
        │   name === null → ocr_failed 즉시 반환
        │
        ├─▶ Phase 2: 스크래퍼
        │     cache.get(name)         → 캐시 히트?
        │     ├ HIT  → ScrapedCharacter[]
        │     └ MISS → dunjiadam.lookup(name) → ScrapedCharacter[]
        │
        │   not_found / network_error → 해당 status 즉시 반환
        │
        ├─▶ Phase 3: Disambiguator  ← 핵심 식별 단계
        │     resolve(candidates, { jobName, renown, fieldConfidences })
        │       → not_found   → not_found 반환
        │       → manual      → disambiguation_required 반환 (후보 목록 포함)
        │       → auto        → selectedCandidate 결정
        │       → recommended → selectedCandidate 결정
        │
        ├─▶ Phase 4: 선택된 1명에 대해 매처
        │     classifyRole(jobName)            → Role
        │     matchSlots(characterData, raidConfig) → EligibleSlots
        │
        └─▶ Phase 5: 선택된 1명에 대해 스코어러
              scoreEngine(characterData, eligibleSlots, scorerConfig)
                → ScoredCandidate
        │
        ▼
 PipelineResult → IPC 응답
        │
        ▼ [Renderer]
 resultStore.result 갱신
        │
        ▼
 CardOverlayRect → CardStateRouter → 뷰 분기 렌더링
```

### 4-2. 후보 네비게이션 (← →)

```
[pipeline: success — candidates: ScoredCandidate[] (유사도 내림차순)]
        │
        ▼
 resultStore: candidateIndex = 0 (초기화)
        │
        ▼
 ResultView: candidates[0] 표시 (1순위 후보)
        │
        │ 후보가 2명 이상인 경우
        ├─ [◀ 버튼] prevCandidate() → candidateIndex = max(0, idx-1)
        └─ [▶ 버튼] nextCandidate() → candidateIndex = min(len-1, idx+1)

공대장은 ← → 로 후보를 순회하며 직접 판단한다.
앱은 자동 선택이나 추천을 하지 않는다.
```

### 4-3. 오버레이 모드 전환 흐름

```
[글로벌 단축키 감지 — Main Process]
        │
        ▼
 IPC push → Renderer ('overlay:modeChange', 'edit')
        │
        ▼
 overlayStore.setMode('edit')
        │
        ├─ BrowserWindow.setIgnoreMouseEvents(false)
        └─ ResizableDragFrame.isActive = true
```

### 4-4. Phase 2 확장 지점

```
[Monitor 모듈 — Phase 2만]
  watcher.ts:        N초마다 captureRegion 캡처
  changeDetector.ts: 이전 프레임과 픽셀 차이 비교
  변화 감지 시 →     pipeline.run() 자동 호출
                     (Phase 1과 동일한 파이프라인 진입점)
```

---

## 5. 결과 후보 모델 설계

> **현재 코드 기준 (2026-04-11)**

### 5-1. 핵심 타입

```typescript
// 파이프라인 최종 출력 (src/types/pipeline.ts)
type PipelineResult =
  | {
      status: 'success';
      candidates: ScoredCandidate[];  // 유사도 내림차순 정렬. index 0 = 가장 유사한 후보.
      ocrResult: ParsedOCRResult;
      cacheHit: boolean;
      durationMs: number;
      stageDurations: StageDuration[];
    }
  | { status: 'ocr_failed'; ocrResult: ParsedOCRResult | null }
  | { status: 'not_found'; name: string; ocrResult: ParsedOCRResult }
  | { status: 'network_error'; name: string; reason: LookupErrorReason; ocrResult: ParsedOCRResult };

// 개별 후보 (카드 렌더링 단위, src/types/candidate.ts)
type ScoredCandidate = CharacterData & {
  eligibleSlots: EligibleSlots;
  score: number;
  breakdown: ScoreBreakdownItem[];
  isWarning: boolean;   // renown < ScorerConfig.warnBelowRenown
};

// CharacterData = ScrapedCharacter & { role: Role }
// ScrapedCharacter: name, server, jobName, adventureName, renown, stats, visual, fetchedAt

// StageDuration.stage (현재): 'capture' | 'preprocess' | 'recognize' | 'parse' |
//                              'disambiguate' | 'scrape' | 'match' | 'score'
// 주의: 'rank'는 제거됨 (candidateRanker 제거에 따라)
```

### 5-2. OCR 파싱 출력

파티 프레임 상단 영역에서 추출하는 값:

```typescript
interface ParsedOCRResult {
  name: string | null;               // 필수. null이면 파이프라인 즉시 ocr_failed.
  jobName: string | null;            // 보조. disambiguator 힌트 (jobWeight 산정에 사용)
  renown: number | null;             // 보조. disambiguator 힌트 (fameWeight 산정에 사용)
  confidence: number;                // 0.0~1.0. toWeight()로 힌트 가중치 결정에 사용
  rawLines: string[];
  warnings: OCRWarning[];
  needsManualReview: boolean;        // confidence < 0.7 → ResultView 경고 배너
  fieldConfidences?: { job?: number; fame?: number; };
}
```

- `name`만 필수. `jobName`, `renown`이 모두 null이면 disambiguator는 원래 순서 그대로 반환한다.

### 5-3. disambiguator 정렬 기준

> **candidateRanker(`src/modules/ranker/`)는 pipeline 핵심 흐름에서 완전히 제거됨. 현재 후보 정렬은 `src/modules/disambiguator/index.ts`가 전담한다. candidateRanker는 구 구조 유산으로 정리 대상.**
>
> **앱은 자동 선택을 하지 않는다.** 유사도 점수로 내림차순 정렬만 수행하고, 공대장이 ← → 로 직접 판단한다.

| 기준 | 설명 |
|------|------|
| `jobMatch` | `candidate.jobName.includes(hintJob)` → 0 or 1.0 |
| `fameMatch` | `delta ≤ 500 → 1.0 / ≤ 3000 → 0.5 / else 0.0` |
| `toWeight` | `confidence ≤ 0.50 → 0.10 / ≤ 0.80 → 0.50 / > 0.80 → 1.00` |
| sanity | `renown < 10,000 → fameWeight = 0` |
| 정렬 | 각 후보의 `matchScore` 내림차순 → `ScoredCandidate[]` 인덱스 순서 결정 |
| 힌트 없을 때 | `jobWeight + fameWeight === 0` → 원래 순서(스크래핑 순) 유지 |

---

## 6. 카드 UI 필드 우선순위

### Tier 1 — 필수 (항상 표시)

| 필드 | 내용 |
|------|------|
| 캐릭터 전신 이미지 | 신청자 시각 식별. 없으면 fallback. |
| 딜 숫자 / 버프점수 | 역할에 따라 자동 전환. 카드 핵심 수치. |
| 캐릭터명 | 이름 확인 |

### Tier 2 — 중요 (공간 있을 때)

| 필드 | 내용 |
|------|------|
| 명성 | 캐릭터 성장도 참고 |
| 역할 배지 | 딜러 / 버퍼 구분 |

### Tier 3 — 선택 (여유 공간)

| 필드 | 내용 |
|------|------|
| 적합 슬롯 목록 | 공대 슬롯 매칭 결과 |
| 캐시 표시 | "캐시 결과" 아이콘 |

### 역할별 표시 전환

```
role === 'dealer'  → primaryValue: 딜 숫자 (억 단위 포맷)
role === 'buffer'  → primaryValue: 버프점수 (정수 포맷)
role === 'unknown' → 두 수치 모두 있으면 나란히, 없으면 "-"
```

---

## 7. MVP 범위 / 제외 범위

### Phase 1 MVP 포함

**구현 완료 (현재)**

| 항목 | 상세 |
|------|------|
| 오버레이 UI | CaptureRect + CardRect, 이동/리사이즈 |
| passive / edit 모드 | 글로벌 단축키 기반 전환 (Alt+Z) |
| Alt+C 캡처 단축키 | passive mode에서 전역 단축키로 캡처 트리거 |
| 던담 검색 + LRU 캐시 | 캐릭터명 기반 검색 |
| disambiguator | OCR 힌트 기반 유사도 내림차순 정렬 |
| 카드 렌더링 | ResultView (성공 + ← → 네비게이터), ErrorView (실패) |
| mock/real 전환 | USE_MOCK 상수로 분기 |
| resultStore 실행 로직 | runCapture(region) — mock 분기 + IPC + 예외 처리, candidateIndex 네비게이션 |
| 위치/크기 영속화 | 앱 재시작 후에도 유지 |

**아직 미구현 (Phase 1 잔여)**

| 항목 | 상세 |
|------|------|
| OCR 실제 구현 | capture/preprocess/recognize/parser 현재 stub 수준 |
| real 모드 검증 | USE_MOCK=false 실제 게임 연동 테스트 |

**MVP 완료 기준**
- 수동 캡처 → 카드 표시 ≤ 10초 (캐시 미스)
- 재조회 ≤ 2초 (캐시 히트)
- OCR 캐릭터명 인식률 ≥ 80%
- 캐릭터 전신 이미지 표시 (던담 제공 시)

### Phase 2 (MVP 이후)

| 항목 | 상세 |
|------|------|
| 자동 감시 | CaptureRect 영역 폴링, 픽셀 변화 감지 시 자동 실행 |
| 감시 제어 UI | 시작 / 일시정지 / 중지 |

### 전체 제외 (Both Phases)

- 자동 수락/거절
- 공대 히스토리 저장
- 길드원 DB 연동
- 멀티 서버 동시 지원
- 공격대 자동 최적화

---

## 8. 기술적 리스크와 완화 전략

### 8-1. click-through 오버레이 안정성

**리스크:** Windows에서 passive ↔ edit 전환 시 일부 Electron 버전에서 깜빡임 또는 포커스 불안정 발생.

**완화:**
- `setIgnoreMouseEvents(true, { forward: true })` 사용 (Electron 공식 지원 API)
- 초기 PoC에서 전환 안정성 먼저 검증 후 UI 작업 진행

---

### 8-2. CardRect의 게임 창 밖 배치

**리스크:** 단일 BrowserWindow를 화면 전체에 펼치면, 전체화면 게임에서 CardRect가 게임 밖으로 나갈 수 없음.

**완화 전략:**

| 방식 | 장점 | 단점 |
|------|------|------|
| **A. 단일 창 (MVP 채택)** | 구현 단순 | 전체화면 게임에서 창 밖 배치 불가 |
| **B. 창 두 개 분리** | CardRect 자유 배치 | IPC 복잡도 증가 |

> **MVP 결정:** A(단일 창). 창모드 게임 지원은 A로 충분. 전체화면 지원 요구 시 Phase 2에서 B 전환.

---

### 8-3. OCR 정확도 (파티 프레임 영역)

**리스크:** 파티 프레임 배경이 어두운 금색 계열이라 이진화 기준 설정이 까다로울 수 있음. 캐릭터명 한글 특수 폰트 오인식 가능.

**완화:**
- `preprocess.ts`에서 게임 UI 배경색 기준 전처리 파라미터 튜닝
- `parser.ts`에서 캐릭터명 유효 패턴 검증 (한글/영문, 2~12자)
- `assets/test-screenshots/`에 실제 게임 파티 프레임 샘플 축적 → OCR 회귀 테스트
- 실패 시 수동 입력 즉시 유도 (에러 숨기지 않음)

---

### 8-4. 던담 이미지 가용성

**리스크:** 던담이 전신 이미지를 모든 캐릭터에 제공하지 않을 수 있음. URL 구조 변경 가능성.

**완화:**
- `CharacterVisual.fullBodyImageUrl`은 항상 `null` 허용 — fallback 렌더링 필수
- 이미지 URL 파싱 로직을 `scraper/dunjiadam.ts` 한 곳에 격리 — 구조 변경 시 이 파일만 수정

---

### 8-5. 글로벌 단축키 충돌

**리스크:** Alt+Z 등 기본 단축키가 게임 내 단축키와 충돌 가능.

**완화:**
- 단축키를 사용자 설정으로 변경 가능하게 구현
- 설정은 트레이 메뉴 또는 edit mode 내 설정 패널에서 재지정

---

## 9. 모듈 책임 요약

> **현재 코드 기준 (2026-04-11)**

| 모듈 | 위치 | 단일 책임 | 상태 |
|------|------|-----------|------|
| `OverlayModeController` | Renderer | passive/edit 상태 및 단축키 | 구현됨 |
| `ResizableDragFrame` | Renderer | Rect 이동/리사이즈 UI | 구현됨 |
| `CaptureOverlayRect` | Renderer | 캡처 영역 UI + Alt+C 단축키 리스너 | 구현됨 |
| `CardOverlayRect` | Renderer | 카드 영역 UI | 구현됨 |
| `CardStateRouter` | Renderer | result/isRunning으로 뷰 분기 | 구현됨 |
| `ResultView` | Renderer | 성공 카드 렌더링 + ← → 네비게이터 | 구현됨 |
| `ErrorView` | Renderer | 오류 표시 | 구현됨 |
| `overlayStore` | Renderer | mode, capture, card bounds | 구현됨 |
| `resultStore` | Renderer | result, isRunning, candidateIndex, runCapture, nextCandidate, prevCandidate | 구현됨 |
| `ocr/` | Main | 이미지 → ParsedOCRResult | **stub** |
| `scraper/` | Main | 캐릭터명 → ScrapedCharacter[] (캐시 포함) | 구현됨 |
| `disambiguator/` | Main | ScrapedCharacter[] + hints → 식별 결과 | 구현됨 |
| `matcher/` | Main | CharacterData → Role + EligibleSlots | 구현됨 |
| `scorer/` | Main | CharacterData → ScoredCandidate | 구현됨 |
| `pipeline/` | Main | 모듈 오케스트레이션 | 구현됨 |
| `ranker/` | Main | (구 구조 유산, 현재 pipeline에서 미사용) | 정리 대상 |
| `monitor/` | Main | 영역 폴링 + 변화 감지 | Phase 2 |

---

## 10. 폴더 구조

> **현재 코드 기준 (2026-04-11)**

```
dnf_help_raidLeader/
├── src/
│   ├── main/
│   │   ├── index.ts                 # BrowserWindow 생성, 글로벌 단축키 등록
│   │   └── ipc/
│   │       ├── capture.ipc.ts       # capture:run 채널
│   │       ├── overlay.ipc.ts       # overlay:modeChange, rect:save 채널
│   │       └── index.ts
│   │
│   ├── renderer/
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── OverlayModeController/   # passive/edit 상태 관리
│   │   │   ├── ResizableDragFrame/      # 공통 이동+리사이즈
│   │   │   ├── CaptureOverlayRect/      # 캡처 영역 + 캡처 버튼
│   │   │   ├── CardOverlayRect/         # 결과 카드 영역
│   │   │   ├── CardStateRouter/         # result/isRunning → 뷰 분기
│   │   │   ├── ResultView/              # success 카드
│   │   │   ├── DisambiguationView/      # disambiguation_required 후보 목록
│   │   │   └── ErrorView/               # 오류 표시
│   │   ├── store/
│   │   │   ├── overlayStore.ts          # mode, capture/card bounds
│   │   │   └── resultStore.ts           # result, isRunning, mockIdx, runCapture
│   │   └── dev/
│   │       └── mockResults.ts           # [dev only] mock PipelineResult 데이터
│   │
│   ├── pipeline/
│   │   └── pipeline.ts                  # 모듈 오케스트레이션
│   │
│   ├── ocr/                             # [stub] capture/preprocess/recognize/parser
│   │   ├── capture.ts
│   │   ├── preprocess.ts
│   │   ├── recognize.ts
│   │   └── parser.ts
│   │
│   ├── scraper/
│   │   ├── client.ts
│   │   ├── dunjiadam.ts                 # 이미지 URL 파싱 포함
│   │   └── cache.ts
│   │
│   ├── modules/
│   │   ├── disambiguator/               # 후보 식별 (핵심) — 식별 완료 후 1명에게만 이하 수행
│   │   │   └── index.ts
│   │   ├── ranker/                      # [구 구조 유산, pipeline에서 완전 미사용 — 정리 대상]
│   │   │   └── candidateRanker.ts       # disambiguator 도입 전 구조. 현재 호출 없음.
│   │   ├── matcher/
│   │   │   ├── roleMatcher.ts
│   │   │   └── slotMatcher.ts
│   │   └── scorer/
│   │       └── scoreEngine.ts
│   │
│   ├── monitor/                         # [Phase 2 — 미구현]
│   │   ├── watcher.ts
│   │   └── changeDetector.ts
│   │
│   ├── config/
│   │   ├── raidConfig.ts
│   │   ├── scorerConfig.ts
│   │   └── defaults.ts
│   │
│   └── types/
│       ├── character.ts               # Role, ScrapedCharacter, CharacterData, CharacterVisual, CharacterStats
│       ├── candidate.ts               # ScoredCandidate, ScoreBreakdownItem
│       ├── lookup.ts                  # LookupErrorReason, FailedLookup, LookupResult
│       ├── raid.ts                    # RaidConfig, SlotId, EligibleSlots
│       ├── ocr.ts                     # CaptureRegion, ImageBuffer, ParsedOCRResult
│       ├── pipeline.ts                # StageDuration, PipelineTrigger, PipelineResult
│       ├── overlay.ts                 # OverlayMode, RectBounds
│       └── ipc.ts
│
├── tests/
│   └── unit/
│       ├── disambiguator/
│       ├── pipeline/
│       ├── scraper/
│       ├── matcher/
│       └── scorer/
│
├── docs/
│   ├── architecture.md
│   ├── decisions.md
│   └── data-flow.md
│
└── assets/
    └── test-screenshots/              # 실제 파티 프레임 캡처 샘플
```
