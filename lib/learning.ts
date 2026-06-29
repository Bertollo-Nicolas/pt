import type { ErrorEntry, Session } from './types';

export type LearningDiagnosis = 'acquired' | 'structure' | 'speed' | 'priority' | 'partial';

export interface LearningSpot {
  key: string;
  name: string;
  catName: string;
  mastery: number;
  flashScore: number | null;
  grilleScore: number | null;
  stability: number;
  errorCount: number;
  diagnosis: LearningDiagnosis;
}

interface SpotBucket {
  key: string;
  name: string;
  catName: string;
  flash: number[];
  grille: number[];
  errorCount: number;
}

export function buildLearningSpots(sessions: Session[], errors: Record<string, ErrorEntry>): LearningSpot[] {
  const buckets: Record<string, SpotBucket> = {};
  const sortedSessions = [...sessions].sort((a, b) => (a.createdAt ?? a.date).localeCompare(b.createdAt ?? b.date));

  for (const session of sortedSessions) {
    const spotKey = session.key.replace(/^(flash|grille)_/, '');
    const bucket = buckets[spotKey] ?? {
      key: spotKey,
      name: session.name,
      catName: session.catName,
      flash: [],
      grille: [],
      errorCount: 0,
    };
    bucket.name = session.name || bucket.name;
    bucket.catName = session.catName || bucket.catName;

    if (session.mode === 'flash') {
      const total = (session.correct ?? 0) + (session.wrong ?? 0) + (session.imprecision ?? 0);
      if (total > 0) bucket.flash.push(Math.round(((session.correct ?? 0) / total) * 100));
    } else if (session.mode === 'grille' && session.score != null) {
      bucket.grille.push(session.score);
    }

    buckets[spotKey] = bucket;
  }

  for (const error of Object.values(errors)) {
    const spotKey = error.key;
    if (!spotKey) continue;
    const bucket = buckets[spotKey] ?? {
      key: spotKey,
      name: error.name ?? spotKey,
      catName: error.catName ?? '',
      flash: [],
      grille: [],
      errorCount: 0,
    };
    bucket.errorCount += error.count;
    buckets[spotKey] = bucket;
  }

  return Object.values(buckets)
    .map(toLearningSpot)
    .filter(s => s.flashScore != null || s.grilleScore != null || s.errorCount > 0)
    .sort((a, b) => a.mastery - b.mastery || b.errorCount - a.errorCount);
}

function toLearningSpot(bucket: SpotBucket): LearningSpot {
  const flashScore = last(bucket.flash);
  const grilleScore = last(bucket.grille);
  const stability = computeStability([...bucket.flash.slice(-3), ...bucket.grille.slice(-3)]);
  const flashComponent = flashScore ?? grilleScore ?? 50;
  const grilleComponent = grilleScore ?? flashScore ?? 50;
  const errorPenalty = Math.min(18, bucket.errorCount * 1.4);
  const mastery = clampScore(
    Math.round((0.45 * grilleComponent) + (0.35 * flashComponent) + (0.20 * stability) - errorPenalty),
  );

  return {
    key: bucket.key,
    name: bucket.name,
    catName: bucket.catName,
    mastery,
    flashScore,
    grilleScore,
    stability,
    errorCount: bucket.errorCount,
    diagnosis: diagnose(flashScore, grilleScore, mastery),
  };
}

function diagnose(flashScore: number | null, grilleScore: number | null, mastery: number): LearningDiagnosis {
  if (mastery >= 85 && (flashScore ?? 85) >= 80 && (grilleScore ?? 85) >= 80) return 'acquired';
  if (flashScore != null && grilleScore != null && flashScore >= 80 && grilleScore < 75) return 'structure';
  if (flashScore != null && grilleScore != null && flashScore < 75 && grilleScore >= 80) return 'speed';
  if (mastery < 65) return 'priority';
  return 'partial';
}

function computeStability(values: number[]): number {
  if (values.length <= 1) return 70;
  const deltas = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return clampScore(Math.round(100 - avgDelta * 1.6));
}

function last(values: number[]): number | null {
  return values.length > 0 ? values[values.length - 1] : null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
