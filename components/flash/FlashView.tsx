'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAppStore, getCfg } from '@/store/appStore';
import { allHands, getHandActions, getNonFoldActions, getDominant, isMixed } from '@/lib/poker';
import { todayStr, hexRgba } from '@/lib/utils';
import { FLASH_TIMER_MS, RANKS } from '@/lib/constants';
import { Toggle } from '../ui/Toggle';
import type { HandItem } from '@/lib/types';

interface FlashStats { correct: number; wrong: number; streak: number; bestStreak: number; }
type Feedback = { type: 'correct' | 'wrong' | 'partial'; text: string } | null;
type DrillMode = 'normal' | 'hard' | 'bottom';
type Suit = '♠' | '♥' | '♦' | '♣';
const ALL_SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

function pickSuits(type: HandItem['type']): [Suit, Suit] {
  const s1 = ALL_SUITS[Math.floor(Math.random() * 4)];
  if (type === 'suited') return [s1, s1];
  const others = ALL_SUITS.filter(s => s !== s1);
  const s2 = others[Math.floor(Math.random() * 3)];
  return [s1, s2];
}

const RANK_IDX = Object.fromEntries(RANKS.map((r, i) => [r, i]));

function parseHandRanks(hand: string): { r1: number; r2: number; type: 'pair' | 'suited' | 'offsuit' } {
  if (hand.length === 2) return { r1: RANK_IDX[hand[0]], r2: RANK_IDX[hand[0]], type: 'pair' };
  return { r1: RANK_IDX[hand[0]], r2: RANK_IDX[hand[1]], type: hand[2] === 's' ? 'suited' : 'offsuit' };
}

function pickHand(mode: DrillMode, rangeMap: Record<string, import('@/lib/types').HandAction[]>): HandItem {
  const all = allHands();
  let pool: HandItem[];

  if (mode === 'hard') {
    const mixed = all.filter(h => { const a = getHandActions(h.hand, rangeMap); return a && isMixed(a); });
    pool = mixed.length > 0 ? mixed : all;

  } else if (mode === 'bottom') {
    // Bottom hands = total non-fold freq < 65%
    const bottomParsed = all
      .filter(h => {
        const nf = getNonFoldActions(h.hand, rangeMap);
        return nf.reduce((s, a) => s + a.freq, 0) < 0.65;
      })
      .map(h => parseHandRanks(h.hand));

    if (bottomParsed.length === 0) {
      pool = all;
    } else {
      // Neighborhood: same type, rank1 ±1, rank2 ±2 around any bottom hand
      pool = all.filter(h => {
        const { r1, r2, type } = parseHandRanks(h.hand);
        return bottomParsed.some(b =>
          b.type === type &&
          Math.abs(r1 - b.r1) <= 1 &&
          Math.abs(r2 - b.r2) <= 2
        );
      });
      if (pool.length < 5) pool = all;
    }

  } else {
    const ir = all.filter(h => getHandActions(h.hand, rangeMap) !== null);
    pool = Math.random() < 0.65 ? ir : all;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

export function FlashView() {
  const store = useAppStore();
  const { selectedTab, selectedTabKey, srs, addSession, recordError, setPendingSrsKey, pendingSrsKey } = store;
  const cfg = getCfg(store);

  const [stats, setStats]       = useState<FlashStats>({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
  const statsRef                = useRef<FlashStats>({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
  const [hand, setHand]         = useState<HandItem | null>(null);
  const [suits, setSuits]       = useState<[Suit, Suit]>(['♠', '♥']);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [drillMode, setDrillMode] = useState<DrillMode>('normal');
  const [timerMode, setTimerMode] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [timerPct, setTimerPct] = useState(100);

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartRef = useRef(0);
  const answeredRef   = useRef(false);
  const autoNextRef   = useRef(autoNext);
  useEffect(() => { autoNextRef.current = autoNext; }, [autoNext]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setTimerPct(100);
    timerStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - timerStartRef.current;
      const pct = Math.max(0, 100 - (elapsed / FLASH_TIMER_MS) * 100);
      setTimerPct(pct);
      if (elapsed >= FLASH_TIMER_MS && !answeredRef.current) {
        clearTimer();
        answerRef.current?.('__TIMEOUT__');
      }
    }, 50);
  }, [clearTimer]);

  const answerRef = useRef<((action: string) => void) | null>(null);

  const drawNext = useCallback(() => {
    if (!selectedTab) return;
    setAnswered(false);
    answeredRef.current = false;
    setFeedback(null);
    const h = pickHand(drillMode, selectedTab.rangeMap);
    setHand(h);
    setSuits(pickSuits(h.type));
    if (timerMode) startTimer();
    else clearTimer();
  }, [selectedTab, drillMode, timerMode, startTimer, clearTimer]);

  useEffect(() => { drawNext(); }, [selectedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-next on correct answer
  useEffect(() => {
    if (!answered || !feedback) return;
    if ((feedback.type === 'correct' || feedback.type === 'partial') && autoNextRef.current) {
      const t = setTimeout(drawNext, 700);
      return () => clearTimeout(t);
    }
  }, [answered, feedback, drawNext]);

  const handleAnswer = useCallback((action: string) => {
    if (answeredRef.current || !selectedTab || !hand) return;
    answeredRef.current = true;
    setAnswered(true);
    clearTimer();

    const isTimeout = action === '__TIMEOUT__';
    const acts = getHandActions(hand.hand, selectedTab.rangeMap);
    let correct = false, partial = false;
    let text = '';

    if (!acts) {
      correct = !isTimeout && action.toUpperCase().includes('FOLD');
      text = correct ? '✓ Correct — pas dans la range' : '✗ Erreur — cette main se fold';
      if (!correct) recordError(hand.hand, action, 'FOLD');
    } else {
      const dom = getDominant(acts);
      const mixed = isMixed(acts);
      if (!isTimeout) {
        if (mixed) {
          const valid = acts.filter(a => a.freq >= 0.2).map(a => a.action);
          correct = valid.includes(action);
          partial = correct && acts.some(a => a.action === action && a.freq < 0.8);
        } else {
          correct = action === dom?.action;
        }
      }
      const detail = acts.map(a => `${a.action}${a.freq < 1 ? ' (' + Math.round(a.freq * 100) + '%)' : ''}`).join(' / ');
      if (isTimeout)            text = `⏱ Temps écoulé — ${detail}`;
      else if (correct && !partial) text = `✓ Correct — ${detail}`;
      else if (partial)         text = `⚡ Acceptable — mixte: ${detail}`;
      else { text = `✗ Erreur — ${detail}`; if (dom) recordError(hand.hand, action, dom.action); }
    }

    setFeedback({ type: correct && !partial ? 'correct' : partial ? 'partial' : 'wrong', text });

    // Update stats synchronously via ref to avoid setState-in-setState
    const prev = statsRef.current;
    const next = { ...prev };
    if (correct || partial) { next.correct++; next.streak++; next.bestStreak = Math.max(next.bestStreak, next.streak); }
    else { next.wrong++; next.streak = 0; }
    statsRef.current = next;
    setStats(next);

    // Save session
    const tot = next.correct + next.wrong;
    const today = todayStr();
    const key = `flash_${selectedTabKey}`;
    const existing = store.sessions.find(s => s.key === key && s.date === today);
    if (!existing) addSession({ key, date: today, name: selectedTab.name, catName: selectedTab.catName, mode: 'flash', correct: next.correct, wrong: next.wrong, bestStreak: next.bestStreak });
    else addSession({ ...existing, correct: next.correct, wrong: next.wrong, bestStreak: next.bestStreak });

    // SRS eligibility
    if (selectedTabKey && !srs[selectedTabKey] && pendingSrsKey !== selectedTabKey && tot >= cfg.minHands) {
      const acc = Math.round(next.correct / tot * 100);
      if (acc >= cfg.threshold) {
        setPendingSrsKey(selectedTabKey);
      }
    }
  }, [selectedTab, hand, clearTimer, recordError, addSession, selectedTabKey, srs, cfg, pendingSrsKey, setPendingSrsKey, store.sessions]);

  useEffect(() => { answerRef.current = handleAnswer; }, [handleAnswer]);
  useEffect(() => () => clearTimer(), [clearTimer]);

  if (!selectedTab) return null;

  const tot = stats.correct + stats.wrong;
  const acc = tot > 0 ? Math.round(stats.correct / tot * 100) : null;
  const srsEntry = selectedTabKey ? srs[selectedTabKey] : null;

  const actionButtons: [string, string][] = [...new Map(
    selectedTab.rangeList
      .filter(rl => rl.hands.length > 0)
      .map(rl => {
        const r = store.rangeColors[rl.id];
        return r ? [r.name, r.color] as [string, string] : null;
      })
      .filter(Boolean) as [string, string][]
  )];

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start md:justify-center p-3 md:p-4 gap-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 w-full max-w-[400px]">
        {[
          { val: stats.correct, label: 'Corrects', color: 'text-green' },
          { val: stats.wrong,   label: 'Erreurs',  color: 'text-red' },
          { val: acc !== null ? `${acc}%` : '—', label: 'Précision', color: 'text-blue' },
          { val: stats.streak,  label: 'Streak 🔥', color: 'text-orange' },
        ].map(({ val, label, color }) => (
          <div key={label} className="text-center bg-bg2 border border-border rounded-lg py-2 px-1">
            <div className={clsx('text-[20px] font-bold', color)}>{val}</div>
            <div className="text-[8px] text-muted mt-0.5 uppercase tracking-wider leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* SRS progress */}
      {srsEntry && srsEntry.interval >= 0 && (
        <div className="w-full max-w-[400px] bg-bg2 border border-border rounded p-3">
          <div className="flex justify-between text-[10px] text-muted mb-1.5">
            <span>{srsEntry.nextReview <= todayStr() ? 'Révision SRS due !' : 'SRS — précision session'}</span>
            <span>{tot >= cfg.minHands ? `${acc}%` : `${tot}/${cfg.minHands} mains`}</span>
          </div>
          <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round(((acc ?? 0) / cfg.threshold) * 100))}%`, background: (acc ?? 0) >= cfg.threshold ? '#2ecc8a' : (acc ?? 0) >= 60 ? '#e09540' : '#6c63ff' }} />
          </div>
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center w-full max-w-[380px]">
        {(['normal', 'hard', 'bottom'] as DrillMode[]).map((m) => {
          const labels: Record<DrillMode, string> = { normal: 'Normal', hard: 'Mixte', bottom: 'Bas de range' };
          return (
            <button key={m} onClick={() => { setDrillMode(m); drawNext(); }}
              className={clsx('px-3 py-1 text-[11px] rounded border transition-all',
                drillMode === m ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'
              )}>
              {labels[m]}
            </button>
          );
        })}
        <div className="w-px h-4 bg-border mx-0.5" />
        <Toggle on={timerMode} onToggle={() => setTimerMode(v => !v)} label="Timer" />
        <Toggle on={autoNext} onToggle={() => setAutoNext(v => !v)} label="Auto suivant" />
        <button onClick={() => setShowRange(v => !v)}
          className={clsx('px-3 py-1 text-[11px] rounded border transition-all',
            showRange ? 'bg-bg3 border-border2 text-text' : 'border-border text-muted hover:text-text'
          )}>
          {showRange ? '🙈 Cacher range' : '👁 Voir range'}
        </button>
      </div>

      {/* Mini range grid */}
      {showRange && (
        <div className="w-full max-w-[380px] overflow-x-auto no-scrollbar">
          <MiniRange selectedTab={selectedTab} actionButtons={actionButtons} currentHand={hand?.hand} />
        </div>
      )}

      {/* Flash card */}
      <div className="bg-bg2 border border-border rounded-lg px-6 md:px-10 py-5 md:py-6 text-center w-full max-w-[380px] relative">
        {stats.streak >= 3 && (
          <div className="absolute top-2 right-3 text-[11px] font-bold text-orange">🔥{stats.streak}</div>
        )}
        <div className="text-[10px] text-muted uppercase tracking-widest mb-2">
          {selectedTab.catName} — {selectedTab.name}
        </div>
        {hand && <HandCards hand={hand} suits={suits} />}
        <div className="text-[11px] text-muted mt-1">Quelle action pour cette main ?</div>

        {!answered && (
          <div className="flex gap-2 mt-3 justify-center flex-wrap">
            {actionButtons.map(([name, color]) => (
              <button key={name} onClick={() => handleAnswer(name)}
                className="px-4 py-2.5 rounded text-xs font-semibold border bg-transparent cursor-pointer transition-all hover:-translate-y-px active:scale-95"
                style={{ borderColor: color, color }}>
                {name}
              </button>
            ))}
          </div>
        )}

        {timerMode && (
          <div className="w-full h-px bg-bg3 rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full transition-all duration-100"
              style={{ width: `${timerPct}%`, background: timerPct > 40 ? '#6c63ff' : timerPct > 20 ? '#e09540' : '#e05555' }} />
          </div>
        )}
      </div>

      {feedback && (
        <div className={clsx('px-4 py-2.5 rounded text-xs font-medium text-center w-full max-w-[380px]',
          feedback.type === 'correct' ? 'bg-green/10 border border-green/30 text-green' :
          feedback.type === 'partial' ? 'bg-orange/10 border border-orange/30 text-orange' :
          'bg-red/10 border border-red/30 text-red'
        )}>
          {feedback.text}
        </div>
      )}

      {answered && (!autoNext || feedback?.type === 'wrong') && (
        <button onClick={drawNext}
          className="w-full max-w-[380px] px-4 py-3 rounded text-xs font-semibold border border-border2 text-muted bg-transparent hover:bg-bg3 hover:text-text transition-all active:scale-95">
          Main suivante →
        </button>
      )}
    </div>
  );
}

// ── Mini range (read-only) ────────────────────────────────
function MiniRange({ selectedTab, actionButtons, currentHand }: {
  selectedTab: import('@/lib/types').SelectedTab;
  actionButtons: [string, string][];
  currentHand?: string;
}) {
  const hands = allHands();
  const CELL = 24;
  return (
    <div className="bg-bg2 border border-border rounded-lg p-2">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(13, ${CELL}px)`, gridAutoRows: `${CELL}px`, gap: '1px' }}>
        {hands.map(({ hand }) => {
          const acts = getNonFoldActions(hand, selectedTab.rangeMap);
          const isCurrent = hand === currentHand;

          if (acts.length === 0) {
            return (
              <div key={hand} className="rounded-sm bg-bg3 flex items-center justify-center"
                style={isCurrent ? { boxShadow: 'inset 0 0 0 2px #f0b429' } : undefined}
                title={hand}
              />
            );
          }

          const dominant = acts[0];
          const color = actionButtons.find(([n]) => n === dominant.action)?.[1] ?? '#888';
          let bg: string;
          if (acts.length === 1 || acts[0].freq > 0.95) {
            bg = hexRgba(color, 0.82);
          } else {
            let pos = 0;
            const stops: string[] = [];
            const total = acts.reduce((s, a) => s + a.freq, 0);
            for (const a of acts) {
              const c = actionButtons.find(([n]) => n === a.action)?.[1] ?? '#888';
              const pct = (a.freq / total) * 100;
              stops.push(`${hexRgba(c, 0.82)} ${pos.toFixed(0)}%`);
              stops.push(`${hexRgba(c, 0.82)} ${(pos + pct).toFixed(0)}%`);
              pos += pct;
            }
            bg = `linear-gradient(90deg, ${stops.join(', ')})`;
          }

          return (
            <div key={hand} className="rounded-sm flex items-center justify-center"
              style={{
                background: bg,
                boxShadow: isCurrent ? 'inset 0 0 0 2px #f0b429' : undefined,
                fontSize: '6.5px', fontWeight: 700, color: '#fff',
                letterSpacing: '-0.3px',
              }}
              title={hand}
            >
              {hand}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Playing cards ─────────────────────────────────────────
const SUIT_COLORS: Record<string, string> = {
  '♠': '#111827', '♥': '#dc2626', '♦': '#2563eb', '♣': '#16a34a',
};

function PlayingCard({ rank, suit }: { rank: string; suit: Suit }) {
  const color = SUIT_COLORS[suit];
  return (
    <div style={{
      width: 72, height: 100,
      background: '#ffffff',
      border: '1.5px solid #d1d5db',
      borderRadius: 9,
      padding: '6px 8px',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      boxShadow: '0 3px 12px rgba(0,0,0,0.35)',
      color,
    }}>
      <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{rank}</span>
      <span style={{ fontSize: 24, lineHeight: 1.1 }}>{suit}</span>
      <span style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 28, fontWeight: 900, lineHeight: 1, transform: 'rotate(180deg)' }}>{rank}</span>
    </div>
  );
}

function HandCards({ hand, suits }: { hand: HandItem; suits: [Suit, Suit] }) {
  const r1 = hand.hand[0];
  const r2 = hand.type === 'pair' ? hand.hand[0] : hand.hand[1];
  return (
    <div className="flex gap-2.5 justify-center my-2">
      <PlayingCard rank={r1} suit={suits[0]} />
      <PlayingCard rank={r2} suit={suits[1]} />
    </div>
  );
}
