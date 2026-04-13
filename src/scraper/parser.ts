/**
 * parser.ts — 던담 HTML 파싱 순수 함수 모음
 *
 * 의존: node-html-parser, character.ts
 * 사용처:
 *   - Main: scraper/dunjiadam.ts (parseSearchPage, detectPageType 사용)
 *   - Tests: tests/unit/scraper/parser.test.ts
 *             tests/unit/scraper/parser.search.test.ts
 *
 * 에러 처리 정책:
 *   숫자 파싱 실패 → NaN 반환 (parseInt 관례 준수, 호출자가 isNaN()으로 검사)
 *   URL 변환 실패 (빈값) → null 반환
 *   parseSearchItem 파싱 실패 → null 반환 (호출자가 filter)
 */

import { parse as parseHtml, HTMLElement, TextNode } from 'node-html-parser';
import type { ScrapedCharacter, CharacterStats, CharacterVisual } from '../types/character';

const DUNDAM_BASE = 'https://dundam.xyz';

// ─── Search page types ───────────────────────────────────────────────────────

/** scraper가 반환하는 ScrapedCharacter에서 fetchedAt을 뺀 타입. fetchedAt은 orchestration 레이어가 주입한다. */
export type RawSearchItem = Omit<ScrapedCharacter, 'fetchedAt'>;

/**
 * parseSearchPage의 반환 타입.
 *
 * | kind       | 조건                              |
 * |------------|-----------------------------------|
 * | not_found  | div.sr-result 내 scon이 0개       |
 * | results    | 파싱 성공한 RawSearchItem 배열    |
 *
 * results.items는 파싱 실패(null) 항목을 제외한 배열.
 * 빈 배열일 수도 있음 — orchestration 레이어가 PARSE_ERROR로 처리.
 */
export type SearchPageResult =
  | { kind: 'not_found' }
  | { kind: 'results'; items: RawSearchItem[] };

// ─── Internal helpers ────────────────────────────────────────────────────────

/** 쉼표 제거 후 parseInt. 빈 문자열 또는 비숫자 → NaN. */
function parseCommaInt(text: string): number {
  const cleaned = text.trim().replace(/,/g, '');
  if (!cleaned) return NaN;
  const n = parseInt(cleaned, 10);
  return n;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 명성(renown) 텍스트 → number.
 * 예: "104330" → 104330, "104,330" → 104330
 */
export function parseRenown(text: string): number {
  return parseCommaInt(text);
}

/**
 * 상세 페이지 span.dval 텍스트 → number.
 * 예: "232,064,408,181" → 232064408181
 */
export function parseExactValue(text: string): number {
  return parseCommaInt(text);
}

/**
 * 버프점수 텍스트 → number.
 * 예: "7,513,277" → 7513277
 */
export function parseBuffValue(text: string): number {
  return parseCommaInt(text);
}

/**
 * 검색 결과 딜 표시 텍스트 → number.
 *
 * 입력 형식: "N조 M억 K만" (단위 조합 자유, 하나만 있어도 됨)
 * 예: "2320 억 6440 만" → 232_064_400_000
 *     "1 조 8840 억"    → 1_884_000_000_000
 *     "100 억"          → 10_000_000_000
 *     "5000 만"         → 50_000_000
 *
 * 단위: 조(10^12) > 억(10^8) > 만(10^4)
 * 주의: 조/억/만 표기가 전혀 없으면 NaN 반환.
 * 순수 숫자("232064408181")는 parseExactValue로 처리할 것.
 */
export function parseDamageValue(text: string): number {
  const normalized = text.trim().replace(/,/g, '');

  const joMatch = normalized.match(/(\d+)\s*조/);
  const eokMatch = normalized.match(/(\d+)\s*억/);
  const manMatch = normalized.match(/(\d+)\s*만/);

  if (!joMatch && !eokMatch && !manMatch) return NaN;

  const jo = joMatch ? parseInt(joMatch[1], 10) * 1_000_000_000_000 : 0;
  const eok = eokMatch ? parseInt(eokMatch[1], 10) * 100_000_000 : 0;
  const man = manMatch ? parseInt(manMatch[1], 10) * 10_000 : 0;

  return jo + eok + man;
}

/**
 * 던담 HTML img src → 절대 URL.
 *
 * - 이미 절대 URL(http:// / https://) → 그대로 반환
 * - 상대 경로("/path" 또는 "path") → DUNDAM_BASE 접두
 * - 빈 문자열 / 공백만 → null
 *
 * 예: "img/job/격투가(여).gif" → "https://dundam.xyz/img/job/격투가(여).gif"
 */
export function normalizeJobIconUrl(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return DUNDAM_BASE + trimmed;
  return DUNDAM_BASE + '/' + trimmed;
}

// ─── Search page parsing ─────────────────────────────────────────────────────

/**
 * HTML 문자열로 던담 페이지 타입을 판별한다.
 *
 * 판별 기준 (fixture 검증):
 *   section#search_result 존재 → 'search' (검색 결과 페이지)
 *   section#character 존재     → 'detail' (캐릭터 상세 페이지)
 *
 * 문자열 탐색으로 구현 — DOM 파싱보다 빠르고 이 용도에 충분히 신뢰성 있음.
 */
export function detectPageType(html: string): 'search' | 'detail' {
  if (html.includes('id="search_result"')) return 'search';
  if (html.includes('id="character"')) return 'detail';
  return 'search';
}

/**
 * 검색 결과 페이지 HTML → SearchPageResult.
 *
 * div.sr-result 내부에 div.scon이 없으면 not_found.
 * scon이 있으면 각각 parseSearchItem을 호출하고 null 항목을 걸러낸다.
 * 전부 파싱 실패하면 results.items === [] — orchestration 레이어가 PARSE_ERROR로 처리.
 */
export function parseSearchPage(html: string): SearchPageResult {
  const root = parseHtml(html);
  const srResult = root.querySelector('.sr-result');
  const scons = srResult?.querySelectorAll('.scon') ?? [];

  if (scons.length === 0) return { kind: 'not_found' };

  const items = scons
    .map((el) => parseSearchItem(el))
    .filter((item): item is RawSearchItem => item !== null);

  return { kind: 'results', items };
}

/**
 * div.scon 엘리먼트 1개 → RawSearchItem.
 *
 * null 반환 조건:
 *   - name이 빔 (캐릭터명 없음)
 *   - server가 빔 (서버 없음)
 *   - renown이 NaN (명성 파싱 실패)
 *   - damage val도 비고 buff val도 빔 (stats 구성 불가)
 *
 * adventureName / fullBodyImageUrl / jobIconUrl은 nullable이므로
 * 없어도 null을 반환하지 않는다.
 */
export function parseSearchItem(el: HTMLElement): RawSearchItem | null {
  const server = el.querySelector('.seh_sever .sev')?.text.trim() ?? '';
  if (!server) return null;

  const jobName = el.querySelector('.seh_job .sev')?.text.trim() ?? '';

  // span.name 안의 TextNode만 → 캐릭터명 (inner span.introd.server 제외)
  const nameEl = el.querySelector('.seh_name .name');
  const name = (nameEl?.childNodes ?? [])
    .filter((n): n is TextNode => n instanceof TextNode)
    .map((n) => n.rawText)
    .join('')
    .trim();
  if (!name) return null;

  const adventureName =
    nameEl?.querySelector('.introd.server')?.text.trim() || null;

  const renown = parseRenown(el.querySelector('.level .val')?.text ?? '');
  if (isNaN(renown)) return null;

  const stats = extractStats(el);
  if (!stats) return null;

  const visual = extractVisual(el);

  return { name, server, jobName, adventureName, renown, stats, visual };
}

// ─── Internal: field extractors ──────────────────────────────────────────────

/**
 * scon에서 CharacterStats를 추출한다.
 *
 * stat_a (딜러/시너지 공통 CSS 클래스):
 *   첫 번째 항목 라벨이 "4인" → type: 'synergy' (무리 세트 딜러)
 *   그 외(랭킹 등)           → type: 'damage'  (일반 딜러)
 *
 * stat_b (버퍼 공통 CSS 클래스):
 *   "4인" 라벨 항목 존재 → type: 'buff', 4인 값 사용 (인챈트리스)
 *   없으면               → type: 'buff', 첫 번째 val 사용 (크루세이더/뮤즈)
 *
 * 둘 다 없음 → null 반환
 */
function extractStats(el: HTMLElement): CharacterStats | null {
  const statA = el.querySelector('.stat_a');
  if (statA) {
    const items = statA.querySelectorAll('li');
    for (const item of items) {
      const label = item.querySelector('.tl')?.text.trim() ?? '';
      const valText = item.querySelector('.val')?.text.trim() ?? '';
      if (!valText) continue;

      if (label === '4인') {
        // 시너지: stat_a에 "4인" 라벨이 있는 경우
        const primaryValue = parseDamageValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: 'synergy', primaryValue, displayLabel: valText };
        }
      } else {
        // 일반 딜러: 랭킹 등 첫 번째 유효한 val 사용
        const primaryValue = parseDamageValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: 'damage', primaryValue, displayLabel: valText };
        }
      }
    }
  }

  const statB = el.querySelector('.stat_b');
  if (statB) {
    const items = statB.querySelectorAll('li');

    // 인챈트리스: "4인" 라벨 항목 우선 탐색
    for (const item of items) {
      const label = item.querySelector('.tl')?.text.trim() ?? '';
      const valText = item.querySelector('.val')?.text.trim() ?? '';
      if (label === '4인' && valText) {
        const primaryValue = parseBuffValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: 'buff', primaryValue, displayLabel: valText };
        }
      }
    }

    // 일반 버퍼: 첫 번째 유효한 val 사용 (크루세이더/뮤즈)
    for (const item of items) {
      const valText = item.querySelector('.val')?.text.trim() ?? '';
      if (valText) {
        const primaryValue = parseBuffValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: 'buff', primaryValue, displayLabel: valText };
        }
      }
    }
  }

  return null;
}

/** scon에서 CharacterVisual을 추출한다. 이미지가 없으면 null 필드로 둔다. */
function extractVisual(el: HTMLElement): CharacterVisual {
  const fullBodySrc = el.querySelector('.seh_abata img')?.getAttribute('src') ?? '';
  const jobIconSrc =
    el.querySelector('.sainf-tr[name="미정"] img')?.getAttribute('src') ?? '';

  return {
    fullBodyImageUrl: fullBodySrc || null,
    jobIconUrl: normalizeJobIconUrl(jobIconSrc),
  };
}
