'use client';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { getCfg, useAppStore } from '@/store/appStore';
import { buildDailyRoadmapSession, buildRoadmap, nextRoadmapSpot, roadmapMilestones, weeklyRoadmapProgress, type RoadmapSpot, type RoadmapStage, type RoadmapStageId, type RoadmapStatus } from '@/lib/roadmap';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/Primitives';
import { SectionHeading, Surface } from '@/components/ui/Surface';

const STATUS: Record<RoadmapStatus, { label: string; tone: string }> = {
  due: { label: 'À réviser', tone: 'text-orange bg-orange/10 border-orange/25' },
  mastered: { label: 'Maîtrisée', tone: 'text-green bg-green/10 border-green/25' },
  consolidate: { label: 'À consolider', tone: 'text-blue bg-blue/10 border-blue/25' },
  learning: { label: 'En apprentissage', tone: 'text-accent bg-accent/10 border-accent/25' },
  new: { label: 'À découvrir', tone: 'text-text bg-bg3 border-border2' },
  locked: { label: 'Plus tard', tone: 'text-muted bg-bg3 border-border' },
};

export function RoadmapView() {
  const store = useAppStore();
  const { rmData, sessions, errors, srs, selectTab, setMode, saveConfig, startRoadmapSession } = store;
  const cfg = getCfg(store);
  const rawStages = useMemo(() => buildRoadmap(rmData, sessions, errors, srs, cfg), [rmData, sessions, errors, srs, cfg]);
  const stages = useMemo(() => filterPath(rawStages, cfg.roadmapPath), [rawStages, cfg.roadmapPath]);
  const recommended = useMemo(() => nextRoadmapSpot(stages), [stages]);
  const allSpots = stages.flatMap(stage => stage.spots);
  const [selectedKey, setSelectedKey] = useState<string | null>(recommended?.key ?? null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [view, setView] = useState<'tree' | 'list'>('tree');
  const [focusStage, setFocusStage] = useState<RoadmapStageId | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'learning' | 'mastered'>('all');
  const selectedSpot = allSpots.find(spot => spot.key === selectedKey) ?? recommended;
  const mastered = allSpots.filter(spot => spot.mastery >= 85).length;
  const due = allSpots.filter(spot => spot.due).length;
  const globalMastery = allSpots.length ? Math.round(allSpots.reduce((sum, spot) => sum + spot.mastery, 0) / allSpots.length) : 0;
  const dailySession = useMemo(() => buildDailyRoadmapSession(stages, cfg.roadmapDailyMinutes), [stages, cfg.roadmapDailyMinutes]);
  const milestones = useMemo(() => roadmapMilestones(rawStages), [rawStages]);
  const weekly = useMemo(() => weeklyRoadmapProgress(sessions), [sessions]);
  const remaining = allSpots.filter(spot => spot.essential && spot.mastery < 85 && !spot.known).length;
  const estimatedDays = Math.max(1, Math.ceil(remaining / Math.max(1, Math.floor(cfg.roadmapDailyMinutes / 5))));
  const visibleStages = useMemo(() => stages
    .filter(stage => !focusStage || stage.id === focusStage)
    .map(stage => ({ ...stage, spots: stage.spots.filter(spot => matchesFilters(spot, query, statusFilter)) })), [stages, focusStage, query, statusFilter]);

  const start = (spot: RoadmapSpot) => {
    selectTab(spot.catId, spot.tabId);
    setMode('flash');
  };

  const selectSkill = (spot: RoadmapSpot) => {
    setSelectedKey(spot.key);
    setDetailOpen(true);
  };

  const togglePreference = (field: 'roadmapPinned' | 'roadmapSnoozed' | 'roadmapKnown', key: string) => {
    const current = cfg[field];
    saveConfig({ [field]: current.includes(key) ? current.filter(item => item !== key) : [...current, key] });
  };

  if (!rmData || allSpots.length === 0) {
    return <div className="flex-1 overflow-y-auto p-4 sm:p-6"><EmptyState icon="roadmap" title="Roadmap indisponible" description="Importe des ranges Open, BB vs Open, 3-bet, Vs 3-bet ou Vs 4-bet pour générer ton parcours." /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <SectionHeading eyebrow="Parcours" title="Roadmap préflop" description="Suis simplement la mission proposée, puis avance dans le chemin." action={<div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center"><Icon name="roadmap" size={21}/></div>} />

        <div className="flex items-center gap-3 text-xs">
          <div className="flex-1 h-2 rounded-full bg-bg3 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${globalMastery}%` }}/></div>
          <strong>{globalMastery}%</strong>
          <span className="text-muted hidden sm:inline">· {mastered}/{allSpots.length} maîtrisées</span>
          {due > 0 && <span className="text-orange">· {due} à réviser</span>}
        </div>

        {recommended && dailySession.length > 0 && (
          <Surface className="p-4 sm:p-5 border-accent/40 bg-gradient-to-br from-accent/10 to-bg2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-accent text-white flex items-center justify-center flex-shrink-0"><Icon name="target" size={22}/></div>
              <div className="min-w-0 flex-1">
                <div className="section-label text-accent">Aujourd’hui · {cfg.roadmapDailyMinutes} min</div>
                <h3 className="text-lg font-bold mt-1">Commence par {recommended.name}</h3>
                <p className="text-xs text-muted mt-1">{dailySession.length} ranges préparées, révisions comprises.</p>
              </div>
              <Button variant="primary" onClick={() => startRoadmapSession(dailySession.map(({ key, catId, tabId, name }) => ({ key, catId, tabId, name })))} className="whitespace-nowrap">Démarrer <span aria-hidden="true">→</span></Button>
            </div>
          </Surface>
        )}

        <details className="rounded-xl border border-border bg-bg2 px-4 py-3">
          <summary className="text-xs font-semibold cursor-pointer text-muted hover:text-text">Réglages et progression</summary>
          <div className="mt-4 grid lg:grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <div className="section-label">Parcours</div>
              <div className="flex flex-wrap gap-2 mt-2">
                <select aria-label="Type de parcours" value={cfg.roadmapPath} onChange={event => saveConfig({ roadmapPath: event.target.value as typeof cfg.roadmapPath })} className="control text-xs"><option value="essential">Essentiel</option><option value="complete">Complet</option><option value="blinds">Défense des blindes</option><option value="aggression">Jeu agressif</option></select>
                <select aria-label="Temps quotidien" value={cfg.roadmapDailyMinutes} onChange={event => saveConfig({ roadmapDailyMinutes: Number(event.target.value) as 10 | 20 | 30 })} className="control text-xs"><option value={10}>10 min / jour</option><option value={20}>20 min / jour</option><option value={30}>30 min / jour</option></select>
              </div>
              <p className="text-[11px] text-muted mt-3">Environ {estimatedDays} jours restants · {weekly.sessions} sessions cette semaine · {weekly.scoreDelta > 0 ? '+' : ''}{weekly.scoreDelta} pts.</p>
            </div>
            <div>
              <div className="section-label">Jalons</div>
              <div className="space-y-1.5 mt-2">{milestones.map(milestone => <div key={milestone.label} className={clsx('text-[11px] flex gap-2', milestone.achieved ? 'text-green' : 'text-muted')}><span>{milestone.achieved ? '✓' : '○'}</span>{milestone.label}</div>)}</div>
            </div>
          </div>
        </details>

        <Surface className="overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <div><div className="section-label">Ton chemin</div><p className="text-xs text-muted mt-1">Le nœud lumineux est ta prochaine priorité.</p></div>
              <details className="relative text-right">
                <summary className="list-none cursor-pointer min-h-8 px-2.5 rounded border border-border text-[10px] text-muted inline-flex items-center">Options</summary>
                <div className="absolute right-0 top-10 z-20 w-64 rounded-xl border border-border2 bg-bg2 shadow-xl p-3 text-left">
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher…" className="control w-full text-[11px]"/>
                  <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="control w-full text-[11px] mt-2"><option value="all">Tous les états</option><option value="due">SRS dues</option><option value="learning">En apprentissage</option><option value="mastered">Maîtrisées</option></select>
                  <div className="grid grid-cols-2 rounded-lg border border-border overflow-hidden mt-2"><button onClick={() => setView('tree')} className={clsx('min-h-8 text-[10px]', view === 'tree' ? 'bg-accent text-white' : 'text-muted')}>Arbre</button><button onClick={() => setView('list')} className={clsx('min-h-8 text-[10px]', view === 'list' ? 'bg-accent text-white' : 'text-muted')}>Liste</button></div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[9px] font-bold uppercase tracking-wider"><Legend color="bg-green" label="Maîtrisée"/><Legend color="bg-accent" label="En cours"/><Legend color="bg-orange" label="SRS"/><Legend color="bg-bg4 border border-border2" label="À venir"/></div>
                </div>
              </details>
            </div>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="p-4 sm:p-7 lg:border-r border-border bg-[radial-gradient(circle_at_50%_0%,rgba(108,99,255,0.10),transparent_42%)]">
              {focusStage && <button onClick={() => setFocusStage(null)} className="mb-4 text-[11px] text-accent hover:text-text">← Revenir au parcours complet</button>}
              {view === 'list' ? (
                <RoadmapList stages={visibleStages} selectedKey={selectedSpot?.key} onSelect={selectSkill}/>
              ) : <div className="max-w-3xl mx-auto">
                {visibleStages.map((stage, index) => (
                  <div key={stage.id}>
                    {index > 0 && <div className={clsx('w-0.5 h-12 mx-auto bg-gradient-to-b', stage.unlocked ? 'from-accent to-accent/35' : 'from-border2 to-border')} aria-hidden="true"/>}
                    <section className="relative">
                      <div className="flex justify-center">
                        <button type="button" onClick={() => setFocusStage(stage.id)} title={`Ouvrir le chapitre ${stage.title}`} className={clsx('relative z-10 w-[92px] h-[92px] rounded-full border-2 flex flex-col items-center justify-center text-center shadow-[0_0_32px_rgba(108,99,255,0.12)] transition-transform hover:scale-105', stage.mastery >= 85 ? 'bg-green/15 border-green text-green' : stage.unlocked ? 'bg-bg2 border-accent text-text' : 'bg-bg3 border-border2 text-muted')}>
                          <Icon name={stage.unlocked ? 'target' : 'roadmap'} size={18}/>
                          <div className="text-xs font-bold mt-1">{stage.title}</div>
                          <div className="text-[9px] opacity-75">{stage.mastery}% · {stage.completed}/{stage.spots.length}</div>
                          {stage.unlocked && stage.mastery < 85 && <span className="absolute inset-[-5px] rounded-full border border-accent/20 animate-pulse"/>}
                        </button>
                      </div>

                      {stage.spots.length > 0 && (focusStage === stage.id || (!focusStage && stage.id === selectedSpot?.stageId)) && (
                        <div className="relative pt-8 mt-1">
                          <div className="absolute top-0 left-1/2 w-px h-4 bg-accent/60" aria-hidden="true"/>
                          <div className="absolute top-4 left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" aria-hidden="true"/>
                          <PositionBranches stage={stage} selectedKey={selectedSpot?.key} onSelect={selectSkill}/>
                        </div>
                      )}
                    </section>
                  </div>
                ))}
              </div>}
            </div>

            <aside className="hidden lg:block p-4 sm:p-5 bg-bg2/70">
              {selectedSpot ? <SkillDetail spot={selectedSpot} onStart={() => start(selectedSpot)} onToggle={togglePreference}/> : <p className="text-xs text-muted">Sélectionne une compétence dans l’arbre.</p>}
            </aside>
          </div>
        </Surface>

        {detailOpen && selectedSpot && (
          <div className="lg:hidden fixed inset-0 z-50 flex items-end">
            <button aria-label="Fermer le détail" className="absolute inset-0 bg-black/65" onClick={() => setDetailOpen(false)}/>
            <div className="relative w-full max-h-[78vh] overflow-y-auto rounded-t-2xl border-t border-border2 bg-bg2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-slide-up">
              <div className="w-10 h-1 rounded-full bg-border2 mx-auto mb-4"/>
              <button onClick={() => setDetailOpen(false)} className="absolute right-4 top-4 text-muted" aria-label="Fermer"><Icon name="close"/></button>
              <SkillDetail spot={selectedSpot} onStart={() => start(selectedSpot)} onToggle={togglePreference}/>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted text-center pb-2">Priorités inspirées du modèle GTO Wizard : fréquence × valeur du spot × niveau actuel, enrichies par tes erreurs et le SRS.</p>
      </div>
    </div>
  );
}

function SkillNode({ spot, selected, onSelect }: { spot: RoadmapSpot; selected: boolean; onSelect: () => void }) {
  const status = STATUS[spot.status];
  const nodeTone = spot.status === 'mastered'
    ? 'border-green bg-green/15 text-green'
    : spot.status === 'due'
      ? 'border-orange bg-orange/15 text-orange shadow-[0_0_20px_rgba(224,149,64,0.22)]'
      : spot.status === 'locked'
        ? 'border-border bg-bg3 text-muted'
        : 'border-accent/70 bg-accent/15 text-accent';
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} title={`${spot.name} · ${spot.level} · Importance ${spot.importance}/5`} className="relative min-w-0 flex flex-col items-center group">
      <span className="absolute -top-4 left-1/2 w-px h-4 bg-border2" aria-hidden="true"/>
      <span className={clsx('relative w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition-all duration-200', nodeTone, selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg2 scale-110')}>
        {spot.status === 'mastered' ? '✓' : spot.status === 'locked' ? <Icon name="roadmap" size={16}/> : `${spot.mastery}%`}
        {spot.due && <span className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-orange border-2 border-bg2 animate-pulse"/>}
      </span>
      <span className={clsx('mt-2 text-[10px] sm:text-[11px] font-semibold leading-tight max-w-[88px] truncate group-hover:text-text', selected ? 'text-text' : 'text-muted')}>{spot.name}</span>
      <span className={clsx('mt-1 text-[8px] px-1.5 py-0.5 rounded-full border leading-none', status.tone)}>{status.label}</span>
    </button>
  );
}

function PositionBranches({ stage, selectedKey, onSelect }: { stage: RoadmapStage; selectedKey?: string; onSelect: (spot: RoadmapSpot) => void }) {
  const groups = [...new Map(stage.spots.map(spot => [spot.position, [] as RoadmapSpot[]])).entries()];
  for (const spot of stage.spots) groups.find(([position]) => position === spot.position)![1].push(spot);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {groups.map(([position, spots]) => (
        <div key={position} className="relative rounded-xl border border-border bg-bg2/55 px-2 py-3">
          <div className="absolute -top-4 left-1/2 w-px h-4 bg-border2" aria-hidden="true"/>
          <div className="text-[9px] uppercase tracking-[0.16em] text-muted font-bold text-center mb-3">{position}</div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-4">{spots.map(spot => <SkillNode key={spot.key} spot={spot} selected={selectedKey === spot.key} onSelect={() => onSelect(spot)}/>)}</div>
        </div>
      ))}
    </div>
  );
}

function RoadmapList({ stages, selectedKey, onSelect }: { stages: RoadmapStage[]; selectedKey?: string; onSelect: (spot: RoadmapSpot) => void }) {
  const spots = stages.flatMap(stage => stage.spots.map(spot => ({ stage, spot })));
  if (spots.length === 0) return <div className="py-12 text-center text-xs text-muted">Aucune compétence ne correspond aux filtres.</div>;
  return <div className="space-y-2">{spots.map(({ stage, spot }) => {
    const status = STATUS[spot.status];
    return <button key={spot.key} onClick={() => onSelect(spot)} className={clsx('w-full rounded-lg border p-3 flex items-center gap-3 text-left transition-colors', selectedKey === spot.key ? 'border-accent bg-accent/10' : 'border-border bg-bg2 hover:border-border2')}>
      <div className="w-10 h-10 rounded-full border border-accent/40 bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent">{spot.mastery}%</div>
      <div className="min-w-0 flex-1"><div className="text-xs font-semibold">{spot.name}</div><div className="text-[10px] text-muted mt-0.5">{stage.title} · {spot.position} · {spot.level}</div></div>
      <span className={clsx('hidden sm:inline text-[9px] px-2 py-1 rounded-full border font-bold', status.tone)}>{status.label}</span>
      <div className="text-right"><div className="text-[10px] font-bold">{'●'.repeat(spot.importance)}<span className="text-bg4">{'●'.repeat(5 - spot.importance)}</span></div><div className="text-[8px] text-muted uppercase">importance</div></div>
    </button>;
  })}</div>;
}

function SkillDetail({ spot, onStart, onToggle }: { spot: RoadmapSpot; onStart: () => void; onToggle: (field: 'roadmapPinned' | 'roadmapSnoozed' | 'roadmapKnown', key: string) => void }) {
  const status = STATUS[spot.status];
  return (
    <div className="lg:sticky lg:top-0">
      <div className="section-label">Compétence sélectionnée</div>
      <div className="mt-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center"><Icon name="target" size={22}/></div>
        <div className="min-w-0"><h3 className="font-bold truncate">{spot.name}</h3><p className="text-[11px] text-muted truncate">{spot.catName}</p></div>
      </div>

      <div className="mt-5 flex items-end justify-between"><div><span className={clsx('text-[9px] px-2 py-1 rounded-full border font-bold', status.tone)}>{status.label}</span><div className="text-[10px] text-muted mt-2">Niveau · <strong className="text-text">{spot.level}</strong></div></div><span className="text-2xl font-bold">{spot.mastery}%</span></div>
      <div className="h-2 rounded-full bg-bg4 overflow-hidden mt-2"><div className={clsx('h-full rounded-full', spot.due ? 'bg-orange' : 'bg-accent')} style={{ width: `${spot.mastery}%` }}/></div>

      <div className="mt-5 rounded-lg border border-border bg-bg3/60 p-3">
        <div className="text-[9px] uppercase tracking-wider font-bold text-muted">Pourquoi maintenant ?</div>
        <p className="text-xs leading-relaxed mt-1.5">{spot.reason}</p>
      </div>

      <Button variant="primary" className="w-full mt-5" onClick={onStart}>{spot.due ? 'Lancer la révision' : 'Travailler cette range'} <span aria-hidden="true">→</span></Button>
      <details className="mt-3 rounded-lg border border-border px-3 py-2">
        <summary className="text-[10px] text-muted cursor-pointer">Détails d’apprentissage</summary>
        <div className="mt-3 text-[10px] text-muted flex items-center justify-between"><span>Prérequis directs</span><strong className="text-text">{spot.prerequisiteKeys.length || 'Aucun'}</strong></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center"><DetailMetric value={formatScore(spot.flashScore)} label="Flash"/><DetailMetric value={formatScore(spot.grilleScore)} label="Grille"/><DetailMetric value={spot.errorCount} label="Erreurs" warn={spot.errorCount > 0}/><DetailMetric value={`${spot.stability}%`} label="Stabilité"/><DetailMetric value={`${spot.importance}/5`} label="Importance"/><DetailMetric value={spot.due ? 'Due' : spot.memory === 'none' ? '—' : 'Planifiée'} label="Mémoire" warn={spot.due}/></div>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          <button onClick={() => onToggle('roadmapPinned', spot.key)} className={clsx('min-h-8 rounded border text-[9px] font-semibold', spot.pinned ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted')}>{spot.pinned ? 'Épinglée' : 'Épingler'}</button>
          <button onClick={() => onToggle('roadmapSnoozed', spot.key)} className={clsx('min-h-8 rounded border text-[9px] font-semibold', spot.snoozed ? 'border-orange bg-orange/10 text-orange' : 'border-border text-muted')}>{spot.snoozed ? 'Reportée' : 'Reporter'}</button>
          <button onClick={() => onToggle('roadmapKnown', spot.key)} className={clsx('min-h-8 rounded border text-[9px] font-semibold', spot.known ? 'border-green bg-green/10 text-green' : 'border-border text-muted')}>{spot.known ? 'Déjà connue' : 'Je connais'}</button>
        </div>
      </details>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-muted"><span className={clsx('w-2 h-2 rounded-full', color)}/>{label}</span>;
}

function DetailMetric({ value, label, warn }: { value: React.ReactNode; label: string; warn?: boolean }) {
  return <div className="rounded-lg bg-bg3 p-2"><div className={clsx('text-xs font-bold', warn && 'text-orange')}>{value}</div><div className="text-[8px] text-muted uppercase mt-0.5">{label}</div></div>;
}

function formatScore(score: number | null): string { return score == null ? '—' : `${score}%`; }

function matchesFilters(spot: RoadmapSpot, query: string, status: 'all' | 'due' | 'learning' | 'mastered'): boolean {
  const textMatch = !query.trim() || `${spot.name} ${spot.catName} ${spot.position}`.toLowerCase().includes(query.trim().toLowerCase());
  const statusMatch = status === 'all' || (status === 'due' ? spot.due : status === 'mastered' ? spot.mastery >= 85 : spot.mastery < 85 && spot.mastery > 0);
  return textMatch && statusMatch;
}

function filterPath(stages: RoadmapStage[], path: 'essential' | 'complete' | 'blinds' | 'aggression'): RoadmapStage[] {
  if (path === 'complete') return stages;
  return stages.map(stage => ({
    ...stage,
    spots: stage.spots.filter(spot => {
      if (spot.due || spot.pinned) return true;
      if (path === 'essential') return spot.essential;
      if (path === 'blinds') return stage.id === 'defense' || spot.position === 'SB' || spot.position === 'BB';
      return stage.id === 'threebet' || stage.id === 'vs-threebet' || stage.id === 'vs-fourbet';
    }),
  })).filter(stage => stage.spots.length > 0);
}
