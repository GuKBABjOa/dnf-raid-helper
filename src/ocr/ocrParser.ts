/**
 * ocrParser.ts — OCR 원시 텍스트 → ParsedOCRResult
 *
 * 의존: types/ocr.ts
 * 사용처: main/ipc/capture.ipc.ts (PipelineDeps.parseOcr으로 주입)
 *
 * 입력 형식 (recognize.ts가 생성하는 태그 구분자 포맷):
 *   §NAME§<이름>
 *   §JOB§<직업명>
 *   §ROW3§<명성 행>
 *
 * 이름 파싱 파이프라인 (parseName 단일 함수 → 5단계 분리):
 *   1. normalizeNameText   — 잡음 제거 (Lv 오인식, 선두 숫자 등)
 *   2. extractNameCandidates — 후보 수집 (영문·한글·특수문자 토큰)
 *   3. scoreNameCandidate  — 각 후보에 점수 부여
 *   4. pickBestName        — 최고 점수 후보 선택
 *   5. shouldManualReview  — 수동 확인 플래그 판정
 *
 * 분리 이유:
 *   규칙이 늘어날 때 하나의 parseName에 정규식 예외를 덧붙이는 대신
 *   각 단계를 독립적으로 테스트·수정할 수 있다.
 *   scoring 기반 구조이므로 새 규칙은 점수 항목 추가로만 반영된다.
 */

import type { ParsedOCRResult, OCRWarning } from '../types/ocr';

// ─── 이름 파싱 타입 ──────────────────────────────────────────────────────────

export type NameCandidateType = 'english' | 'korean' | 'mixed' | 'special';

/**
 * 이름 파싱 결과에 붙는 수동 확인 플래그.
 * 여러 개가 동시에 붙을 수 있다.
 *
 * SHORT_NAME   — 이름이 2자 이하. 실제 짧은 이름일 수 있으나 확인 권장.
 * SPECIAL_CHAR — 특수문자(♥, †, ★ 등) 감지. OCR이 오인식했을 가능성.
 * TRUNCATED    — 한글 2자 이하가 단독 후보. 이미지에서 이름이 잘린 것으로 의심.
 * LOW_SCORE    — 최우선 후보의 점수가 낮음. 어떤 후보도 신뢰하기 어려움.
 * LV_COLLISION — 짧은 영문 토큰이 Lv 오인식 잔재와 구별 불가.
 */
export type ReviewFlag =
  | 'SHORT_NAME'
  | 'SPECIAL_CHAR'
  | 'TRUNCATED'
  | 'LOW_SCORE'
  | 'LV_COLLISION';

/** 이름 후보 하나. extractNameCandidates가 생성, scoreNameCandidate가 채운다. */
export interface NameCandidate {
  text: string;
  type: NameCandidateType;
  score: number;
  debugReason: string;
}

/** 이름 파싱 파이프라인의 최종 결과. parseOcrText가 ParsedOCRResult로 변환한다. */
export interface ParsedName {
  name: string;
  candidates: NameCandidate[];  // 점수 내림차순 정렬
  confidenceScore: number;      // 0.0~1.0 (best.score / 6 기반)
  reviewFlags: ReviewFlag[];
  debugReason: string;
}

// ─── 태그 파싱 ────────────────────────────────────────────────────────────────

function extractTaggedSection(raw: string, tag: string): string {
  const marker = `§${tag}§`;
  const idx = raw.indexOf(marker);
  if (idx === -1) return '';
  const start = idx + marker.length;
  const end = raw.indexOf('\n§', start);
  return (end === -1 ? raw.slice(start) : raw.slice(start, end)).trim();
}

// ─── 단계 1: normalizeNameText ────────────────────────────────────────────────

/**
 * OCR 원시 텍스트에서 이름 파싱에 방해되는 잡음을 제거한다.
 *
 * 제거 순서:
 *   1. 첫 줄만 유지 (NAME zone은 단일 행)
 *   2. Lv 명시 오인식 변형 제거: Lv.115 / Lv,115 / Lw55 등 (L + v/w/u + 구두점? + 숫자)
 *   3. Lv에서 L이 탈락한 잔재 제거: 선두 1~2 알파벳 + 구두점? + 숫자 2자 이상
 *      ex) "v,115 이름" → "이름",  "vi 15 이름" → "이름"
 *      앵커(^)로 선두만 대상. 실제 이름 토큰의 부분 일치 방지.
 *   4. 남은 선두 숫자·전각구두점·공백 블록 제거
 */
export function normalizeNameText(raw: string): string {
  let text = raw.split('\n')[0];
  // 2. Lv 명시 변형 (L이 있는 경우)
  text = text.replace(/\bL[vwu][.,]?\s*\d+/gi, '');
  // 3. L 탈락 잔재 (선두 한정)
  text = text.replace(/^[A-Za-z]{1,2}[,.]?\s*\d{2,}\s*/g, '');
  // 4. 선두 숫자·구두점 블록
  text = text.replace(/^[\s\d,.\u3002\uFF0C\uff61]+/, '');
  return text.trim();
}

// ─── 단계 2: extractNameCandidates ───────────────────────────────────────────

/**
 * 정규화된 텍스트에서 이름 후보를 수집한다.
 *
 * 수집 대상:
 *   ① 영문 시작 토큰: [A-Za-z][A-Za-z0-9\-_.]*
 *      하이픈/언더스코어로 끝나면 바로 뒤 비공백 문자(한자 포함)를 이어붙임
 *      → Nepel-血魔, Nepel-斷罪 같은 혼합 이름 처리
 *   ② 한글 토큰: 2자 이상
 *   ③ 특수문자 토큰: ♥†★☆◆●♠♣♦ 로 시작하는 비공백 연속
 *
 * 중복 제거: 하이픈 결합으로 생긴 서브토큰 중복을 제거한다.
 */
export function extractNameCandidates(text: string): NameCandidate[] {
  if (!text) return [];

  const raw: Array<{ text: string; type: NameCandidateType }> = [];

  // ① 영문 시작 토큰
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9\-_.]*/g)) {
    let token = m[0];
    const afterIdx = (m.index as number) + token.length;
    // 하이픈/언더스코어 결합
    if (token.endsWith('-') || token.endsWith('_')) {
      const after = text.slice(afterIdx).match(/^\S+/);
      if (after) token += after[0];
    }
    // 후행 구두점 제거
    token = token.replace(/[,.\u3002\uFF0C\uff61\s]+$/, '');
    if (token) raw.push({ text: token, type: classifyType(token) });
  }

  // ② 한글 토큰 (2자 이상)
  for (const m of text.matchAll(/[가-힣]{2,}/g)) {
    raw.push({ text: m[0], type: 'korean' });
  }

  // ③ 특수문자 포함 토큰
  for (const m of text.matchAll(/[♥†★☆◆●♠♣♦][^\s]*/g)) {
    raw.push({ text: m[0], type: 'special' });
  }

  // 중복 제거
  const seen = new Set<string>();
  return raw
    .filter(({ text: t }) => {
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .map(({ text: t, type }) => ({ text: t, type, score: 0, debugReason: '' }));
}

function classifyType(token: string): NameCandidateType {
  if (/[♥†★☆◆●♠♣♦]/.test(token)) return 'special';
  const hasEng     = /[A-Za-z]/.test(token);
  const hasKorKanji = /[가-힣\u4e00-\u9fff]/.test(token);
  if (hasEng && hasKorKanji) return 'mixed';
  if (hasEng) return 'english';
  return 'korean';
}

// ─── 단계 3: scoreNameCandidate ───────────────────────────────────────────────

/**
 * 이름 후보 하나에 점수를 매긴다. 점수가 높을수록 실제 이름일 가능성이 높다.
 *
 * 스코어링 기준표:
 *   길이 6 이상         +2   긴 이름은 잡음일 확률이 낮음
 *   길이 4~5            +1
 *   길이 2~3             0
 *   길이 1              -3   단독 알파벳은 노이즈
 *   하이픈 포함         +3   DNF 닉네임 관례 (Nepel-Kasch 형태)
 *   mixed 타입          +2   영문+한자 혼합 = 의도된 이름 (Nepel-血魔)
 *   english / korean    +1   정형 타입 기본 보너스
 *   special 타입        -1   특수문자 포함, 오인식 가능성
 *   ^L[vwu] 패턴        -5   정규화에서 못 잡힌 레벨 지시자 잔재
 */
export function scoreNameCandidate(candidate: NameCandidate): NameCandidate {
  const { text, type } = candidate;
  const reasons: string[] = [];
  let score = 0;

  // 길이
  if (text.length >= 6)      { score += 2; reasons.push('len≥6(+2)'); }
  else if (text.length >= 4) { score += 1; reasons.push('len≥4(+1)'); }
  else if (text.length <= 1) { score -= 3; reasons.push('len≤1(-3)'); }

  // 하이픈
  if (text.includes('-')) { score += 3; reasons.push('hyphen(+3)'); }

  // 타입
  if (type === 'mixed')                             { score += 2; reasons.push('mixed(+2)'); }
  else if (type === 'english' || type === 'korean') { score += 1; reasons.push(`${type}(+1)`); }
  else if (type === 'special')                      { score -= 1; reasons.push('special(-1)'); }

  // Lv 오인식 잔재 (정규화에서 못 잡힌 경우)
  if (/^L[vwu]/i.test(text)) { score -= 5; reasons.push('lv-pattern(-5)'); }

  return { ...candidate, score, debugReason: reasons.join(', ') || '(no rule matched)' };
}

// ─── 단계 5: shouldManualReview ──────────────────────────────────────────────

/**
 * 수동 확인 플래그를 판정한다.
 *
 * 발생 조건:
 *   SHORT_NAME   — 이름이 2자 이하
 *   SPECIAL_CHAR — 정규화 텍스트에 ♥/†/★ 등 포함, 또는 winner 타입이 special
 *   TRUNCATED    — 한글 2자 이하가 단독 후보 (양성 점수의 경쟁 후보 없음)
 *   LOW_SCORE    — best.score ≤ 1 (어떤 후보도 신뢰 불가)
 *   LV_COLLISION — 2자 이하 영문이 이겼고 v/i/l로 시작 (Lv 잔재 혼동 가능)
 */
export function shouldManualReview(
  best: NameCandidate,
  allCandidates: NameCandidate[],
  normalizedText: string,
): ReviewFlag[] {
  const flags = new Set<ReviewFlag>();

  if (best.text.length <= 2) {
    flags.add('SHORT_NAME');
  }

  if (best.type === 'special' || /[♥†★☆◆●♠♣♦]/.test(normalizedText)) {
    flags.add('SPECIAL_CHAR');
  }

  // 한글 2자 이하이고 양성 점수의 경쟁 후보가 없으면 이미지 잘림 의심
  const hasCompetitor = allCandidates.some((c) => c !== best && c.score > 0);
  if (best.type === 'korean' && best.text.length <= 2 && !hasCompetitor) {
    flags.add('TRUNCATED');
  }

  if (best.score <= 1) {
    flags.add('LOW_SCORE');
  }

  // 짧은 영문이 이겼는데 Lv 잔재로 오해받을 수 있는 형태
  if (best.type === 'english' && best.text.length <= 2 && /^[vViIlL]/.test(best.text)) {
    flags.add('LV_COLLISION');
  }

  return [...flags];
}

// ─── 단계 4: pickBestName ─────────────────────────────────────────────────────

function pickBestName(
  candidates: NameCandidate[],
  normalizedText: string,
): ParsedName | null {
  if (candidates.length === 0) return null;

  const scored = candidates.map(scoreNameCandidate);
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  // 최고 점수 후보가 명백한 노이즈(-5 이하)인 경우만 null 반환
  if (best.score <= -4) return null;

  const confidenceScore = Math.min(1.0, Math.max(0.0, best.score / 6));
  const reviewFlags = shouldManualReview(best, scored, normalizedText);

  return {
    name: best.text,
    candidates: scored,
    confidenceScore,
    reviewFlags,
    debugReason: best.debugReason,
  };
}

// ─── 파이프라인 진입점 ─────────────────────────────────────────────────────────

/**
 * NAME zone 원시 텍스트 → ParsedName.
 * normalizeNameText → extractNameCandidates → scoreNameCandidate → pickBestName 순으로 실행.
 * 테스트에서 직접 호출 가능하도록 export한다.
 */
export function parseNamePipeline(raw: string): ParsedName | null {
  const normalized = normalizeNameText(raw);
  if (!normalized) return null;
  const candidates = extractNameCandidates(normalized);
  return pickBestName(candidates, normalized);
}

// ─── JOB zone 파싱 ────────────────────────────────────────────────────────────

/**
 * JOB zone 텍스트에서 직업명을 추출한다.
 * JOB zone은 직업명 전용이므로 역방향 추출 불필요 — 앞에서부터 한글 그룹 추출.
 */
function parseJob(jobZoneText: string): string | null {
  if (!jobZoneText) return null;
  const text = jobZoneText.split('\n')[0].trim();

  // "眞 직업명" 패턴
  const jinMatch = text.match(/眞\s+[가-힣\u4e00-\u9fff]+(?:\s+[가-힣\u4e00-\u9fff]+)*/);
  if (jinMatch) return jinMatch[0].trim();

  // 한글 단어 그룹
  const korMatch = text.match(/[가-힣]{2,}(?:\s+[가-힣]{2,})*/);
  if (korMatch) return korMatch[0].trim();

  return null;
}

// ─── ROW3 파싱: 명성 ──────────────────────────────────────────────────────────

/**
 * ROW3 텍스트에서 명성 숫자를 추출한다.
 * 1차: "명성[: .]숫자" 패턴. 2차: 4자리 이상 숫자 fallback.
 */
function parseRenown(row3: string): number | null {
  const labeled = row3.match(/명성[:\s.]+([0-9,]+)/);
  if (labeled) {
    const n = parseInt(labeled[1].replace(/,/g, ''), 10);
    if (!isNaN(n)) return n;
  }
  for (const m of [...row3.matchAll(/[0-9,]{4,}/g)]) {
    const n = parseInt(m[0].replace(/,/g, ''), 10);
    if (!isNaN(n) && n >= 1000) return n;
  }
  return null;
}

// ─── parseOcrText ─────────────────────────────────────────────────────────────

export function parseOcrText(raw: string): ParsedOCRResult {
  const rawLines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const warnings: OCRWarning[] = [];

  const nameText = extractTaggedSection(raw, 'NAME');
  const jobText  = extractTaggedSection(raw, 'JOB');
  const row3Text = extractTaggedSection(raw, 'ROW3');
  // 구버전 §ROW1§ 포맷 호환
  const row1Text = extractTaggedSection(raw, 'ROW1');

  const parsedName = nameText
    ? parseNamePipeline(nameText)
    : row1Text
      ? parseNamePipeline(row1Text)
      : null;

  const name    = parsedName?.name ?? null;
  const jobName = jobText ? parseJob(jobText) : null;
  const renown  = parseRenown(row3Text);

  // ReviewFlag → OCRWarning 변환
  if (parsedName?.reviewFlags.includes('SPECIAL_CHAR')) {
    warnings.push({
      type: 'POSSIBLE_MISREAD',
      detail: `특수문자 포함 이름 (OCR 오인식 가능): "${name}"`,
    });
  }
  if (parsedName?.reviewFlags.includes('LV_COLLISION')) {
    warnings.push({
      type: 'POSSIBLE_MISREAD',
      detail: `이름이 레벨 표시와 혼동될 수 있음: "${name}"`,
    });
  }

  let confidence = 0.0;
  if (name)            confidence += 0.5;
  if (jobName)         confidence += 0.3;
  if (renown !== null) confidence += 0.2;

  // 이름 품질 플래그가 있으면 confidence 감소
  const hasQualityFlag = parsedName?.reviewFlags.some(
    (f) => f === 'LOW_SCORE' || f === 'TRUNCATED',
  ) ?? false;
  if (hasQualityFlag) confidence -= 0.2;

  if (warnings.some((w) => w.type === 'POSSIBLE_MISREAD')) confidence -= 0.2;

  confidence = Math.max(0.0, Math.min(1.0, confidence));

  if (confidence < 0.7) {
    warnings.push({
      type: 'LOW_CONFIDENCE',
      detail: `confidence: ${confidence.toFixed(2)}`,
    });
  }

  const needsManualReview =
    confidence < 0.7 ||
    (parsedName?.reviewFlags.some(
      (f) => f === 'SPECIAL_CHAR' || f === 'TRUNCATED' || f === 'LV_COLLISION',
    ) ?? false);

  return { name, jobName, renown, confidence, rawLines, warnings, needsManualReview };
}
