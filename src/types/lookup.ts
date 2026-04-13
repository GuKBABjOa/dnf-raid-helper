/**
 * lookup.ts — 스크래퍼 조회 결과 타입
 *
 * 의존: character.ts (ScrapedCharacter)
 * 사용처:
 *   - Main: scraper/dunjiadam.ts (LookupResult 반환)
 *   - Main: scraper/cache.ts (LookupResult 캐시 저장)
 *   - Main: pipeline.ts (LookupResult 분기 처리)
 *
 * 변경 영향:
 *   - LookupErrorReason 변경 → pipeline.ts PipelineResult 브랜치, ErrorView 메시지
 *   - LookupResult 변경 → scraper/cache.ts, pipeline.ts
 *
 * 캐시 정책 (ADR-017):
 *   - 성공(ok): 세션 유지
 *   - 실패(failed): NOT_FOUND는 60초 TTL
 *   - NETWORK_ERROR, TIMEOUT: 캐시하지 않음 (네트워크 복구 후 재시도 허용)
 */

import type { ScrapedCharacter } from './character';

export type LookupErrorReason =
  | 'NOT_FOUND'      // 던담에 해당 캐릭터 없음
  | 'NETWORK_ERROR'  // HTTP 요청 실패
  | 'PARSE_ERROR'    // 응답은 왔으나 파싱 실패
  | 'RATE_LIMITED'   // 429 응답
  | 'TIMEOUT';       // 3초 타임아웃 초과

export interface FailedLookup {
  status: 'failed';
  name: string;
  reason: LookupErrorReason;
  attemptedAt: Date;
}

/**
 * scraper 모듈의 공개 출력 타입.
 * pipeline.ts가 이 유니온을 분기해서 처리한다.
 *
 * ok.data는 검색 결과 후보 전체 배열 — scraper는 선택하지 않는다.
 * ranker가 data[]를 받아 RankedCandidateList를 생성하고 1순위를 결정한다.
 * failed → 파이프라인 중단.
 */
export type LookupResult =
  | { status: 'ok'; data: ScrapedCharacter[] }
  | FailedLookup;
