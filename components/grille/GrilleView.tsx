'use client';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import clsx from 'clsx';
import { useAppStore, getCfg } from '@/store/appStore';
import { allHands, getNonFoldActions, getHandActions, isMixed, cellType } from '@/lib/poker';
import { hexRgba, todayStr } from '@/lib/utils';
import type { HandItem, SelectedTab } from '@/lib/types';

const FOLD_COLOR = '#6b7280';

type CellFreqs = Record<string, number>;
type Selection = Record<string, CellFreqs>;
type CheckState = 'correct' | 'missed' | 'extra' | 'wrong-action';

interface CheckResult {
  states: Record<string, CheckState>;
  correct: number; wrongAct: number; missed: number; extra: number;
  score: number; pct: number;
}

// ── Helpers ───────────────────────────────────────────────────

// Fix rounding so cell always sums to exactly 100.
function normalizeTo100(cell: CellFreqs): CellFreqs {
  const entries = Object.entries(cell).filter(([, v]) => v > 0);
  if (entries.length === 0) return { Fold: 100 };
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 100) return Object.fromEntries(entries);
  const diff = 100 - total;
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const result: CellFreqs = Object.fromEntries(entries);
  result[sorted[0][0]] = Math.max(1, result[sorted[0][0]] + diff);
  return result;
}

// Proportional redistribution: setting action X to freq F scales all other
// actions proportionally to fill the remaining (100 - F)%.
function applyPaint(prev: Selection, hand: string, action: string, freq: number): Selection {
  const prevCell = prev[hand] ?? { Fold: 100 };

  // freq=100 → exclusive replacement
  if (freq === 100) return { ...prev, [hand]: { [action]: 100 } };

  // freq=0 → remove action, scale others up to fill its share
  if (freq === 0) {
    const cell = { ...prevCell };
    delete cell[action];
    const remaining = Object.entries(cell).filter(([, v]) => v > 0);
    if (remaining.length === 0) return { ...prev, [hand]: { Fold: 100 } };
    const tot = remaining.reduce((s, [, v]) => s + v, 0);
    const newCell: CellFreqs = {};
    for (const [k, v] of remaining) newCell[k] = Math.round(v / tot * 100);
    return { ...prev, [hand]: normalizeTo100(newCell) };
  }

  // 0 < freq < 100 → set action, scale all others to fill (100 - freq)
  const others = Object.entries(prevCell).filter(([k]) => k !== action);
  const othersTotal = others.reduce((s, [, v]) => s + v, 0);
  const remaining = 100 - freq;

  const newCell: CellFreqs = { [action]: freq };

  if (othersTotal === 0) {
    // No other actions → remainder goes to Fold
    if (remaining > 0) newCell['Fold'] = remaining;
  } else {
    for (const [k, v] of others) {
      const scaled = Math.round(v / othersTotal * remaining);
      if (scaled > 0) newCell[k] = scaled;
    }
  }

  return { ...prev, [hand]: normalizeTo100(newCell) };
}

function cellIsPlayed(freqs: CellFreqs): boolean {
  return Object.entries(freqs).some(([k, v]) => !k.toUpperCase().includes('FOLD') && v > 0);
}

function initAllFold(): Selection {
  const sel: Selection = {};
  allHands().forEach(({ hand }) => { sel[hand] = { Fold: 100 }; });
  return sel;
}

// buildGradient — props are always ~100% total, so proportions are correct.
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
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#2ecc8a' : score >= 55 ? '#e09540' : '#e05555';
  return (
    <svg width="68" height="68" viewBox="0 0 68 68">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#2e2e38" strokeWidth="5" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
      <text x="34" y="39" textAnchor="middle" fontSize="13" fontWeight="bold" fill={color}>{score}%</text>
    </svg>
  );
}

// ── Result grid with hand labels (like main grid, auto-sized) ─

function ResultGrid({ hands, selection, actionButtons, selectedTab, label, hoveredHand, onHoverHand }: {
  hands: HandItem[];
  selection: Selection | null; // null = show correct
  actionButtons: [string, string][];
  selectedTab: SelectedTab | null;
  label: string;
  hoveredHand: string | null;
  onHoverHand: (hand: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(18);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setCellSize(Math.max(14, Math.floor((w - 4) / 13)));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const fontSize = Math.max(5, Math.floor(cellSize * 0.37));

  return (
    <div>
      <div className="text-[9px] text-muted text-center mb-1 uppercase tracking-wider">{label}</div>
      <div ref={containerRef} className="bg-bg3 rounded-lg p-1">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(13, ${cellSize}px)`,
            gridAutoRows: `${cellSize}px`,
            gap: '1px',
            fontSize: `${fontSize}px`,
          }}
          onMouseLeave={() => onHoverHand(null)}
        >
          {hands.map(({ hand }) => {
            let bg = hexRgba(FOLD_COLOR, 0.22);

            if (selection !== null) {
              const freqs = selection[hand] ?? {};
              if (cellIsPlayed(freqs)) {
                const nonFold = Object.entries(freqs).filter(([k]) => !k.toUpperCase().includes('FOLD'));
                const dom = nonFold.reduce((a, b) => b[1] > a[1] ? b : a, ['', 0] as [string, number]);
                const color = actionButtons.find(([n]) => n === dom[0])?.[1] ?? '#888';
                bg = hexRgba(color, 0.85);
              }
            } else if (selectedTab) {
              const acts = getNonFoldActions(hand, selectedTab.rangeMap);
              if (acts.length > 0) {
                const color = actionButtons.find(([n]) => n === acts[0].action)?.[1] ?? '#888';
                bg = hexRgba(color, 0.85);
              }
            }

            const isHovered = hoveredHand === hand;
            return (
              <div key={hand}
                onMouseEnter={() => onHoverHand(hand)}
                style={{
                  background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, color: 'rgba(255,255,255,0.88)',
                  borderRadius: '2px',
                  outline: isHovered ? '1.5px solid rgba(255,255,255,0.85)' : undefined,
                  zIndex: isHovered ? 1 : 0,
                  position: 'relative',
                  opacity: hoveredHand && !isHovered ? 0.45 : 1,
                  transition: 'opacity 0.07s',
                  userSelect: 'none',
                }}
              >
                {hand}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main grid cell ────────────────────────────────────────────

const HandCell = memo(function HandCell({
  hand, selStyle, hasDot, onPointerDown, onPointerEnter,
}: {
  hand: string;
  selStyle?: React.CSSProperties;
  hasDot?: boolean;
  onPointerDown: (hand: string, e: React.PointerEvent) => void;
  onPointerEnter: (hand: string) => void;
}) {
  const type = cellType(hand);
  const baseClass = clsx(
    'hand-cell select-none',
    !selStyle && (
      type === 'pair'   ? 'bg-yellow/10 text-yellow border-yellow/20' :
      type === 'suited' ? 'bg-blue/10 text-blue border-blue/20' :
                          'bg-bg3 text-muted2 border-border'
    ),
    selStyle && 'border',
  );
  return (
    <div className={baseClass} style={selStyle ?? undefined}
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
  const colorOverrides = store.colorOverrides ?? {};

  const [selected,      setSelected]      = useState<Selection>(() => initAllFold());
  const [checkResult,   setCheckResult]   = useState<CheckResult | null>(null);
  const [revealed,      setRevealed]      = useState(false);
  const [cellSize,      setCellSize]      = useState(32);
  const [activeAction,  setActiveAction]  = useState<string>('Fold');
  const [freqPerAction, setFreqPerAction] = useState<Record<string, number>>({});
  const [hoveredHand,   setHoveredHand]   = useState<string | null>(null);

  const midRef         = useRef<HTMLDivElement>(null);
  const isDraggingRef  = useRef(false);
  const pointerDownRef = useRef<string | null>(null);
  const dragMovedRef   = useRef(false);

  // Action buttons: all non-fold from file + Fold last
  const rawActionButtons: [string, string][] = selectedTab
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
    : [];

  const allActionButtons: [string, string][] = [
    ...rawActionButtons,
    ['Fold', colorOverrides['Fold'] ?? FOLD_COLOR],
  ];

  // Resize observer for main grid
  const sizeGrid = useCallback(() => {
    if (!midRef.current) return;
    const { clientWidth: w, clientHeight: h } = midRef.current;
    const size = Math.min(w, h) - 8;
    setCellSize(Math.max(16, Math.floor((size - 26) / 13)));
  }, []);
  useEffect(() => {
    const obs = new ResizeObserver(sizeGrid);
    if (midRef.current) obs.observe(midRef.current);
    return () => obs.disconnect();
  }, [sizeGrid]);

  // Reset on tab change
  useEffect(() => {
    setSelected(initAllFold());
    setCheckResult(null);
    setRevealed(false);
    setActiveAction('Fold');
    setFreqPerAction({});
    setHoveredHand(null);
  }, [selectedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Distribution: dominant action per cell → count
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

  // ── Painting ──────────────────────────────────────────────────

  const getFreq = useCallback((action: string) => freqPerAction[action] ?? 100, [freqPerAction]);

  const paintCell = useCallback((hand: string) => {
    if (checkResult || !activeAction) return;
    const freq = getFreq(activeAction);
    setSelected(prev => applyPaint(prev, hand, activeAction, freq));
  }, [checkResult, activeAction, getFreq]);

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
    if (!isDraggingRef.current || checkResult || !selectedTab || !activeAction) return;
    if (hand === pointerDownRef.current) return;
    if (!dragMovedRef.current) {
      dragMovedRef.current = true;
      const origin = pointerDownRef.current;
      if (origin) setSelected(prev => applyPaint(prev, origin, activeAction, getFreq(activeAction)));
    }
    setSelected(prev => applyPaint(prev, hand, activeAction, getFreq(activeAction)));
  }, [checkResult, selectedTab, activeAction, getFreq]);

  // ── Check ─────────────────────────────────────────────────────

  const handleCheck = () => {
    if (!selectedTab) return;
    let correct = 0, wrongAct = 0, missed = 0, extra = 0;
    const states: Record<string, CheckState> = {};

    allHands().forEach(({ hand }) => {
      const nonFoldActs = getNonFoldActions(hand, selectedTab.rangeMap);
      const inRange = nonFoldActs.length > 0;
      const userFreqs = selected[hand] ?? {};
      const played = cellIsPlayed(userFreqs);

      if (inRange && played) {
        const nonFoldEntries = Object.entries(userFreqs).filter(([k]) => !k.toUpperCase().includes('FOLD'));
        const userDom = nonFoldEntries.reduce((a, b) => b[1] > a[1] ? b : a, ['', 0] as [string, number]);
        const dom = nonFoldActs[0];
        if (userDom[0] === dom?.action) {
          states[hand] = 'correct'; correct++;
        } else {
          const validMixed = nonFoldActs.find(a => a.action === userDom[0] && a.freq >= 0.2);
          if (validMixed) { states[hand] = 'correct'; correct++; }
          else { states[hand] = 'wrong-action'; wrongAct++; }
        }
      } else if (inRange && !played) {
        states[hand] = 'missed'; missed++;
      } else if (!inRange && played) {
        states[hand] = 'extra'; extra++;
      }
    });

    const total = correct + wrongAct + missed;
    const score = total > 0 ? Math.round(correct / total * 100) : 100;
    const pct   = Math.round(total / 169 * 100);
    setCheckResult({ states, correct, wrongAct, missed, extra, score, pct });

    addSession({ key: `grille_${selectedTabKey}`, date: todayStr(), name: selectedTab.name, catName: selectedTab.catName, mode: 'grille', score, correct, missed, extra, wrongAct });

    if (selectedTabKey && !srs[selectedTabKey] && score >= cfg.grilleThreshold && pendingSrsKey !== selectedTabKey) {
      setPendingSrsKey(selectedTabKey);
    }
  };

  const handleReset = useCallback(() => {
    setSelected(initAllFold());
    setCheckResult(null);
    setRevealed(false);
    setActiveAction('Fold');
    setFreqPerAction({});
    setHoveredHand(null);
  }, []);

  const hands = allHands();
  const inRangeCount = selectedTab ? hands.filter(h => getNonFoldActions(h.hand, selectedTab.rangeMap).length > 0).length : 0;
  const pctRange = Math.round(inRangeCount / 169 * 100);
  const fontSize = Math.max(7, Math.floor(cellSize * 0.38));
  const isSrsReview = srsReviewKey === selectedTabKey;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 px-2 md:px-4 py-2">

      {/* SRS banner */}
      {isSrsReview && (
        <div className="flex-shrink-0 mb-1.5 px-3 py-2 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-accent">📅 Révision SRS</span>
            <span className="text-[10px] text-muted ml-2">Reconstituez la range de mémoire, puis vérifiez</span>
          </div>
          <button onClick={() => store.setMode('srs')}
            className="text-[10px] text-muted hover:text-text transition-colors flex-shrink-0">
            ✕ Annuler
          </button>
        </div>
      )}

      {/* ── Editing UI ──────────────────────────────────────────── */}
      {!checkResult && (
        <div className="flex-shrink-0">
          {/* Range info */}
          {selectedTab && (
            <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-muted flex-shrink-0">{inRangeCount} mains ({pctRange}%)</span>
              <div className="flex gap-1 flex-wrap">
                {rawActionButtons.map(([name, color]) => (
                  <div key={name} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-border whitespace-nowrap flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />{name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GTOWizard action cards */}
          {selectedTab && !revealed && (
            <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-0.5">
              {allActionButtons.map(([name, color]) => {
                const isActive = activeAction === name;
                const freq = getFreq(name);
                const distPct = Math.round((actionDist[name] ?? 0) / 169 * 100);
                return (
                  <div key={name}
                    onClick={() => setActiveAction(name)}
                    className="flex-1 min-w-[72px] rounded-lg overflow-hidden cursor-pointer select-none flex-shrink-0"
                    style={{
                      background: isActive ? color : hexRgba(color, 0.28),
                      border: `2px solid ${isActive ? color : hexRgba(color, 0.55)}`,
                    }}
                  >
                    <div className="px-2 py-2.5 flex flex-col items-center gap-1.5">
                      <span className="text-white font-bold text-[13px] leading-tight text-center">{name}</span>

                      {isActive ? (
                        <div className="flex flex-col items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 justify-center">
                            <button
                              className="w-5 h-5 rounded flex items-center justify-center text-base leading-none cursor-pointer text-white"
                              style={{ background: 'rgba(0,0,0,0.25)' }}
                              onClick={() => setFreqPerAction(p => ({ ...p, [name]: Math.max(0, (p[name] ?? 100) - 25) }))}>−</button>
                            <span className="text-white font-bold font-mono text-sm w-8 text-center">{freq}</span>
                            <button
                              className="w-5 h-5 rounded flex items-center justify-center text-base leading-none cursor-pointer text-white"
                              style={{ background: 'rgba(0,0,0,0.25)' }}
                              onClick={() => setFreqPerAction(p => ({ ...p, [name]: Math.min(100, (p[name] ?? 100) + 25) }))}>+</button>
                          </div>
                          <div className="flex gap-0.5 justify-center flex-wrap">
                            {[0, 25, 50, 75, 100].map(f => (
                              <button key={f}
                                className="px-1 py-0.5 text-[9px] rounded cursor-pointer text-white"
                                style={{ background: freq === f ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.22)' }}
                                onClick={() => setFreqPerAction(p => ({ ...p, [name]: f }))}>
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-white/60 text-[10px]">{distPct}%</span>
                      )}
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
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3 py-1">

          {/* Score */}
          <div className="text-center">
            <div className="inline-flex flex-col items-center">
              <ScoreCircle score={checkResult.score} />
              <div className="text-[10px] text-muted mt-1">
                {checkResult.score >= 85 ? 'Excellent' :
                 checkResult.score >= 70 ? 'Bien' :
                 checkResult.score >= 55 ? 'À améliorer' : 'À retravailler'}
              </div>
            </div>
          </div>

          {/* Side-by-side grids with hand labels */}
          <div className="grid grid-cols-2 gap-2">
            <ResultGrid
              hands={hands} selection={selected}
              actionButtons={allActionButtons} selectedTab={selectedTab}
              label="Votre réponse"
              hoveredHand={hoveredHand} onHoverHand={setHoveredHand}
            />
            <ResultGrid
              hands={hands} selection={null}
              actionButtons={allActionButtons} selectedTab={selectedTab}
              label="Correct"
              hoveredHand={hoveredHand} onHoverHand={setHoveredHand}
            />
          </div>

          {/* Counts */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Correct', val: checkResult.correct,  color: '#2ecc8a' },
              { label: 'Raté',    val: checkResult.missed,   color: '#e05555' },
              { label: 'En trop', val: checkResult.extra,    color: '#e09540' },
              { label: 'Erreur',  val: checkResult.wrongAct, color: '#d4c040' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-bg2 border border-border rounded-lg py-2 text-center">
                <div className="text-xl font-bold leading-none" style={{ color }}>{val}</div>
                <div className="text-[8px] text-muted mt-1 uppercase tracking-wider leading-none">{label}</div>
              </div>
            ))}
          </div>

          {/* Try again */}
          <button onClick={handleReset}
            className="w-full py-2.5 rounded-lg bg-bg3 border border-border text-sm font-semibold text-text hover:bg-bg4 hover:border-border2 transition-all cursor-pointer">
            ↺ Recommencer
          </button>

          {/* SRS confirmation */}
          {isSrsReview && selectedTabKey && (
            <div className={clsx(
              'flex items-center justify-between px-3 py-2.5 rounded-lg border',
              checkResult.score >= cfg.grilleThreshold ? 'bg-green/10 border-green/30' : 'bg-red/10 border-red/30'
            )}>
              <div>
                <div className={clsx('text-[11px] font-bold', checkResult.score >= cfg.grilleThreshold ? 'text-green' : 'text-red')}>
                  {checkResult.score >= cfg.grilleThreshold
                    ? `✅ Révision réussie (${checkResult.score}%)`
                    : `❌ Score insuffisant (${checkResult.score}% < ${cfg.grilleThreshold}%)`}
                </div>
                <div className="text-[9px] text-muted mt-0.5">
                  {checkResult.score >= cfg.grilleThreshold ? 'Intervalle avancé' : 'Intervalle réduit — réessayer demain'}
                </div>
              </div>
              <button onClick={() => finishSrsReview(selectedTabKey, checkResult.score)}
                className="flex-shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity ml-3 cursor-pointer">
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
