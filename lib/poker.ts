import { RANKS } from './constants';
import type { HandItem, HandAction, HandType, RangeEntry, RangeColor } from './types';

export function tabKey(catId: string, tabId: string): string {
  return `${catId}__${tabId}`;
}

export function allHands(): HandItem[] {
  const hands: HandItem[] = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const r1 = RANKS[i], r2 = RANKS[j];
      if (i === j) hands.push({ hand: r1 + r2, type: 'pair' });
      else if (i < j) hands.push({ hand: r1 + r2 + 's', type: 'suited' });
      else hands.push({ hand: r2 + r1 + 'o', type: 'offsuit' });
    }
  }
  return hands;
}

export function buildRangeMap(
  rangeList: RangeEntry[],
  rangeColors: Record<string, RangeColor>,
): Record<string, HandAction[]> {
  const map: Record<string, HandAction[]> = {};
  for (const rl of rangeList) {
    const ri = rangeColors[rl.id] ?? { name: '?', color: '#888' };
    for (const h of rl.hands) {
      const [hand, freqStr] = h.split(':');
      const freq = freqStr ? parseFloat(freqStr) : 1.0;
      if (!map[hand]) map[hand] = [];
      map[hand].push({ action: ri.name, color: ri.color, freq, id: rl.id });
    }
  }
  return map;
}

export function getHandActions(
  hand: string,
  rangeMap: Record<string, HandAction[]>,
): HandAction[] | null {
  if (rangeMap[hand]) return rangeMap[hand];
  if (hand.length === 2 && rangeMap[hand[0] + hand[1]]) return rangeMap[hand[0] + hand[1]];
  return null;
}

export function isFoldAction(action: string): boolean {
  return action.trim().toUpperCase() === 'FOLD';
}

export function getNonFoldActions(
  hand: string,
  rangeMap: Record<string, HandAction[]>,
): HandAction[] {
  const acts = getHandActions(hand, rangeMap);
  if (!acts) return [];
  return acts
    .filter(a => !isFoldAction(a.action))
    .sort((a, b) => b.freq - a.freq);
}

export function getDecisionActions(
  hand: string,
  rangeMap: Record<string, HandAction[]>,
): HandAction[] {
  const raw = (getHandActions(hand, rangeMap) ?? []).filter(a => a.freq > 0);
  if (raw.length === 0) {
    return [{ action: 'Fold', color: '#6b7280', freq: 1, id: '__fold__' }];
  }

  const actions = raw.map(a => isFoldAction(a.action) ? { ...a, action: 'Fold' } : a);
  const total = actions.reduce((sum, action) => sum + action.freq, 0);
  const hasFold = actions.some(action => isFoldAction(action.action));

  if (!hasFold && total < 0.999) {
    actions.push({ action: 'Fold', color: '#6b7280', freq: 1 - total, id: '__fold__' });
  }

  return actions.sort((a, b) => b.freq - a.freq);
}

export function getRangeActionDefs(
  rangeMap: Record<string, HandAction[]>,
): [string, string][] {
  const defs = new Map<string, string>();
  let foldColor = '#6b7280';

  for (const actions of Object.values(rangeMap)) {
    for (const action of actions) {
      if (isFoldAction(action.action)) foldColor = action.color;
      else if (!defs.has(action.action)) defs.set(action.action, action.color);
    }
  }

  return [...defs.entries(), ['Fold', foldColor]];
}

export function getRangeMixedActionSets(
  rangeMap: Record<string, HandAction[]>,
): string[][] {
  const sets = new Map<string, string[]>();

  for (const hand of Object.keys(rangeMap)) {
    const names = [...new Set(getDecisionActions(hand, rangeMap).map(action => action.action))];
    if (names.length < 2) continue;
    const key = [...names].sort().join('\u0000');
    if (!sets.has(key)) sets.set(key, names);
  }

  return [...sets.values()];
}

export function getDominant(acts: HandAction[]): HandAction | null {
  if (!acts.length) return null;
  return acts.reduce((a, b) => (a.freq >= b.freq ? a : b));
}

export function isMixed(acts: HandAction[]): boolean {
  return acts.some(a => a.freq < 1.0 && a.freq > 0);
}

export function cellType(hand: string): HandType {
  if (hand.endsWith('s')) return 'suited';
  if (hand.endsWith('o')) return 'offsuit';
  return 'pair';
}

export function normalizeHand(cards: string[]): string {
  const r1 = cards[0][0];
  const s1 = cards[0][1];
  const r2 = cards[1][0];
  const s2 = cards[1][1];

  const v1 = RANKS.indexOf(r1 as any);
  const v2 = RANKS.indexOf(r2 as any);

  if (v1 === v2) return r1 + r1;

  const sorted = v1 < v2 ? [r1, r2] : [r2, r1];
  const suffix = s1 === s2 ? 's' : 'o';
  return sorted[0] + sorted[1] + suffix;
}

export function countCombos(rangeList: RangeEntry[]): number {
  const s = new Set<string>();
  for (const r of rangeList) for (const h of r.hands) s.add(h.split(':')[0]);
  return s.size;
}
