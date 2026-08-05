import { allHands, getNonFoldActions, isFoldAction } from './poker';
import type { HandAction } from './types';

export type GrilleCheckState = 'correct' | 'missed' | 'extra' | 'wrong-action';

export interface GrilleErrorEvent {
  hand: string;
  given: string;
  expected: string;
}

export interface GrilleCheckResult {
  states: Record<string, GrilleCheckState>;
  correct: number;
  wrongAct: number;
  missed: number;
  extra: number;
  score: number;
  pct: number;
  errors: GrilleErrorEvent[];
}

type Selection = Record<string, Record<string, number>>;

export function scoreGrille(
  selection: Selection,
  rangeMap: Record<string, HandAction[]>,
  freqTolerance: number,
): GrilleCheckResult {
  let correct = 0;
  let wrongAct = 0;
  let missed = 0;
  let extra = 0;
  const states: Record<string, GrilleCheckState> = {};
  const errors: GrilleErrorEvent[] = [];

  allHands().forEach(({ hand }) => {
    const nonFoldActs = getNonFoldActions(hand, rangeMap);
    const inRange = nonFoldActs.length > 0;
    const played = cellIsPlayed(selection[hand] ?? {});

    if (inRange && played) {
      const userNonFoldEntries = Object.entries(selection[hand] ?? {}).filter(([k]) => !isFoldAction(k));
      let isAllCorrect = userNonFoldEntries.length === nonFoldActs.length;

      if (isAllCorrect) {
        for (const [uAction, uFreq] of userNonFoldEntries) {
          const expected = nonFoldActs.find(a => a.action === uAction);
          if (!expected || Math.abs(Math.round(expected.freq * 100) - uFreq) > freqTolerance) {
            isAllCorrect = false;
            break;
          }
        }
      }

      if (isAllCorrect) {
        states[hand] = 'correct';
        correct++;
      } else {
        states[hand] = 'wrong-action';
        wrongAct++;
        errors.push({ hand, given: formatSelection(selection[hand] ?? {}) || 'Fold', expected: formatExpectedActions(nonFoldActs) });
      }
    } else if (inRange && !played) {
      states[hand] = 'missed';
      missed++;
      errors.push({ hand, given: 'Fold', expected: formatExpectedActions(nonFoldActs) });
    } else if (!inRange && played) {
      states[hand] = 'extra';
      extra++;
      errors.push({ hand, given: formatSelection(selection[hand] ?? {}), expected: 'Fold' });
    }
  });

  const total = correct + wrongAct + missed + extra;
  return {
    states,
    correct,
    wrongAct,
    missed,
    extra,
    score: total > 0 ? Math.round(correct / total * 100) : 100,
    pct: Math.round(total / 169 * 100),
    errors,
  };
}

function cellIsPlayed(freqs: Record<string, number>): boolean {
  return Object.entries(freqs).some(([k, v]) => !isFoldAction(k) && v > 0);
}

function formatSelection(freqs: Record<string, number>): string {
  return Object.entries(freqs)
    .filter(([k, v]) => !isFoldAction(k) && v > 0)
    .map(([k, v]) => `${k} ${v}%`)
    .join(' / ');
}

function formatExpectedActions(acts: HandAction[]): string {
  return acts
    .map(a => `${a.action}${a.freq < 1 ? ` ${Math.round(a.freq * 100)}%` : ''}`)
    .join(' / ');
}
