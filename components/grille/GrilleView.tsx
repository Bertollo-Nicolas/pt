'use client';
import { useCallback, useEffect, useRef, useState, memo } from 'react';
import clsx from 'clsx';
import { useAppStore, getCfg } from '@/store/appStore';
import { allHands, getNonFoldActions, getHandActions, isMixed, cellType } from '@/lib/poker';
import { hexRgba, todayStr } from '@/lib/utils';
import type { HandAction } from '@/lib/types';

// hand → { actionName → freq 0-100 }
type CellFreqs = Record<string, number>;
type Selection = Record<string, CellFreqs>;

type CheckState = 'correct' | 'missed' | 'extra' | 'wrong-action';

interface CheckResult {
  states: Record<string, CheckState>;
  correct: number; wrongAct: number; missed: number; extra: number;
  score: number; pct: number;
}

// ── Gradient builder ──────────────────────────────────────
function buildGradient(freqs: CellFreqs, buttons: [string, string][]): React.CSSProperties {
  const entries = buttons.map(([n, c]) => ({ n, c, v: freqs[n] ?? 0 })).filter(e => e.v > 0);
  if (entries.length === 0) return {};
  const total = entries.reduce((a, e) => a + e.v, 0);

  if (entries.length === 1) {
    return { background: hexRgba(entries[0].c, 0.32), borderColor: entries[0].c, color: entries[0].c };
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

// ── Cell ──────────────────────────────────────────────────
const HandCell = memo(function HandCell({
  hand, selStyle, checkState, hasDot,
  onPointerDown, onPointerEnter,
}: {
  hand: string;
  selStyle?: React.CSSProperties;
  checkState?: CheckState;
  hasDot?: boolean;
  onPointerDown: (hand: string, e: React.PointerEvent) => void;
  onPointerEnter: (hand: string) => void;
}) {
  const type = cellType(hand);
  const baseClass = clsx(
    'hand-cell select-none',
    !checkState && !selStyle && (
      type === 'pair'   ? 'bg-yellow/10 text-yellow border-yellow/20' :
      type === 'suited' ? 'bg-blue/10 text-blue border-blue/20' :
                          'bg-bg3 text-muted2 border-border'
    ),
    checkState === 'correct'      && 'bg-green/20 !text-green !border-green',
    checkState === 'missed'       && 'bg-red/20 !text-red !border-red',
    checkState === 'extra'        && 'bg-orange/20 !text-orange !border-orange',
    checkState === 'wrong-action' && 'bg-yellow/20 !text-yellow !border-yellow',
    selStyle && !checkState && 'border',
  );
  return (
    <div className={baseClass} style={checkState ? undefined : selStyle}
      data-hand={hand}
      onPointerDown={(e) => onPointerDown(hand, e)}
      onPointerEnter={() => onPointerEnter(hand)}
    >
      {hand}
      {hasDot && <div className="freq-dot" />}
    </div>
  );
});

// ── Main view ─────────────────────────────────────────────
export function GrilleView() {
  const store = useAppStore();
  const { selectedTab, selectedTabKey, addSession, srs, setPendingSrsKey, pendingSrsKey, srsReviewKey, finishSrsReview } = store;
  const cfg = getCfg(store);

  const [selected, setSelected]       = useState<Selection>({});
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [cellSize, setCellSize]       = useState(32);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [activeFreq, setActiveFreq]   = useState(100);

  const midRef             = useRef<HTMLDivElement>(null);
  const isDraggingRef      = useRef(false);
  const pointerDownRef     = useRef<string | null>(null);
  const dragMovedRef       = useRef(false);
  const dragDeselectingRef = useRef(false);
  const selectedRef        = useRef<Selection>({});
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Non-fold action buttons derived from the tab
  const actionButtons: [string, string][] = selectedTab
    ? [...new Map(
        selectedTab.rangeList
          .filter(rl => rl.hands.length > 0)
          .map(rl => {
            const r = store.rangeColors[rl.id];
            return r && !r.name.toUpperCase().includes('FOLD') ? [r.name, r.color] as [string, string] : null;
          })
          .filter(Boolean) as [string, string][]
      )]
    : [];

  // Resize observer — square cells
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
    setSelected({});
    setCheckResult(null);
    setRevealed(false);
    const first = selectedTab
      ? [...new Map(
          selectedTab.rangeList.filter(rl => rl.hands.length > 0).map(rl => {
            const r = store.rangeColors[rl.id];
            return r && !r.name.toUpperCase().includes('FOLD') ? [r.name, r.color] as [string, string] : null;
          }).filter(Boolean) as [string, string][]
        )]
      : [];
    setActiveAction(first[0]?.[0] ?? null);
    setActiveFreq(100);
  }, [selectedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Painting helpers ─────────────────────────────────────
  const applyPaint = (prev: Selection, hand: string, action: string, freq: number): Selection => {
    if (freq === 0) {
      // freq=0 → remove this action from cell
      const cell = { ...(prev[hand] ?? {}) };
      delete cell[action];
      if (Object.keys(cell).length === 0) { const s = { ...prev }; delete s[hand]; return s; }
      return { ...prev, [hand]: cell };
    }
    if (freq === 100) {
      // exclusive: replace all
      return { ...prev, [hand]: { [action]: 100 } };
    }
    return { ...prev, [hand]: { ...(prev[hand] ?? {}), [action]: freq } };
  };

  const paintCell = useCallback((hand: string) => {
    if (checkResult || !activeAction) return;
    setSelected(prev => {
      const cell = prev[hand] ?? {};
      // Toggle off if same action at same freq already present
      if (cell[activeAction] === activeFreq || (activeFreq === 100 && cell[activeAction] !== undefined)) {
        const newCell = { ...cell };
        delete newCell[activeAction];
        if (Object.keys(newCell).length === 0) { const s = { ...prev }; delete s[hand]; return s; }
        return { ...prev, [hand]: newCell };
      }
      return applyPaint(prev, hand, activeAction, activeFreq);
    });
  }, [checkResult, activeAction, activeFreq]);

  const paintCellRef = useRef(paintCell);
  useEffect(() => { paintCellRef.current = paintCell; }, [paintCell]);

  // Global pointerup → click handler
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
    // Drag mode: deselect if cell already has this action, else paint
    dragDeselectingRef.current = activeAction !== null && (selectedRef.current[hand] ?? {})[activeAction] !== undefined;
  }, [checkResult, activeAction]);

  const handlePointerEnter = useCallback((hand: string) => {
    if (!isDraggingRef.current || checkResult || !selectedTab || !activeAction) return;
    if (hand === pointerDownRef.current) return;
    if (!dragMovedRef.current) {
      dragMovedRef.current = true;
      const origin = pointerDownRef.current;
      if (origin) {
        if (dragDeselectingRef.current) {
          setSelected(prev => {
            const cell = { ...(prev[origin] ?? {}) }; delete cell[activeAction];
            if (Object.keys(cell).length === 0) { const s = { ...prev }; delete s[origin]; return s; }
            return { ...prev, [origin]: cell };
          });
        } else {
          setSelected(prev => applyPaint(prev, origin, activeAction, activeFreq));
        }
      }
    }
    if (dragDeselectingRef.current) {
      setSelected(prev => {
        const cell = { ...(prev[hand] ?? {}) }; delete cell[activeAction];
        if (Object.keys(cell).length === 0) { const s = { ...prev }; delete s[hand]; return s; }
        return { ...prev, [hand]: cell };
      });
    } else {
      setSelected(prev => applyPaint(prev, hand, activeAction, activeFreq));
    }
  }, [checkResult, selectedTab, activeAction, activeFreq]);

  // ── Check ─────────────────────────────────────────────────
  const handleCheck = () => {
    if (!selectedTab) return;
    let correct = 0, wrongAct = 0, missed = 0, extra = 0;
    const states: Record<string, CheckState> = {};

    allHands().forEach(({ hand }) => {
      const nonFold    = getNonFoldActions(hand, selectedTab.rangeMap);
      const inRange    = nonFold.length > 0;
      const isSelected = hand in selected;
      const userFreqs  = selected[hand] ?? {};
      const dom        = nonFold[0];

      if (inRange && isSelected) {
        const entries = Object.entries(userFreqs);
        const userDom = entries.length > 0 ? entries.reduce((a, b) => b[1] > a[1] ? b : a) : null;
        if (!userDom) { states[hand] = 'missed'; missed++; return; }
        const [userAct] = userDom;
        if (userAct === dom?.action) {
          states[hand] = 'correct'; correct++;
        } else {
          const validMixed = nonFold.find(a => a.action === userAct && a.freq >= 0.2);
          if (validMixed) { states[hand] = 'correct'; correct++; }
          else { states[hand] = 'wrong-action'; wrongAct++; }
        }
      } else if (inRange && !isSelected) {
        states[hand] = 'missed'; missed++;
      } else if (!inRange && isSelected) {
        states[hand] = 'extra'; extra++;
      }
    });

    const total = correct + wrongAct + missed;
    const score = total > 0 ? Math.round(correct / total * 100) : 100;
    const pct   = Math.round(total / 169 * 100);
    setCheckResult({ states, correct, wrongAct, missed, extra, score, pct });

    addSession({ key: `grille_${selectedTabKey}`, date: todayStr(), name: selectedTab.name, catName: selectedTab.catName, mode: 'grille', score, correct, missed, extra, wrongAct });

    // Propose SRS addition if threshold met and not already tracked
    if (selectedTabKey && !srs[selectedTabKey] && score >= cfg.grilleThreshold && pendingSrsKey !== selectedTabKey) {
      setPendingSrsKey(selectedTabKey);
    }
  };

  const hands = allHands();
  const inRangeCount = selectedTab ? hands.filter(h => getNonFoldActions(h.hand, selectedTab.rangeMap).length > 0).length : 0;
  const pctRange = Math.round(inRangeCount / 169 * 100);
  const fontSize = Math.max(7, Math.floor(cellSize * 0.38));

  const isSrsReview = srsReviewKey === selectedTabKey;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 px-2 md:px-4 py-2">
      {/* SRS Review banner */}
      {isSrsReview && (
        <div className="flex-shrink-0 mb-1.5 px-3 py-2 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-accent">📅 Révision SRS</span>
            <span className="text-[10px] text-muted ml-2">Reconstituez la range de mémoire, puis vérifiez</span>
          </div>
          <button
            onClick={() => store.setMode('srs')}
            className="text-[10px] text-muted hover:text-text transition-colors flex-shrink-0"
          >
            ✕ Annuler
          </button>
        </div>
      )}
      <div className="flex-shrink-0">
        {/* Range legend */}
        {selectedTab && (
          <div className="flex items-center gap-2 mb-1.5 overflow-x-auto no-scrollbar">
            <div className="flex gap-1 flex-nowrap">
              {actionButtons.map(([name, color]) => (
                <div key={name} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-border whitespace-nowrap flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{name}
                </div>
              ))}
            </div>
            <span className="text-[10px] text-muted flex-shrink-0 ml-auto">{inRangeCount} ({pctRange}%)</span>
          </div>
        )}

        {/* Action palette — GTO Wizard style */}
        {selectedTab && !checkResult && !revealed && actionButtons.length > 0 && (
          <div className="mb-1.5 space-y-1">
            <div className="flex gap-1.5 items-center overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-muted flex-shrink-0">Paint:</span>
              {actionButtons.map(([name, color]) => (
                <button key={name} onClick={() => setActiveAction(name)}
                  className={clsx('px-2.5 py-1 text-[11px] font-semibold rounded border transition-all flex-shrink-0',
                    activeAction === name ? 'text-white' : 'bg-transparent text-muted hover:text-text'
                  )}
                  style={activeAction === name ? { background: color, borderColor: color } : { borderColor: color, color }}
                >
                  {name}
                  {activeAction === name && <span className="ml-1.5 opacity-80">{activeFreq}%</span>}
                </button>
              ))}
            </div>
            {activeAction && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] text-muted mr-0.5 flex-shrink-0">Freq:</span>
                {[0, 25, 50, 75, 100].map(f => (
                  <button key={f} onClick={() => setActiveFreq(f)}
                    className={clsx('px-1.5 py-0.5 text-[10px] rounded border transition-colors flex-shrink-0',
                      activeFreq === f ? 'bg-muted2 border-muted2 text-white' : 'border-border text-muted hover:text-text'
                    )}
                  >{f}</button>
                ))}
                <input type="number" min="0" max="100" value={activeFreq}
                  onChange={e => setActiveFreq(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-11 bg-bg3 border border-border rounded px-1.5 py-0.5 text-[10px] text-text outline-none focus:border-accent ml-1 flex-shrink-0"
                />
                <span className="text-[10px] text-muted flex-shrink-0">%</span>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-1.5 mb-1 flex-wrap">
          <button onClick={handleCheck} className="px-3 py-1 text-[11px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity">✓ Vérifier</button>
          <button onClick={() => { setRevealed(true); setCheckResult(null); }} className="px-3 py-1 text-[11px] font-semibold rounded border border-border text-muted hover:text-text hover:border-border2 transition-colors">👁 Révéler</button>
          <button onClick={() => { setSelected({}); setCheckResult(null); setRevealed(false); }} className="px-3 py-1 text-[11px] font-semibold rounded border border-border text-muted hover:text-text hover:border-border2 transition-colors">↺ Reset</button>
        </div>

        {checkResult && (
          <div className="flex gap-2 flex-wrap mb-0.5">
            {[
              { color: '#2ecc8a', label: 'Correct' }, { color: '#e05555', label: 'Manqué' },
              { color: '#e09540', label: 'En trop' }, { color: '#d4c040', label: 'Mauvaise action' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1 text-[9px] text-muted">
                <div className="w-2 h-2 rounded-sm" style={{ background: color }} />{label}
              </div>
            ))}
          </div>
        )}
        {!checkResult && !revealed && <p className="text-[10px] text-muted mb-0.5">Clic / glisser · Re-clic = déselect</p>}
      </div>

      {/* Grid */}
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
            let cs: CheckState | undefined;

            if (checkResult) {
              cs = checkResult.states[hand];
            } else if (revealed) {
              if (acts.length > 0) {
                const freqs: CellFreqs = {};
                for (const a of acts) freqs[a.action] = a.freq * 100;
                selStyle = buildGradient(freqs, actionButtons);
              }
            } else if (hand in selected) {
              selStyle = buildGradient(selected[hand], actionButtons);
            }

            return (
              <HandCell key={hand} hand={hand} selStyle={selStyle} checkState={cs}
                hasDot={hasDot && (!!checkResult || revealed)}
                onPointerDown={handlePointerDown}
                onPointerEnter={handlePointerEnter}
              />
            );
          })}
        </div>
      </div>

      {/* Check stats */}
      {checkResult && (
        <div className="flex-shrink-0 mt-2 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {[
              { val: checkResult.correct,  label: 'Corrects',        color: '#2ecc8a' },
              { val: checkResult.wrongAct, label: 'Mauvaise action', color: '#d4c040' },
              { val: checkResult.missed,   label: 'Manqués',         color: '#e05555' },
              { val: checkResult.extra,    label: 'En trop',         color: '#e09540' },
              { val: `${checkResult.score}%`, label: 'Score',        color: '#6c63ff' },
              { val: `${checkResult.pct}%`,   label: '% Range',      color: '#4a9eff' },
            ].map(({ val, label, color }) => (
              <div key={label} className="flex-1 min-w-[60px] bg-bg2 border border-border rounded px-2 py-1.5 text-center">
                <div className="text-lg font-bold" style={{ color }}>{val}</div>
                <div className="text-[9px] text-muted uppercase tracking-wider mt-px">{label}</div>
              </div>
            ))}
          </div>

          {/* SRS Review confirmation */}
          {isSrsReview && selectedTabKey && (
            <div className={clsx(
              'flex items-center justify-between px-3 py-2.5 rounded-lg border',
              checkResult.score >= cfg.grilleThreshold
                ? 'bg-green/10 border-green/30'
                : 'bg-red/10 border-red/30'
            )}>
              <div>
                <div className={clsx('text-[11px] font-bold', checkResult.score >= cfg.grilleThreshold ? 'text-green' : 'text-red')}>
                  {checkResult.score >= cfg.grilleThreshold ? `✅ Révision réussie (${checkResult.score}%)` : `❌ Score insuffisant (${checkResult.score}% < ${cfg.grilleThreshold}%)`}
                </div>
                <div className="text-[9px] text-muted mt-0.5">
                  {checkResult.score >= cfg.grilleThreshold ? 'Intervalle avancé' : 'Intervalle réduit — réessayer demain'}
                </div>
              </div>
              <button
                onClick={() => finishSrsReview(selectedTabKey, checkResult.score)}
                className="flex-shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity ml-3"
              >
                Confirmer →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
