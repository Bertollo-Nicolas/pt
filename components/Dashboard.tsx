'use client';
import { useMemo } from 'react';
import { getCfg, useAppStore } from '@/store/appStore';
import { buildRoadmap, nextRoadmapSpot } from '@/lib/roadmap';
import { addDays, todayStr } from '@/lib/utils';
import { srsRequiresDrill } from '@/lib/srs';
import type { Session } from '@/lib/types';
import { Icon, type IconName } from './ui/Icon';

function score(session: Session) {
  if (session.score !== undefined) return session.score;
  const total = (session.correct ?? 0) + (session.wrong ?? 0) + (session.imprecision ?? 0);
  return total ? Math.round((session.correct ?? 0) / total * 100) : null;
}

export function Dashboard({ onLibrary }: { onLibrary: () => void }) {
  const store = useAppStore();
  const { rmData, sessions, errors, srs, setMode, selectedTab } = store;
  const cfg = getCfg(store);
  const stages = useMemo(() => buildRoadmap(rmData, sessions, errors, srs, cfg), [rmData, sessions, errors, srs, cfg]);
  const recommended = nextRoadmapSpot(stages);
  const spots = stages.flatMap(stage => stage.spots);
  const rangeCount = rmData ? Object.values(rmData.categories).reduce((n, cat) => n + (cat.tabList?.length ?? 0), 0) : 0;
  const mastery = spots.length ? Math.round(spots.reduce((n, spot) => n + spot.mastery, 0) / spots.length) : 0;
  const today = todayStr();
  const due = Object.values(srs).filter(entry => entry.nextReview <= today || srsRequiresDrill(entry)).length;
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6);
    return { date, count: sessions.filter(session => session.date.slice(0, 10) === date).length };
  });
  const weekCount = week.reduce((n, day) => n + day.count, 0);
  const recent = sessions.slice(-4).reverse();
  const scores = sessions.map(score).filter((value): value is number => value !== null);
  const average = scores.length ? Math.round(scores.reduce((n, value) => n + value, 0) / scores.length) : null;
  const start = () => rangeCount ? setMode(spots.length ? 'roadmap' : 'flash') : onLibrary();
  return <div className="dashboard-scroll"><div className="dashboard">
    <div className="dashboard-heading"><div><div className="eyebrow">TON ESPACE DE PROGRESSION</div><h1>Chaque décision compte<span>.</span></h1><p>Un plan clair. De meilleures habitudes. Un jeu plus solide.</p></div><span className="date-chip"><Icon name="calendar" size={15}/>{new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date())}</span></div>
    <div className="dashboard-top">
      <section className="focus-card">
        <div className="focus-copy"><span className="focus-tag"><span/> {rangeCount ? 'TA PROCHAINE ÉTAPE' : 'LE DÉBUT DE TON PARCOURS'}</span><h2>{rangeCount ? <>Prends une longueur<br/>d’avance.</> : <>Ton meilleur jeu<br/>commence ici.</>}</h2><p>{recommended ? `Aujourd’hui, travaille ${recommended.name}. Un objectif précis pour faire progresser ton préflop.` : rangeCount ? 'Retrouve tes ranges et construis tes automatismes, une session à la fois.' : 'Transforme tes ranges en réflexes. Importe ta bibliothèque et construis ton parcours d’entraînement.'}</p><button className="focus-cta" onClick={start}>{rangeCount ? spots.length ? 'Continuer mon parcours' : 'Choisir un exercice' : 'Importer mes ranges'}<Icon name={rangeCount ? 'chevron' : 'upload'} size={17}/></button><span className="focus-footnote">{rangeCount ? `${cfg.roadmapDailyMinutes} min par jour · À ton rythme` : 'Fichiers .rm · Depuis Range Manager'}</span></div>
        <div className="poker-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="art-coordinate">PREFLOP / 01</span><div className="playing-card card-back"><span>A<small>♣</small></span><b>♣</b></div><div className="playing-card card-front"><span>A<small>♠</small></span><b>♠</b><span className="card-corner">A</span></div><span className="art-caption">LESS GUESSING. MORE EDGE.</span></div>
      </section>
      <section className="activity-card"><div className="flex items-center justify-between"><span className="eyebrow">TA RÉGULARITÉ</span><Icon name="chart" size={17} className="text-muted"/></div><div className="activity-number">{weekCount}<span>session{weekCount > 1 ? 's' : ''}</span></div><p className="text-xs text-muted">Sur les 7 derniers jours</p><div className="weekly-bars">{week.map(day => <div key={day.date} className="day-column"><div className="bar-track"><div className={`day-bar ${day.date === today ? 'today' : ''}`} style={{ height: day.count ? `${Math.max(12, day.count / Math.max(1, ...week.map(d => d.count)) * 100)}%` : '3px' }} title={`${day.date} : ${day.count} session(s)`}/></div><span className={day.date === today ? 'text-text' : ''}>{new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' }).format(new Date(`${day.date}T12:00:00`))}</span></div>)}</div><div className="activity-caption"><span className="text-accent">↗</span>{weekCount ? 'Chaque session construit tes automatismes.' : 'Une première session, et c’est parti.'}</div></section>
    </div>
    <section className="metric-strip" aria-label="Statistiques de progression">{[
      { label: 'Ranges dans la bibliothèque', value: rangeCount, detail: 'Ton terrain d’entraînement', icon: 'folder' },
      { label: 'Maîtrise du parcours', value: `${mastery}%`, detail: `${spots.filter(spot => spot.mastery >= 85).length} ranges maîtrisées`, icon: 'target' },
      { label: 'Précision moyenne', value: average === null ? '—' : `${average}%`, detail: scores.length ? `${scores.length} sessions évaluées` : 'À découvrir après ta première session', icon: 'chart' },
      { label: 'Révisions à faire', value: due.toString().padStart(2, '0'), detail: due ? 'Consolide tes acquis aujourd’hui' : 'Aucune révision en attente', icon: 'calendar' },
    ].map(metric => <div className="dashboard-metric" key={metric.label}><span className="metric-label">{metric.label}<Icon name={metric.icon as IconName} size={15}/></span><strong>{metric.value}</strong><span className="metric-detail">{metric.detail}</span></div>)}</section>
    <div className="section-title-row"><div><span className="eyebrow">LA PRATIQUE FAIT LA DIFFÉRENCE</span><h2>À chaque objectif, son exercice.</h2></div><button className="text-link" onClick={() => setMode('roadmap')}>Voir mon parcours <Icon name="chevron" size={14}/></button></div>
    <div className="practice-grid">{[
      { number: '01', icon: 'flash', title: 'Créer des automatismes', description: 'Une main, une décision. Entraîne ta rapidité et ta précision avec les flashcards.', mode: 'flash', action: 'Ouvrir les flashcards' },
      { number: '02', icon: 'grid', title: 'Comprendre toute la range', description: 'Reconstruis ta grille de mémoire pour maîtriser chaque combinaison.', mode: 'grille', action: 'Ouvrir le range builder' },
      { number: '03', icon: 'calendar', title: 'Ancrer tes connaissances', description: 'Revois la bonne range au bon moment grâce à la répétition espacée.', mode: 'srs', action: due ? `Réviser ${due} ranges` : 'Voir mes révisions' },
    ].map(item => <button key={item.number} className="practice-card" onClick={() => setMode(item.mode as 'flash' | 'grille' | 'srs')}><div className="flex items-center justify-between"><span className="practice-icon"><Icon name={item.icon as IconName} size={21}/></span><span className="practice-number">{item.number}</span></div><h3>{item.title}</h3><p>{item.description}</p><span className="practice-action">{item.action}<Icon name="chevron" size={16}/></span></button>)}</div>
    <section className="recent-section"><div className="section-title-row"><div><span className="eyebrow">UN PEU PLUS SOLIDE À CHAQUE FOIS</span><h2>Dernières sessions</h2></div>{selectedTab && <button className="text-link" onClick={() => setMode('flash')}>Reprendre {selectedTab.name}<Icon name="chevron" size={14}/></button>}</div>{recent.length ? <div className="session-list">{recent.map((session, index) => <div key={session.id ?? `${session.date}-${index}`} className="session-row"><span className="session-icon"><Icon name={session.mode === 'flash' ? 'flash' : 'grid'} size={18}/></span><div className="min-w-0"><strong className="block truncate text-sm">{session.name}</strong><span className="text-xs text-muted">{session.catName}</span></div><span className="hidden sm:block text-xs text-muted ml-auto">{session.mode === 'flash' ? 'Flashcards' : 'Range builder'}</span><span className="text-sm ml-auto sm:ml-4">{score(session) === null ? '—' : `${score(session)}%`}</span><span className="text-xs text-muted">{session.date.slice(0, 10).split('-').reverse().join('/')}</span></div>)}</div> : <div className="empty-sessions"><span className="session-icon"><Icon name="chart" size={22}/></span><div><h3>La progression commence par une première session.</h3><p>Tu retrouveras ici tes résultats et tes derniers entraînements.</p></div><button className="text-link" onClick={() => rangeCount ? setMode('flash') : onLibrary()}>Commencer<Icon name="chevron" size={15}/></button></div>}</section>
    <footer className="dashboard-footer"><span>RANGE TRAINER</span><span>Le travail hors des tables fait la différence.</span><span>♠</span></footer>
  </div></div>;
}
