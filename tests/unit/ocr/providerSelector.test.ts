import { describe, expect, it } from 'vitest';
import { selectNameCandidate } from '../../../src/ocr/providerSelector';
import type { ParsedNameOCRCandidate } from '../../../src/ocr/contracts';

function makeCandidate(
  source: string,
  name: string,
  confidenceScore: number,
  reviewFlags: Array<'SHORT_NAME' | 'SPECIAL_CHAR' | 'TRUNCATED' | 'LOW_SCORE' | 'LV_COLLISION'> = [],
): ParsedNameOCRCandidate {
  return {
    ocr: {
      source,
      text: name,
      zone: 'name',
      confidence: 99,
    },
    parsed: {
      name,
      candidates: [],
      confidenceScore,
      reviewFlags,
      debugReason: 'test',
    },
  };
}

describe('providerSelector', () => {
  it('provider raw confidence instead uses provider weight + parser quality', () => {
    const result = selectNameCandidate([
      makeCandidate('easyocr', '커피맛만주', 1.0),
      makeCandidate('tesseract', '커피맛안주', 0.8),
    ]);

    expect(result.candidate?.parsed.name).toBe('커피맛안주');
    expect(result.debugReason.some((line) => line.includes('provider=tesseract'))).toBe(true);
  });

  it('review flag penalty can outweigh parser confidence advantage', () => {
    const result = selectNameCandidate([
      makeCandidate('tesseract', '소환된바리채', 1.0, ['TRUNCATED']),
      makeCandidate('easyocr', '소환된파리채', 0.8),
    ]);

    expect(result.candidate?.parsed.name).toBe('소환된파리채');
    expect(result.debugReason.some((line) => line.includes('reviewFlagPenalty'))).toBe(true);
  });
});
