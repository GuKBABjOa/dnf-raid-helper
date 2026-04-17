import type { ParsedNameOCRCandidate, SelectedNameCandidate } from './contracts';

const PROVIDER_WEIGHTS: Record<string, number> = {
  claude: 4.0,
};

const REVIEW_FLAG_PENALTIES: Record<string, number> = {
  SHORT_NAME: -0.6,
  SPECIAL_CHAR: -0.8,
  TRUNCATED: -2.6,
  LOW_SCORE: -0.8,
  LV_COLLISION: -0.8,
};

function getProviderWeight(source: string): number {
  return PROVIDER_WEIGHTS[source] ?? 0;
}

function getLengthScore(text: string): number {
  if (text.length >= 8) return 1.2;
  if (text.length >= 5) return 0.8;
  if (text.length >= 3) return 0.3;
  return -0.5;
}

function getReviewPenalty(candidate: ParsedNameOCRCandidate): number {
  return candidate.parsed.reviewFlags.reduce((total, flag) => total + (REVIEW_FLAG_PENALTIES[flag] ?? 0), 0);
}

function buildCandidateScore(candidate: ParsedNameOCRCandidate): { score: number; debugReason: string[] } {
  const debugReason: string[] = [];
  let score = 0;

  const providerWeight = getProviderWeight(candidate.ocr.source);
  score += providerWeight;
  debugReason.push(`provider=${candidate.ocr.source} weight(${providerWeight >= 0 ? '+' : ''}${providerWeight.toFixed(1)})`);

  const parserScore = candidate.parsed.confidenceScore * 2;
  score += parserScore;
  debugReason.push(`parserConfidence(+${parserScore.toFixed(2)})`);

  const validityScore = candidate.parsed.name ? 1.5 : -2;
  score += validityScore;
  debugReason.push(`parsedValidity(${validityScore >= 0 ? '+' : ''}${validityScore.toFixed(1)})`);

  const lengthScore = getLengthScore(candidate.parsed.name);
  score += lengthScore;
  debugReason.push(`textLength(${lengthScore >= 0 ? '+' : ''}${lengthScore.toFixed(1)})`);

  const reviewPenalty = getReviewPenalty(candidate);
  score += reviewPenalty;
  debugReason.push(`reviewFlagPenalty(${reviewPenalty >= 0 ? '+' : ''}${reviewPenalty.toFixed(1)})`);

  return { score, debugReason };
}

export function selectNameCandidate(candidates: ParsedNameOCRCandidate[]): SelectedNameCandidate {
  if (candidates.length === 0) {
    return {
      candidate: null,
      score: Number.NEGATIVE_INFINITY,
      debugReason: ['no parsed name candidates available'],
    };
  }

  const scored = candidates.map((candidate) => {
    const scoredCandidate = buildCandidateScore(candidate);
    return { candidate, ...scoredCandidate };
  });

  scored.sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const runnerUp = scored[1];
  const debugReason = [...winner.debugReason];

  if (runnerUp) {
    debugReason.push(
      `selected over ${runnerUp.candidate.ocr.source} because totalScore(${winner.score.toFixed(2)} > ${runnerUp.score.toFixed(2)})`,
    );
  } else {
    debugReason.push('selected as the only parsed candidate');
  }

  console.log(
    `[OCR][name][selector] selected=${winner.candidate.parsed.name} source=${winner.candidate.ocr.source} score=${winner.score.toFixed(2)}`,
  );

  return {
    candidate: winner.candidate,
    score: winner.score,
    debugReason,
  };
}
