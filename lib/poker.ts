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

export function getNonFoldActions(
  hand: string,
  rangeMap: Record<string, HandAction[]>,
): HandAction[] {
  const acts = getHandActions(hand, rangeMap);
  if (!acts) return [];
  return acts
    .filter(a => !a.action.toUpperCase().includes('FOLD'))
    .sort((a, b) => b.freq - a.freq);
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

export function countCombos(rangeList: RangeEntry[]): number {
  const s = new Set<string>();
  for (const r of rangeList) for (const h of r.hands) s.add(h.split(':')[0]);
  return s.size;
}
