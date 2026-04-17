import type { OCRResult } from './contracts';
import type { ParsedNameOCRCandidate, ParsedOCRResultWithCandidates, OCRRecognitionPayload } from './contracts';
import type { OCRWarning } from '../types/ocr';
import { parseNamePipeline } from './ocrParser';
import { selectNameCandidate } from './providerSelector';

function parseJob(jobZoneText: string): string | null {
  if (!jobZoneText) return null;
  const text = jobZoneText.split('\n')[0].trim();

  const jinMatch = text.match(/眞?\s+[가-힣一-龥]+(?:\s+[가-힣一-龥]+)*/);
  if (jinMatch) return jinMatch[0].trim();

  const korMatch = text.match(/[가-힣]{2,}(?:\s+[가-힣]{2,})*/);
  if (korMatch) return korMatch[0].trim();

  return null;
}

function parseRenown(row3: string): number | null {
  const labeled = row3.match(/명성[:\s.]+([0-9,]+)/);
  if (labeled) {
    const n = parseInt(labeled[1].replace(/,/g, ''), 10);
    if (!isNaN(n)) return n;
  }

  for (const match of [...row3.matchAll(/[0-9,]{4,}/g)]) {
    const n = parseInt(match[0].replace(/,/g, ''), 10);
    if (!isNaN(n) && n >= 1000) return n;
  }

  return null;
}

function chooseFirstNonEmpty(results: OCRResult[]): OCRResult | null {
  return results.find((result) => result.text.trim().length > 0) ?? null;
}

function buildRawLines(payload: OCRRecognitionPayload): string[] {
  return [
    ...payload.name.map((result) => `[OCR][name][${result.source}] ${result.text}`),
    ...payload.job.map((result) => `[OCR][job][${result.source}] ${result.text}`),
    ...payload.row3.map((result) => `[OCR][row3][${result.source}] ${result.text}`),
  ];
}

export function parseOcrPayload(payload: OCRRecognitionPayload): ParsedOCRResultWithCandidates {
  const warnings: OCRWarning[] = [];

  const parsedNameCandidates = parseNameCandidates(payload.name);
  const selectedName = selectNameCandidate(parsedNameCandidates);
  const bestParsedName = selectedName.candidate?.parsed ?? null;
  const selectedJob = chooseFirstNonEmpty(payload.job);
  const selectedRow3 = chooseFirstNonEmpty(payload.row3);

  const name = bestParsedName?.name ?? null;
  const jobName = selectedJob ? parseJob(selectedJob.text) : null;
  const renown = selectedRow3 ? parseRenown(selectedRow3.text) : null;

  if (bestParsedName?.reviewFlags.includes('SPECIAL_CHAR')) {
    warnings.push({
      type: 'POSSIBLE_MISREAD',
      detail: `special characters detected in OCR name: "${name}"`,
    });
  }

  if (bestParsedName?.reviewFlags.includes('LV_COLLISION')) {
    warnings.push({
      type: 'POSSIBLE_MISREAD',
      detail: `possible level-prefix collision in OCR name: "${name}"`,
    });
  }

  let confidence = 0.0;
  if (name) confidence += 0.5;
  if (jobName) confidence += 0.3;
  if (renown !== null) confidence += 0.2;

  const hasQualityFlag = bestParsedName?.reviewFlags.some(
    (flag) => flag === 'LOW_SCORE' || flag === 'TRUNCATED',
  ) ?? false;
  if (hasQualityFlag) confidence -= 0.2;

  if (warnings.some((warning) => warning.type === 'POSSIBLE_MISREAD')) confidence -= 0.2;

  confidence = Math.max(0.0, Math.min(1.0, confidence));

  if (confidence < 0.7) {
    warnings.push({
      type: 'LOW_CONFIDENCE',
      detail: `confidence: ${confidence.toFixed(2)}`,
    });
  }

  return {
    name,
    jobName,
    renown,
    confidence,
    rawLines: buildRawLines(payload),
    ocrResults: payload,
    nameSelectionDebug: selectedName.debugReason,
    warnings,
    needsManualReview:
      confidence < 0.7 ||
      (bestParsedName?.reviewFlags.some(
        (flag) => flag === 'SPECIAL_CHAR' || flag === 'TRUNCATED' || flag === 'LV_COLLISION',
      ) ?? false),
  };
}

export function parseNameCandidates(results: OCRResult[]): ParsedNameOCRCandidate[] {
  return results
    .map((result) => {
      const parsed = parseNamePipeline(result.text);
      if (parsed) {
        console.log(`[OCR][name][${result.source}][parsed] "${parsed.name}" score=${parsed.confidenceScore.toFixed(2)}`);
      } else {
        console.log(`[OCR][name][${result.source}][parsed] null`);
      }
      return {
        ocr: result,
        parsed,
      };
    })
    .filter(
      (candidate): candidate is ParsedNameOCRCandidate => candidate.parsed !== null,
    );
}
