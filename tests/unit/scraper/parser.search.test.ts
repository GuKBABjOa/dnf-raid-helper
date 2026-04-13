import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  detectPageType,
  parseSearchPage,
  parseSearchItem,
} from '../../../src/scraper/parser';
import { parse as parseHtml } from 'node-html-parser';

// ─── fixtures ────────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(__dirname, '../../fixtures/dundam');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.html`), 'utf-8');
}

const htmlSingle = loadFixture('search-single');
const htmlMulti = loadFixture('search-multi');
const htmlNotFound = loadFixture('search-notfound');
const htmlDetailDealer = loadFixture('detail-dealer');
const htmlSearchInchan = loadFixture('search-inchan');
const htmlSearchSynergy = loadFixture('search-synergy');

// ─── detectPageType ───────────────────────────────────────────────────────────

describe('detectPageType', () => {
  it('search_result 섹션이 있으면 → "search"', () => {
    expect(detectPageType(htmlSingle)).toBe('search');
  });

  it('search-multi fixture → "search"', () => {
    expect(detectPageType(htmlMulti)).toBe('search');
  });

  it('search-notfound fixture → "search"', () => {
    expect(detectPageType(htmlNotFound)).toBe('search');
  });

  it('character 섹션이 있으면 → "detail"', () => {
    expect(detectPageType(htmlDetailDealer)).toBe('detail');
  });
});

// ─── parseSearchPage: search-notfound ────────────────────────────────────────

describe('parseSearchPage — search-notfound', () => {
  it('sr-result가 비어있으면 → kind: not_found', () => {
    const result = parseSearchPage(htmlNotFound);
    expect(result.kind).toBe('not_found');
  });
});

// ─── parseSearchPage: search-single ──────────────────────────────────────────

describe('parseSearchPage — search-single (딜러 1명)', () => {
  it('kind: results, items.length === 1', () => {
    const result = parseSearchPage(htmlSingle);
    expect(result.kind).toBe('results');
    if (result.kind !== 'results') return;
    expect(result.items).toHaveLength(1);
  });

  it('name: "Ria_PAIN", server: "카인", jobName: "眞 넨마스터"', () => {
    const result = parseSearchPage(htmlSingle);
    if (result.kind !== 'results') return;
    const item = result.items[0];
    expect(item.name).toBe('Ria_PAIN');
    expect(item.server).toBe('카인');
    expect(item.jobName).toBe('眞 넨마스터');
  });

  it('adventureName: "PA1N", renown: 104330', () => {
    const result = parseSearchPage(htmlSingle);
    if (result.kind !== 'results') return;
    const item = result.items[0];
    expect(item.adventureName).toBe('PA1N');
    expect(item.renown).toBe(104_330);
  });

  it('stats.type: "damage", primaryValue: 232_064_400_000, displayLabel: "2320 억 6440 만"', () => {
    const result = parseSearchPage(htmlSingle);
    if (result.kind !== 'results') return;
    const { stats } = result.items[0];
    expect(stats.type).toBe('damage');
    expect(stats.primaryValue).toBe(232_064_400_000);
    expect(stats.displayLabel).toBe('2320 억 6440 만');
  });

  it('visual.fullBodyImageUrl이 neople CDN 절대 URL이다', () => {
    const result = parseSearchPage(htmlSingle);
    if (result.kind !== 'results') return;
    const { visual } = result.items[0];
    expect(visual.fullBodyImageUrl).toMatch(/^https:\/\/img-api\.neople\.co\.kr\//);
  });

  it('visual.jobIconUrl이 dundam.xyz 절대 URL이다', () => {
    const result = parseSearchPage(htmlSingle);
    if (result.kind !== 'results') return;
    const { visual } = result.items[0];
    expect(visual.jobIconUrl).toMatch(/^https:\/\/dundam\.xyz\//);
  });
});

// ─── parseSearchPage: search-multi ───────────────────────────────────────────

describe('parseSearchPage — search-multi (30개 scon 혼재)', () => {
  it('items 배열에 여러 캐릭터가 포함된다', () => {
    const result = parseSearchPage(htmlMulti);
    expect(result.kind).toBe('results');
    if (result.kind !== 'results') return;
    expect(result.items.length).toBeGreaterThan(1);
  });

  it('첫 번째 아이템: 프레이 眞 메카닉 "아이유", renown: 111139, type: damage', () => {
    const result = parseSearchPage(htmlMulti);
    if (result.kind !== 'results') return;
    const first = result.items[0];
    expect(first.server).toBe('프레이');
    expect(first.jobName).toBe('眞 메카닉');
    expect(first.name).toBe('아이유');
    expect(first.renown).toBe(111_139);
    expect(first.stats.type).toBe('damage');
  });

  it('두 번째 아이템(바칼 크루세이더): stats.type === "buff", primaryValue: 10_285_382', () => {
    const result = parseSearchPage(htmlMulti);
    if (result.kind !== 'results') return;
    const buffer = result.items[1];
    expect(buffer.server).toBe('바칼');
    expect(buffer.jobName).toBe('眞 크루세이더');
    expect(buffer.stats.type).toBe('buff');
    expect(buffer.stats.primaryValue).toBe(10_285_382);
  });

  it('조 단위 캐릭터(유아이유, 1조 8840억) → primaryValue: 1_884_000_000_000', () => {
    const result = parseSearchPage(htmlMulti);
    if (result.kind !== 'results') return;
    const jo = result.items.find((i) => i.name === '유아이유');
    expect(jo).toBeDefined();
    expect(jo!.stats.primaryValue).toBe(1_884_000_000_000);
  });

  it('스탯이 없는 캐릭터는 items에 포함되지 않는다 (전체 30개 scon → 파싱된 items < 30)', () => {
    const result = parseSearchPage(htmlMulti);
    if (result.kind !== 'results') return;
    // 30개 scon 중 stat 없는 캐릭터들(stat_a val 비고 stat_b val도 빈 경우)이 제외됨
    expect(result.items.length).toBeLessThan(30);
  });

  it('items의 모든 항목이 fetchedAt 없이 반환된다', () => {
    const result = parseSearchPage(htmlMulti);
    if (result.kind !== 'results') return;
    for (const item of result.items) {
      expect(item).not.toHaveProperty('fetchedAt');
    }
  });
});

// ─── parseSearchPage: search-inchan (인챈트리스) ─────────────────────────────

describe('parseSearchPage — search-inchan (인챈트리스 버퍼)', () => {
  it('kind: results', () => {
    expect(parseSearchPage(htmlSearchInchan).kind).toBe('results');
  });

  it('첫 번째 아이템: 眞 인챈트리스, stats.type === "buff"', () => {
    const result = parseSearchPage(htmlSearchInchan);
    if (result.kind !== 'results') return;
    const item = result.items[0];
    expect(item.jobName).toBe('眞 인챈트리스');
    expect(item.stats.type).toBe('buff');
  });

  it('인챈트리스 primaryValue는 2인/3인이 아닌 4인 값이다', () => {
    const result = parseSearchPage(htmlSearchInchan);
    if (result.kind !== 'results') return;
    const item = result.items[0];
    // fixture: 2인=10,305,868 / 3인=9,461,413 / 4인=9,179,928 → 4인 선택
    expect(item.stats.primaryValue).toBe(9_179_928);
    expect(item.stats.displayLabel).toBe('9,179,928');
  });
});

// ─── parseSearchPage: search-synergy (시너지) ────────────────────────────────

describe('parseSearchPage — search-synergy (시너지 딜러)', () => {
  it('kind: results', () => {
    expect(parseSearchPage(htmlSearchSynergy).kind).toBe('results');
  });

  it('첫 번째 아이템: 眞 드래곤나이트, stats.type === "synergy"', () => {
    const result = parseSearchPage(htmlSearchSynergy);
    if (result.kind !== 'results') return;
    const item = result.items[0];
    expect(item.jobName).toBe('眞 드래곤나이트');
    expect(item.stats.type).toBe('synergy');
  });

  it('시너지 primaryValue는 랭킹이 아닌 4인 값이다', () => {
    const result = parseSearchPage(htmlSearchSynergy);
    if (result.kind !== 'results') return;
    const item = result.items[0];
    // fixture: 4인=689억 6012만, 랭킹=600 억 6204 만 → 4인 선택
    expect(item.stats.primaryValue).toBe(68_960_120_000);
    expect(item.stats.displayLabel).toBe('689억 6012만');
  });
});

// ─── parseSearchItem: 직접 호출 (엣지 케이스) ────────────────────────────────

describe('parseSearchItem — 엣지 케이스', () => {
  it('name이 빈 scon → null', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_sever"><li class="sev">카인</li></div>
        <div class="seh_job"><li class="sev">眞 넨마스터</li></div>
        <div class="seh_name"><span class="name"><span class="introd server" name="서버"></span></span><div class="level"><span class="val">50000</span></div></div>
        <div class="seh_stat"><ul class="stat_a"><li><div class="statc"><span class="tl tfive">랭킹</span><span class="val">100 억</span></div></li></ul></div>
      </div>`,
    ).querySelector('.scon')!;
    expect(parseSearchItem(el)).toBeNull();
  });

  it('server가 빈 scon → null', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_sever"><li class="sev"></li></div>
        <div class="seh_job"><li class="sev">眞 넨마스터</li></div>
        <div class="seh_name"><span class="name">테스트<span class="introd server" name="서버"></span></span><div class="level"><span class="val">50000</span></div></div>
        <div class="seh_stat"><ul class="stat_a"><li><div class="statc"><span class="tl tfive">랭킹</span><span class="val">100 억</span></div></li></ul></div>
      </div>`,
    ).querySelector('.scon')!;
    expect(parseSearchItem(el)).toBeNull();
  });

  it('renown이 파싱 불가한 scon → null', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_sever"><li class="sev">카인</li></div>
        <div class="seh_job"><li class="sev">眞 넨마스터</li></div>
        <div class="seh_name"><span class="name">테스트<span class="introd server" name="서버">단</span></span><div class="level"><span class="val">없음</span></div></div>
        <div class="seh_stat"><ul class="stat_a"><li><div class="statc"><span class="tl tfive">랭킹</span><span class="val">100 억</span></div></li></ul></div>
      </div>`,
    ).querySelector('.scon')!;
    expect(parseSearchItem(el)).toBeNull();
  });

  it('stat_a와 stat_b 모두 빈 scon → null', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_sever"><li class="sev">카인</li></div>
        <div class="seh_job"><li class="sev">眞 넨마스터</li></div>
        <div class="seh_name"><span class="name">테스트<span class="introd server" name="서버">단</span></span><div class="level"><span class="val">50000</span></div></div>
        <div class="seh_stat"><ul class="stat_a"><li><div class="statc"><span class="tl tfive">랭킹</span><span class="val"></span></div></li></ul></div>
      </div>`,
    ).querySelector('.scon')!;
    expect(parseSearchItem(el)).toBeNull();
  });

  it('모험단명이 빈 scon → adventureName: null', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_abata"><div class="imgt"><img src="https://img-api.neople.co.kr/test.jpg"></div></div>
        <div class="seh_sever"><li class="sev">바칼</li></div>
        <div class="seh_job"><li class="sev">眞 소검마스터</li></div>
        <div class="seh_name">
          <span class="name">간츠아이유<span class="introd server" name="서버"></span></span>
          <div class="level"><span class="val">84421</span></div>
        </div>
        <div class="seh_stat"><ul class="stat_a"><li><div class="statc"><span class="tl tfive">랭킹</span><span class="val">100 억</span></div></li></ul></div>
      </div>`,
    ).querySelector('.scon')!;
    const item = parseSearchItem(el);
    expect(item).not.toBeNull();
    expect(item!.adventureName).toBeNull();
  });

  it('stat_a 첫 라벨이 "4인"인 scon → type: synergy', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_sever"><li class="sev">디레지에</li></div>
        <div class="seh_job"><li class="sev">眞 드래곤나이트</li></div>
        <div class="seh_name"><span class="name">Nepel-Lars<span class="introd server" name="서버">Nepel</span></span><div class="level"><span class="val">91853</span></div></div>
        <div class="seh_stat">
          <ul class="stat_a">
            <li><div class="statc"><span class="tl tfive">4인</span><span class="val">689억 6012만</span></div></li>
            <li><div class="statc"><span class="tl ozma">랭킹</span><span class="val">600 억 6204 만</span></div></li>
          </ul>
        </div>
      </div>`,
    ).querySelector('.scon')!;
    const item = parseSearchItem(el);
    expect(item).not.toBeNull();
    expect(item!.stats.type).toBe('synergy');
    expect(item!.stats.primaryValue).toBe(68_960_120_000);
    expect(item!.stats.displayLabel).toBe('689억 6012만');
  });

  it('stat_b에 "4인" 라벨 있는 scon → type: buff, 4인 값 사용 (인챈트리스)', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_sever"><li class="sev">디레지에</li></div>
        <div class="seh_job"><li class="sev">眞 인챈트리스</li></div>
        <div class="seh_name"><span class="name">Nepel-Witch<span class="introd server" name="서버">Nepel</span></span><div class="level"><span class="val">103142</span></div></div>
        <div class="seh_stat">
          <ul class="stat_b">
            <li><div class="statc"><span class="tl">2인</span><span class="val">10,305,868</span></div></li>
            <li><div class="statc"><span class="tl">3인</span><span class="val">9,461,413</span></div></li>
            <li><div class="statc"><span class="tl">4인</span><span class="val">9,179,928</span></div></li>
          </ul>
        </div>
      </div>`,
    ).querySelector('.scon')!;
    const item = parseSearchItem(el);
    expect(item).not.toBeNull();
    expect(item!.stats.type).toBe('buff');
    expect(item!.stats.primaryValue).toBe(9_179_928);
    expect(item!.stats.displayLabel).toBe('9,179,928');
  });

  it('jobIconUrl 없는 scon → visual.jobIconUrl === null', () => {
    const el = parseHtml(
      `<div class="scon">
        <div class="seh_abata"><div class="imgt"><img src="https://img-api.neople.co.kr/test.jpg"></div></div>
        <div class="seh_sever"><li class="sev">카인</li></div>
        <div class="seh_job"><li class="sev">眞 넨마스터</li></div>
        <div class="seh_name"><span class="name">테스트<span class="introd server" name="서버">단</span></span><div class="level"><span class="val">50000</span></div></div>
        <div class="seh_stat"><ul class="stat_a"><li><div class="statc"><span class="tl tfive">랭킹</span><span class="val">100 억</span></div></li></ul></div>
      </div>`,
    ).querySelector('.scon')!;
    const item = parseSearchItem(el);
    expect(item).not.toBeNull();
    expect(item!.visual.jobIconUrl).toBeNull();
  });
});
