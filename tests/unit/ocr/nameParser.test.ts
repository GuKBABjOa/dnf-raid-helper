/**
 * nameParser.test.ts — 이름 파싱 파이프라인 단위 테스트
 *
 * 테스트 대상:
 *   normalizeNameText / extractNameCandidates / scoreNameCandidate
 *   parseNamePipeline (전체 파이프라인 통합)
 *   shouldManualReview (플래그 판정)
 *
 * 회귀 테스트 입력값:
 *   실제 OCR 실행 후 캡처한 NAME원문을 그대로 사용.
 *   Tesseract 재실행 없이 파서 로직만 검증한다.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeNameText,
  extractNameCandidates,
  scoreNameCandidate,
  shouldManualReview,
  parseNamePipeline,
  type NameCandidate,
} from '../../../src/ocr/ocrParser';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 후보 생성 헬퍼 (테스트 가독성용) */
function makeCandidate(
  text: string,
  type: NameCandidate['type'],
  score = 0,
): NameCandidate {
  return { text, type, score, debugReason: '' };
}

// ─── normalizeNameText ────────────────────────────────────────────────────────

describe('normalizeNameText — Lv 오인식 변형 제거', () => {
  it('Lv.115 제거', () => {
    expect(normalizeNameText('Lv.115 Nepel-Kasch')).toBe('Nepel-Kasch');
  });

  it('Lv,115 제거', () => {
    expect(normalizeNameText('Lv,115 Nepel-Pichu 區')).toBe('Nepel-Pichu 區');
  });

  it('Lw55 제거 (w 오인식)', () => {
    expect(normalizeNameText('Lw55 Nepel-Lars')).toBe('Nepel-Lars');
  });

  it('v,115 제거 (L 탈락, 선두)', () => {
    expect(normalizeNameText('v,115 Nepel-斷罪 호')).toBe('Nepel-斷罪 호');
  });

  it('vi 15 제거 (L+v 분리 오인식, 선두)', () => {
    expect(normalizeNameText('vi 15 Nepel-Lars 還')).toBe('Nepel-Lars 還');
  });

  it('선행 순수 숫자+공백 제거', () => {
    expect(normalizeNameText('0 15 Nepel-Kasch 和')).toBe('Nepel-Kasch 和');
  });

  it('전각 구두점(。) 제거', () => {
    expect(normalizeNameText('Lv,55。Nepel-如如')).toBe('Nepel-如如');
  });

  it('여러 줄 중 첫 줄만 유지', () => {
    expect(normalizeNameText('Nepel-Kasch\n다음줄노이즈')).toBe('Nepel-Kasch');
  });

  it('Lv가 선두에 없으면 이름 내부를 건드리지 않는다', () => {
    // 이름이 Lv로 시작하는 가상 케이스 — 실제로는 드물지만 보호
    const result = normalizeNameText('30 15 커피맞만주');
    expect(result).toBe('커피맞만주');
  });
});

// ─── extractNameCandidates ────────────────────────────────────────────────────

describe('extractNameCandidates — 후보 수집', () => {
  it('영문 이름 추출', () => {
    const candidates = extractNameCandidates('Nepel-Kasch');
    const texts = candidates.map((c) => c.text);
    expect(texts).toContain('Nepel-Kasch');
  });

  it('한글 이름 추출 (2자 이상)', () => {
    const candidates = extractNameCandidates('눈가린파리채');
    expect(candidates[0].text).toBe('눈가린파리채');
    expect(candidates[0].type).toBe('korean');
  });

  it('한글 1자는 추출하지 않는다', () => {
    const candidates = extractNameCandidates('호');
    expect(candidates).toHaveLength(0);
  });

  it('하이픈 끝 토큰 + 한자 결합 (Nepel-血魔)', () => {
    const candidates = extractNameCandidates('Nepel-血魔,,');
    const texts = candidates.map((c) => c.text);
    expect(texts).toContain('Nepel-血魔');
    // 결합 결과의 타입은 mixed
    const mixed = candidates.find((c) => c.text === 'Nepel-血魔');
    expect(mixed?.type).toBe('mixed');
  });

  it('하이픈 끝 토큰 + 한자 결합 (Nepel-斷罪)', () => {
    const candidates = extractNameCandidates('Nepel-斷罪 호');
    const texts = candidates.map((c) => c.text);
    expect(texts).toContain('Nepel-斷罪');
  });

  it('영문 2글자 이름도 후보에 포함된다 (길이 제한 없음)', () => {
    const candidates = extractNameCandidates('AB');
    expect(candidates.map((c) => c.text)).toContain('AB');
  });

  it('특수문자 토큰 감지 (♥이름)', () => {
    const candidates = extractNameCandidates('♥이름♥');
    const special = candidates.find((c) => c.type === 'special');
    expect(special).toBeDefined();
  });

  it('빈 문자열은 빈 배열 반환', () => {
    expect(extractNameCandidates('')).toHaveLength(0);
  });
});

// ─── scoreNameCandidate ───────────────────────────────────────────────────────

describe('scoreNameCandidate — 스코어링', () => {
  it('하이픈 포함 영문 긴 이름: 높은 점수', () => {
    const scored = scoreNameCandidate(makeCandidate('Nepel-Kasch', 'english'));
    // len≥6(+2) + hyphen(+3) + english(+1) = 6
    expect(scored.score).toBe(6);
  });

  it('하이픈 + 한자 혼합: 가장 높은 점수', () => {
    const scored = scoreNameCandidate(makeCandidate('Nepel-血魔', 'mixed'));
    // len≥6(+2) + hyphen(+3) + mixed(+2) = 7
    expect(scored.score).toBe(7);
  });

  it('한글 긴 이름: 적절한 점수', () => {
    const scored = scoreNameCandidate(makeCandidate('눈가린파리채', 'korean'));
    // len≥6(+2) + korean(+1) = 3
    expect(scored.score).toBe(3);
  });

  it('2글자 영문 이름: 0점 (페널티 없음)', () => {
    const scored = scoreNameCandidate(makeCandidate('AB', 'english'));
    // len 2~3(0) + english(+1) = 1
    expect(scored.score).toBe(1);
  });

  it('2글자 한글 이름: 1점', () => {
    const scored = scoreNameCandidate(makeCandidate('리채', 'korean'));
    // len 2~3(0) + korean(+1) = 1
    expect(scored.score).toBe(1);
  });

  it('단독 알파벳: 음수', () => {
    const scored = scoreNameCandidate(makeCandidate('D', 'english'));
    // len≤1(-3) + english(+1) = -2
    expect(scored.score).toBe(-2);
  });

  it('Lv 패턴: 강한 페널티', () => {
    const scored = scoreNameCandidate(makeCandidate('Lv115', 'english'));
    // len≥4(+1) + english(+1) + lv-pattern(-5) = -3
    expect(scored.score).toBe(-3);
  });

  it('특수문자 타입: 소폭 페널티', () => {
    const scored = scoreNameCandidate(makeCandidate('♥이름♥', 'special'));
    // len 4~5(+1) + special(-1) = 0
    expect(scored.score).toBe(0);
  });

  it('debugReason이 비어있지 않다', () => {
    const scored = scoreNameCandidate(makeCandidate('Nepel-Kasch', 'english'));
    expect(scored.debugReason).not.toBe('');
  });
});

// ─── shouldManualReview ───────────────────────────────────────────────────────

describe('shouldManualReview — 플래그 판정', () => {
  it('2자 이하 이름: SHORT_NAME', () => {
    const best = makeCandidate('AB', 'english', 1);
    const flags = shouldManualReview(best, [best], 'AB');
    expect(flags).toContain('SHORT_NAME');
  });

  it('특수문자 포함 텍스트: SPECIAL_CHAR', () => {
    const best = makeCandidate('이름', 'korean', 1);
    const flags = shouldManualReview(best, [best], '♥이름♥');
    expect(flags).toContain('SPECIAL_CHAR');
  });

  it('special 타입 winner: SPECIAL_CHAR', () => {
    const best = makeCandidate('♥이름', 'special', 0);
    const flags = shouldManualReview(best, [best], '♥이름');
    expect(flags).toContain('SPECIAL_CHAR');
  });

  it('한글 2자 단독 후보: TRUNCATED', () => {
    const best = makeCandidate('리채', 'korean', 1);
    const flags = shouldManualReview(best, [best], '리채');
    expect(flags).toContain('TRUNCATED');
  });

  it('한글 2자지만 경쟁 후보(양성)가 있으면 TRUNCATED 아님', () => {
    const best = makeCandidate('리채', 'korean', 1);
    const other = makeCandidate('Nepel-Lars', 'english', 6);
    const flags = shouldManualReview(best, [best, other], '리채');
    expect(flags).not.toContain('TRUNCATED');
  });

  it('점수 1 이하: LOW_SCORE', () => {
    const best = makeCandidate('AB', 'english', 1);
    const flags = shouldManualReview(best, [best], 'AB');
    expect(flags).toContain('LOW_SCORE');
  });

  it('점수 2 이상: LOW_SCORE 없음', () => {
    const best = makeCandidate('Nepel', 'english', 4);
    const flags = shouldManualReview(best, [best], 'Nepel');
    expect(flags).not.toContain('LOW_SCORE');
  });

  it('2자 영문 v로 시작: LV_COLLISION', () => {
    const best = makeCandidate('Vi', 'english', 1);
    const flags = shouldManualReview(best, [best], 'Vi');
    expect(flags).toContain('LV_COLLISION');
  });

  it('긴 영문 이름: 플래그 없음', () => {
    const best = makeCandidate('Nepel-Kasch', 'english', 6);
    const flags = shouldManualReview(best, [best], 'Nepel-Kasch');
    expect(flags).toHaveLength(0);
  });
});

// ─── parseNamePipeline — 회귀 테스트 (15개 fixture NAME원문) ──────────────────

describe('parseNamePipeline — 회귀 테스트 (실제 OCR 출력값)', () => {
  const cases: Array<{ file: string; nameZoneOcr: string; expected: string }> = [
    { file: 'buffer1',  nameZoneOcr: 'Lv,115 Nepel-Pichu 區',       expected: 'Nepel-Pichu' },
    { file: 'buffer2',  nameZoneOcr: 'Lv,115 Nepel-Muse',            expected: 'Nepel-Muse' },
    { file: 'dealer1',  nameZoneOcr: '0 15 Nepel-Kasch 和',          expected: 'Nepel-Kasch' },
    { file: 'dealer2',  nameZoneOcr: 'Lv,115_Nepel-Ellie 0',         expected: 'Nepel-Ellie' },
    { file: 'dealer3',  nameZoneOcr: '3 15 Nepel-Loyvan 10',         expected: 'Nepel-Loyvan' },
    { file: 'dealer4',  nameZoneOcr: 'Lv,115 Nepel-血魔,,',          expected: 'Nepel-血魔' },
    { file: 'dealer5',  nameZoneOcr: 'Lv,55\u3002Nepel-如如',        expected: 'Nepel-如如' },
    { file: 'dealer6',  nameZoneOcr: '4115 눈가린파리채',             expected: '눈가린파리채' },
    { file: 'dealer8',  nameZoneOcr: '30 15 커피맞만주',              expected: '커피맞만주' },
    { file: 'dealer9',  nameZoneOcr: 'Lv,115 패밀리파리채',           expected: '패밀리파리채' },
    { file: 'dealer10', nameZoneOcr: 'Lv,115 피터진파리채 !0!.',      expected: '피터진파리채' },
    { file: 'dealer11', nameZoneOcr: 'Lv,115 소환된파리채',           expected: '소환된파리채' },
    { file: 'synergy1', nameZoneOcr: 'v,115 Nepel-斷罪 호',          expected: 'Nepel-斷罪' },
    { file: 'synergy2', nameZoneOcr: 'vi 15 Nepel-Lars 還',          expected: 'Nepel-Lars' },
  ];

  for (const { file, nameZoneOcr, expected } of cases) {
    it(`${file}: "${expected}"`, () => {
      const result = parseNamePipeline(nameZoneOcr);
      expect(result?.name).toBe(expected);
    });
  }

  // dealer7은 이미지에서 이름이 실제로 잘린 케이스
  it('dealer7: 이름 잘림 케이스 → 리채 반환 + TRUNCATED 플래그', () => {
    const result = parseNamePipeline('8 15          리채');
    expect(result?.name).toBe('리채');
    expect(result?.reviewFlags).toContain('TRUNCATED');
    expect(result?.reviewFlags).toContain('SHORT_NAME');
  });
});

// ─── parseNamePipeline — 추가 케이스 ──────────────────────────────────────────

describe('parseNamePipeline — 추가 케이스', () => {
  it('2글자 영문 이름 AB: 이름 반환 + SHORT_NAME', () => {
    const result = parseNamePipeline('Lv,115 AB');
    expect(result?.name).toBe('AB');
    expect(result?.reviewFlags).toContain('SHORT_NAME');
  });

  it('2글자 영문 이름 Ry: 이름 반환', () => {
    const result = parseNamePipeline('Lv,115 Ry');
    expect(result?.name).toBe('Ry');
  });

  it('하이픈+한자 혼합 이름: 정확히 결합', () => {
    const result = parseNamePipeline('Lv,115 Nepel-血魔,,');
    expect(result?.name).toBe('Nepel-血魔');
    expect(result?.reviewFlags).toHaveLength(0);
  });

  it('Lv 오인식 패턴만 있고 이름 없음: null 반환', () => {
    const result = parseNamePipeline('Lv,115');
    expect(result).toBeNull();
  });

  it('특수문자 이름 ♥이름♥: 이름 반환 + SPECIAL_CHAR', () => {
    const result = parseNamePipeline('♥이름♥');
    expect(result?.name).not.toBeNull();
    expect(result?.reviewFlags).toContain('SPECIAL_CHAR');
  });

  it('실제 이름이 Vi인 경우: 이름 반환 + LV_COLLISION', () => {
    const result = parseNamePipeline('Lv,115 Vi');
    expect(result?.name).toBe('Vi');
    expect(result?.reviewFlags).toContain('LV_COLLISION');
  });

  it('짧은 이름 Vi와 긴 이름이 함께 있으면 긴 이름 선택', () => {
    // 정규화 후 vi 15가 제거되면 Nepel-Lars만 남음
    const result = parseNamePipeline('vi 15 Nepel-Lars 還');
    expect(result?.name).toBe('Nepel-Lars');
    expect(result?.reviewFlags).not.toContain('LV_COLLISION');
  });

  it('완전히 빈 입력: null 반환', () => {
    expect(parseNamePipeline('')).toBeNull();
  });

  it('confidenceScore: 긴 하이픈 이름은 높은 점수', () => {
    const result = parseNamePipeline('Lv,115 Nepel-Kasch');
    // score = 6, confidenceScore = 6/6 = 1.0
    expect(result?.confidenceScore).toBe(1.0);
  });

  it('confidenceScore: 짧은 이름은 낮은 점수', () => {
    const result = parseNamePipeline('Lv,115 AB');
    // AB score = 1, confidenceScore = 1/6 ≈ 0.17
    expect((result?.confidenceScore ?? 0)).toBeLessThan(0.5);
  });

  it('debugReason이 채워진다', () => {
    const result = parseNamePipeline('Nepel-Kasch');
    expect(result?.debugReason).not.toBe('');
  });
});
