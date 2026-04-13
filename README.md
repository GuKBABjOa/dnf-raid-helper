# 던파 공대장 도우미

파티 신청창을 캡처하면 후보 캐릭터의 스펙을 자동으로 조회하고, 공격대 슬롯별 최적 후보를 카드 UI로 표시하는 Electron 데스크탑 앱.

## 목표 (MVP)

- 파티 신청창 스크린샷 OCR 분석
- 던담에서 캐릭터 스펙 자동 조회
- 공격대 슬롯별 후보 매칭 및 스코어 정렬
- 후보 카드 UI 표시

## 기술 스택

- **런타임:** Electron + Node.js
- **언어:** TypeScript
- **OCR:** 미결정 (docs/decisions.md 참조)
- **UI:** 미결정

## 현재 상태

- [x] 프로젝트 초기화
- [ ] 기술 스택 확정
- [ ] 개발 환경 구성 (tsconfig, eslint, vitest)
- [ ] OCR 모듈 프로토타입
- [ ] 스크래퍼 모듈 프로토타입
- [ ] 매처/스코어러 모듈
- [ ] UI 구현
- [ ] 통합 테스트

## 문서

- [아키텍처 설계](docs/architecture.md)
- [데이터 흐름](docs/data-flow.md)
- [기술 결정 로그](docs/decisions.md)

## 개발 원칙

- 모듈은 독립적으로 테스트 가능해야 한다
- 모듈 간 직접 import 금지 — 타입(`src/types/`)으로만 통신
- IPC는 contextBridge를 통해서만 노출
- 에러는 파이프라인을 멈추지 않고 부분 실패를 허용한다
