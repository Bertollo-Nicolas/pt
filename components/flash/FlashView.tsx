'use client';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import clsx from 'clsx';
import { useAppStore, getCfg } from '@/store/appStore';
import { allHands, getDecisionActions, getHandActions, getNonFoldActions, getDominant, getRangeActionDefs, getRangeMixedActionSets } from '@/lib/poker';
import { todayStr, hexRgba } from '@/lib/utils';
import { SRS_DRILL_HANDS, srsDrillProgress, srsNeedsDrill, srsRequiresDrill } from '@/lib/srs';
import { createFlashSchedulerState, drawSmartFlashHand, recordFlashOutcome, type FlashSchedulerState } from '@/lib/flash-scheduler';
import type { HandItem, SelectedTab, HandAction } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';

// ── Types ─────────────────────────────────────────────────────
type Suit = '♠' | '♥' | '♦' | '♣';
const ALL_SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
type TableCount = 1 | 2 | 4;
type TimerMs = 0 | 5000 | 8000 | 12000 | 15000 | 20000;

interface ButtonDef { label: string; color: string; color2?: string; actions: string[] }
interface FlashStats { correct: number; wrong: number; imprecision: number; streak: number; bestStreak: number }
interface CardDims { w: number; h: number }

// ── Helpers ───────────────────────────────────────────────────
function pickSuits(type: HandItem['type']): [Suit, Suit] {
  const s1 = ALL_SUITS[Math.floor(Math.random() * 4)];
  if (type === 'suited') return [s1, s1];
  const others = ALL_SUITS.filter(s => s !== s1);
  return [s1, others[Math.floor(Math.random() * 3)]];
}

function buildAllButtons(actionButtons: [string, string][], mixedActionSets: string[][]): ButtonDef[] {
  const colors = new Map(actionButtons);
  const result: ButtonDef[] = actionButtons.map(([name, color]) => ({ label: name, color, actions: [name] }));

  for (const actions of mixedActionSets) {
    result.push({
      label: actions.join(' / '),
      color: colors.get(actions[0]) ?? '#888',
      color2: colors.get(actions[1]),
      actions,
    });
  }

  return result;
}

function evaluateAnswer(
  btn: ButtonDef,
  hand: string,
  rangeMap: Record<string, HandAction[]>,
): { correct: boolean; partial: boolean; text: string; expected: string } {
  const sigActs = getDecisionActions(hand, rangeMap);
  const dominant = getDominant(sigActs);
  const detail = sigActs
    .map(a => `${a.action}${a.freq < 1 ? ' (' + Math.round(a.freq * 100) + '%)' : ''}`)
    .join(' / ');
  const expected = sigActs.map(a => a.action).join(' / ');

  if (btn.actions.length === 1) {
    const clicked = btn.actions[0];
    if (sigActs.length > 1) {
      const isPartial = clicked === dominant?.action;
      return { correct: false, partial: isPartial, expected,
        text: isPartial ? `≈ Imprécision — ${detail}` : `✗ Erreur — ${detail}` };
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

// ── FlashView (orchestrator) ───────────────────────────────────
export function FlashView() {
  const store = useAppStore();
  const { selectedTab, selectedTabKey, srs, addSession, setPendingSrsKey, pendingSrsKey, saveConfig, progressSrsDrill, startSrsReview, roadmapQueue, roadmapQueueIndex, advanceRoadmapSession, cancelRoadmapSession, recordRoadmapFlash } = store;
  const cfg = getCfg(store);

  const [tableCount,   setTableCount]   = useState<TableCount>(1);
  const [timerMs,      setTimerMs]      = useState<TimerMs>(0);
  const [autoNext,     setAutoNext]     = useState(false);
  const [focusMode,    setFocusMode]    = useState(false);
  const [paused,       setPaused]       = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [totalStats,   setTotalStats]   = useState<FlashStats>({ correct: 0, wrong: 0, imprecision: 0, streak: 0, bestStreak: 0 });
  const [retryCount,   setRetryCount]   = useState(0);
  const [handFilter,   setHandFilter]   = useState<Set<string> | null>(
    cfg.flashHandFilter ? new Set(cfg.flashHandFilter) : null,
  );
  const [showFilter,   setShowFilter]   = useState(false);

  const updateFilter = useCallback((f: Set<string> | null) => {
    setHandFilter(f);
    saveConfig({ flashHandFilter: f ? [...f] : null });
  }, [saveConfig]);

  const totalStatsRef    = useRef<FlashStats>({ correct: 0, wrong: 0, imprecision: 0, streak: 0, bestStreak: 0 });
  const sessionErrorsRef = useRef<Map<string, number>>(new Map());
  const retryQueueRef    = useRef<string[]>([]);
  const schedulerRef     = useRef<FlashSchedulerState>(createFlashSchedulerState());

  const onRetryCountChange = useCallback(() => {
    setRetryCount(retryQueueRef.current.length);
  }, []);

  const onAnswer = useCallback((correct: boolean, partial: boolean) => {
    const prev = totalStatsRef.current;
    const next = { ...prev };
    if (correct) { next.correct++; next.streak++; next.bestStreak = Math.max(next.bestStreak, next.streak); }
    else if (partial) { next.imprecision++; /* streak unchanged */ }
    else { next.wrong++; next.streak = 0; }
    totalStatsRef.current = next;
    setTotalStats(next);

    if (!selectedTab || !selectedTabKey) return;
    const tot = next.correct + next.wrong + next.imprecision;
    addSession({ key: `flash_${selectedTabKey}`, date: todayStr(),
      name: selectedTab.name, catName: selectedTab.catName,
      mode: 'flash', correct: next.correct, wrong: next.wrong, imprecision: next.imprecision, bestStreak: next.bestStreak });
    const drillEntry = srs[selectedTabKey];
    if (drillEntry && srsNeedsDrill(drillEntry)) {
      progressSrsDrill(selectedTabKey);
    }
    if (!srs[selectedTabKey] && pendingSrsKey !== selectedTabKey && tot >= cfg.minHands) {
      if (Math.round(next.correct / tot * 100) >= cfg.threshold) setPendingSrsKey(selectedTabKey);
    }
  }, [selectedTab, selectedTabKey, addSession, srs, pendingSrsKey, cfg, setPendingSrsKey, progressSrsDrill]);

  const handleNewSession = useCallback(() => {
    totalStatsRef.current = { correct: 0, wrong: 0, imprecision: 0, streak: 0, bestStreak: 0 };
    setTotalStats({ correct: 0, wrong: 0, imprecision: 0, streak: 0, bestStreak: 0 });
    sessionErrorsRef.current = new Map();
    retryQueueRef.current = [];
    schedulerRef.current = createFlashSchedulerState();
    setRetryCount(0);
    setPaused(false);
    setSessionEnded(false);
  }, []);

  useEffect(() => { handleNewSession(); }, [selectedTabKey]); // eslint-disable-line

  if (!selectedTab) return null;

  const colorOverrides = store.colorOverrides ?? {};
  const actionButtons: [string, string][] = getRangeActionDefs(selectedTab.rangeMap)
    .map(([name, color]) => [name, colorOverrides[name] ?? color]);
  const allButtons = buildAllButtons(actionButtons, getRangeMixedActionSets(selectedTab.rangeMap));

  const tot = totalStats.correct + totalStats.wrong + totalStats.imprecision;
  const acc = tot > 0 ? Math.round(totalStats.correct / tot * 100) : null;
  const resetKey = `${selectedTabKey ?? 'none'}-${tableCount}`;
  const filterActive = handFilter !== null && handFilter.size > 0;
  const drillEntry = selectedTabKey ? srs[selectedTabKey] : undefined;
  const drillProgress = drillEntry ? srsDrillProgress(drillEntry) : 0;
  const isSrsDrill = Boolean(drillEntry && srsRequiresDrill(drillEntry));
  const drillComplete = isSrsDrill && drillProgress >= SRS_DRILL_HANDS;
  const finishSession = () => {
    const stats = totalStatsRef.current;
    const total = stats.correct + stats.wrong + stats.imprecision;
    if (selectedTabKey && total >= cfg.minHands) recordRoadmapFlash(selectedTabKey, Math.round(stats.correct / total * 100));
    setPaused(true);
    setSessionEnded(true);
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-b from-bg3/20 to-bg">

      {isSrsDrill && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-orange/10 border-b border-orange/30 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-xs font-bold text-orange">Drill SRS obligatoire — {drillProgress}/{SRS_DRILL_HANDS}</div>
            <div className="text-[11px] text-muted">Chaque réponse compte, sans score minimum.</div>
          </div>
          {drillComplete && selectedTabKey && (
            <button onClick={() => startSrsReview(selectedTabKey)} className="px-2.5 py-1 text-[10px] font-semibold rounded bg-accent text-white flex-shrink-0">
              Faire la Grille →
            </button>
          )}
        </div>
      )}

      {roadmapQueue.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-accent/10 border-b border-accent/30 flex-shrink-0">
          <div className="min-w-0"><div className="text-xs font-bold text-accent">Session Roadmap · étape {roadmapQueueIndex + 1}/{roadmapQueue.length}</div><div className="text-[10px] text-muted truncate">{roadmapQueue.map(item => item.name).join(' → ')}</div></div>
          <button onClick={cancelRoadmapSession} className="text-[10px] text-muted hover:text-text">Quitter</button>
        </div>
      )}

      {/* ── Row 1: Stats + Session Controls ──────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-bg2/95 border-b border-border flex-shrink-0 overflow-x-auto no-scrollbar">
        <span className="text-xs font-bold text-green flex-shrink-0">✓{totalStats.correct}</span>
        {totalStats.imprecision > 0 && <span className="text-xs font-bold text-orange flex-shrink-0">≈{totalStats.imprecision}</span>}
        <span className="text-xs font-bold text-red flex-shrink-0">✗{totalStats.wrong}</span>
        {acc !== null && <span className="text-xs font-bold text-blue flex-shrink-0">{acc}%</span>}
        {totalStats.streak >= 3 && <span className="text-xs font-bold text-orange flex-shrink-0">🔥{totalStats.streak}</span>}
        {retryCount > 0 && <span className="text-[10px] font-bold text-yellow flex-shrink-0">🔁{retryCount}</span>}
        <div className="flex-1" />
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowFilter(v => !v)}
            aria-pressed={showFilter}
            aria-label="Filtrer les mains"
            className={clsx('text-[11px] min-h-8 px-2.5 py-1 rounded border transition-all',
              filterActive
                ? 'bg-accent/20 border-accent text-accent'
                : showFilter
                  ? 'bg-bg3 border-border text-text'
                  : 'border-border text-muted hover:text-text',
            )}>
            {filterActive ? `Filtre ${handFilter!.size}` : 'Filtrer'}
          </button>
          <button onClick={() => setFocusMode(v => !v)}
            aria-pressed={focusMode}
            className={clsx('text-[11px] min-h-8 px-2.5 py-1 rounded border transition-all',
              focusMode ? 'bg-orange/20 border-orange text-orange' : 'border-border text-muted hover:text-text'
            )}
            title="Mode Focus : ne révise que vos erreurs">
            Focus
          </button>
          <button onClick={() => setAutoNext(v => !v)}
            aria-pressed={autoNext}
            className={clsx('text-[11px] min-h-8 px-2.5 py-1 rounded border transition-all',
              autoNext ? 'bg-accent/20 border-accent text-accent' : 'border-border text-muted hover:text-text'
            )}>
            Auto
          </button>
          <button onClick={() => { if (!sessionEnded) setPaused(v => !v); }}
            aria-label={paused ? 'Reprendre la session' : 'Mettre la session en pause'}
            className={clsx('text-[11px] min-h-8 px-2.5 py-1 rounded border transition-all',
              paused ? 'bg-green/10 border-green text-green' : 'border-border text-muted hover:text-text'
            )}>
            {paused ? 'Reprendre' : 'Pause'}
          </button>
          <button onClick={finishSession}
            aria-label="Terminer la session"
            className="text-[11px] min-h-8 px-2.5 py-1 rounded border border-border text-muted hover:border-red hover:text-red transition-all">
            Terminer
          </button>
        </div>
      </div>

      {/* ── Row 2: Timer + Tables ─────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-bg3 border-b border-border flex-shrink-0 overflow-x-auto no-scrollbar">
        <span className="section-label flex-shrink-0">Timer</span>
        {([0, 5000, 8000, 12000, 15000, 20000] as TimerMs[]).map(ms => (
          <button key={ms} onClick={() => setTimerMs(ms)}
            className={clsx('text-[11px] min-h-7 px-2 py-0.5 rounded border transition-all flex-shrink-0',
              timerMs === ms ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'
            )}>
            {ms === 0 ? 'Off' : `${ms / 1000}s`}
          </button>
        ))}
        <div className="w-px h-3 bg-border mx-1 flex-shrink-0" />
        <span className="section-label flex-shrink-0">Tables</span>
        {([1, 2, 4] as TableCount[]).map(n => (
          <button key={n} onClick={() => setTableCount(n)}
            className={clsx('text-[11px] min-h-7 px-2 py-0.5 rounded border transition-all flex-shrink-0',
              tableCount === n ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'
            )}>
            {n}
          </button>
        ))}
      </div>

      {/* ── Panels ─────────────────────────────────────────────── */}
      {tableCount === 1 ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-5 flex items-start md:items-center justify-center">
          <FlashPanel key={resetKey}
            selectedTab={selectedTab} allButtons={allButtons} actionButtons={actionButtons}
            timerMs={timerMs} autoNext={autoNext} paused={paused || sessionEnded}
            focusMode={focusMode}
            compact={false} sessionErrorsRef={sessionErrorsRef} retryQueueRef={retryQueueRef}
            schedulerRef={schedulerRef}
            handFilter={handFilter}
            spotKey={selectedTabKey}
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
              focusMode={focusMode}
              compact sessionErrorsRef={sessionErrorsRef} retryQueueRef={retryQueueRef}
              schedulerRef={schedulerRef}
              handFilter={handFilter}
              spotKey={selectedTabKey}
              onAnswer={onAnswer} onRetryCountChange={onRetryCountChange}
            />
          ))}
        </div>
      )}

      {/* ── Hand filter overlay ────────────────────────────────── */}
      {showFilter && (
        <HandFilterOverlay
          selectedTab={selectedTab}
          actionButtons={actionButtons}
          handFilter={handFilter}
          setHandFilter={updateFilter}
          onClose={() => setShowFilter(false)}
        />
      )}

      {/* ── Session ended overlay ──────────────────────────────── */}
      {sessionEnded && (
        <div className="absolute inset-0 z-40 bg-bg/90 flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-xl p-6 max-w-[340px] w-full text-center">
            <div className="text-base font-bold mb-0.5">Session terminée</div>
            <div className="text-[11px] text-muted mb-4">{selectedTab.catName} — {selectedTab.name}</div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { val: totalStats.correct,                    label: 'Corrects',      color: 'text-green'  },
                { val: totalStats.imprecision,                label: 'Imprécisions',  color: 'text-orange' },
                { val: totalStats.wrong,                      label: 'Erreurs',       color: 'text-red'    },
                { val: acc !== null ? `${acc}%` : '—',       label: 'Précision',     color: 'text-blue'   },
                { val: totalStats.bestStreak,                 label: 'Best streak',   color: 'text-yellow' },
              ].map(({ val, label, color }) => (
                <div key={label} className="bg-bg3 rounded-lg py-2 px-3">
                  <div className={clsx('text-2xl font-bold', color)}>{val}</div>
                  <div className="text-[9px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {roadmapQueue.length > 0 ? (
              <button onClick={() => { setSessionEnded(false); advanceRoadmapSession(); }} className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">
                {roadmapQueueIndex + 1 < roadmapQueue.length ? 'Étape suivante →' : 'Terminer le parcours ✓'}
              </button>
            ) : (
              <button onClick={handleNewSession} className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">Nouvelle session</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HandFilterOverlay ─────────────────────────────────────────
function HandFilterOverlay({
  selectedTab, actionButtons, handFilter, setHandFilter, onClose,
}: {
  selectedTab: SelectedTab;
  actionButtons: [string, string][];
  handFilter: Set<string> | null;
  setHandFilter: (f: Set<string> | null) => void;
  onClose: () => void;
}) {
  const hands = allHands();
  const active = handFilter ?? new Set(hands.map(h => h.hand));

  const toggle = (hand: string) => {
    const next = new Set(active);
    if (next.has(hand)) next.delete(hand); else next.add(hand);
    if (next.size === hands.length) setHandFilter(null);
    else setHandFilter(next.size > 0 ? next : null);
  };

  const selectAll = () => setHandFilter(null);
  const selectNone = () => setHandFilter(new Set());
  const selectInRange = () => {
    const inRange = hands.filter(h => getHandActions(h.hand, selectedTab.rangeMap) !== null);
    setHandFilter(new Set(inRange.map(h => h.hand)));
  };

  const count = active.size;

  const CELL = 30;

  return (
    <div className="absolute inset-0 z-30 bg-bg/85 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-xl p-3 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-text">Filtrer les mains</span>
            <span className="text-[9px] text-muted">{count} / {hands.length}</span>
            {handFilter !== null && count > 0 && (
              <span className="text-[9px] text-accent font-semibold">● actif</span>
            )}
          </div>
          <div className="flex gap-1 ml-4">
            <button onClick={selectInRange}
              className="text-[9px] px-2 py-0.5 rounded border border-border text-muted hover:text-text transition-colors cursor-pointer">
              Range
            </button>
            <button onClick={selectAll}
              className="text-[9px] px-2 py-0.5 rounded border border-border text-muted hover:text-text transition-colors cursor-pointer">
              Tout
            </button>
            <button onClick={selectNone}
              className="text-[9px] px-2 py-0.5 rounded border border-border text-muted hover:text-text transition-colors cursor-pointer">
              Aucun
            </button>
            <button onClick={onClose}
              className="text-[9px] px-2 py-0.5 rounded border border-border text-muted hover:border-red hover:text-red transition-colors cursor-pointer">
              ✕
            </button>
          </div>
        </div>

        {/* Grid — fixed cell size, same as MiniRange */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(13, ${CELL}px)`, gridAutoRows: `${CELL}px`, gap: '1px' }}>
          {hands.map(({ hand }) => {
            const acts = getNonFoldActions(hand, selectedTab.rangeMap);
            const isSelected = active.has(hand);

            let bg: string;
            if (acts.length === 0) {
              bg = isSelected ? 'rgba(107,114,128,0.28)' : 'rgba(15,15,17,0.5)';
            } else if (acts.length === 1 || acts[0].freq > 0.95) {
              const c = actionButtons.find(([n]) => n === acts[0].action)?.[1] ?? '#888';
              bg = hexRgba(c, isSelected ? 0.8 : 0.18);
            } else {
              let pos = 0; const stops: string[] = [];
              const total = acts.reduce((s, a) => s + a.freq, 0);
              for (const a of acts) {
                const c = actionButtons.find(([n]) => n === a.action)?.[1] ?? '#888';
                const alpha = isSelected ? 0.8 : 0.18;
                const pct = (a.freq / total) * 100;
                stops.push(`${hexRgba(c, alpha)} ${pos.toFixed(0)}%`);
                stops.push(`${hexRgba(c, alpha)} ${(pos + pct).toFixed(0)}%`);
                pos += pct;
              }
              bg = `linear-gradient(90deg, ${stops.join(', ')})`;
            }

            return (
              <div key={hand} onClick={() => toggle(hand)} title={hand}
                style={{
                  background: bg,
                  borderRadius: 2,
                  opacity: isSelected ? 1 : 0.3,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '6.5px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px',
                  transition: 'opacity 0.1s',
                }}>
                {hand}
              </div>
            );
          })}
        </div>
      </div>
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
  focusMode: boolean;
  compact: boolean;
  sessionErrorsRef: MutableRefObject<Map<string, number>>;
  retryQueueRef: MutableRefObject<string[]>;
  schedulerRef: MutableRefObject<FlashSchedulerState>;
  handFilter?: Set<string> | null;
  spotKey: string | null;
  onAnswer: (correct: boolean, partial: boolean) => void;
  onRetryCountChange: () => void;
}

function FlashPanel({
  selectedTab, allButtons, actionButtons, timerMs, autoNext, paused, focusMode, compact,
  sessionErrorsRef, retryQueueRef, schedulerRef, handFilter, spotKey, onAnswer, onRetryCountChange,
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
  const handleTimeoutRef = useRef<(() => void) | null>(null);

  // Seed retry queue from global errors on mount
  useEffect(() => {
    const globalErrors = useAppStore.getState().errors;
    const errorHands = Object.entries(globalErrors)
      .filter(([key, e]) => e.count >= 2 && (!spotKey || e.key === spotKey || !e.key || key === e.hand))
      .map(([, e]) => e.hand);
    if (errorHands.length > 0) {
      retryQueueRef.current = [...new Set([...retryQueueRef.current, ...errorHands])];
      onRetryCountChange();
    }
  }, []); // eslint-disable-line

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
      recordFlashOutcome(schedulerRef.current, hand.hand, 'timeout');
      recordError(hand.hand, 'Timeout', detail, spotKey ?? undefined);
      const previousErrors = sessionErrorsRef.current.get(hand.hand) ?? 0;
      sessionErrorsRef.current.set(hand.hand, previousErrors + 1);
      if (!retryQueueRef.current.includes(hand.hand)) {
        retryQueueRef.current.push(hand.hand);
        onRetryCountChange();
      }
      onAnswer(false, false);
    };
  }, [hand, selectedTab.rangeMap, schedulerRef, sessionErrorsRef, retryQueueRef, spotKey, recordError, onRetryCountChange, onAnswer]);

  const draw = useCallback(() => {
    clearTimer();
    setAnswered(false); answeredRef.current = false;
    setFeedback(null);
    setCardAnim(null);
    setTimerPct(100);
    const h = drawSmartFlashHand(selectedTab.rangeMap, schedulerRef.current, retryQueueRef.current, handFilter, focusMode);
    setHand(h); setSuits(pickSuits(h.type));
    intervalStartRef.current = Date.now();
    pausedAtRef.current = pausedRef.current ? Date.now() : null;
    if (timerMsRef.current > 0 && !pausedRef.current) startTimer();
  }, [selectedTab.rangeMap, schedulerRef, retryQueueRef, handFilter, focusMode, clearTimer, startTimer]);

  useEffect(() => { draw(); }, []); // eslint-disable-line

  // Auto-next: also fires when autoNext is toggled on while already answered
  useEffect(() => {
    if (!answered || !feedback) return;
    if ((feedback.type === 'correct' || feedback.type === 'partial') && autoNext && !pausedRef.current) {
      const t = setTimeout(draw, 700); return () => clearTimeout(t);
    }
  }, [answered, feedback, autoNext, draw]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleAnswer = useCallback((btn: ButtonDef) => {
    if (answeredRef.current || !hand || pausedRef.current) return;
    answeredRef.current = true; setAnswered(true); clearTimer();

    const result = evaluateAnswer(btn, hand.hand, selectedTab.rangeMap);
    setFeedback({ type: result.correct ? 'correct' : result.partial ? 'partial' : 'wrong', text: result.text });
    setCardAnim((result.correct || result.partial) ? 'pop' : 'shake');
    setAnimKey(k => k + 1);
    recordFlashOutcome(schedulerRef.current, hand.hand, result.correct ? 'correct' : result.partial ? 'partial' : 'wrong');

    if (!result.correct && !result.partial) recordError(hand.hand, btn.label, result.expected, spotKey ?? undefined);

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
  }, [hand, clearTimer, selectedTab.rangeMap, schedulerRef, sessionErrorsRef, retryQueueRef, spotKey, onAnswer, onRetryCountChange, recordError]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, [contenteditable="true"]') || showRangeOverlay) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < allButtons.length && !answered) {
        event.preventDefault();
        handleAnswer(allButtons[index]);
      }
      if ((event.key.toLowerCase() === 'n' || event.key === 'Enter') && answered) {
        event.preventDefault();
        draw();
      }
      if (event.key.toLowerCase() === 'r') setShowRangeOverlay(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allButtons, answered, draw, handleAnswer, showRangeOverlay]);

  if (!hand) return null;

  const singleButtons = allButtons.filter(b => b.actions.length === 1);
  const mixedButtons  = allButtons.filter(b => b.actions.length > 1);

  const btnStyle = (btn: ButtonDef) => btn.actions.length === 1
    ? { background: hexRgba(btn.color, 0.22), borderColor: hexRgba(btn.color, 0.5), color: '#fff' }
    : { background: `linear-gradient(135deg, ${hexRgba(btn.color, 0.32)} 50%, ${hexRgba(btn.color2 ?? btn.color, 0.32)} 50%)`,
        borderColor: hexRgba(btn.color, 0.5), color: '#fff' };

  const btnClass = clsx(
    'rounded border font-semibold transition-all hover:-translate-y-px active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
    compact ? 'px-2 py-1 text-[10px]' : 'min-h-10 px-4 py-2 text-xs',
  );

  return (
    <div ref={panelRef} className={clsx(
      'relative flex flex-col items-center bg-bg2 border border-border rounded-xl overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.2)]',
      compact
        ? 'h-full gap-1.5 p-2 justify-center'
        : 'gap-2 md:gap-3 p-3 md:p-5 w-full max-w-[420px]',
    )}>
      {!compact && (
        <div className="section-label text-center">
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
            {singleButtons.map((btn, index) => (
              <button key={btn.label} onClick={() => handleAnswer(btn)} disabled={paused}
                className={btnClass} style={btnStyle(btn)}>
                <span>{btn.label}</span>{!compact && <kbd className="ml-2 text-[9px] opacity-55">{index + 1}</kbd>}
              </button>
            ))}
          </div>
          {mixedButtons.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {mixedButtons.map((btn, index) => (
                <button key={btn.label} onClick={() => handleAnswer(btn)} disabled={paused}
                  className={btnClass} style={btnStyle(btn)}>
                  <span>{btn.label}</span>{!compact && <kbd className="ml-2 text-[9px] opacity-55">{singleButtons.length + index + 1}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {feedback && (
        <div key={`fb-${animKey}`} className={clsx(
          'animate-slide-up rounded text-center flex-shrink-0 self-center',
          compact ? 'px-2 py-1 text-[9px]' : 'px-4 py-2 text-xs font-medium max-w-xs',
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
            'rounded border border-border2 text-muted bg-transparent hover:bg-bg3 hover:text-text transition-all active:scale-95 cursor-pointer flex-shrink-0 self-center',
            compact ? 'px-2 py-1 text-[9px]' : 'px-5 py-2 text-xs font-semibold',
          )}>
          Main suivante →
        </button>
      )}

      <button onClick={() => setShowRangeOverlay(true)}
        className={clsx('inline-flex items-center gap-1.5 text-muted hover:text-text transition-colors flex-shrink-0 rounded px-2 py-1 hover:bg-bg3',
          compact ? 'text-[10px]' : 'text-xs'
        )}>
        <Icon name="grid" size={13} /> Voir la range
      </button>
      {!compact && <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted"><Icon name="keyboard" size={13}/><span>1–9 répondre · N suivante · R range</span></div>}

      <Modal open={showRangeOverlay} onClose={() => setShowRangeOverlay(false)} className="!max-w-[760px] !p-0 overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-4 sm:px-5 py-4 border-b border-border bg-bg3/50">
          <div className="min-w-0">
            <div className="section-label text-accent">Range complète</div>
            <h3 className="text-base font-bold truncate mt-0.5">{selectedTab.catName} · {selectedTab.name}</h3>
            <p className="text-[11px] text-muted mt-1">La main affichée est encadrée en jaune.</p>
          </div>
          <button aria-label="Fermer la range" onClick={() => setShowRangeOverlay(false)} className="w-9 h-9 rounded-lg border border-border text-muted hover:text-text hover:bg-bg3 flex items-center justify-center flex-shrink-0">
            <Icon name="close" size={17}/>
          </button>
        </div>
        <MiniRange selectedTab={selectedTab} actionButtons={actionButtons} currentHand={hand.hand} />
      </Modal>
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
  const inRange = hands.filter(({ hand }) => getNonFoldActions(hand, selectedTab.rangeMap).length > 0).length;
  return (
    <div className="bg-bg2 p-3 sm:p-5 overflow-y-auto max-h-[calc(90vh-88px)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-xs text-muted"><strong className="text-text">{inRange}</strong> mains · {Math.round(inRange / 169 * 100)}% de la grille</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {actionButtons.map(([name, color]) => <span key={name} className="inline-flex items-center gap-1.5 text-[11px] text-muted"><span className="w-2 h-2 rounded-full" style={{background:color}}/>{name}</span>)}
        </div>
      </div>
      <div className="grid grid-cols-13 gap-[2px] max-w-[640px] mx-auto" style={{ width: 'min(100%, calc(90vh - 190px))' }}>
        {hands.map(({ hand }) => {
          const acts = getNonFoldActions(hand, selectedTab.rangeMap);
          const isCurrent = hand === currentHand;
          if (acts.length === 0) {
            return <div key={hand} className="aspect-square rounded-[3px] flex items-center justify-center text-[clamp(6px,1.35vw,9px)] font-semibold text-muted2"
              style={{ background: 'rgba(107,114,128,0.18)', ...(isCurrent ? { boxShadow: 'inset 0 0 0 2px #f0b429' } : {}) }} title={hand}>{hand}</div>;
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
            <div key={hand} className="aspect-square rounded-[3px] flex items-center justify-center text-[clamp(6px,1.35vw,9px)] font-bold text-white"
              style={{ background: bg, boxShadow: isCurrent ? 'inset 0 0 0 2px #f0b429' : undefined,
                letterSpacing: '-0.2px' }}
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
