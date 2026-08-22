import type { AppConfig } from './types';

export const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'] as const;

export const DEFAULT_CFG: AppConfig = {
  threshold: 80,
  minHands: 10,
  grilleThreshold: 80,
  grilleFreqTolerance: 5,
  intervals: [1, 3, 7, 14, 30, 90],
  flashHandFilter: null,
  roadmapPath: 'essential',
  roadmapDailyMinutes: 20,
  roadmapPinned: [],
  roadmapSnoozed: [],
  roadmapKnown: [],
  roadmapProgress: {},
};

export const MAX_SESSIONS = 200;

export const FLASH_TIMER_MS = 8000;

export const LS_KEY = 'range-trainer-v5';
