'use client';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import clsx from 'clsx';
import { useAppStore, getCfg } from '@/store/appStore';
import { allHands, getHandActions, getNonFoldActions, getDominant } from '@/lib/poker';
import { todayStr, hexRgba } from '@/lib/utils';
import type { HandItem, SelectedTab, HandAction } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────
type Suit = '♠' | '♥' | '♦' | '♣';
const ALL_SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
type TableCount = 1 | 2 | 4;
type TimerMs = 0 | 5000 | 8000 | 12000 | 15000 | 20000;

interface ButtonDef { label: string; color: string; color2?: string; actions: string[] }
interface FlashStats { correct: number; wrong: number; streak: number; bestStreak: number }
interface CardDims { w: number; h: number }

// ── Helpers ───────────────────────────────────────────────────
function pickSuits(type: HandItem['type']): [Suit, Suit] {
  const s1 = ALL_SUITS[Math.floor(Math.random() * 4)];
  if (type === 'suited') return [s1, s1];
  const others = ALL_SUITS.filter(s => s !== s1);
  return [s1, others[Math.floor(Math.random() * 3)]];
}

function buildAllButtons(actionButtons: [string, string][]): ButtonDef[] {
  const result: ButtonDef[] = [];
  for (const [name, color] of actionButtons) {
    result.push({ label: name, color, actions: [name] });
  }
  for (let i = 0; i < actionButtons.length; i++) {
    for (let j = i + 1; j < actionButtons.length; j++) {
      result.push({
        label: `${actionButtons[i][0]} / ${actionButtons[j][0]}`,
        color: actionButtons[i][1],
        color2: actionButtons[j][1],
        actions: [actionButtons[i][0], actionButtons[j][0]],
      });
    }
  }
  return result;
}

function evaluateAnswer(
  btn: ButtonDef,
  hand: string,
  rangeMap: Record<string, HandAction[]>,
): { correct: boolean; partial: boolean; text: string; expected: string } {
  const acts = getHandActions(hand, rangeMap);

  if (!acts) {
    const isFold = btn.actions.some(a => a.toUpperCase().includes('FOLD'));
    return { correct: isFold, partial: false, expected: 'Fold',
      text: isFold ? '✓ Correct — pas dans la range' : '✗ Erreur — cette main se fold' };
  }

  const sigActs = acts.filter(a => a.freq >= 0.15).sort((a, b) => b.freq - a.freq);
  const dominant = getDominant(sigActs);
  const detail = sigActs
    .map(a => `${a.action}${a.freq < 1 ? ' (' + Math.round(a.freq * 100) + '%)' : ''}`)
    .join(' / ');
  const expected = sigActs.map(a => a.action).join(' / ');

  if (btn.actions.length === 1) {
    const clicked = btn.actions[0];
    if (sigActs.length > 1) {
      const partial = clicked === dominant?.action;
      return { correct: false, partial, expected, text: `✗ Main mixte — ${detail}` };
    }
    const correct = clicked === dominant?.action;
    return { correct, partial: false, expected,
      text: correct ? `✓ Correct — ${detail}` : `✗ Erreur — ${detail}` };
  }

  const btnSet = new Set(btn.actions);
  const actSet = new Set(sigActs.map(a => a.action));
  const exact = btnSet.size === actSet.size && btn.actions.every(a => actSet.has(a));
  if (exact) return { correct: true, partial: false, expected, text: `✓ Correct — ${detail}` };
  if (sigActs.length === 1) {
    return { correct: false, partial: false, expected, text: `✗ Erreur — ${sigActs[0].action} uniquement` };
  }
  return { correct: false, partial: false, expected, text: `✗ Erreur — ${detail}` };
}

function pickNextHand(rangeMap: Record<string, HandAction[]>, retryQueue: string[]): HandItem {
  const all = allHands();
  if (retryQueue.length > 0 && Math.random() < 0.35) {
    const idx = Math.floor(Math.random() * retryQueue.length);
    const found = all.find(h => h.hand === retryQueue[idx]);
    if (found) return found;
  }
  const ir = all.filter(h => getHandActions(h.hand, rangeMap) !== null);
  const pool = ir.length > 0 && Math.random() < 0.65 ? ir : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── FlashView (orchestrator) ───────────────────────────────────
export function FlashView() {
  const store = useAppStore();
  const { selectedTab, selectedTabKey, srs, addSession, setPendingSrsKey, pendingSrsKey } = store;
  const cfg = getCfg(store);

  const [tableCount,   setTableCount]   = useState<TableCount>(1);
  const [timerMs,      setTimerMs]      = useState<TimerMs>(0);
  const [autoNext,     setAutoNext]     = useState(false);
  const [paused,       setPaused]       = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [totalStats,   setTotalStats]   = useState<FlashStats>({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
  const [retryCount,   setRetryCount]   = useState(0);

  const totalStatsRef    = useRef<FlashStats>({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
  const sessionErrorsRef = useRef<Map<string, number>>(new Map());
  const retryQueueRef    = useRef<string[]>([]);

  const onRetryCountChange = useCallback(() => {
    setRetryCount(retryQueueRef.current.length);
  }, []);

  const onAnswer = useCallback((correct: boolean, partial: boolean) => {
    const prev = totalStatsRef.current;
    const next = { ...prev };
    if (correct || partial) { next.correct++; next.streak++; next.bestStreak = Math.max(next.bestStreak, next.streak); }
    else { next.wrong++; next.streak = 0; }
    totalStatsRef.current = next;
    setTotalStats(next);

    if (!selectedTab || !selectedTabKey) return;
    const tot = next.correct + next.wrong;
    addSession({ key: `flash_${selectedTabKey}`, date: todayStr(),
      name: selectedTab.name, catName: selectedTab.catName,
      mode: 'flash', correct: next.correct, wrong: next.wrong, bestStreak: next.bestStreak });
    if (!srs[selectedTabKey] && pendingSrsKey !== selectedTabKey && tot >= cfg.minHands) {
      if (Math.round(next.correct / tot * 100) >= cfg.threshold) setPendingSrsKey(selectedTabKey);
    }
  }, [selectedTab, selectedTabKey, addSession, srs, pendingSrsKey, cfg, setPendingSrsKey]);

  const handleNewSession = useCallback(() => {
    totalStatsRef.current = { correct: 0, wrong: 0, streak: 0, bestStreak: 0 };
    setTotalStats({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
    sessionErrorsRef.current = new Map();
    retryQueueRef.current = [];
    setRetryCount(0);
    setPaused(false);
    setSessionEnded(false);
  }, []);

  useEffect(() => { handleNewSession(); }, [selectedTabKey]); // eslint-disable-line

  if (!selectedTab) return null;

  const colorOverrides = store.colorOverrides ?? {};
  const rawButtons: [string, string][] = [...new Map(
    selectedTab.rangeList
      .filter(rl => rl.hands.length > 0)
      .map(rl => {
        const r = store.rangeColors[rl.id];
        return r ? [r.name, colorOverrides[r.name] ?? r.color] as [string, string] : null;
      })
      .filter(Boolean) as [string, string][]
  )];
  const hasExplicitFold = rawButtons.some(([n]) => n.toUpperCase().includes('FOLD'));
  const actionButtons: [string, string][] = hasExplicitFold ? rawButtons : [...rawButtons, ['Fold', colorOverrides['Fold'] ?? '#6b7280']];
  const allButtons = buildAllButtons(actionButtons);

  const tot = totalStats.correct + totalStats.wrong;
  const acc = tot > 0 ? Math.round(totalStats.correct / tot * 100) : null;
  const resetKey = `${selectedTabKey ?? 'none'}-${tableCount}`;

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">

      {/* ── Row 1: Stats + Session Controls ──────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg2 border-b border-border flex-shrink-0 overflow-x-auto no-scrollbar">
        <span className="text-xs font-bold text-green flex-shrink-0">✓{totalStats.correct}</span>
        <span className="text-xs font-bold text-red flex-shrink-0">✗{totalStats.wrong}</span>
        {acc !== null && <span className="text-xs font-bold text-blue flex-shrink-0">{acc}%</span>}
        {totalStats.streak >= 3 && <span className="text-xs font-bold text-orange flex-shrink-0">🔥{totalStats.streak}</span>}
        {retryCount > 0 && <span className="text-[10px] font-bold text-yellow flex-shrink-0">🔁{retryCount}</span>}
        <div className="flex-1" />
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setAutoNext(v => !v)}
            className={clsx('text-[10px] px-2 py-1 rounded border transition-all',
              autoNext ? 'bg-accent/20 border-accent text-accent' : 'border-border text-muted hover:text-text'
            )}>
            Auto▶
          </button>
          <button onClick={() => { if (!sessionEnded) setPaused(v => !v); }}
            className={clsx('text-[10px] px-2 py-1 rounded border transition-all',
              paused ? 'bg-green/10 border-green text-green' : 'border-border text-muted hover:text-text'
            )}>
            {paused ? '▶' : '⏸'}
          </button>
          <button onClick={() => { setPaused(true); setSessionEnded(true); }}
            className="text-[10px] px-2 py-1 rounded border border-border text-muted hover:border-red hover:text-red transition-all">
            ⏹
          </button>
        </div>
      </div>

      {/* ── Row 2: Timer + Tables (always visible) ────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg3 border-b border-border flex-shrink-0 overflow-x-auto no-scrollbar">
        <span className="text-[9px] text-muted uppercase tracking-wider flex-shrink-0">Timer</span>
        {([0, 5000, 8000, 12000, 15000, 20000] as TimerMs[]).map(ms => (
          <button key={ms} onClick={() => setTimerMs(ms)}
            className={clsx('text-[10px] px-1.5 py-0.5 rounded border transition-all flex-shrink-0',
              timerMs === ms ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'
            )}>
            {ms === 0 ? 'Off' : `${ms / 1000}s`}
          </button>
        ))}
        <div className="w-px h-3 bg-border mx-1 flex-shrink-0" />
        <span className="text-[9px] text-muted uppercase tracking-wider flex-shrink-0">Tables</span>
        {([1, 2, 4] as TableCount[]).map(n => (
          <button key={n} onClick={() => setTableCount(n)}
            className={clsx('text-[10px] px-1.5 py-0.5 rounded border transition-all flex-shrink-0',
              tableCount === n ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'
            )}>
            {n}
          </button>
        ))}
      </div>

      {/* ── Panels ─────────────────────────────────────────────── */}
      {tableCount === 1 ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 md:p-3 flex items-start md:items-center justify-center">
          <FlashPanel key={resetKey}
            selectedTab={selectedTab} allButtons={allButtons} actionButtons={actionButtons}
            timerMs={timerMs} autoNext={autoNext} paused={paused || sessionEnded}
            compact={false} sessionErrorsRef={sessionErrorsRef} retryQueueRef={retryQueueRef}
            onAnswer={onAnswer} onRetryCountChange={onRetryCountChange}
          />
        </div>
      ) : (
        <div className={clsx(
          'flex-1 min-h-0 overflow-hidden p-2 md:p-3 grid grid-cols-2 gap-2',
          tableCount === 4 && 'grid-rows-2',
        )}>
          {Array.from({ length: tableCount }, (_, i) => (
            <FlashPanel key={`${resetKey}-${i}`}
              selectedTab={selectedTab} allButtons={allButtons} actionButtons={actionButtons}
              timerMs={timerMs} autoNext={autoNext} paused={paused || sessionEnded}
              compact sessionErrorsRef={sessionErrorsRef} retryQueueRef={retryQueueRef}
              onAnswer={onAnswer} onRetryCountChange={onRetryCountChange}
            />
          ))}
        </div>
      )}

      {/* ── Session ended overlay ──────────────────────────────── */}
      {sessionEnded && (
        <div className="absolute inset-0 z-40 bg-bg/90 flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-xl p-6 max-w-[340px] w-full text-center">
            <div className="text-base font-bold mb-0.5">Session terminée</div>
            <div className="text-[11px] text-muted mb-4">{selectedTab.catName} — {selectedTab.name}</div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {[
                { val: totalStats.correct,                label: 'Corrects',    color: 'text-green'  },
                { val: totalStats.wrong,                  label: 'Erreurs',     color: 'text-red'    },
                { val: acc !== null ? `${acc}%` : '—',   label: 'Précision',   color: 'text-blue'   },
                { val: totalStats.bestStreak,             label: 'Best streak', color: 'text-orange' },
              ].map(({ val, label, color }) => (
                <div key={label} className="bg-bg3 rounded-lg py-2 px-3">
                  <div className={clsx('text-2xl font-bold', color)}>{val}</div>
                  <div className="text-[9px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            <button onClick={handleNewSession}
              className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              Nouvelle session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FlashPanel (self-contained per-table) ─────────────────────
interface FlashPanelProps {
  selectedTab: SelectedTab;
  allButtons: ButtonDef[];
  actionButtons: [string, string][];
  timerMs: number;
  autoNext: boolean;
  paused: boolean;
  compact: boolean;
  sessionErrorsRef: MutableRefObject<Map<string, number>>;
  retryQueueRef: MutableRefObject<string[]>;
  onAnswer: (correct: boolean, partial: boolean) => void;
  onRetryCountChange: () => void;
}

function FlashPanel({
  selectedTab, allButtons, actionButtons, timerMs, autoNext, paused, compact,
  sessionErrorsRef, retryQueueRef, onAnswer, onRetryCountChange,
}: FlashPanelProps) {
  const { recordError } = useAppStore();

  const [hand,             setHand]             = useState<HandItem | null>(null);
  const [suits,            setSuits]            = useState<[Suit, Suit]>(['♠', '♥']);
  const [answered,         setAnswered]         = useState(false);
  const [feedback,         setFeedback]         = useState<{ type: 'correct' | 'wrong' | 'partial'; text: string } | null>(null);
  const [timerPct,         setTimerPct]         = useState(100);
  const [showRangeOverlay, setShowRangeOverlay] = useState(false);
  const [cardAnim,         setCardAnim]         = useState<'shake' | 'pop' | null>(null);
  const [animKey,          setAnimKey]          = useState(0);
  const [cardDims,         setCardDims]         = useState<CardDims>({ w: 72, h: 100 });

  const panelRef         = useRef<HTMLDivElement>(null);
  const answeredRef      = useRef(false);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalStartRef = useRef(0);
  const pausedAtRef      = useRef<number | null>(null);
  const timerMsRef       = useRef(timerMs);
  const pausedRef        = useRef(paused);
  const autoNextRef      = useRef(autoNext);
  const handleTimeoutRef = useRef<(() => void) | null>(null);

  useEffect(() => { autoNextRef.current = autoNext; }, [autoNext]);

  // Dynamic card sizing from panel height
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      const cardH = Math.max(50, Math.min(compact ? 80 : 118, Math.floor(h * 0.26)));
      setCardDims({ w: Math.round(cardH * 0.72), h: cardH });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [compact]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      if (pausedRef.current || answeredRef.current) return;
      const duration = timerMsRef.current;
      if (duration === 0) { clearTimer(); return; }
      const elapsed = Date.now() - intervalStartRef.current;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setTimerPct(pct);
      if (elapsed >= duration) { clearTimer(); handleTimeoutRef.current?.(); }
    }, 50);
  }, [clearTimer]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      pausedAtRef.current = Date.now();
    } else if (pausedAtRef.current !== null) {
      intervalStartRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [paused]);

  useEffect(() => {
    timerMsRef.current = timerMs;
    if (answeredRef.current || !hand) return;
    if (timerMs === 0) { clearTimer(); setTimerPct(100); }
    else if (!pausedRef.current) { intervalStartRef.current = Date.now(); setTimerPct(100); startTimer(); }
  }, [timerMs]); // eslint-disable-line

  useEffect(() => {
    handleTimeoutRef.current = () => {
      if (answeredRef.current || !hand) return;
      answeredRef.current = true; setAnswered(true);
      const acts = getHandActions(hand.hand, selectedTab.rangeMap);
      const detail = acts
        ? acts.map(a => `${a.action}${a.freq < 1 ? ' (' + Math.round(a.freq * 100) + '%)' : ''}`).join(' / ')
        : 'Fold';
      setFeedback({ type: 'wrong', text: `⏱ Temps écoulé — ${detail}` });
      onAnswer(false, false);
    };
  }, [hand, selectedTab.rangeMap, onAnswer]);

  const draw = useCallback(() => {
    clearTimer();
    setAnswered(false); answeredRef.current = false;
    setFeedback(null);
    setCardAnim(null);
    setTimerPct(100);
    const h = pickNextHand(selectedTab.rangeMap, retryQueueRef.current);
    setHand(h); setSuits(pickSuits(h.type));
    intervalStartRef.current = Date.now();
    pausedAtRef.current = pausedRef.current ? Date.now() : null;
    if (timerMsRef.current > 0 && !pausedRef.current) startTimer();
  }, [selectedTab.rangeMap, retryQueueRef, clearTimer, startTimer]);

  useEffect(() => { draw(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!answered || !feedback) return;
    if ((feedback.type === 'correct' || feedback.type === 'partial') && autoNextRef.current && !pausedRef.current) {
      const t = setTimeout(draw, 700); return () => clearTimeout(t);
    }
  }, [answered, feedback, draw]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleAnswer = useCallback((btn: ButtonDef) => {
    if (answeredRef.current || !hand || pausedRef.current) return;
    answeredRef.current = true; setAnswered(true); clearTimer();

    const result = evaluateAnswer(btn, hand.hand, selectedTab.rangeMap);
    setFeedback({ type: result.correct ? 'correct' : result.partial ? 'partial' : 'wrong', text: result.text });
    setCardAnim((result.correct || result.partial) ? 'pop' : 'shake');
    setAnimKey(k => k + 1);

    if (!result.correct && !result.partial) recordError(hand.hand, btn.label, result.expected);

    if (!result.correct) {
      const prev = sessionErrorsRef.current.get(hand.hand) ?? 0;
      const next = prev + 1;
      sessionErrorsRef.current.set(hand.hand, next);
      if (next >= 2 && !retryQueueRef.current.includes(hand.hand)) {
        retryQueueRef.current.push(hand.hand); onRetryCountChange();
      }
    } else {
      const idx = retryQueueRef.current.indexOf(hand.hand);
      if (idx !== -1) { retryQueueRef.current.splice(idx, 1); onRetryCountChange(); }
    }
    onAnswer(result.correct, result.partial);
  }, [hand, clearTimer, selectedTab.rangeMap, sessionErrorsRef, retryQueueRef, onAnswer, onRetryCountChange, recordError]);

  if (!hand) return null;

  const singleButtons = allButtons.filter(b => b.actions.length === 1);
  const mixedButtons  = allButtons.filter(b => b.actions.length > 1);

  const btnStyle = (btn: ButtonDef) => btn.actions.length === 1
    ? { background: hexRgba(btn.color, 0.22), borderColor: hexRgba(btn.color, 0.5), color: '#fff' }
    : { background: `linear-gradient(135deg, ${hexRgba(btn.color, 0.32)} 50%, ${hexRgba(btn.color2 ?? btn.color, 0.32)} 50%)`,
        borderColor: hexRgba(btn.color, 0.5), color: '#fff' };

  const btnClass = clsx(
    'rounded border font-semibold transition-all hover:-translate-y-px active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
    compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-2 text-[11px]',
  );

  return (
    <div ref={panelRef} className={clsx(
      'relative flex flex-col items-center bg-bg2 border border-border rounded-lg overflow-hidden',
      compact
        ? 'h-full gap-1.5 p-2 justify-center'
        : 'gap-2 md:gap-3 p-3 md:p-5 w-full max-w-[420px]',
    )}>
      {!compact && (
        <div className="text-[10px] text-muted uppercase tracking-widest text-center">
          {selectedTab.catName} — {selectedTab.name}
        </div>
      )}

      <div key={animKey} className={clsx(
        'flex-shrink-0',
        cardAnim === 'shake' && 'animate-shake',
        cardAnim === 'pop'   && 'animate-pop-correct',
      )}>
        <HandCards hand={hand} suits={suits} w={cardDims.w} h={cardDims.h} />
      </div>

      {timerMs > 0 && (
        <div className="w-full h-0.5 bg-bg3 rounded-full overflow-hidden flex-shrink-0">
          <div className="h-full rounded-full transition-none"
            style={{ width: `${timerPct}%`,
              background: timerPct > 40 ? '#6c63ff' : timerPct > 20 ? '#e09540' : '#e05555' }} />
        </div>
      )}

      {!answered && (
        <div className="flex flex-col gap-1.5 w-full flex-shrink-0">
          <div className="flex gap-1.5 flex-wrap justify-center">
            {singleButtons.map(btn => (
              <button key={btn.label} onClick={() => handleAnswer(btn)} disabled={paused}
                className={btnClass} style={btnStyle(btn)}>
                {btn.label}
              </button>
            ))}
          </div>
          {mixedButtons.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {mixedButtons.map(btn => (
                <button key={btn.label} onClick={() => handleAnswer(btn)} disabled={paused}
                  className={btnClass} style={btnStyle(btn)}>
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {feedback && (
        <div key={`fb-${animKey}`} className={clsx(
          'animate-slide-up rounded text-center flex-shrink-0',
          compact ? 'px-2 py-1 text-[9px] w-full' : 'px-4 py-2 text-xs font-medium self-center max-w-xs',
          feedback.type === 'correct' ? 'bg-green/10 border border-green/25 text-green' :
          feedback.type === 'partial'  ? 'bg-orange/10 border border-orange/30 text-orange' :
          'bg-red/10 border border-red/30 text-red',
        )}>
          {feedback.text}
        </div>
      )}

      {answered && (!autoNext || feedback?.type === 'wrong') && (
        <button onClick={draw}
          className={clsx(
            'rounded border border-border2 text-muted bg-transparent hover:bg-bg3 hover:text-text transition-all active:scale-95 cursor-pointer flex-shrink-0',
            compact ? 'px-2 py-1 text-[9px] w-full' : 'px-5 py-2 text-xs font-semibold self-center',
          )}>
          Main suivante →
        </button>
      )}

      <button onClick={() => setShowRangeOverlay(v => !v)}
        className={clsx('text-muted hover:text-text transition-colors flex-shrink-0',
          compact ? 'text-[9px]' : 'text-[11px]'
        )}>
        👁 Range
      </button>

      {showRangeOverlay && (
        <div className="absolute inset-0 z-10 bg-black/85 rounded-lg flex flex-col items-center justify-center p-2">
          <button onClick={() => setShowRangeOverlay(false)}
            className="absolute top-2 right-2 text-[10px] bg-bg2 text-muted hover:text-text rounded px-2 py-0.5 border border-border">
            ✕
          </button>
          <div className="overflow-auto no-scrollbar w-full mt-4">
            <MiniRange selectedTab={selectedTab} actionButtons={actionButtons} currentHand={hand.hand} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mini range (read-only) ─────────────────────────────────────
function MiniRange({ selectedTab, actionButtons, currentHand }: {
  selectedTab: SelectedTab;
  actionButtons: [string, string][];
  currentHand?: string;
}) {
  const hands = allHands();
  const CELL = 24;
  return (
    <div className="bg-bg2 border border-border rounded-lg p-2.5 shadow-2xl">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(13, ${CELL}px)`, gridAutoRows: `${CELL}px`, gap: '1px' }}>
        {hands.map(({ hand }) => {
          const acts = getNonFoldActions(hand, selectedTab.rangeMap);
          const isCurrent = hand === currentHand;
          if (acts.length === 0) {
            return <div key={hand} className="rounded-sm bg-bg3"
              style={isCurrent ? { boxShadow: 'inset 0 0 0 2px #f0b429' } : undefined} title={hand} />;
          }
          const color = actionButtons.find(([n]) => n === acts[0].action)?.[1] ?? '#888';
          let bg: string;
          if (acts.length === 1 || acts[0].freq > 0.95) {
            bg = hexRgba(color, 0.85);
          } else {
            let pos = 0; const stops: string[] = [];
            const total = acts.reduce((s, a) => s + a.freq, 0);
            for (const a of acts) {
              const c = actionButtons.find(([n]) => n === a.action)?.[1] ?? '#888';
              const pct = (a.freq / total) * 100;
              stops.push(`${hexRgba(c, 0.85)} ${pos.toFixed(0)}%`);
              stops.push(`${hexRgba(c, 0.85)} ${(pos + pct).toFixed(0)}%`);
              pos += pct;
            }
            bg = `linear-gradient(90deg, ${stops.join(', ')})`;
          }
          return (
            <div key={hand} className="rounded-sm flex items-center justify-center"
              style={{ background: bg, boxShadow: isCurrent ? 'inset 0 0 0 2px #f0b429' : undefined,
                fontSize: '6.5px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}
              title={hand}>
              {hand}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Playing cards ──────────────────────────────────────────────
const SUIT_COLORS: Record<string, string> = {
  '♠': '#111827', '♥': '#dc2626', '♦': '#2563eb', '♣': '#16a34a',
};

function PlayingCard({ rank, suit, w, h }: { rank: string; suit: Suit; w: number; h: number }) {
  const color = SUIT_COLORS[suit];
  const fontSz = Math.round(h * 0.27);
  const suitSz = Math.round(h * 0.23);
  const padV   = Math.round(h * 0.055);
  const padH   = Math.round(w * 0.1);
  const radius = Math.round(w * 0.1);
  return (
    <div style={{ width: w, height: h, background: '#ffffff', border: '1.5px solid #d1d5db',
      borderRadius: radius, padding: `${padV}px ${padH}px`,
      display: 'flex', flexDirection: 'column', position: 'relative',
      boxShadow: '0 3px 12px rgba(0,0,0,0.35)', color }}>
      <span style={{ fontSize: fontSz, fontWeight: 900, lineHeight: 1 }}>{rank}</span>
      <span style={{ fontSize: suitSz, lineHeight: 1.1 }}>{suit}</span>
      <span style={{ position: 'absolute', bottom: padV, right: padH,
        fontSize: fontSz, fontWeight: 900, lineHeight: 1, transform: 'rotate(180deg)' }}>
        {rank}
      </span>
    </div>
  );
}

function HandCards({ hand, suits, w, h }: { hand: HandItem; suits: [Suit, Suit]; w: number; h: number }) {
  const r1 = hand.hand[0];
  const r2 = hand.type === 'pair' ? hand.hand[0] : hand.hand[1];
  return (
    <div className="flex gap-2 justify-center my-1 flex-shrink-0">
      <PlayingCard rank={r1} suit={suits[0]} w={w} h={h} />
      <PlayingCard rank={r2} suit={suits[1]} w={w} h={h} />
    </div>
  );
}
