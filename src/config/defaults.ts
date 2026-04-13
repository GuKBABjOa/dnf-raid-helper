import type { RaidConfig } from '../types/raid';
import type { OverlayPersistedState } from '../types/overlay';

export interface ScorerConfig {
  /** 이 명성 미만이면 isWarning: true */
  warnBelowRenown: number;
}

export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
  warnBelowRenown: 20_000,
};

export const DEFAULT_RAID_CONFIG: RaidConfig = {
  raidName: '기본 공대',
  slots: [
    { id: 'dealer-1', label: '딜러 1', eligibleRoles: ['dealer'], required: true },
    { id: 'dealer-2', label: '딜러 2', eligibleRoles: ['dealer'], required: true },
    { id: 'dealer-3', label: '딜러 3', eligibleRoles: ['dealer'], required: true },
    { id: 'dealer-4', label: '딜러 4', eligibleRoles: ['dealer'], required: true },
    { id: 'buffer-1', label: '버퍼 1', eligibleRoles: ['buffer'], required: true },
    { id: 'buffer-2', label: '버퍼 2', eligibleRoles: ['buffer'], required: false },
    { id: 'supporter-1', label: '서포터', eligibleRoles: ['supporter', 'buffer'], required: false },
  ],
};

export const DEFAULT_OVERLAY_STATE: OverlayPersistedState = {
  capture: { x: 100, y: 200, width: 420, height: 120 },
  card: { x: 900, y: 100, width: 220, height: 450 },
  shortcutKey: 'Alt+Z',
};
