import { allHands, getNonFoldActions } from './poker';
import type { HandAction, HandItem } from './types';

export const FLASH_MASTERY_STREAK = 2;

export interface FlashHandProgress {
  shown: number;
  correctStreak: number;
  wrong: number;
  lastShown: number;
}

export interface FlashSchedulerState {
  progress: Map<string, FlashHandProgress>;
  activeHands: Set<string>;
  drawIndex: number;
}

export function createFlashSchedulerState(): FlashSchedulerState {
  return { progress: new Map(), activeHands: new Set(), drawIndex: 0 };
}

export function getMatrixNeighbors(hand: string): string[] {
  const hands = allHands();
  const index = hands.findIndex(item => item.hand === hand);
  if (index < 0) return [];
  const row = Math.floor(index / 13);
  const column = index % 13;
  const neighbors: string[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = column + dc;
      if (r >= 0 && r < 13 && c >= 0 && c < 13) neighbors.push(hands[r * 13 + c].hand);
    }
  }
  return neighbors;
}

export function buildSmartFlashPool(
  rangeMap: Record<string, HandAction[]>,
  handFilter?: Set<string> | null,
): HandItem[] {
  const hands = allHands();
  const played = new Set(
    hands.filter(item => getNonFoldActions(item.hand, rangeMap).length > 0).map(item => item.hand),
  );
  const boundaryFolds = new Set<string>();
  for (const hand of played) {
    for (const neighbor of getMatrixNeighbors(hand)) {
      if (!played.has(neighbor)) boundaryFolds.add(neighbor);
    }
  }
  let pool = hands.filter(item => played.has(item.hand) || boundaryFolds.has(item.hand));
  if (handFilter) pool = pool.filter(item => handFilter.has(item.hand));
  return pool;
}

export function drawSmartFlashHand(
  rangeMap: Record<string, HandAction[]>,
  state: FlashSchedulerState,
  retryQueue: string[],
  handFilter?: Set<string> | null,
  focusMode = false,
): HandItem {
  const smartPool = buildSmartFlashPool(rangeMap, handFilter);
  const pool = smartPool.length > 0 ? smartPool : allHands();
  const inactive = pool.filter(item => !state.activeHands.has(item.hand));
  const available = inactive.length > 0 ? inactive : pool;
  const retry = new Set(retryQueue);
  let candidates = available.filter(item =>
    (state.progress.get(item.hand)?.correctStreak ?? 0) < FLASH_MASTERY_STREAK,
  );

  if (candidates.length === 0) {
    for (const item of pool) {
      const progress = state.progress.get(item.hand);
      if (progress) state.progress.set(item.hand, { ...progress, correctStreak: 0 });
    }
    candidates = available;
  }

  if (focusMode) {
    const focused = candidates.filter(item => retry.has(item.hand));
    if (focused.length > 0) candidates = focused;
  } else {
    const unseen = candidates.filter(item => (state.progress.get(item.hand)?.shown ?? 0) === 0);
    if (unseen.length > 0) candidates = unseen;
    else {
      const retried = candidates.filter(item => retry.has(item.hand));
      if (retried.length > 0) candidates = retried;
    }
  }

  const minimumShown = Math.min(...candidates.map(item => state.progress.get(item.hand)?.shown ?? 0));
  candidates = candidates.filter(item => (state.progress.get(item.hand)?.shown ?? 0) === minimumShown);
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const previous = state.progress.get(selected.hand) ?? { shown: 0, correctStreak: 0, wrong: 0, lastShown: -1 };
  state.drawIndex += 1;
  state.progress.set(selected.hand, { ...previous, shown: previous.shown + 1, lastShown: state.drawIndex });
  state.activeHands.add(selected.hand);
  return selected;
}

export function recordFlashOutcome(
  state: FlashSchedulerState,
  hand: string,
  outcome: 'correct' | 'partial' | 'wrong' | 'timeout',
): void {
  const previous = state.progress.get(hand) ?? { shown: 1, correctStreak: 0, wrong: 0, lastShown: state.drawIndex };
  state.activeHands.delete(hand);
  state.progress.set(hand, {
    ...previous,
    correctStreak: outcome === 'correct' ? previous.correctStreak + 1 : 0,
    wrong: outcome === 'wrong' || outcome === 'timeout' ? previous.wrong + 1 : previous.wrong,
  });
}
