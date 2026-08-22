'use client';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { getCfg, useAppStore } from '@/store/appStore';
import { buildDailyRoadmapSession, buildRoadmap, nextRoadmapSpot, roadmapMilestones, weeklyRoadmapProgress, type RoadmapSpot, type RoadmapStage, type RoadmapStatus } from '@/lib/roadmap';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/Primitives';
import { SectionHeading, Surface } from '@/components/ui/Surface';
import { buildRoadmapFlashHands } from '@/lib/roadmap-flash';
import { RangeLearningWorkspace } from '@/components/roadmap/RangeLearningWorkspace';
import { addDays, todayStr } from '@/lib/utils';

const STATUS: Record<RoadmapStatus, { label: string; tone: string }> = {
  due: { label: 'À réviser', tone: 'text-orange bg-orange/10 border-orange/25' },
  mastered: { label: 'Maîtrisée', tone: 'text-green bg-green/10 border-green/25' },
  consolidate: { label: 'À consolider', tone: 'text-blue bg-blue/10 border-blue/25' },
  learning: { label: 'En apprentissage', tone: 'text-accent bg-accent/10 border-accent/25' },
  new: { label: 'À découvrir', tone: 'text-text bg-bg3 border-border2' },
  locked: { label: 'Verrouillée', tone: 'text-muted bg-bg3 border-border' },
};

export function RoadmapView() {
  const store = useAppStore();
  const { rmData, sessions, errors, srs, selectedTab, selectedTabKey, selectTab, setMode, saveConfig, updateRoadmapProgress, resetRoadmapProgress, clearErrors, resetLearningData, addSrs } = store;
  const cfg = getCfg(store);
  const rawStages = useMemo(() => buildRoadmap(rmData, sessions, errors, srs, cfg), [rmData, sessions, errors, srs, cfg]);
  const stages = rawStages;
  const recommended = useMemo(() => nextRoadmapSpot(stages), [stages]);
  const allSpots = stages.flatMap(stage => stage.spots);
  const [selectedKey, setSelectedKey] = useState<string | null>(recommended?.key ?? null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [view, setView] = useState<'tree' | 'list'>('tree');
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
    .map(stage => ({ ...stage, spots: stage.spots.filter(spot => matchesFilters(spot, query, statusFilter)) })), [stages, query, statusFilter]);

  const start = (spot: RoadmapSpot) => {
    if (!spot.unlocked) return;
    selectTab(spot.catId, spot.tabId);
    if (spot.phase === 'practice' && selectedTabKey === spot.key && selectedTab) {
      updateRoadmapProgress(spot.key, { flashSession: spot.progress?.flashSession ?? { hands: buildRoadmapFlashHands(selectedTab.rangeMap), index: 0, answers: [], startedAt: new Date().toISOString() } });
    }
    setMode(spot.phase === 'validate' ? 'grille' : spot.phase === 'retention' && spot.due ? 'srs' : 'flash');
  };

  const selectSkill = (spot: RoadmapSpot) => {
    selectTab(spot.catId, spot.tabId);
    if (spot.phase === 'retention' && spot.progress?.phase !== 'retention') updateRoadmapProgress(spot.key, { phase: 'retention' });
    if (spot.phase === 'retention' && !srs[spot.key]) addSrs(spot.key, { key: spot.key, name: spot.name, catName: spot.catName, interval: cfg.intervals[0], nextReview: addDays(todayStr(), cfg.intervals[0]), added: todayStr(), lastScore: spot.grilleScore });
    setSelectedKey(spot.key);
    setDetailOpen(true);
    setWorkspaceOpen(false);
  };

  const startFromDetail = (spot: RoadmapSpot) => {
    if (spot.phase === 'discover' || spot.phase === 'understand') setWorkspaceOpen(true);
    else start(spot);
  };

  const togglePreference = (field: 'roadmapPinned' | 'roadmapSnoozed' | 'roadmapKnown', key: string) => {
    const current = cfg[field];
    saveConfig({ [field]: current.includes(key) ? current.filter(item => item !== key) : [...current, key] });
  };

  if (!rmData || allSpots.length === 0) {
    return <div className="flex-1 overflow-y-auto p-4 sm:p-6"><EmptyState icon="roadmap" title="Roadmap indisponible" description="Importe des ranges Open, BB vs Open, 3-bet, Vs 3-bet ou Vs 4-bet pour générer ton parcours." /></div>;
  }

  if (workspaceOpen && selectedSpot && selectedTabKey === selectedSpot.key && selectedTab) {
    return <RangeLearningWorkspace selectedTab={selectedTab} phase={selectedSpot.phase} onBack={() => setWorkspaceOpen(false)} onAdvance={() => updateRoadmapProgress(selectedSpot.key, selectedSpot.phase === 'discover' ? { phase: 'understand', lessonCompleted: true } : { phase: 'practice', guidedCompleted: true })} onStartNext={() => start(selectedSpot)}/>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-5">
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
              <Button variant="primary" onClick={() => selectSkill(recommended)} className="whitespace-nowrap">Voir l’étape <span aria-hidden="true">→</span></Button>
            </div>
          </Surface>
        )}

        <details className="rounded-xl border border-border bg-bg2 px-4 py-3">
          <summary className="text-xs font-semibold cursor-pointer text-muted hover:text-text">Réglages et progression</summary>
          <div className="mt-4 grid lg:grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <div className="section-label">Rythme</div>
              <div className="flex flex-wrap gap-2 mt-2">
                <select aria-label="Temps quotidien" value={cfg.roadmapDailyMinutes} onChange={event => saveConfig({ roadmapDailyMinutes: Number(event.target.value) as 10 | 20 | 30 })} className="control text-xs"><option value={10}>10 min / jour</option><option value={20}>20 min / jour</option><option value={30}>30 min / jour</option></select>
              </div>
              <p className="text-[11px] text-muted mt-3">Environ {estimatedDays} jours restants · {weekly.sessions} sessions cette semaine · {weekly.scoreDelta > 0 ? '+' : ''}{weekly.scoreDelta} pts.</p>
            </div>
            <div>
              <div className="section-label">Jalons</div>
              <div className="space-y-1.5 mt-2">{milestones.map(milestone => <div key={milestone.label} className={clsx('text-[11px] flex gap-2', milestone.achieved ? 'text-green' : 'text-muted')}><span>{milestone.achieved ? '✓' : '○'}</span>{milestone.label}</div>)}</div>
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                <button onClick={() => confirm('Réinitialiser uniquement la Roadmap ? Le SRS et les erreurs seront conservés.') && resetRoadmapProgress()} className="text-[10px] text-muted hover:text-text">Réinitialiser la Roadmap</button>
                <button onClick={() => confirm('Effacer l’historique des erreurs ?') && clearErrors()} className="text-[10px] text-muted hover:text-text">Effacer les erreurs</button>
                <button onClick={() => confirm('Tout réinitialiser : Roadmap, SRS, sessions et erreurs ?') && resetLearningData()} className="text-[10px] text-red hover:opacity-80">Tout réinitialiser</button>
              </div>
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
          <div className="grid 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="p-3 sm:p-6 2xl:border-r border-border bg-[radial-gradient(circle_at_50%_0%,rgba(108,99,255,0.08),transparent_42%)]">
              {view === 'list' ? (
                <RoadmapList stages={visibleStages} selectedKey={selectedSpot?.key} onSelect={selectSkill}/>
              ) : <SkillTree stages={visibleStages} selectedKey={selectedSpot?.key} recommendedKey={recommended?.key} onSelect={selectSkill}/>}
            </div>

            <aside className="hidden 2xl:block p-4 sm:p-5 bg-bg2/70">
              {selectedSpot ? <SkillDetail spot={selectedSpot} onStart={() => startFromDetail(selectedSpot)} onToggle={togglePreference}/> : <p className="text-xs text-muted">Sélectionne une compétence dans l’arbre.</p>}
            </aside>
          </div>
        </Surface>

        {detailOpen && selectedSpot && (
          <div className="2xl:hidden fixed inset-0 z-50 flex items-end">
            <button aria-label="Fermer le détail" className="absolute inset-0 bg-black/65" onClick={() => setDetailOpen(false)}/>
            <div className="relative w-full max-h-[78vh] overflow-y-auto rounded-t-2xl border-t border-border2 bg-bg2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-slide-up">
              <div className="w-10 h-1 rounded-full bg-border2 mx-auto mb-4"/>
              <button onClick={() => setDetailOpen(false)} className="absolute right-4 top-4 text-muted" aria-label="Fermer"><Icon name="close"/></button>
              <SkillDetail spot={selectedSpot} onStart={() => startFromDetail(selectedSpot)} onToggle={togglePreference}/>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted text-center pb-2">Parcours pédagogique indépendant : découverte, compréhension, entraînement, validation puis répétition espacée.</p>
      </div>
    </div>
  );
}

const TREE_POSITIONS = ['UTG', 'HJ', 'CO', 'BU', 'SB', 'BB'];

function SkillTree({ stages, selectedKey, recommendedKey, onSelect }: { stages: RoadmapStage[]; selectedKey?: string; recommendedKey?: string; onSelect: (spot: RoadmapSpot) => void }) {
  const allSpots = stages.flatMap(stage => stage.spots);
  const recommendedPosition = allSpots.find(spot => spot.key === recommendedKey)?.heroPosition;
  const firstPosition = TREE_POSITIONS.find(position => allSpots.some(spot => spot.heroPosition === position)) ?? 'UTG';
  const [mobilePosition, setMobilePosition] = useState(recommendedPosition ?? firstPosition);
  const mobileSpots = allSpots.filter(spot => spot.heroPosition === mobilePosition);
  const mobileMastered = mobileSpots.filter(spot => spot.status === 'mastered').length;
  const mobileProgress = mobileSpots.length ? Math.round(mobileSpots.reduce((sum, spot) => sum + spot.mastery, 0) / mobileSpots.length) : 0;

  return <>
    <div className="2xl:hidden">
      <div className="px-1 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-xs font-bold">Choisis une branche</div><div className="text-[9px] text-muted mt-0.5">Progression par position Hero</div></div>
          <div className="text-right"><div className="text-lg font-black">{mobileProgress}%</div><div className="text-[8px] text-muted">{mobileMastered}/{mobileSpots.length} maîtrisées</div></div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {TREE_POSITIONS.map(position => {
            const spots = allSpots.filter(spot => spot.heroPosition === position);
            const mastered = spots.filter(spot => spot.status === 'mastered').length;
            const hasNext = spots.some(spot => spot.key === recommendedKey);
            const active = position === mobilePosition;
            return <button key={position} type="button" onClick={() => setMobilePosition(position)} className={clsx('relative min-w-0 rounded-lg border px-2 py-2 text-center transition-colors', active ? 'border-accent bg-accent/15 text-text shadow-[0_3px_0_rgba(45,39,125,.45)]' : 'border-border bg-bg3/70 text-muted', !spots.length && 'opacity-45')}>
              {hasNext && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange"/>}
              <span className="block text-sm font-black">{position}</span>
              <span className="block text-[8px] mt-0.5">{mastered}/{spots.length}</span>
            </button>;
          })}
        </div>
      </div>

      <div className="border-t border-border pt-1">
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-bg2/95 px-1 py-3 backdrop-blur">
          <div className="w-9 h-9 rounded-lg border border-accent/40 bg-accent/15 flex items-center justify-center font-black text-accent">{mobilePosition}</div>
          <div className="min-w-0 flex-1"><div className="text-xs font-bold">Branche {mobilePosition}</div><div className="text-[9px] text-muted">Du premier Open jusqu’à la rétention</div></div>
          {recommendedPosition === mobilePosition && <span className="rounded-full border border-orange/30 bg-orange/10 px-2 py-1 text-[8px] font-bold text-orange">Prioritaire</span>}
        </div>
        <div className="relative pt-1 pb-3 before:absolute before:left-1/2 before:top-1 before:bottom-3 before:w-px before:-translate-x-1/2 before:bg-gradient-to-b before:from-accent before:via-border2 before:to-border">
          {stages.map(stage => {
            const spots = stage.spots.filter(spot => spot.heroPosition === mobilePosition);
            if (!spots.length) return null;
            return <section key={stage.id} className="relative pt-6 pb-3">
              <div className="relative z-[1] mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-border2 bg-bg px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent"/><span className="text-[8px] font-bold uppercase tracking-[0.16em] text-muted">{stage.title}</span><span className="text-[8px] text-muted2">{spots.filter(spot => spot.status === 'mastered').length}/{spots.length}</span>
              </div>
              <div className="relative z-[1] space-y-3">{spots.map(spot => <MobileSkillNode key={spot.key} spot={spot} selected={selectedKey === spot.key} recommended={recommendedKey === spot.key} onSelect={() => onSelect(spot)}/>)}</div>
            </section>;
          })}
          {!mobileSpots.length && <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-[10px] text-muted">Aucune compétence disponible pour cette position.</div>}
        </div>
      </div>
    </div>

    <div className="hidden 2xl:block overflow-x-auto pb-4 -mx-1 px-1">
      <div className="min-w-[1040px]">
      <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-border bg-bg2/80 px-4 py-3">
        <div><div className="text-xs font-bold">Arbre de compétences préflop</div><div className="text-[10px] text-muted mt-1">Chaque branche descend de l’Open de la position Hero.</div></div>
        <div className="flex items-center gap-3 text-[9px] text-muted"><span><b className="text-accent">◆</b> Accessible</span><span><b className="text-green">✓</b> Maîtrisée</span><span><b>▣</b> Verrouillée</span></div>
      </div>
      <div className="grid grid-cols-6 gap-4 items-start">
        {TREE_POSITIONS.map(position => {
          const laneSpots = allSpots.filter(spot => spot.heroPosition === position);
          const mastered = laneSpots.filter(spot => spot.status === 'mastered').length;
          return <section key={position} className="relative min-w-0">
            <div className="sticky top-0 z-10 rounded-xl border border-border2 bg-bg2/95 p-3 text-center shadow-lg backdrop-blur">
              <div className="text-[9px] tracking-[0.2em] font-bold text-muted">BRANCHE</div>
              <div className="text-lg font-black mt-0.5">{position}</div>
              <div className="text-[9px] text-muted mt-1">{mastered}/{laneSpots.length} maîtrisées</div>
            </div>
            <div className="relative mt-3 px-1 before:absolute before:left-1/2 before:top-0 before:bottom-4 before:w-px before:-translate-x-1/2 before:bg-gradient-to-b before:from-accent/70 before:via-border2 before:to-border">
              {stages.map(stage => {
                const spots = stage.spots.filter(spot => spot.heroPosition === position);
                if (!spots.length) return null;
                return <div key={stage.id} className="relative pt-7 pb-5">
                  <div className="relative z-[1] mx-auto mb-3 w-fit rounded-full border border-border2 bg-bg px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-muted">{stage.title}</div>
                  <div className="relative z-[1] space-y-3">
                    {spots.map(spot => <SkillNode key={spot.key} spot={spot} selected={selectedKey === spot.key} recommended={recommendedKey === spot.key} onSelect={() => onSelect(spot)}/>)}
                  </div>
                </div>;
              })}
              {!laneSpots.length && <div className="relative z-[1] mt-8 rounded-xl border border-dashed border-border bg-bg2 px-3 py-8 text-center text-[9px] text-muted">Aucune compétence importée</div>}
            </div>
          </section>;
        })}
      </div>
      </div>
    </div>
  </>;
}

function SkillNode({ spot, selected, recommended, onSelect }: { spot: RoadmapSpot; selected: boolean; recommended: boolean; onSelect: () => void }) {
  const status = STATUS[spot.status];
  const nodeTone = spot.status === 'mastered'
    ? 'border-green/70 bg-green/10 text-green shadow-[0_7px_0_rgba(16,80,58,.45)]'
    : spot.status === 'due'
      ? 'border-orange/70 bg-orange/10 text-orange shadow-[0_7px_0_rgba(90,55,20,.5)]'
      : spot.status === 'locked'
        ? 'border-border bg-[repeating-linear-gradient(135deg,rgba(37,37,48,.95),rgba(37,37,48,.95)_7px,rgba(31,31,37,.95)_7px,rgba(31,31,37,.95)_14px)] text-muted shadow-[0_7px_0_rgba(0,0,0,.28)]'
        : 'border-accent/70 bg-gradient-to-br from-accent/20 to-bg2 text-text shadow-[0_7px_0_rgba(45,39,125,.5)]';
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} title={`${spot.displayName} · ${spot.level} · Importance ${spot.importance}/5`} className={clsx('relative w-full min-h-[112px] rounded-xl border p-3 text-left transition-all duration-200 group hover:-translate-y-0.5', nodeTone, selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg', recommended && 'ring-1 ring-orange/70 shadow-[0_0_24px_rgba(224,149,64,.18)]')}>
      <div className="flex items-start justify-between gap-2">
        <span className={clsx('w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-black flex-shrink-0', spot.status === 'locked' ? 'border-border2 bg-black/15' : spot.status === 'mastered' ? 'border-green/40 bg-green/15' : 'border-accent/40 bg-accent/15')}>
          {spot.status === 'mastered' ? '✓' : spot.status === 'locked' ? <Icon name="lock" size={15}/> : `${spot.mastery}%`}
        </span>
        {recommended ? <span className="rounded-full border border-orange/30 bg-orange/10 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-orange">Next</span> : <span className={clsx('rounded-full border px-1.5 py-0.5 text-[7px] font-bold', status.tone)}>{status.label}</span>}
      </div>
      <div className={clsx('mt-2 text-[10px] font-bold leading-snug', spot.status === 'locked' ? 'text-muted' : 'text-text')}>{spot.displayName}</div>
      {spot.status === 'locked'
        ? <div className="mt-1.5 flex items-start gap-1 text-[8px] leading-snug text-muted2"><Icon name="lock" size={10} className="mt-px flex-shrink-0"/><span>{spot.lockReason}</span></div>
        : <div className="mt-1.5 flex items-center justify-between text-[8px] text-muted"><span>{spot.level}</span><span>{spot.recommended ? 'Prioritaire' : `Niv. ${spot.importance}/5`}</span></div>}
      {spot.due && <span className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-orange border-2 border-bg2 animate-pulse"/>}
    </button>
  );
}

function MobileSkillNode({ spot, selected, recommended, onSelect }: { spot: RoadmapSpot; selected: boolean; recommended: boolean; onSelect: () => void }) {
  const locked = spot.status === 'locked';
  const tone = spot.status === 'mastered'
    ? 'border-green/60 bg-green/10 shadow-[0_4px_0_rgba(16,80,58,.4)]'
    : spot.status === 'due'
      ? 'border-orange/60 bg-orange/10 shadow-[0_4px_0_rgba(90,55,20,.45)]'
      : locked
        ? 'border-border bg-[repeating-linear-gradient(135deg,rgba(37,37,48,.97),rgba(37,37,48,.97)_7px,rgba(31,31,37,.97)_7px,rgba(31,31,37,.97)_14px)] shadow-[0_4px_0_rgba(0,0,0,.28)]'
        : 'border-accent/60 bg-gradient-to-br from-accent/20 to-bg2 shadow-[0_4px_0_rgba(45,39,125,.45)]';
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={clsx('relative mx-auto flex w-full max-w-[300px] items-center gap-3 rounded-xl border p-3 text-left transition-transform active:translate-y-0.5', tone, selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg', recommended && 'ring-1 ring-orange/70')}>
    <span className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border text-[10px] font-black', locked ? 'border-border2 bg-black/15 text-muted' : spot.status === 'mastered' ? 'border-green/40 bg-green/15 text-green' : 'border-accent/40 bg-accent/15 text-accent')}>
      {spot.status === 'mastered' ? '✓' : locked ? <Icon name="lock" size={16}/> : `${spot.mastery}%`}
    </span>
    <span className="min-w-0 flex-1">
      <span className={clsx('block text-[11px] font-bold leading-tight', locked ? 'text-muted' : 'text-text')}>{spot.displayName}</span>
      <span className="mt-1 flex items-center gap-1 text-[8px] leading-tight text-muted2">
        {locked && <Icon name="lock" size={9} className="flex-shrink-0"/>}<span className="line-clamp-2">{locked ? spot.lockReason : spot.level}</span>
      </span>
    </span>
    <span className={clsx('self-start rounded-full border px-1.5 py-0.5 text-[7px] font-bold uppercase', recommended ? 'border-orange/30 bg-orange/10 text-orange' : locked ? 'border-border2 bg-bg3 text-muted' : 'border-accent/30 bg-accent/10 text-accent')}>{recommended ? 'Next' : locked ? 'Bloqué' : spot.status === 'mastered' ? 'OK' : 'Go'}</span>
  </button>;
}

function RoadmapList({ stages, selectedKey, onSelect }: { stages: RoadmapStage[]; selectedKey?: string; onSelect: (spot: RoadmapSpot) => void }) {
  const spots = stages.flatMap(stage => stage.spots.map(spot => ({ stage, spot })));
  if (spots.length === 0) return <div className="py-12 text-center text-xs text-muted">Aucune compétence ne correspond aux filtres.</div>;
  return <div className="space-y-2">{spots.map(({ stage, spot }) => {
    const status = STATUS[spot.status];
    return <button key={spot.key} onClick={() => onSelect(spot)} className={clsx('w-full rounded-lg border p-3 flex items-center gap-3 text-left transition-colors', selectedKey === spot.key ? 'border-accent bg-accent/10' : 'border-border bg-bg2 hover:border-border2')}>
      <div className="w-10 h-10 rounded-full border border-accent/40 bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent">{spot.mastery}%</div>
      <div className="min-w-0 flex-1"><div className="text-xs font-semibold">{spot.displayName}</div><div className="text-[10px] text-muted mt-0.5">Hero {spot.heroPosition} · {spot.level}</div></div>
      <span className={clsx('hidden sm:inline text-[9px] px-2 py-1 rounded-full border font-bold', status.tone)}>{status.label}</span>
      <div className="text-right"><div className="text-[10px] font-bold">{'●'.repeat(spot.importance)}<span className="text-bg4">{'●'.repeat(5 - spot.importance)}</span></div><div className="text-[8px] text-muted uppercase">importance</div></div>
    </button>;
  })}</div>;
}

function SkillDetail({ spot, onStart, onToggle }: { spot: RoadmapSpot; onStart: () => void; onToggle: (field: 'roadmapPinned' | 'roadmapSnoozed' | 'roadmapKnown', key: string) => void }) {
  const status = STATUS[spot.status];
  const phases = [
    ['discover', 'Découvrir'], ['understand', 'Comprendre'], ['practice', 'Flash'], ['validate', 'Grille'], ['retention', 'SRS'],
  ] as const;
  const phaseIndex = phases.findIndex(([phase]) => phase === spot.phase);
  const action = spot.phase === 'discover'
    ? { label: 'Ouvrir l’exploration', help: 'Commence par lire la forme globale, la taille et les actions présentes.', run: onStart }
    : spot.phase === 'understand'
      ? { label: 'Continuer l’exploration', help: 'Mémorise surtout les bottoms, les folds voisins, les mixes et les actions rares.', run: onStart }
      : spot.phase === 'practice'
        ? { label: 'Lancer Flash', help: `Objectif : 80% de bonnes réponses. Meilleur score : ${formatScore(spot.flashScore)}.`, run: onStart }
        : spot.phase === 'validate'
          ? { label: 'Reconstituer dans Grille', help: `Une reconstruction réussie à au moins 80% validera la range et activera automatiquement le SRS.`, run: onStart }
          : { label: spot.due ? 'Faire la révision SRS' : 'Range acquise', help: spot.due ? 'Une révision mémoire est disponible.' : 'Le SRS te la reproposera au bon moment.', run: onStart };
  return (
    <div className="2xl:sticky 2xl:top-0">
      <div className="section-label">Compétence sélectionnée</div>
      <div className="mt-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center"><Icon name="target" size={22}/></div>
        <div className="min-w-0"><h3 className="font-bold">{spot.displayName}</h3><p className="text-[11px] text-muted truncate">{spot.catName}</p></div>
      </div>

      <div className="mt-5 flex items-end justify-between"><div><span className={clsx('text-[9px] px-2 py-1 rounded-full border font-bold', status.tone)}>{status.label}</span><div className="text-[10px] text-muted mt-2">Niveau · <strong className="text-text">{spot.level}</strong></div></div><span className="text-2xl font-bold">{spot.mastery}%</span></div>
      <div className="h-2 rounded-full bg-bg4 overflow-hidden mt-2"><div className={clsx('h-full rounded-full', spot.due ? 'bg-orange' : 'bg-accent')} style={{ width: `${spot.mastery}%` }}/></div>

      <div className="grid grid-cols-5 gap-1 mt-5" aria-label="Étapes d’apprentissage">
        {phases.map(([phase, label], index) => <div key={phase} className="text-center min-w-0"><div className={clsx('h-1.5 rounded-full', index <= phaseIndex ? 'bg-accent' : 'bg-bg4')}/><div className={clsx('text-[8px] mt-1 truncate', index === phaseIndex ? 'text-text font-bold' : 'text-muted')}>{label}</div></div>)}
      </div>

      <div className="mt-5 rounded-lg border border-border bg-bg3/60 p-3">
        <div className="text-[9px] uppercase tracking-wider font-bold text-muted">Pourquoi maintenant ?</div>
        <p className="text-xs leading-relaxed mt-1.5">{spot.reason}</p>
      </div>

      <div className="mt-5 rounded-lg border border-accent/25 bg-accent/5 p-3"><div className="text-[9px] uppercase tracking-wider font-bold text-accent">Étape actuelle · {phases[phaseIndex]?.[1]}</div><p className="text-[11px] text-muted mt-1.5 leading-relaxed">{action.help}</p></div>
      {!spot.unlocked && <div className="mt-5 rounded-lg border border-border bg-bg3 p-3 text-[11px] text-muted"><span className="font-bold text-text">Prérequis</span><br/>{spot.lockReason}</div>}
      <Button variant="primary" className="w-full mt-3" onClick={action.run} disabled={!spot.unlocked || (spot.phase === 'retention' && !spot.due)}>{spot.unlocked ? action.label : 'Range verrouillée'} {spot.unlocked && !(spot.phase === 'retention' && !spot.due) && <span aria-hidden="true">→</span>}</Button>
      <details className="mt-3 rounded-lg border border-border px-3 py-2">
        <summary className="text-[10px] text-muted cursor-pointer">Détails d’apprentissage</summary>
        <div className="mt-3 text-[10px] text-muted flex items-center justify-between"><span>Prérequis directs</span><strong className="text-text">{spot.prerequisiteKeys.length || 'Aucun'}</strong></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center"><DetailMetric value={formatScore(spot.flashScore)} label="Flash"/><DetailMetric value={formatScore(spot.grilleScore)} label="Grille"/><DetailMetric value={spot.phase === 'retention' ? 'Oui' : 'Non'} label="Validée"/><DetailMetric value={`${spot.stability}%`} label="Stabilité"/><DetailMetric value={`${spot.importance}/5`} label="Importance"/><DetailMetric value={spot.due ? 'Due' : spot.memory === 'none' ? '—' : 'Planifiée'} label="Mémoire" warn={spot.due}/></div>
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
