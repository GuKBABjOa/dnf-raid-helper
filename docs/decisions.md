# 기술 결정 로그 (Architecture Decision Records)

결정이 내려질 때마다 이 파일에 추가한다.
형식: 날짜 / 결정 / 이유 / 기각된 대안

---

## ADR-001: Electron 채택 (2026-04-09)
**결정:** Electron + Node.js + TypeScript로 개발한다.  
**이유:** 화면 캡처, 로컬 파일 접근, 시스템 트레이 등 OS 레벨 기능이 필요하고, 웹 기술 기반으로 UI를 빠르게 만들 수 있다.  
**기각:** 순수 웹앱 (스크린샷 불가), Python Tkinter (UI 생태계 약함), Tauri (Rust 학습 곡선)

---

## ADR-002: 모듈 분리 원칙 (2026-04-09)
**결정:** OCR / 스크래퍼 / 매처 / 스코어러를 독립 모듈로 분리한다.  
**이유:** 각 모듈을 독립적으로 테스트할 수 있어야 한다. OCR 엔진 교체, 스크래핑 대상 사이트 변경 등이 발생해도 다른 모듈에 영향이 없어야 한다.  
**원칙:** 모듈 간 통신은 타입 정의(`src/types/`)로만 한다. 모듈이 서로를 직접 import하지 않는다.

---

## ADR-003: OCR 엔진 선택 (미결정)
**후보:**
- `tesseract.js` — 로컬 실행, 무료, 한글 지원 가능, 속도 느림
- Google Cloud Vision API — 정확도 높음, 유료, 네트워크 필요
- Windows OCR API (via node-addon) — 빠름, Windows 전용

**결정 기준:** 한글 인식률, 오프라인 작동 가능 여부, 비용  
**결정:** 미결정 — 프로토타입에서 Tesseract.js로 시작 후 비교 예정

---

## ADR-004: 스크래핑 대상 사이트 (미결정)
**후보:**
- 던담 (dunjiadam.com 계열) — 비공식, 구조 변경 위험
- 던파 공식 API — 존재 여부 확인 필요
- 기타 커뮤니티 사이트

**결정:** 미결정 — 사이트 구조 조사 후 결정

---

## ADR-005: UI 프레임워크 선택 (미결정)
**후보:**
- React + TypeScript — 생태계 풍부
- Vue 3 — 학습 곡선 낮음
- Svelte — 번들 크기 작음

**결정:** 미결정

---

## ADR-007: Pipeline Coordinator 분리 (2026-04-09)
**결정:** `src/pipeline/pipeline.ts`를 별도로 만들어 모듈 오케스트레이션을 담당시킨다.  
**이유:** IPC 핸들러가 모듈 호출 순서를 직접 관리하면 IPC 레이어에 비즈니스 로직이 침투한다. pipeline.ts만 각 모듈을 import할 수 있는 유일한 파일이다.  
**규칙:** IPC 핸들러는 `pipeline.run()`만 호출한다. 각 모듈은 pipeline을 통해서만 연결된다.

---

## ADR-008: Scorer 가중치 외부 주입 (2026-04-09)
**결정:** 가중치를 `src/config/scorerConfig.ts`에서 관리하고 Scorer에 주입한다.  
**이유:** 하드코딩된 상수 파일은 사용자가 공대 유형에 따라 가중치를 바꿀 수 없게 만든다.  
**원칙:** Scorer는 순수 함수. 설정은 밖에서 주입받는다.

---

## ADR-009: 스크래퍼 동시성 제한 (2026-04-09)
**결정:** 스크래퍼의 동시 HTTP 요청 수를 최대 5개로 제한한다.  
**이유:** 제한 없는 병렬 요청은 사이트 차단(429) 위험. Rate Limit 시 지수 백오프 1회 재시도.  
**구현 위치:** `scraper/client.ts`의 HTTP 클라이언트 내부.

---

## ADR-006: IPC 통신 방식 (2026-04-09)
**결정:** Electron의 `ipcMain` / `ipcRenderer`를 사용하되, `contextBridge`로 preload를 통해 노출한다.  
**이유:** `nodeIntegration: true`는 보안 위험. 최소 권한 원칙.  
**원칙:** Renderer는 IPC 채널 이름과 타입만 알고, Main Process 내부 구현을 알지 못한다.

---

## ADR-010: Matcher 입력에서 FailedLookup 제외 (2026-04-09)
**결정:** pipeline.ts가 LookupResult[]를 필터링하여 ScrapedCharacter[]만 matcher에 전달한다.  
**이유:** Matcher의 계약은 CharacterData[] → SlotCandidates. FailedLookup에는 분류에 필요한 job 필드가 없다. Matcher에 에러 처리 로직을 넣으면 단일 책임 원칙이 깨진다.  
**정보 보존:** FailedLookup은 PipelineResult.failedLookups에 저장되어 UI에 "조회 실패" 뱃지로 표시된다.

---

## ADR-011: ScrapedCharacter와 CharacterData 타입 분리 (2026-04-09)
**결정:** scraper 출력은 `ScrapedCharacter` (role 없음), matcher 이후는 `CharacterData = ScrapedCharacter & { role: Role }`.  
**이유:** role은 matcher의 roleMatcher가 결정한다. scraper가 role을 알면 DNF 도메인 지식이 두 군데에 퍼진다. 타입으로 파이프라인 단계를 명시한다.

---

## ADR-012: 첫 구현 모듈은 scorer (2026-04-09)
**결정:** 구현 시작 시 scorer.scoreEngine을 첫 번째 모듈로 구현한다. parser.ts는 OCR 엔진 확정 및 실제 게임 샘플 수집 후에 구현한다.  
**이유:** scorer는 외부 의존이 전혀 없는 순수 함수로, 게임이나 네트워크 없이 완전히 테스트 가능하다. parser는 OCR 엔진 출력 형식에 묶여 있어 엔진 확정 전 구현하면 가정 기반 코드가 된다.  
**순서:** scorer → roleMatcher → scraper(mock) → parser(실제 샘플 기반)

---

## ADR-013: 자동 감시는 Phase 2, 트리거 추상화는 Phase 1부터 (2026-04-09)
**결정:** MVP에서 수동 캡처를 유지한다. 단, `PipelineTrigger` 타입에 `source: 'manual' | 'monitor'`를 처음부터 포함해 Phase 2 확장을 수용한다.  
**이유:** 자동 감시(watcher, changeDetector)는 파이프라인 자체와 무관한 독립 기능이다. 파이프라인을 먼저 안정화한 뒤 트리거 출처를 추가하는 것이 위험이 낮다.  
**원칙:** 파이프라인은 누가 호출했는지 신경 쓰지 않는다. `trigger.source`는 로그에만 기록한다.

---

## ADR-014: monitor 모듈을 OCR 모듈과 분리 (2026-04-09)
**결정:** 영역 감시 기능(`watcher.ts`, `changeDetector.ts`)을 `src/modules/monitor/`로 분리한다. OCR 모듈은 건드리지 않는다.  
**이유:** OCR의 계약은 `ImageBuffer → ParsedOCRResult`이며 무상태·순수함수여야 한다. 감시 기능은 이전 프레임 상태, 타이머, 변화 판단 로직을 필요로 하며 이는 OCR의 책임이 아니다. OCR에 감시를 넣으면 상태를 갖게 되어 단위 테스트가 깨진다.  
**예외:** `watcher.ts`는 `capture.ts`를 재사용한다. capture.ts는 OCR 폴더에 있지만 DNF 지식 없는 범용 함수이므로 monitor에서 직접 import 허용. 단, 이 허용은 `capture.ts` 한 파일에 한정한다.

---

## ADR-015: RegionSelector는 Phase 1 필수 포함 (2026-04-09)
**결정:** 자동 감시(Phase 2)가 아니더라도 캡처 영역 지정 UI(RegionSelector)는 Phase 1 MVP에 포함한다.  
**이유:** 수동 캡처도 어디를 캡처할지 알아야 한다. `CaptureRegion`이 없으면 전체 화면을 캡처하게 되어 OCR 노이즈가 급증한다.  
**MVP 구현:** 좌표 숫자 입력 방식(단순). Phase 2 전에 드래그 오버레이 방식으로 개선 예정.

---

## ADR-016: 단일 신청자(1인) 분석 구조로 재정의 (2026-04-09)
**결정:** 파이프라인의 분석 단위를 "신청자 N명 배치"가 아닌 "현재 화면의 신청자 1명"으로 재정의한다.  
**이유:** 게임 UI는 신청자를 한 명씩 보여준다. 공대장은 화살표로 신청자를 넘기며 한 명씩 검토한다. 배치 처리는 잘못된 전제였다.  
**영향:** `ParsedOCRResult.names[]` → `name: CharacterName | null`, `SlotCandidates` 제거, `RankedCandidates` 제거, `ScoredApplicant` 신설, 스크래퍼 입력 단수화.  
**변경 없는 것:** 파이프라인 구조(OCR→스크래퍼→매처→스코어러 순서), 각 모듈의 책임 경계, IPC 방식.

---

## ADR-017: 스크래퍼 FailedLookup도 캐시한다 (2026-04-09)
**결정:** 캐시에 `ScrapedCharacter`뿐 아니라 `FailedLookup`도 저장한다. FailedLookup TTL은 60초.  
**이유:** 1인 루프에서 같은 신청자를 반복해서 보는 경우 던담에 없는 캐릭터(NOT_FOUND)를 매번 요청하게 된다. 실패 결과도 캐싱해 재요청을 방지한다.  
**예외:** NETWORK_ERROR, TIMEOUT은 캐시하지 않는다. 네트워크 복구 후 재시도를 허용하기 위해.

---

## ADR-018: 성능 목표를 1인 반응 시간 기준으로 재정의 (2026-04-09)
**결정:** "전체 처리 시간 30초 이내" 목표를 폐기하고, 캐시 히트 4초 / 캐시 미스 10초로 대체한다.  
**이유:** 배치 처리 목표는 전제가 틀렸다. 1인 루프에서 의미있는 지표는 "신청자가 바뀐 뒤 카드가 뜨기까지의 시간"이다. 공대장이 신청자를 넘길 때마다 느끼는 지연이 UX의 핵심이다.

---

## ADR-019: 후보 식별을 candidateRanker에서 disambiguator로 분리 (2026-04-11)
**결정:** `ranker/candidateRanker.ts` 대신 `modules/disambiguator/index.ts`가 후보 선택을 담당한다. candidateRanker는 파이프라인 핵심 흐름에서 제거된다.  
**이유:** candidateRanker는 점수 정렬(`score + bonus`) 방식으로 후보를 선택했다. 그러나 "어떤 후보가 화면의 신청자인가"는 평가(scoring)와 독립된 *식별(identification)* 문제다. 두 책임을 분리해야 각각 독립적으로 테스트할 수 있고, 식별 로직(직업/명성 힌트 + OCR 신뢰도 가중치)을 명시적으로 표현할 수 있다.  
**영향:** pipeline.ts Phase 3이 `disambiguate()` 호출로 교체됨. `StageDuration.stage`에서 `'rank'` 제거, `'disambiguate'` 추가.

---

## ADR-020: disambiguator 유사도 정렬 알고리즘 (2026-04-11)
**결정:** disambiguator는 OCR 힌트(직업명, 명성)를 기반으로 후보들을 유사도 내림차순 정렬하고, `ranked | not_found`만 반환한다. 자동 선택(auto/recommended/manual) 분류는 하지 않는다.  
**이유:** 공대장이 후보를 직접 판단하는 구조(ADR-025)에서는 앱이 1명을 "선택"할 필요가 없다. 정렬 순서만 제공하면 충분하다.  
**알고리즘 요약:**
- `jobMatch`: candidate.jobName.includes(hintJob) → 0 or 1.0
- `fameMatch`: delta ≤ 500 → 1.0 / ≤ 3000 → 0.5 / else 0.0
- `toWeight(confidence)`: ≤ 0.50 → 0.10 / ≤ 0.80 → 0.50 / > 0.80 → 1.00
- renown < 10,000 → fameWeight = 0 (sanity fail)
- `matchScore = jobMatch * jobWeight + fameMatch * fameWeight`로 각 후보 점수화
- 힌트가 전혀 없으면(분모 = 0) 원래 스크래핑 순서 그대로 반환

---

## ADR-021: PipelineResult를 전체 후보 목록 구조로 전환 (2026-04-11)
**결정:** `success`는 단일 `ScoredCandidate`가 아닌 `ScoredCandidate[]`(유사도 내림차순 정렬)를 포함한다. `disambiguation_required` 브랜치는 제거한다.  
**이유:** ADR-025(공대장이 직접 판단) 정책에 따라 "앱이 1명을 선택"하는 구조가 없어졌다. 모든 후보를 평가해 정렬된 목록으로 반환하고, UI에서 ← → 네비게이터로 순회한다.  
**before:** `success.data: ScoredCandidate` (1명) + `success.disambiguationStatus` + `disambiguation_required.candidates: ScrapedCharacter[]`  
**after:** `success.candidates: ScoredCandidate[]` (전체, 유사도 내림차순)

---

## ADR-022: renderer resultStore를 pipeline 실행 액션 소유자로 확장 (2026-04-11)
**결정:** `resultStore`는 단순 상태 컨테이너가 아니라 `runCapture(region)` 액션을 포함한다. mock/real 분기, isRunning 제어, IPC 예외 처리, candidateIndex 네비게이션을 store가 담당한다.  
**이유:** CaptureOverlayRect 컴포넌트가 mock 분기/비동기 IPC/예외 처리/running 상태 제어를 모두 담당하면 "UI 컴포넌트가 실행 로직을 안다"는 문제가 생긴다. Zustand store에 액션을 두면 컴포넌트는 `runCapture(capture)` 한 줄, 네비게이션은 `nextCandidate()` / `prevCandidate()` 호출만 담당하면 되고, 실행 로직은 독립적으로 테스트 가능해진다.  
**결과:** CaptureOverlayRect는 Alt+C 리스너 → `runCapture(capture)` 호출만 담당. `mockIdx`, `candidateIndex` 상태 모두 store 소유.

---

## ADR-023: mock/real 실행 전환은 USE_MOCK 상수로 관리 (2026-04-11)
**결정:** `resultStore.ts` 상단의 `export const USE_MOCK = true` 상수 하나로 mock/real 모드를 전환한다.  
**이유:** OCR 엔진(ADR-003)이 미결정인 상태에서도 renderer UI를 개발·검증할 수 있어야 한다. 환경 변수나 런타임 분기 대신 컴파일타임 상수를 사용해 dead code 제거가 용이하고, "mock으로 돌아가는지" 코드만 봐도 즉시 알 수 있다.  
**mock 데이터 위치:** `src/renderer/dev/mockResults.ts` — OCR 연결 완료 후 이 파일은 사용되지 않을 예정.

---

## ADR-025: 캡처는 passive mode에서 Alt+C 단축키로 트리거한다 (2026-04-11)
**결정:** 캡처 버튼을 edit mode에 두지 않는다. 대신 글로벌 단축키 Alt+C를 passive mode 전용 트리거로 등록한다.  
**이유:** edit mode는 두 Rect의 위치/크기 조정 전용이다. 캡처를 위해 edit mode로 진입(Alt+Z) → 버튼 클릭 → passive mode 복귀(ESC)하는 흐름은 공대장이 게임 진행 중에 사용하기 너무 불편하다. passive mode에서 Alt+C 한 번으로 캡처를 트리거하면 게임 포커스를 빼앗기지 않는다.  
**구현:** Main Process에서 `globalShortcut.register('Alt+C')` → `mainWindow.webContents.send('capture:shortcut')` IPC 푸시 → Renderer의 `onCaptureShortcut` 리스너 → `runCapture(capture)`.  
**passive mode에서 Alt+C만 트리거:** `if (currentMode !== 'passive') return` 가드로 edit mode 중에는 무시.

---

## ADR-026: 앱은 후보를 자동 선택하지 않는다 — 공대장이 직접 판단한다 (2026-04-11)
**결정:** disambiguator의 auto/recommended/manual 분류를 제거한다. 대신 전체 후보를 유사도 내림차순으로 정렬해 ResultView에 표시하고, 공대장이 ← → 네비게이터로 순회하며 직접 판단한다.  
**이유:** 공대장은 본인만의 기준(예: 길드 우선, 명성 컷, 특정 직업 선호)으로 신청을 판단한다. 앱이 "이 사람이 신청자입니다"라고 결론을 내리면 공대장의 판단 여지를 빼앗는다. 앱의 역할은 데이터를 빠르게 보여주는 것이지, 판단하는 것이 아니다.  
**네비게이터 조건:** 후보가 2명 이상일 때만 ← → 버튼 표시. 단일 후보면 버튼 없이 카드만 표시.  
**인덱스 0 = 가장 유사한 후보.** 캡처할 때마다 candidateIndex = 0으로 초기화된다.
