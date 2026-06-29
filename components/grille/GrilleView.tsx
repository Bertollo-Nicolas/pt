'use client';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import clsx from 'clsx';
import { useAppStore, getCfg } from '@/store/appStore';
import { allHands, getNonFoldActions, getHandActions, isMixed, cellType } from '@/lib/poker';
import { hexRgba, todayStr } from '@/lib/utils';
import { scoreGrille, type GrilleCheckResult, type GrilleCheckState } from '@/lib/grille-score';
import type { HandItem, SelectedTab } from '@/lib/types';

const FOLD_COLOR = '#6b7280';

type CellFreqs = Record<string, number>;
type Selection = Record<string, CellFreqs>;
type CheckState = GrilleCheckState;
type CheckResult = GrilleCheckResult;

// ── Helpers ───────────────────────────────────────────────────

function normalizeTo100(obj: Record<string, number>, keys: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const k of keys) result[k] = obj[k] ?? 0;
  const total = keys.reduce((s, k) => s + result[k], 0);
  if (total === 0) { result['Fold'] = 100; return result; }
  if (total === 100) return result;
  const diff = 100 - total;
  const biggest = keys.reduce((a, b) => result[b] > result[a] ? b : a);
  result[biggest] = Math.max(0, result[biggest] + diff);
  return result;
}

// Adjust one action's freq → scale all others proportionally to fill 100%.
function redistributeFreqs(
  prev: Record<string, number>,
  changed: string,
  newFreq: number,
  allNames: string[],
): Record<string, number> {
  const clamped = Math.max(0, Math.min(100, newFreq));
  const others = allNames.filter(n => n !== changed);
  const othersTotal = others.reduce((s, n) => s + (prev[n] ?? 0), 0);
  const remaining = 100 - clamped;

  const next: Record<string, number> = {};
  for (const n of allNames) next[n] = prev[n] ?? 0;
  next[changed] = clamped;

  if (remaining === 0) {
    for (const n of others) next[n] = 0;
  } else if (othersTotal === 0) {
    // Others were all 0 → put remainder in Fold
    const foldKey = others.find(n => n.toUpperCase().includes('FOLD')) ?? others[0];
    for (const n of others) next[n] = 0;
    if (foldKey) next[foldKey] = remaining;
  } else {
    for (const n of others) {
      next[n] = Math.round((prev[n] ?? 0) / othersTotal * remaining);
    }
  }

  return normalizeTo100(next, allNames);
}

function initAllFold(): Selection {
  const sel: Selection = {};
  allHands().forEach(({ hand }) => { sel[hand] = { Fold: 100 }; });
  return sel;
}

// buildGradient — uses buttons order for consistent left-to-right colouring.
function buildGradient(freqs: CellFreqs, buttons: [string, string][]): React.CSSProperties {
  const entries = buttons.map(([n, c]) => ({ n, c, v: freqs[n] ?? 0 })).filter(e => e.v > 0);
  if (entries.length === 0) return {};
  const total = entries.reduce((a, e) => a + e.v, 0);
  if (entries.length === 1) {
    return { background: hexRgba(entries[0].c, 0.5), borderColor: entries[0].c, color: entries[0].c };
  }
  let pos = 0;
  const stops: string[] = [];
  for (const { c, v } of entries) {
    const pct = (v / total) * 100;
    stops.push(`${hexRgba(c, 0.5)} ${pos.toFixed(1)}%`);
    stops.push(`${hexRgba(c, 0.5)} ${(pos + pct).toFixed(1)}%`);
    pos += pct;
  }
  const dominant = entries.reduce((a, b) => b.v > a.v ? b : a);
  return { background: `linear-gradient(90deg, ${stops.join(', ')})`, borderColor: dominant.c, color: '#dde0f0' };
}

// ── Score circle ──────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#2ecc8a' : score >= 55 ? '#e09540' : '#e05555';
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#2e2e38" strokeWidth="4" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
      <text x="28" y="32" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>{score}%</text>
    </svg>
  );
}

// ── Result grid with hand labels ──────────────────────────────

function ResultGrid({ hands, selection, actionButtons, selectedTab, label, hoveredHand, onHoverHand, checkResult, hoveredState, cellSize }: {
  hands: HandItem[];
  selection: Selection | null;
  actionButtons: [string, string][];
  selectedTab: SelectedTab | null;
  label: string;
  hoveredHand: string | null;
  onHoverHand: (hand: string | null) => void;
  checkResult: CheckResult | null;
  hoveredState: CheckState | null;
  cellSize: number;
}) {
  const fontSize = Math.max(4, Math.floor(cellSize * 0.35));

  return (
    <div className="flex flex-col items-center">
      <div className="text-[8px] text-muted text-center mb-0.5 uppercase tracking-wider">{label}</div>
      <div className="bg-bg3 rounded-lg p-0.5">
        <div
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(13, ${cellSize}px)`, 
            gridAutoRows: `${cellSize}px`, 
            gap: '1px', 
            fontSize: `${fontSize}px` 
          }}
          onMouseLeave={() => onHoverHand(null)}
        >
          {hands.map(({ hand }) => {
            let cellStyle: React.CSSProperties = { background: hexRgba(FOLD_COLOR, 0.22) };
            if (selection !== null) {
              // "Votre réponse" — painted freqs → gradient
              const freqs = selection[hand] ?? { Fold: 100 };
              const gs = buildGradient(freqs, actionButtons);
              if (gs.background) cellStyle = gs;
            } else if (selectedTab) {
              // "Correct" — build freqs from range data → gradient
              const acts = getNonFoldActions(hand, selectedTab.rangeMap);
              if (acts.length > 0) {
                const freqs: CellFreqs = {};
                const nfTotal = acts.reduce((s, a) => s + a.freq, 0);
                for (const a of acts) freqs[a.action] = a.freq * 100;
                if (nfTotal < 0.99) freqs['Fold'] = Math.round((1 - nfTotal) * 100);
                const gs = buildGradient(freqs, actionButtons);
                if (gs.background) cellStyle = gs;
              }
            }
            const handState = checkResult?.states[hand];
            const isHoveredByHand = hoveredHand === hand;
            const isHoveredByState = hoveredState && handState === hoveredState;
            const isAnyHovered = !!hoveredHand || !!hoveredState;
            const isHighlighted = isHoveredByHand || isHoveredByState;

            return (
              <div key={hand} onMouseEnter={() => onHoverHand(hand)}
                style={{
                  ...cellStyle,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, color: 'rgba(255,255,255,0.88)', borderRadius: '1.5px',
                  outline: isHighlighted ? '1.5px solid rgba(255,255,255,0.85)' : undefined,
                  zIndex: isHighlighted ? 1 : 0, position: 'relative',
                  opacity: isAnyHovered && !isHighlighted ? 0.45 : 1,
                  transition: 'opacity 0.07s', userSelect: 'none',
                }}>{hand}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main grid cell ────────────────────────────────────────────

const HandCell = memo(function HandCell({ hand, selStyle, hasDot, onPointerDown, onPointerEnter }: {
  hand: string;
  selStyle?: React.CSSProperties;
  hasDot?: boolean;
  onPointerDown: (hand: string, e: React.PointerEvent) => void;
  onPointerEnter: (hand: string) => void;
}) {
  const type = cellType(hand);
  return (
    <div
      className={clsx(
        'hand-cell select-none',
        !selStyle && (
          type === 'pair'   ? 'bg-yellow/10 text-yellow border-yellow/20' :
          type === 'suited' ? 'bg-blue/10 text-blue border-blue/20' :
                              'bg-bg3 text-muted2 border-border'
        ),
        selStyle && 'border',
      )}
      style={selStyle}
      onPointerDown={(e) => onPointerDown(hand, e)}
      onPointerEnter={() => onPointerEnter(hand)}
    >
      {hand}
      {hasDot && <div className="freq-dot" />}
    </div>
  );
});

// ── Main view ─────────────────────────────────────────────────

export function GrilleView() {
  const store = useAppStore();
  const { selectedTab, selectedTabKey, addSession, srs, setPendingSrsKey, pendingSrsKey, srsReviewKey, finishSrsReview } = store;
  const cfg = getCfg(store);
  const colorOverrides = store.colorOverrides;

  const [selected,      setSelected]      = useState<Selection>(() => initAllFold());
  const [checkResult,   setCheckResult]   = useState<CheckResult | null>(null);
  const [revealed,      setRevealed]      = useState(false);
  const [cellSize,      setCellSize]      = useState(32);
  const [resCellSize,   setResCellSize]   = useState(18);
  const [freqPerAction, setFreqPerAction] = useState<Record<string, number>>({});
  const [hoveredHand,   setHoveredHand]   = useState<string | null>(null);
  const [hoveredState,  setHoveredState]  = useState<CheckState | null>(null);

  const containerRef   = useRef<HTMLDivElement>(null);
  const midRef         = useRef<HTMLDivElement>(null);
  const isDraggingRef  = useRef(false);
  const pointerDownRef = useRef<string | null>(null);
  const dragMovedRef   = useRef(false);

  // Build action buttons: non-fold from file + Fold last
  const rawActionButtons = useMemo((): [string, string][] => selectedTab
    ? [...new Map(
      selectedTab.rangeList
        .filter(rl => rl.hands.length > 0)
        .map(rl => {
          const r = store.rangeColors[rl.id];
          return r && !r.name.toUpperCase().includes('FOLD')
            ? [r.name, colorOverrides[r.name] ?? r.color] as [string, string]
            : null;
        })
        .filter(Boolean) as [string, string][]
    )]
    : [], [selectedTab, store.rangeColors, colorOverrides]);

  const allActionButtons = useMemo((): [string, string][] => [
    ...rawActionButtons,
    ['Fold', colorOverrides['Fold'] ?? FOLD_COLOR]
  ], [rawActionButtons, colorOverrides]);

  const allActionNames = useMemo(() => allActionButtons.map(([n]) => n), [allActionButtons]);

  // Resize observer for grids
  const updateSizes = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: w, clientHeight: h } = containerRef.current;
    
    // Main grid sizing
    if (midRef.current) {
      const { clientWidth: mw, clientHeight: mh } = midRef.current;
      setCellSize(Math.max(16, Math.floor((Math.min(mw, mh) - 34) / 13)));
    }

    // Result grids sizing (2 grids side by side)
    // Non-grid height estimates: Score (~65), Stats (~55), Button (~45), Banner (~40), Spacings (~60)
    const fixedH = 265; 
    const maxResH = Math.max(10, Math.floor((h - fixedH) / 13));
    const maxResW = Math.max(10, Math.floor((w - 40) / 2 / 13));
    setResCellSize(Math.min(maxResH, maxResW));
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver(updateSizes);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [updateSizes]);

  // Reset on tab change — init freqPerAction to Fold=100%, others=0%
  useEffect(() => {
    setSelected(initAllFold());
    setCheckResult(null);
    setRevealed(false);
    setHoveredHand(null);
    setHoveredState(null);
    const init: Record<string, number> = {};
    for (const [n] of allActionButtons) init[n] = n === 'Fold' ? 100 : 0;
    setFreqPerAction(init);
  }, [selectedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Distribution: dominant action per cell → count (for display in cards)
  const actionDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const freqs of Object.values(selected)) {
      const entries = Object.entries(freqs);
      if (entries.length === 0) { counts['Fold'] = (counts['Fold'] ?? 0) + 1; continue; }
      const dom = entries.reduce((a, b) => b[1] > a[1] ? b : a);
      counts[dom[0]] = (counts[dom[0]] ?? 0) + 1;
    }
    return counts;
  }, [selected]);

  // Adjust one action's freq; scale others proportionally
  const adjustFreq = useCallback((name: string, newFreq: number) => {
    setFreqPerAction(prev => redistributeFreqs(prev, name, newFreq, allActionNames));
  }, [allActionNames]);

  // ── Painting — apply current freqPerAction snapshot ───────────

  const paintCell = useCallback((hand: string) => {
    if (checkResult) return;
    const snapshot: CellFreqs = {};
    for (const [n] of allActionButtons) {
      const f = freqPerAction[n] ?? 0;
      if (f > 0) snapshot[n] = f;
    }
    if (Object.keys(snapshot).length === 0) snapshot['Fold'] = 100;
    setSelected(prev => ({ ...prev, [hand]: snapshot }));
  }, [checkResult, freqPerAction, allActionButtons]);

  const paintCellRef = useRef(paintCell);
  useEffect(() => { paintCellRef.current = paintCell; }, [paintCell]);

  useEffect(() => {
    const onUp = () => {
      if (pointerDownRef.current && !dragMovedRef.current && !checkResult) {
        paintCellRef.current(pointerDownRef.current);
      }
      isDraggingRef.current = false;
      pointerDownRef.current = null;
      dragMovedRef.current = false;
    };
    document.addEventListener('pointerup', onUp);
    return () => document.removeEventListener('pointerup', onUp);
  }, [checkResult]);

  const handlePointerDown = useCallback((hand: string, e: React.PointerEvent) => {
    e.preventDefault();
    if (checkResult) return;
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    pointerDownRef.current = hand;
  }, [checkResult]);

  const handlePointerEnter = useCallback((hand: string) => {
    if (!isDraggingRef.current || checkResult || !selectedTab) return;
    if (hand === pointerDownRef.current) return;
    if (!dragMovedRef.current) {
      dragMovedRef.current = true;
      if (pointerDownRef.current) paintCellRef.current(pointerDownRef.current);
    }
    paintCellRef.current(hand);
  }, [checkResult, selectedTab]);

  // ── Check ─────────────────────────────────────────────────────

  const handleCheck = () => {
    if (!selectedTab) return;
    const result = scoreGrille(selected, selectedTab.rangeMap, cfg.grilleFreqTolerance);
    setCheckResult(result);
    if (selectedTabKey) {
      for (const err of result.errors) {
        store.recordError(err.hand, err.given, err.expected, selectedTabKey);
      }
    }
    addSession({ key: `grille_${selectedTabKey}`, date: todayStr(), name: selectedTab.name, catName: selectedTab.catName, mode: 'grille', score: result.score, correct: result.correct, missed: result.missed, extra: result.extra, wrongAct: result.wrongAct });
    if (selectedTabKey && !srs[selectedTabKey] && result.score >= cfg.grilleThreshold && pendingSrsKey !== selectedTabKey) {
      setPendingSrsKey(selectedTabKey);
    }
  };

  const handleReset = useCallback(() => {
    setSelected(initAllFold());
    setCheckResult(null);
    setRevealed(false);
    setHoveredHand(null);
    setHoveredState(null);
    const init: Record<string, number> = {};
    for (const [n] of allActionButtons) init[n] = n === 'Fold' ? 100 : 0;
    setFreqPerAction(init);
  }, [allActionButtons]); // eslint-disable-line react-hooks/exhaustive-deps

  const hands = allHands();
  const inRangeCount = selectedTab ? hands.filter(h => getNonFoldActions(h.hand, selectedTab.rangeMap).length > 0).length : 0;
  const fontSize = Math.max(7, Math.floor(cellSize * 0.38));
  const isSrsReview = srsReviewKey === selectedTabKey;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden min-h-0 px-2 md:px-4 py-2">

      {/* SRS banner */}
      {isSrsReview && (
        <div className="flex-shrink-0 mb-1.5 px-3 py-2 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-accent">📅 Révision SRS</span>
            <span className="text-[10px] text-muted ml-2">Reconstituez la range de mémoire, puis vérifiez</span>
          </div>
          <button onClick={() => store.setMode('srs')} className="text-[10px] text-muted hover:text-text transition-colors flex-shrink-0">✕ Annuler</button>
        </div>
      )}

      {/* ── Editing UI ──────────────────────────────────────────── */}
      {!checkResult && (
        <div className="flex-shrink-0">

          {/* Range info */}
          {selectedTab && (
            <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-muted flex-shrink-0">{inRangeCount} mains ({Math.round(inRangeCount / 169 * 100)}%)</span>
            </div>
          )}

          {/* Action cards — always fully expanded, no selection */}
          {selectedTab && !revealed && (
            <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-0.5">
              {allActionButtons.map(([name, color]) => {
                const freq = freqPerAction[name] ?? 0;
                const distPct = Math.round((actionDist[name] ?? 0) / 169 * 100);
                const isActive = freq > 0;
                return (
                  <div key={name}
                    className="flex-1 min-w-[80px] rounded-lg overflow-hidden flex-shrink-0"
                    style={{
                      background: isActive ? hexRgba(color, 0.35) : hexRgba(color, 0.1),
                      border: `2px solid ${isActive ? color : hexRgba(color, 0.3)}`,
                    }}
                  >
                    <div className="px-2 py-2 flex flex-col items-center gap-1.5">
                      {/* Action name + painted % */}
                      <div className="flex items-center gap-1.5 w-full justify-between">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-white font-bold text-[12px] flex-1 text-center leading-tight">{name}</span>
                        <span className="text-[9px] text-white/50">{distPct}%</span>
                      </div>

                      {/* Freq stepper */}
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          className="w-5 h-5 rounded flex items-center justify-center text-sm leading-none cursor-pointer text-white select-none"
                          style={{ background: 'rgba(0,0,0,0.3)' }}
                          onClick={() => adjustFreq(name, Math.max(0, freq - 5))}>−</button>
                        <span className="font-mono font-bold text-sm text-white w-9 text-center">{freq}%</span>
                        <button
                          className="w-5 h-5 rounded flex items-center justify-center text-sm leading-none cursor-pointer text-white select-none"
                          style={{ background: 'rgba(0,0,0,0.3)' }}
                          onClick={() => adjustFreq(name, Math.min(100, freq + 5))}>+</button>
                      </div>

                      {/* Presets */}
                      <div className="flex gap-0.5 justify-center">
                        {[0, 25, 50, 75, 100].map(f => (
                          <button key={f}
                            className="px-1 py-0.5 text-[8px] rounded cursor-pointer text-white select-none"
                            style={{ background: freq === f ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)' }}
                            onClick={() => adjustFreq(name, f)}>{f}</button>
                        ))}
                      </div>
                    </div>

                    {/* Distribution bar at bottom */}
                    <div className="h-[3px] bg-black/20">
                      <div style={{ width: `${distPct}%`, background: color, height: '100%', transition: 'width 0.2s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Control buttons */}
          <div className="flex gap-1.5 mb-1.5">
            <button onClick={handleCheck}
              className="px-3 py-1.5 text-[11px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity cursor-pointer">
              ✓ Vérifier
            </button>
            <button onClick={() => setRevealed(v => !v)}
              className={clsx('px-3 py-1.5 text-[11px] font-semibold rounded border transition-colors cursor-pointer',
                revealed ? 'bg-blue/20 border-blue text-blue' : 'border-border text-muted hover:text-text hover:border-border2'
              )}>
              👁 Révéler
            </button>
            <button onClick={handleReset}
              className="px-3 py-1.5 text-[11px] font-semibold rounded border border-border text-muted hover:text-text hover:border-border2 transition-colors cursor-pointer">
              ↺ Reset
            </button>
          </div>
        </div>
      )}

      {/* ── Results view ─────────────────────────────────────────── */}
      {checkResult ? (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2 py-0.5 w-full">
          <div className="text-center">
            <div className="inline-flex flex-col items-center">
              <ScoreCircle score={checkResult.score} />
              <div className="text-[10px] text-muted mt-0.5">
                {checkResult.score >= 85 ? 'Excellent' : checkResult.score >= 70 ? 'Bien' : checkResult.score >= 55 ? 'À améliorer' : 'À retravailler'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ResultGrid hands={hands} selection={selected} actionButtons={allActionButtons} selectedTab={selectedTab} label="Votre réponse" hoveredHand={hoveredHand} onHoverHand={setHoveredHand} checkResult={checkResult} hoveredState={hoveredState} cellSize={resCellSize} />
            <ResultGrid hands={hands} selection={null} actionButtons={allActionButtons} selectedTab={selectedTab} label="Correct" hoveredHand={hoveredHand} onHoverHand={setHoveredHand} checkResult={checkResult} hoveredState={hoveredState} cellSize={resCellSize} />
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Correct', val: checkResult.correct,  color: '#2ecc8a', state: 'correct' as const },
              { label: 'Raté',    val: checkResult.missed,   color: '#e05555', state: 'missed' as const },
              { label: 'En trop', val: checkResult.extra,    color: '#e09540', state: 'extra' as const },
              { label: 'Erreur',  val: checkResult.wrongAct, color: '#d4c040', state: 'wrong-action' as const },
            ].map(({ label, val, color, state }) => (
              <div key={label}
                className="bg-bg2 border border-border rounded-lg py-1.5 text-center transition-colors hover:bg-bg3 cursor-default"
                onMouseEnter={() => setHoveredState(state)}
                onMouseLeave={() => setHoveredState(null)}
              >
                <div className="text-lg font-bold leading-none" style={{ color }}>{val}</div>
                <div className="text-[7px] text-muted mt-0.5 uppercase tracking-wider leading-none">{label}</div>
              </div>
            ))}
          </div>

          <button onClick={handleReset}
            className="w-full py-2 rounded-lg bg-bg3 border border-border text-xs font-semibold text-text hover:bg-bg4 hover:border-border2 transition-all cursor-pointer">
            ↺ Recommencer
          </button>

          {isSrsReview && selectedTabKey && (
            <div className={clsx('flex items-center justify-between px-3 py-1.5 rounded-lg border',
              checkResult.score >= cfg.grilleThreshold ? 'bg-green/10 border-green/30' : 'bg-red/10 border-red/30')}>
              <div>
                <div className={clsx('text-[10px] font-bold', checkResult.score >= cfg.grilleThreshold ? 'text-green' : 'text-red')}>
                  {checkResult.score >= cfg.grilleThreshold ? `✅ Révision réussie (${checkResult.score}%)` : `❌ Score insuffisant (${checkResult.score}% < ${cfg.grilleThreshold}%)`}
                </div>
                <div className="text-[8px] text-muted mt-0.5">
                  {checkResult.score >= cfg.grilleThreshold ? 'Prochaine date adaptée au score' : 'Révision rapprochée — réessayer demain'}
                </div>
              </div>
              <button onClick={() => finishSrsReview(selectedTabKey, checkResult.score)}
                className="flex-shrink-0 px-2 py-1 text-[10px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity ml-3 cursor-pointer">
                Confirmer →
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Main editing grid ──────────────────────────────────── */
        <div ref={midRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(13, ${cellSize}px)`,
            gridAutoRows: `${cellSize}px`,
            gap: '2px',
            fontSize: `${fontSize}px`,
          }}>
            {hands.map(({ hand }) => {
              const acts = selectedTab ? getNonFoldActions(hand, selectedTab.rangeMap) : [];
              const rawActs = selectedTab ? (getHandActions(hand, selectedTab.rangeMap) ?? []) : [];
              const hasDot = isMixed(rawActs);

              let selStyle: React.CSSProperties | undefined;
              if (revealed) {
                if (acts.length > 0) {
                  const freqs: CellFreqs = {};
                  const nfTotal = acts.reduce((s, a) => s + a.freq, 0);
                  for (const a of acts) freqs[a.action] = a.freq * 100;
                  if (nfTotal < 0.99) freqs['Fold'] = Math.round((1 - nfTotal) * 100);
                  selStyle = buildGradient(freqs, allActionButtons);
                } else {
                  selStyle = { background: hexRgba(colorOverrides['Fold'] ?? FOLD_COLOR, 0.22), borderColor: hexRgba(colorOverrides['Fold'] ?? FOLD_COLOR, 0.35), color: '#7a7a90' };
                }
              } else {
                selStyle = buildGradient(selected[hand] ?? { Fold: 100 }, allActionButtons);
              }

              return (
                <HandCell key={hand} hand={hand} selStyle={selStyle}
                  hasDot={hasDot && revealed}
                  onPointerDown={handlePointerDown}
                  onPointerEnter={handlePointerEnter}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
