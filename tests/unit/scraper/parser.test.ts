import { describe, it, expect } from 'vitest';
import {
  parseRenown,
  parseExactValue,
  parseBuffValue,
  parseDamageValue,
  normalizeJobIconUrl,
} from '../../../src/scraper/parser';

// ─── parseRenown ────────────────────────────────────────────────────────────

describe('parseRenown', () => {
  it('쉼표 없는 숫자를 파싱한다', () => {
    expect(parseRenown('104330')).toBe(104_330);
  });

  it('쉼표 포함 숫자를 파싱한다', () => {
    expect(parseRenown('104,330')).toBe(104_330);
  });

  it('앞뒤 공백을 무시한다', () => {
    expect(parseRenown('  92025  ')).toBe(92_025);
  });

  it('빈 문자열은 NaN을 반환한다', () => {
    expect(parseRenown('')).toBeNaN();
  });

  it('공백만 있으면 NaN을 반환한다', () => {
    expect(parseRenown('   ')).toBeNaN();
  });

  it('숫자가 아닌 문자열은 NaN을 반환한다', () => {
    expect(parseRenown('없음')).toBeNaN();
  });
});

// ─── parseExactValue ─────────────────────────────────────────────────────────

describe('parseExactValue', () => {
  // fixture detail-dealer: span.dval = "232,064,408,181"
  it('상세 페이지 딜 수치를 파싱한다', () => {
    expect(parseExactValue('232,064,408,181')).toBe(232_064_408_181);
  });

  it('쉼표 없는 숫자도 파싱한다', () => {
    expect(parseExactValue('232064408181')).toBe(232_064_408_181);
  });

  it('0을 파싱한다', () => {
    expect(parseExactValue('0')).toBe(0);
  });

  it('빈 문자열은 NaN을 반환한다', () => {
    expect(parseExactValue('')).toBeNaN();
  });

  it('숫자가 아닌 문자열은 NaN을 반환한다', () => {
    expect(parseExactValue('abc')).toBeNaN();
  });
});

// ─── parseBuffValue ──────────────────────────────────────────────────────────

describe('parseBuffValue', () => {
  // fixture detail-buffer: span.dval = "7,513,277"
  it('버프점수를 파싱한다', () => {
    expect(parseBuffValue('7,513,277')).toBe(7_513_277);
  });

  it('쉼표 없는 버프점수도 파싱한다', () => {
    expect(parseBuffValue('7513277')).toBe(7_513_277);
  });

  it('0을 파싱한다', () => {
    expect(parseBuffValue('0')).toBe(0);
  });

  it('빈 문자열은 NaN을 반환한다', () => {
    expect(parseBuffValue('')).toBeNaN();
  });

  it('숫자가 아닌 문자열은 NaN을 반환한다', () => {
    expect(parseBuffValue('없음')).toBeNaN();
  });
});

// ─── parseDamageValue ────────────────────────────────────────────────────────

describe('parseDamageValue', () => {
  // fixture search-single: span.val = "2320 억 6440 만"
  it('억과 만이 모두 있는 경우를 파싱한다', () => {
    expect(parseDamageValue('2320 억 6440 만')).toBe(232_064_400_000);
  });

  // fixture search-multi: span.val = "5501 억 1749 만"
  it('다른 억/만 조합도 파싱한다', () => {
    expect(parseDamageValue('5501 억 1749 만')).toBe(550_117_490_000);
  });

  it('억만 있는 경우를 파싱한다', () => {
    expect(parseDamageValue('100 억')).toBe(10_000_000_000);
  });

  it('만만 있는 경우를 파싱한다', () => {
    expect(parseDamageValue('5000 만')).toBe(50_000_000);
  });

  it('공백 없는 억 표기도 파싱한다', () => {
    expect(parseDamageValue('1억')).toBe(100_000_000);
  });

  it('공백 없는 만 표기도 파싱한다', () => {
    expect(parseDamageValue('500만')).toBe(5_000_000);
  });

  it('억/만 수치에 쉼표가 있어도 파싱한다', () => {
    expect(parseDamageValue('2,320 억 6,440 만')).toBe(232_064_400_000);
  });

  it('1억 미만(만 단위 only)을 파싱한다', () => {
    expect(parseDamageValue('999 만')).toBe(9_990_000);
  });

  // 억/만 표기 없는 순수 숫자는 이 함수의 대상이 아님
  it('억/만 표기 없는 순수 숫자는 NaN을 반환한다', () => {
    expect(parseDamageValue('232064408181')).toBeNaN();
  });

  it('빈 문자열은 NaN을 반환한다', () => {
    expect(parseDamageValue('')).toBeNaN();
  });

  it('관련 없는 문자열은 NaN을 반환한다', () => {
    expect(parseDamageValue('결과없음')).toBeNaN();
  });

  // fixture search-multi scon#9: "1 조 8840 억"
  it('"N조 M억" 형식을 파싱한다 → 조(10^12) + 억(10^8)', () => {
    expect(parseDamageValue('1 조 8840 억')).toBe(1_884_000_000_000);
  });

  it('조만 있는 경우를 파싱한다', () => {
    expect(parseDamageValue('2 조')).toBe(2_000_000_000_000);
  });

  it('조/억/만 모두 있는 경우를 파싱한다', () => {
    expect(parseDamageValue('1 조 500 억 3000 만')).toBe(1_050_030_000_000);
  });
});

// ─── normalizeJobIconUrl ──────────────────────────────────────────────────────

describe('normalizeJobIconUrl', () => {
  // fixture: src="img/job/격투가(여).gif"
  it('슬래시 없는 상대 경로를 절대 URL로 변환한다', () => {
    expect(normalizeJobIconUrl('img/job/격투가(여).gif')).toBe(
      'https://dundam.xyz/img/job/격투가(여).gif',
    );
  });

  // fixture: src="img/job/거너(여).gif"
  it('다른 직업 아이콘 상대 경로도 변환한다', () => {
    expect(normalizeJobIconUrl('img/job/거너(여).gif')).toBe(
      'https://dundam.xyz/img/job/거너(여).gif',
    );
  });

  it('슬래시로 시작하는 상대 경로를 절대 URL로 변환한다', () => {
    expect(normalizeJobIconUrl('/img/job/성직자(여).gif')).toBe(
      'https://dundam.xyz/img/job/성직자(여).gif',
    );
  });

  it('이미 절대 URL이면 그대로 반환한다', () => {
    const url = 'https://img-api.neople.co.kr/df/icon/job.png';
    expect(normalizeJobIconUrl(url)).toBe(url);
  });

  it('http:// URL도 그대로 반환한다', () => {
    const url = 'http://example.com/icon.gif';
    expect(normalizeJobIconUrl(url)).toBe(url);
  });

  it('빈 문자열은 null을 반환한다', () => {
    expect(normalizeJobIconUrl('')).toBeNull();
  });

  it('공백만 있으면 null을 반환한다', () => {
    expect(normalizeJobIconUrl('   ')).toBeNull();
  });
});
