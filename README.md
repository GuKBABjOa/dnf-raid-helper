# 던파 공대장 도우미

파티 신청창을 캡처하면 후보 캐릭터의 스펙을 자동으로 조회하고, 공격대 슬롯별 최적 후보를 카드 UI로 표시하는 Electron 데스크탑 오버레이 앱.

## 기능

- `Alt+C` — 파티 신청창 캡처 → OCR → 던담 자동 조회 → 결과 카드 표시
- `Alt+Z` — 편집 모드 전환 (카드/캡처 영역 위치·크기 조정)
- 후보 여러 명 검색 시 ◀▶ 버튼으로 탐색
- 검색 실패 시 닉네임 직접 입력 검색
- 결과 카드에서 🔍 버튼으로 다른 닉네임 검색

## 기술 스택

- **런타임:** Electron + Node.js
- **언어:** TypeScript
- **OCR:** Claude Vision (`claude-haiku-4-5-20251001`)
- **UI:** React + Zustand
- **스크래퍼:** Electron BrowserWindow (던담 CSR 앱 대응)
- **서버:** Express 프록시 서버 (`server/` 폴더)

## 현재 상태

- [x] 프로젝트 초기화
- [x] OCR 모듈 (Claude Vision)
- [x] 스크래퍼 모듈 (던담)
- [x] 매처/스코어러 모듈
- [x] 오버레이 UI (React)
- [x] 닉네임 직접 검색 기능
- [x] 프록시 서버 (`server/`)

## 환경 변수

### 클라이언트 (앱 루트 `.env`)

| 변수 | 설명 |
|------|------|
| `SERVER_URL` | 프록시 서버 URL (배포 모드) |
| `INVITE_CODE` | 서버 접근 초대코드 (배포 모드) |
| `ANTHROPIC_API_KEY` | 로컬 개발 전용 — `SERVER_URL`/`INVITE_CODE` 없을 때 사용 |

> `SERVER_URL` + `INVITE_CODE` 가 있으면 프록시 서버 경유, 없으면 `ANTHROPIC_API_KEY`로 직접 호출.

### 서버 (`server/.env`)

| 변수 | 설명 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `PORT` | 포트 (기본값: 3000) |

## 서버 초대코드 관리

`server/codes.json` 배열에 코드 추가/제거 후 서버 재시작:

```json
["beta-001", "beta-002", "beta-003"]
```

## 개발 실행

```bash
# 의존성 설치
npm install

# 개발 모드 (앱)
npm run dev

# 서버 개발 모드
cd server && npm run dev
```

## 문서

- [아키텍처 설계](docs/architecture.md)
- [데이터 흐름](docs/data-flow.md)
- [기술 결정 로그](docs/decisions.md)
