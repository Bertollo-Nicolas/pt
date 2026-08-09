'use client';
import clsx from 'clsx';
import { buildLearningSpots, type LearningDiagnosis } from '@/lib/learning';
import { useAppStore } from '@/store/appStore';

const DIAGNOSIS: Record<LearningDiagnosis, { label: string; tone: string }> = {
  acquired: { label: 'Acquis', tone: 'bg-green/10 border-green/30 text-green' },
  structure: { label: 'Structure', tone: 'bg-blue/10 border-blue/30 text-blue' },
  speed: { label: 'Vitesse', tone: 'bg-yellow/10 border-yellow/30 text-yellow' },
  priority: { label: 'Priorité', tone: 'bg-red/10 border-red/30 text-red' },
  partial: { label: 'À consolider', tone: 'bg-orange/10 border-orange/30 text-orange' },
};

export function LearningInsights() {
  const { sessions, errors } = useAppStore();
  const spots = buildLearningSpots(sessions, errors);
  const weakSpots = spots.filter(s => s.diagnosis !== 'acquired').slice(0, 6);

  if (spots.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="section-label">
          Priorités d&apos;apprentissage
        </div>
        <div className="text-[10px] text-muted">{spots.length} spot{spots.length > 1 ? 's' : ''} suivis</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {weakSpots.map(spot => {
          const diag = DIAGNOSIS[spot.diagnosis];
          return (
            <div key={spot.key} className="bg-bg2 border border-border rounded-lg px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{spot.name}</div>
                  <div className="text-[10px] text-muted truncate mt-0.5">{spot.catName}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={clsx('text-[9px] px-1.5 py-0.5 rounded-full border font-bold', diag.tone)}>
                    {diag.label}
                  </div>
                  <div className="text-sm font-bold mt-1">{spot.mastery}%</div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                <Metric label="Flash" value={formatScore(spot.flashScore)} />
                <Metric label="Grille" value={formatScore(spot.grilleScore)} />
                <Metric label="Stable" value={`${spot.stability}%`} />
                <Metric label="Erreurs" value={String(spot.errorCount)} warn={spot.errorCount > 0} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-bg3 rounded px-1.5 py-1">
      <div className={clsx('text-[11px] font-bold leading-none', warn ? 'text-orange' : 'text-text')}>{value}</div>
      <div className="text-[9px] text-muted uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function formatScore(score: number | null): string {
  return score == null ? '-' : `${score}%`;
}
