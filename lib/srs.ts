import type { AppConfig, SrsEntry } from './types';
import { addDays, clamp } from './utils';

const DEFAULT_EASE = 2.3;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
export const SRS_FAILURES_BEFORE_DRILL = 3;
export const SRS_DRILL_HANDS = 50;

export function srsDrillProgress(entry: SrsEntry): number {
  return Math.min(SRS_DRILL_HANDS, Math.max(0, entry.drillProgress ?? 0));
}

export function srsConsecutiveFailures(entry: SrsEntry): number {
  // Legacy entries only persisted `lapses`. Treat that value as the initial
  // failure streak until the first review writes `consecutiveFailures`.
  return Math.max(0, entry.consecutiveFailures ?? entry.lapses ?? 0);
}

export function srsRequiresDrill(entry: SrsEntry): boolean {
  return entry.drillRequired ?? srsConsecutiveFailures(entry) >= SRS_FAILURES_BEFORE_DRILL;
}

export function srsNeedsDrill(entry: SrsEntry): boolean {
  return srsRequiresDrill(entry) && srsDrillProgress(entry) < SRS_DRILL_HANDS;
}

export function srsIntervalDays(entry: SrsEntry, cfg: AppConfig): number {
  const intervals = cfg.intervals.length > 0 ? cfg.intervals : [1];
  return entry.interval < intervals.length
    ? intervals[entry.interval]
    : intervals[intervals.length - 1];
}

export function scheduleSrsReview(
  entry: SrsEntry,
  score: number,
  cfg: AppConfig,
  today: string,
): Partial<SrsEntry> {
  const intervals = cfg.intervals.length > 0 ? cfg.intervals : [1];
  const threshold = cfg.grilleThreshold;
  const reviews = entry.reviews ?? 0;
  const lapses = entry.lapses ?? 0;
  const streak = entry.streak ?? 0;
  const ease = entry.ease ?? DEFAULT_EASE;

  if (score < threshold) {
    const severeMiss = score < threshold - 15;
    const nextIdx = Math.max(0, entry.interval - (severeMiss ? 2 : 1));
    const nextEase = clamp(ease - (severeMiss ? 0.25 : 0.15), MIN_EASE, MAX_EASE);

    const consecutiveFailures = srsConsecutiveFailures(entry) + 1;
    const drillRequired = consecutiveFailures >= SRS_FAILURES_BEFORE_DRILL;

    return {
      lastScore: score,
      lastReview: today,
      interval: nextIdx,
      nextReview: addDays(today, intervals[0]),
      ease: nextEase,
      reviews: reviews + 1,
      lapses: lapses + 1,
      streak: 0,
      consecutiveFailures,
      drillRequired,
      drillProgress: drillRequired ? 0 : (entry.drillProgress ?? 0),
      drillStartedAt: drillRequired ? today : entry.drillStartedAt,
      drillCompletedAt: drillRequired ? undefined : entry.drillCompletedAt,
    };
  }

  const strongPass = score >= Math.max(95, threshold + 10);
  const cleanPass = score >= Math.max(90, threshold + 5);
  const weakPass = score < threshold + 5;
  const step = strongPass && streak > 0 ? 2 : 1;
  const nextIdx = Math.min(entry.interval + step, intervals.length - 1);
  const nextEase = clamp(
    ease + (strongPass ? 0.12 : cleanPass ? 0.04 : weakPass ? -0.08 : 0),
    MIN_EASE,
    MAX_EASE,
  );

  const presetDays = intervals[nextIdx];
  const currentDays = srsIntervalDays(entry, cfg);
  const scoreMultiplier = strongPass ? 1.15 : cleanPass ? 1.05 : weakPass ? 0.85 : 1;
  const adaptiveDays = reviews === 0
    ? presetDays
    : Math.round(currentDays * nextEase * scoreMultiplier);
  const cappedDays = clamp(adaptiveDays, presetDays, Math.ceil(presetDays * 1.6));

  return {
    lastScore: score,
    lastReview: today,
    interval: nextIdx,
    nextReview: addDays(today, cappedDays),
    ease: nextEase,
    reviews: reviews + 1,
    lapses,
    streak: streak + 1,
    consecutiveFailures: 0,
    drillRequired: false,
    drillProgress: 0,
    drillStartedAt: undefined,
    drillCompletedAt: undefined,
  };
}
