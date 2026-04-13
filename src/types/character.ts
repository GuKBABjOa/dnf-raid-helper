/**
 * character.ts — 캐릭터 도메인 핵심 타입
 *
 * 의존: 없음 (standalone)
 * 사용처:
 *   - Main: scraper/dunjiadam.ts (ScrapedCharacter 생성)
 *   - Main: matcher/roleMatcher.ts (ScrapedCharacter → CharacterData)
 *   - Main: scorer/scoreEngine.ts (CharacterData 소비)
 *   - candidate.ts, lookup.ts, raid.ts가 이 파일에 의존
 *
 * 변경 영향:
 *   - Role 변경 → raid.ts(SlotDefinition), matcher, scorer, ResultView 역할 배지
 *   - ScrapedCharacter 변경 → scraper, lookup.ts, candidate.ts 전체
 *   - CharacterVisual 변경 → scraper(파싱), CharacterVisual 컴포넌트
 *   - CharacterStats 변경 → scraper(파싱), PrimaryStatLine 컴포넌트
 *   - adventureName 필드명 변경 → scraper, 카드 UI
 */

/**
 * 캐릭터의 역할 분류.
 * roleMatcher.ts가 jobName + statsType을 종합해 결정한다.
 * scraper는 role을 모른다 — matcher만 안다.
 *
 * synergy: 딜러 직업이 무리 방어구를 장착한 상태.
 *   jobName은 딜러 직업명이지만 stats.type === 'synergy'로 식별.
 */
export type Role = 'dealer' | 'buffer' | 'synergy' | 'supporter' | 'unknown';

/** 카드에 표시할 캐릭터 외형 이미지. 없으면 null — fallback 렌더링 필요. */
export interface CharacterVisual {
  fullBodyImageUrl: string | null;  // 전신 이미지 (던담 제공 시)
  jobIconUrl: string | null;        // fallback: 직업 아이콘
}

/**
 * 카드의 핵심 수치.
 * 딜러   → type: 'damage' (랭킹 기준 딜량)
 * 버퍼   → type: 'buff'   (버프점수 또는 인챈트리스 4인 값)
 * 시너지 → type: 'synergy' (4인 기준 딜량)
 *
 * displayLabel은 scraper가 포맷팅해서 내려준다. ("2,320억 6,440만")
 * resolveRole이 stats.type === 'synergy'를 보고 Role을 결정한다.
 */
export interface CharacterStats {
  type: 'damage' | 'buff' | 'synergy';
  primaryValue: number;       // 원시 숫자 (정렬/비교용)
  displayLabel: string;       // 카드 표시용 포맷된 문자열
}

/**
 * 던담에서 스크래핑한 원시 캐릭터 데이터.
 * role 없음 — matcher가 아직 판단하지 않은 상태.
 * guildName 아님, adventureName(모험단명)임 — 게임 UI 기준.
 */
export interface ScrapedCharacter {
  name: string;
  server: string;
  jobName: string;                // 던파 원문 직업명 (예: "眞 스트리트파이터")
  adventureName: string | null;   // 모험단명. 카드에 표시.
  renown: number;
  stats: CharacterStats;
  visual: CharacterVisual;
  fetchedAt: Date;
}

/**
 * matcher가 ScrapedCharacter에 role을 붙여 만드는 타입.
 * 이 타입부터 "역할이 확정된 캐릭터"다.
 * scorer와 candidate.ts는 이 타입을 소비한다.
 */
export interface CharacterData extends ScrapedCharacter {
  role: Role;
}
