import type { Role, CharacterStats } from '../../types/character';

/**
 * resolveRole의 입력 인자.
 * jobName과 statsType을 함께 받아 역할을 종합 판단한다.
 *
 * statsType이 'synergy'이면 jobName 무관하게 synergy를 반환한다.
 * 이는 시너지가 직업이 아닌 장착 방어구 세트로 결정되기 때문이다.
 * 게임(그리고 던담 스크래퍼)이 이미 stats.type으로 분류해서 제공하므로
 * jobName보다 statsType이 더 신뢰할 수 있는 근거가 된다.
 */
export interface RoleInput {
  jobName: string;
  statsType: CharacterStats['type'];
}

/**
 * 버퍼 직업명 키워드.
 * jobName.includes(keyword) 이면 buffer 분류.
 * 眞 접두사 유무와 무관하게 동작한다.
 */
const BUFFER_KEYWORDS: readonly string[] = [
  '크루세이더', // 여성/남성 성직자 버퍼
  '인챈트리스', // 여성 마법사 버퍼
  '뮤즈',       // 남성 마법사 버퍼
];

/**
 * 서포터 직업명 키워드.
 */
const SUPPORTER_KEYWORDS: readonly string[] = [
  '무당', // 격투가 서포터 (일부 공대에서 버퍼 취급)
];

/**
 * jobName + statsType → Role.
 *
 * 판정 우선순위:
 *   1. statsType === 'synergy'  → 'synergy'  (jobName 무관)
 *      시너지는 방어구 세트 기반이므로 던담이 제공한 stats.type이 우선 근거.
 *   2. jobName이 빈 문자열     → 'unknown'
 *   3. BUFFER_KEYWORDS 매칭    → 'buffer'
 *   4. SUPPORTER_KEYWORDS 매칭 → 'supporter'
 *   5. 나머지                  → 'dealer'  (던파는 딜러가 압도적으로 많으므로 기본값)
 *
 * 직업명이 '眞 크루세이더' 또는 '크루세이더' 어느 쪽이든 매칭된다.
 */
export function resolveRole(input: RoleInput): Role {
  // 1. statsType 우선: 시너지는 jobName과 무관하게 결정됨
  if (input.statsType === 'synergy') return 'synergy';

  // 2. 빈 직업명
  if (input.jobName.trim() === '') return 'unknown';

  // 3. 버퍼
  for (const kw of BUFFER_KEYWORDS) {
    if (input.jobName.includes(kw)) return 'buffer';
  }

  // 4. 서포터
  for (const kw of SUPPORTER_KEYWORDS) {
    if (input.jobName.includes(kw)) return 'supporter';
  }

  // 5. 딜러 (기본값)
  return 'dealer';
}
