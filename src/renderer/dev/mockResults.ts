/**
 * dev/mockResults.ts — OCR 없이 UI를 테스트하기 위한 mock PipelineResult
 *
 * USE_MOCK=true 상태에서 Alt+C를 누를 때마다 MOCK_RESULTS를 순환한다.
 * OCR 연결 후 이 파일은 사용되지 않는다.
 */

import type { PipelineResult } from '../../types/pipeline';
import type { ScoredCandidate } from '../../types/candidate';

const makeCandidate = (
  name: string,
  server: string,
  jobName: string,
  renown: number,
  statType: 'damage' | 'buff',
  primaryValue: number,
  displayLabel: string,
): ScoredCandidate => ({
  name,
  server,
  jobName,
  adventureName: null,
  renown,
  stats: { type: statType, primaryValue, displayLabel },
  visual: { fullBodyImageUrl: null, jobIconUrl: null },
  fetchedAt: new Date(),
  role: statType === 'damage' ? 'dealer' : 'buffer',
  eligibleSlots: [],
  score: primaryValue,
  breakdown: [],
  isWarning: false,
});

// 후보 1명 (성공, 단일)
const singleSuccessMock: PipelineResult = {
  status: 'success',
  candidates: [
    makeCandidate('아이유', '아린', '眞 스트리트파이터', 45_900, 'damage', 5_000_000_000, '50억'),
  ],
  ocrResult: {
    name: '아이유',
    jobName: '스트리트파이터',
    renown: 45_901,
    confidence: 0.92,
    rawLines: ['아이유', '스트리트파이터', '45901'],
    warnings: [],
    needsManualReview: false,
  },
  cacheHit: false,
  durationMs: 342,
  stageDurations: [
    { stage: 'capture',     durationMs: 15  },
    { stage: 'preprocess',  durationMs: 8   },
    { stage: 'recognize',   durationMs: 120 },
    { stage: 'parse',       durationMs: 3   },
    { stage: 'scrape',      durationMs: 180 },
    { stage: 'disambiguate',durationMs: 2   },
    { stage: 'match',       durationMs: 1   },
    { stage: 'score',       durationMs: 0   },
  ],
};

// 후보 3명 (← → 네비게이터 테스트)
const multiSuccessMock: PipelineResult = {
  status: 'success',
  candidates: [
    makeCandidate('홍길동', '아린',   '眞 스트리트파이터', 46_200, 'damage', 8_200_000_000, '82억'),
    makeCandidate('홍길동', '시로코', '眞 스트리트파이터', 45_900, 'damage', 5_000_000_000, '50억'),
    makeCandidate('홍길동', '카인',   '眞 크루세이더',     44_500, 'buff',   7_800_000,     '780만'),
  ],
  ocrResult: {
    name: '홍길동',
    jobName: null,
    renown: null,
    confidence: 0.75,
    rawLines: ['홍길동'],
    warnings: [],
    needsManualReview: false,
  },
  cacheHit: false,
  durationMs: 520,
  stageDurations: [
    { stage: 'capture',     durationMs: 15  },
    { stage: 'preprocess',  durationMs: 8   },
    { stage: 'recognize',   durationMs: 150 },
    { stage: 'parse',       durationMs: 3   },
    { stage: 'scrape',      durationMs: 330 },
    { stage: 'disambiguate',durationMs: 2   },
    { stage: 'match',       durationMs: 2   },
    { stage: 'score',       durationMs: 0   },
  ],
};

const ocrFailedMock: PipelineResult = {
  status: 'ocr_failed',
  ocrResult: null,
};

export const MOCK_RESULTS: PipelineResult[] = [
  singleSuccessMock,
  multiSuccessMock,
  ocrFailedMock,
];
