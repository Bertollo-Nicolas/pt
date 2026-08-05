'use client';
import clsx from 'clsx';
import { useAppStore, getCfg } from '@/store/appStore';
import { todayStr, diffDays } from '@/lib/utils';
import { SRS_DRILL_HANDS, srsConsecutiveFailures, srsDrillProgress, srsIntervalDays, srsNeedsDrill, srsRequiresDrill } from '@/lib/srs';
import { LearningInsights } from '@/components/learning/LearningInsights';
import type { SrsEntry } from '@/lib/types';

export function SrsView() {
  const store = useAppStore();
  const { srs, clearSrs, setCalendar, calYear, calMonth, startSrsReview, startSrsDrill, removeSrs } = store;
  const cfg = getCfg(store);
  const today = todayStr();

  const entries = Object.values(srs)
    .filter(e => e.interval >= 0) // skip any legacy interval: -1
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview));

  const due      = entries.filter(e => e.nextReview <= today || srsRequiresDrill(e));
  const upcoming = entries.filter(e => e.nextReview > today && !srsRequiresDrill(e));

  // Build reviewMap for calendar
  const reviewMap: Record<string, SrsEntry[]> = {};
  for (const e of entries) {
    if (!reviewMap[e.nextReview]) reviewMap[e.nextReview] = [];
    reviewMap[e.nextReview].push(e);
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 md:px-5 py-3 min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold">Révisions SRS</h3>
          <p className="text-[10px] text-muted mt-0.5">
            {due.length > 0
              ? `${due.length} range${due.length > 1 ? 's' : ''} à réviser aujourd&apos;hui`
              : entries.length === 0 ? 'Aucune range suivie' : 'Tout est à jour ✓'
            }
          </p>
        </div>
        {entries.length > 0 && (
          <button
            onClick={() => { if (confirm('Réinitialiser tout le SRS ?')) clearSrs(); }}
            className="text-[10px] text-muted hover:text-red transition-colors cursor-pointer"
          >
            🗑 Reset
          </button>
        )}
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="text-center py-8 text-muted">
          <div className="text-3xl mb-3">📅</div>
          <p className="text-xs">Aucune range dans le SRS.</p>
          <p className="text-[10px] mt-1.5 leading-relaxed">
            Atteins le seuil de précision en <strong className="text-text">Flash</strong> ou en <strong className="text-text">Grille</strong> pour être proposé.
          </p>
        </div>
      )}

      <LearningInsights />

      {/* Due today */}
      {due.length > 0 && (
        <section className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-red mb-2">
            🔴 À réviser aujourd&apos;hui — {due.length}
          </div>
          <div className="flex flex-col gap-1.5">
            {due.map(e => (
              <SrsCard
                key={e.key} entry={e} today={today} cfg={cfg}
                onReview={() => startSrsReview(e.key)}
                onDrill={() => startSrsDrill(e.key)}
                onRemove={() => removeSrs(e.key)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Calendar */}
      {entries.length > 0 && (
        <Calendar
          reviewMap={reviewMap} today={today} year={calYear} month={calMonth}
          onPrev={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y--; } setCalendar(y, m); }}
          onNext={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++; } setCalendar(y, m); }}
        />
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
            📅 À venir — {upcoming.length}
          </div>
          <div className="flex flex-col gap-1.5">
            {upcoming.map(e => (
              <SrsCard
                key={e.key} entry={e} today={today} cfg={cfg}
                onRemove={() => removeSrs(e.key)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── SRS Card ──────────────────────────────────────────────
function SrsCard({ entry, today, cfg, onReview, onDrill, onRemove }: {
  entry: SrsEntry;
  today: string;
  cfg: import('@/lib/types').AppConfig;
  onReview?: () => void;
  onDrill?: () => void;
  onRemove: () => void;
}) {
  const isDue = entry.nextReview <= today;
  const days = isDue ? 0 : diffDays(today, entry.nextReview);
  const intervalLabel = `${srsIntervalDays(entry, cfg)}j`;
  const ease = entry.ease ?? 2.3;
  const reviews = entry.reviews ?? 0;
  const lapses = entry.lapses ?? 0;
  const consecutiveFailures = srsConsecutiveFailures(entry);
  const drillProgress = srsDrillProgress(entry);
  const needsDrill = srsNeedsDrill(entry);
  const requiresDrill = srsRequiresDrill(entry);
  const drillComplete = requiresDrill && !needsDrill;

  return (
    <div className={clsx(
      'flex items-center gap-2 px-3 py-2.5 bg-bg2 border rounded-lg',
      isDue ? 'border-red/30 bg-red/5' : 'border-border'
    )}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{entry.name}</div>
        <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{entry.catName}</span>
          <span>·</span>
          <span>Intervalle: {intervalLabel}</span>
          {reviews > 0 && (
            <><span>·</span><span>{reviews} revue{reviews > 1 ? 's' : ''}</span></>
          )}
          {lapses > 0 && (
            <><span>·</span><span className="text-orange">{lapses} échec{lapses > 1 ? 's' : ''}</span></>
          )}
          {consecutiveFailures > 0 && (
            <><span>·</span><span className="text-red">{consecutiveFailures} échec{consecutiveFailures > 1 ? 's' : ''} de suite</span></>
          )}
          {requiresDrill && (
            <><span>·</span><span className={needsDrill ? 'text-orange' : 'text-green'}>Flash {drillProgress}/{SRS_DRILL_HANDS}</span></>
          )}
          {reviews > 0 && (
            <><span>·</span><span>Facilité: {ease.toFixed(2)}</span></>
          )}
          {entry.lastScore != null && (
            <><span>·</span><span>Dernier: {entry.lastScore}%</span></>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isDue || requiresDrill ? (
          needsDrill && onDrill ? (
            <button
              onClick={onDrill}
              className="px-2.5 py-1 text-[11px] font-semibold rounded border bg-orange/15 border-orange/40 text-orange hover:bg-orange/20 transition-colors cursor-pointer"
            >
              Drill {drillProgress}/{SRS_DRILL_HANDS}
            </button>
          ) : onReview && (
            <button
              onClick={onReview}
              className="px-2.5 py-1 text-[11px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              {drillComplete ? 'Grille débloquée' : 'Réviser'}
            </button>
          )
        ) : (
          <span className={clsx(
            'text-[10px] px-2 py-0.5 rounded-full border font-medium',
            days <= 3 ? 'bg-orange/10 border-orange/30 text-orange' : 'bg-green/10 border-green/30 text-green'
          )}>
            {days === 1 ? 'Demain' : `J+${days}`}
          </span>
        )}
        <button
          onClick={onRemove}
          className="text-[11px] text-muted hover:text-red transition-colors p-1"
          title="Retirer du SRS"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────
function Calendar({ reviewMap, today, year, month, onPrev, onNext }: {
  reviewMap: Record<string, SrsEntry[]>;
  today: string;
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Mon = 0

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ d, ds, revs: reviewMap[ds] ?? [], isToday: ds === today, isPast: ds < today });
  }

  return (
    <div className="bg-bg2 border border-border rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={onPrev} className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-text hover:border-border2 transition-colors text-lg">‹</button>
        <span className="text-[12px] font-bold capitalize">{monthLabel}</span>
        <button onClick={onNext} className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-text hover:border-border2 transition-colors text-lg">›</button>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map(d => (
          <div key={d} className="text-center text-[9px] text-muted py-1 uppercase tracking-wider">{d}</div>
        ))}
        {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} />)}
        {days.map(({ d, ds, revs, isToday, isPast }) => {
          const hasRev = revs.length > 0;
          return (
            <div key={ds} title={revs.map(e => e.name).join(', ')}
              className={clsx(
                'aspect-square rounded flex flex-col items-center justify-center text-[10px]',
                isToday && 'ring-2 ring-accent font-bold text-accent',
                !isToday && !hasRev && 'bg-bg3 text-muted',
                hasRev && !isPast && 'bg-blue/15 text-blue font-semibold',
                hasRev && isPast && 'bg-red/20 text-red font-bold',
              )}>
              <span>{d}</span>
              {hasRev && <span className="text-[7px] font-bold leading-tight">{revs.length}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
