import { allHands, getDecisionActions, getNonFoldActions } from './poker';
import { getMatrixNeighbors } from './flash-scheduler';
import type { HandAction } from './types';

export interface RoadmapRangeAnalysis {
  played: string[];
  innerBottoms: string[];
  boundaryFolds: string[];
  mixed: string[];
  actionCounts: Array<{ action: string; count: number }>;
}

export function analyzeRoadmapRange(rangeMap: Record<string, HandAction[]>): RoadmapRangeAnalysis {
  const hands = allHands();
  const played = new Set(hands.filter(({ hand }) => getNonFoldActions(hand, rangeMap).length > 0).map(({ hand }) => hand));
  const innerBottoms = new Set<string>();
  const boundaryFolds = new Set<string>();
  const actionCounts = new Map<string, Set<string>>();
  for (const hand of played) {
    const folds = getMatrixNeighbors(hand).filter(neighbor => !played.has(neighbor));
    if (folds.length) innerBottoms.add(hand);
    for (const fold of folds) boundaryFolds.add(fold);
    for (const action of getDecisionActions(hand, rangeMap)) {
      if (action.action !== 'Fold') actionCounts.set(action.action, new Set([...(actionCounts.get(action.action) ?? []), hand]));
    }
  }
  return {
    played: [...played], innerBottoms: [...innerBottoms], boundaryFolds: [...boundaryFolds],
    mixed: [...played].filter(hand => getDecisionActions(hand, rangeMap).length > 1),
    actionCounts: [...actionCounts].map(([action, actionHands]) => ({ action, count: actionHands.size })).sort((a, b) => b.count - a.count),
  };
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildRoadmapFlashHands(rangeMap: Record<string, HandAction[]>): string[] {
  const analysis = analyzeRoadmapRange(rangeMap);
  const played = new Set(analysis.played);
  const innerBottoms = new Set(analysis.innerBottoms);
  const boundaryFolds = new Set(analysis.boundaryFolds);
  const mixed = new Set(analysis.mixed);
  const byAction = new Map<string, string[]>();
  for (const hand of played) {
    for (const action of getDecisionActions(hand, rangeMap)) {
      if (action.action === 'Fold') continue;
      byAction.set(action.action, [...(byAction.get(action.action) ?? []), hand]);
    }
  }

  if (played.size <= 30) {
    return shuffle([...played, ...shuffle([...boundaryFolds]).slice(0, Math.max(4, innerBottoms.size))]);
  }

  const selected = new Set<string>([...innerBottoms, ...mixed]);
  for (const actionHands of byAction.values()) {
    const quota = Math.max(2, Math.ceil(actionHands.length * 0.25));
    for (const hand of shuffle(actionHands).slice(0, quota)) selected.add(hand);
  }
  const controls = shuffle([...played].filter(hand => !selected.has(hand))).slice(0, Math.max(4, Math.ceil(played.size * 0.08)));
  for (const hand of controls) selected.add(hand);
  for (const hand of shuffle([...boundaryFolds]).slice(0, Math.max(6, innerBottoms.size))) selected.add(hand);
  return shuffle([...selected]);
}
