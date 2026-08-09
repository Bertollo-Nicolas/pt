import { getDecisionActions, getNonFoldActions, isFoldAction } from './poker';
import type { HandAction, PreflopStat } from './types';

export type TrackerDeviationType = 'extra' | 'missed' | 'different';

export interface TrackerDeviation {
  key: string;
  spot: string;
  hand: string;
  action: string;
  expected: string;
  count: number;
  net_bb: number;
  type: TrackerDeviationType;
}

export interface TrackerReport {
  mappedHands: number;
  deviationHands: number;
  deviations: TrackerDeviation[];
  missing: TrackerDeviation[];
  extra: TrackerDeviation[];
}

export interface TrackerHandReport {
  hand: string;
  total: number;
  correct: number;
  errors: number;
  missed: number;
  extra: number;
  different: number;
  net_bb: number;
  expected: { action: string; freq: number }[];
  actual: Record<string, number>;
}

export interface TrackerRangeReport {
  rangeKey: string;
  label: string;
  spots: string[];
  total: number;
  correct: number;
  errors: number;
  missed: number;
  extra: number;
  different: number;
  net_bb: number;
  hands: Record<string, TrackerHandReport>;
}

export function buildTrackerRangeReports(
  stats: PreflopStat[],
  mappings: Record<string, string>,
  rangeMaps: Record<string, Record<string, HandAction[]>>,
  rangeLabels: Record<string, string>,
): TrackerRangeReport[] {
  const reports: Record<string, TrackerRangeReport> = {};

  for (const stat of stats) {
    const rangeKey = mappings[stat.spot] ?? mappings[stat.position];
    const rangeMap = rangeKey ? rangeMaps[rangeKey] : null;
    if (!rangeKey || !rangeMap) continue;

    const report = reports[rangeKey] ??= {
      rangeKey,
      label: rangeLabels[rangeKey] ?? stat.spot,
      spots: [],
      total: 0,
      correct: 0,
      errors: 0,
      missed: 0,
      extra: 0,
      different: 0,
      net_bb: 0,
      hands: {},
    };
    if (!report.spots.includes(stat.spot)) report.spots.push(stat.spot);

    const expected = getDecisionActions(stat.hand, rangeMap);
    const allowed = expected.map(action => action.action);
    const actualIsFold = isFoldAction(stat.action) || stat.action === 'Check';
    const foldAllowed = allowed.some(isFoldAction);
    const nonFoldAllowed = allowed.some(action => !isFoldAction(action));
    const valid = allowed.some(action => matchesExpectedTrackerAction(stat.action, action));

    let type: TrackerDeviationType | null = null;
    if (!valid) {
      if (actualIsFold && nonFoldAllowed && !foldAllowed) type = 'missed';
      else if (!actualIsFold && !nonFoldAllowed) type = 'extra';
      else type = 'different';
    }

    const hand = report.hands[stat.hand] ??= {
      hand: stat.hand,
      total: 0,
      correct: 0,
      errors: 0,
      missed: 0,
      extra: 0,
      different: 0,
      net_bb: 0,
      expected: expected.map(action => ({ action: action.action, freq: action.freq })),
      actual: {},
    };

    report.total += stat.count;
    report.net_bb += stat.net_bb;
    hand.total += stat.count;
    hand.net_bb += stat.net_bb;
    hand.actual[stat.action] = (hand.actual[stat.action] ?? 0) + stat.count;

    if (type) {
      report.errors += stat.count;
      report[type] += stat.count;
      hand.errors += stat.count;
      hand[type] += stat.count;
    } else {
      report.correct += stat.count;
      hand.correct += stat.count;
    }
  }

  return Object.values(reports)
    .map(report => ({ ...report, spots: report.spots.sort() }))
    .sort((a, b) => b.errors - a.errors || b.total - a.total);
}

const POSITIONS = ['HJ', 'CO', 'BTN', 'SB', 'BB'];
const OPENERS = ['HJ', 'CO', 'BTN', 'SB'];
const OPEN_SIZES = ['2x', '2.5x', '3x'];
const THREE_BET_SIZES = ['7.5x', '9x', '10x', '12x'];

export function commonTrackerSpots(): string[] {
  const spots: string[] = [];
  for (const pos of POSITIONS.filter(p => p !== 'BB')) spots.push(`${pos} unopened`);
  for (const hero of POSITIONS) {
    for (const opener of OPENERS) {
      if (hero === opener) continue;
      for (const size of OPEN_SIZES) {
        spots.push(`${hero} vs ${opener} open ${size}`);
        spots.push(`${hero} 3bet vs ${opener} open ${size}`);
      }
    }
  }
  for (const hero of POSITIONS) {
    for (const villain of POSITIONS.filter(p => p !== hero)) {
      for (const size of THREE_BET_SIZES) {
        spots.push(`${hero} vs ${villain} 3bet ${size}`);
        spots.push(`${hero} 4bet vs ${villain} 3bet ${size}`);
      }
    }
  }
  spots.push('HJ vs limp', 'CO vs limp', 'BTN vs limp', 'SB vs limp', 'BB vs limp');
  return [...new Set(spots)].sort((a, b) => a.localeCompare(b));
}

export function buildTrackerReport(
  stats: PreflopStat[],
  mappings: Record<string, string>,
  rangeMaps: Record<string, Record<string, HandAction[]>>,
): TrackerReport {
  const deviations: TrackerDeviation[] = [];
  let mappedHands = 0;

  for (const s of stats) {
    const mapKey = mappings[s.spot] ?? mappings[s.position];
    const rangeMap = mapKey ? rangeMaps[mapKey] : null;
    if (!rangeMap) continue;
    mappedHands += s.count;

    const expectedActs = getNonFoldActions(s.hand, rangeMap);
    const expected = expectedActs.length > 0 ? expectedActs.map(a => a.action).join(' / ') : 'Fold';
    const played = isPlayedTrackerAction(s.action);

    let type: TrackerDeviationType | null = null;
    if (expectedActs.length === 0 && played) type = 'extra';
    else if (expectedActs.length > 0 && !played) type = 'missed';
    else if (expectedActs.length > 0 && played && !expectedActs.some(a => matchesExpectedTrackerAction(s.action, a.action))) type = 'different';

    if (type) {
      deviations.push({
        key: `${s.day}-${s.spot}-${s.hand}-${s.action}`,
        spot: s.spot,
        hand: s.hand,
        action: s.action,
        expected,
        count: s.count,
        net_bb: s.net_bb,
        type,
      });
    }
  }

  const sorted = deviations.sort((a, b) => b.count - a.count || Math.abs(b.net_bb) - Math.abs(a.net_bb));
  return {
    mappedHands,
    deviationHands: sorted.reduce((acc, d) => acc + d.count, 0),
    deviations: sorted,
    missing: sorted.filter(d => d.type === 'missed'),
    extra: sorted.filter(d => d.type === 'extra'),
  };
}

export function aggregateStats(stats: PreflopStat[]): PreflopStat[] {
  const agg: Record<string, PreflopStat> = {};
  for (const s of stats) {
    const key = `${s.day}__${s.position}__${s.spot}__${s.hand}__${s.action}`;
    if (!agg[key]) agg[key] = { ...s };
    else {
      agg[key].count += s.count;
      agg[key].net_bb += s.net_bb;
    }
  }
  return Object.values(agg);
}

function isPlayedTrackerAction(action: string): boolean {
  return !['Fold', 'Check'].includes(action);
}

function matchesExpectedTrackerAction(action: string, expectedAction: string): boolean {
  const actionNorm = normalizeAction(action);
  const expectedNorm = normalizeAction(expectedAction);
  if (actionNorm === expectedNorm) return true;
  if (['raise', '3bet', '4bet'].includes(actionNorm) && ['raise', 'open', 'bet', '3bet', '4bet'].includes(expectedNorm)) return true;
  if (actionNorm === 'call' && ['call', 'coldcall', 'defend'].includes(expectedNorm)) return true;
  return false;
}

function normalizeAction(action: string): string {
  const a = action.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (a.includes('4bet')) return '4bet';
  if (a.includes('3bet')) return '3bet';
  if (a.includes('raise') || a.includes('open')) return 'raise';
  if (a.includes('call') || a.includes('defend')) return 'call';
  if (a.includes('fold')) return 'fold';
  if (a.includes('check')) return 'check';
  return a;
}
