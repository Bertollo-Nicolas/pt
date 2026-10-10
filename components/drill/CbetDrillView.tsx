'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { QUESTIONS } from '@/lib/cbet-drill/dataset';
import { categoriesOf, classifyBoard, emptyProgress, evaluateAnswer, recordAttempt, selectQuestion, weakestCategories } from '@/lib/cbet-drill/engine';
import { CATEGORY_LABELS, SIZINGS, type Confidence, type DrillAttempt, type DrillProgress, type DrillQuestion, type Sizing } from '@/lib/cbet-drill/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

type DrillMode = 'learn' | 'drill' | 'mastery';
type Session = { question: DrillQuestion; attempts: DrillAttempt[]; startedAt: number; answer: DrillAttempt | null; done: boolean; pool: DrillQuestion[] };
const MODES: { id: DrillMode; title: string; detail: string }[] = [
  { id: 'learn', title: 'Apprentissage', detail: 'Indices et explications complètes' },
  { id: 'drill', title: 'Drill', detail: 'Décisions rapides, feedback essentiel' },
  { id: 'mastery', title: 'Mastery', detail: 'Cas proches et pièges, sans indices' },
];
const SESSION_LENGTH = 20;
const SUITS: Record<string, { symbol: string; label: string }> = { S: { symbol: '♠', label: 'pique' }, H: { symbol: '♥', label: 'cœur' }, D: { symbol: '♦', label: 'carreau' }, C: { symbol: '♣', label: 'trèfle' } };
const RANK_LABELS: Record<string, string> = { A: 'As', K: 'Roi', Q: 'Dame', J: 'Valet', T: '10' };

function Board({ question }: { question: DrillQuestion }) {
  return <div className="cbet-board" aria-label="Flop">{question.board.cards.map(card => <div key={card} className={`cbet-card suit-${card[1]}`} role="img" aria-label={`${RANK_LABELS[card[0]] ?? card[0]} de ${SUITS[card[1]].label}`}><span>{card[0] === 'T' ? '10' : card[0]}</span><b aria-hidden="true">{SUITS[card[1]].symbol}</b><small aria-hidden="true">{card[0] === 'T' ? '10' : card[0]}</small></div>)}</div>;
}

function ProgressStats({ progress, compact = false, sessionOnly = false }: { progress: DrillProgress; compact?: boolean; sessionOnly?: boolean }) {
  const weak = weakestCategories(progress).filter(category => category.correct < category.attempts);
  return <section className="cbet-stats" aria-label="Progression du drill"><div className="cbet-stat-grid">{[
    [sessionOnly ? 'Précision de session' : 'Précision globale', progress.attempts ? `${Math.round(progress.correct / progress.attempts * 100)} %` : '—'],
    ['Décisions', progress.attempts], ['Série actuelle', progress.streak], ['Meilleure série', progress.bestStreak],
  ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>{!compact && <><h3 className="font-semibold mt-6 mb-4">Tes repères par famille</h3><div className="cbet-categories">{Object.entries(CATEGORY_LABELS).map(([key, label]) => {
    const stats = progress.categories[key as keyof typeof CATEGORY_LABELS];
    const accuracy = stats?.attempts ? Math.round(stats.correct / stats.attempts * 100) : null;
    return <div key={key}><div className="flex justify-between gap-3 text-sm"><span>{label}</span><span className="text-muted">{accuracy === null ? 'À découvrir' : `${accuracy} % · ${stats!.attempts}`}</span></div><div className="cbet-stat-track"><span style={{ width: `${accuracy ?? 0}%` }} /></div></div>;
  })}</div><p className="text-sm text-muted mt-5">{weak.length ? <>À renforcer : <span className="text-signal">{weak.slice(0, 2).map(item => CATEGORY_LABELS[item.category]).join(' · ')}</span></> : progress.attempts ? 'Aucune erreur pour le moment. Continue à varier les flops.' : 'Tes points forts et tes priorités apparaîtront après tes premières décisions.'}</p>{progress.attempts > 0 && <p className="text-xs text-muted mt-2">Temps moyen : {(progress.totalTimeMs / progress.attempts / 1000).toFixed(1)} s par décision.</p>}</>}</section>;
}

export function CbetDrillView() {
  const progress = useAppStore(state => state.config.cbetDrill) ?? emptyProgress();
  const record = useAppStore(state => state.recordCbetAttempt);
  const [mode, setMode] = useState<DrillMode>('learn');
  const [level, setLevel] = useState(4);
  const [session, setSession] = useState<Session | null>(null);
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  const answered = useRef(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const feedbackArea = useRef<HTMLElement>(null);
  const activeQuestionId = session?.question.id;
  const sessionDone = session?.done;
  useEffect(() => { scrollArea.current?.scrollTo({ top: 0 }); }, [activeQuestionId, sessionDone]);
  const start = () => {
    const pool = QUESTIONS.filter(question => mode === 'mastery' ? question.difficulty >= 3 : question.difficulty <= level);
    answered.current = false;
    setConfidence(undefined);
    setSession({ question: selectQuestion(pool, progress, []), attempts: [], startedAt: performance.now(), answer: null, done: false, pool });
  };
  const answer = (sizing: Sizing) => {
    if (!session || session.answer || answered.current) return;
    answered.current = true;
    const attempt: DrillAttempt = { id: crypto.randomUUID(), questionId: session.question.id, answer: sizing,
      correct: evaluateAnswer(session.question, sizing).correct, responseTimeMs: Math.round(performance.now() - session.startedAt), confidence, createdAt: new Date().toISOString() };
    record(session.question, attempt);
    setSession({ ...session, answer: attempt, attempts: [...session.attempts, attempt] });
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 1150px)').matches) feedbackArea.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };
  const next = () => {
    if (!session?.answer) return;
    if (session.attempts.length >= SESSION_LENGTH) { setSession({ ...session, done: true }); return; }
    answered.current = false;
    setConfidence(undefined);
    setSession({ ...session, question: selectQuestion(session.pool, progress, session.attempts.map(item => item.questionId)), answer: null, startedAt: performance.now() });
    requestAnimationFrame(() => questionHeading.current?.focus({ preventScroll: true }));
  };
  let sessionProgress = emptyProgress();
  if (session) for (const attempt of session.attempts) sessionProgress = recordAttempt(sessionProgress, QUESTIONS.find(question => question.id === attempt.questionId)!, attempt);
  const mistakes = session?.attempts.filter(attempt => !attempt.correct) ?? [];
  const missedRules = mistakes.reduce<Record<string, number>>((result, attempt) => {
    const rule = QUESTIONS.find(question => question.id === attempt.questionId)!.explanation.mentalRule;
    result[rule] = (result[rule] ?? 0) + 1; return result;
  }, {});
  const mostMissed = Object.entries(missedRules).sort((a, b) => b[1] - a[1])[0];
  const question = session?.question;
  const feedback = question && session?.answer ? evaluateAnswer(question, session.answer.answer) : null;
  return <div ref={scrollArea} className="cbet-scroll"><div className="cbet-workspace">
    <header className="cbet-heading"><div><span className="eyebrow text-signal">POSTFLOP / ENTRAÎNE TA DÉCISION</span><h1>Le bon sizing.<br className="sm:hidden"/> Pour la bonne raison.</h1><p>BTN vs BB · Pot relancé · Flop · Tu es l’agresseur au bouton.</p></div><span className="cbet-spot"><Icon name="target"/>Drill C-bet</span></header>
    {!session ? <div className="cbet-setup-grid"><section className="cbet-panel"><span className="section-label">UNE SESSION, UN RÉFLEXE</span><h2>Observe. Décide. Comprends.</h2><p className="text-muted text-sm mt-3 mb-6">20 flops pour choisir le sizing principal de ta stratégie, sans main précise. Les erreurs reviennent sur des boards similaires.</p><fieldset><legend className="text-sm font-semibold mb-3">Ton mode d’entraînement</legend><div className="cbet-mode-grid">{MODES.map(item => <label key={item.id} className={`cbet-mode ${mode === item.id ? 'is-selected' : ''}`}><input className="sr-only" type="radio" name="cbet-mode" value={item.id} checked={mode === item.id} onChange={() => setMode(item.id)}/><strong>{item.title}</strong><span>{item.detail}</span></label>)}</div></fieldset>{mode !== 'mastery' && <label className="block text-sm font-semibold mt-6">Difficulté<select className="cbet-select" value={level} onChange={event => setLevel(Number(event.target.value))}><option value={1}>1 · Textures essentielles</option><option value={2}>2 · Avantage de nuts et hauteur</option><option value={3}>3 · Fréquence et logique de mise</option><option value={4}>4 · Toutes les textures et cas proches</option></select></label>}<div className="cbet-start"><Button variant="primary" onClick={start}>Lancer les 20 flops <span aria-hidden="true">→</span></Button><span>{QUESTIONS.length} boards · Sans chronomètre imposé</span></div></section><ProgressStats progress={progress}/></div>
      : session.done ? <section className="cbet-panel cbet-summary"><span className="section-label text-signal">SESSION TERMINÉE</span><h2>{sessionProgress.correct} / {SESSION_LENGTH}<span> bonnes décisions</span></h2><p className="text-muted mt-3">{mistakes.length ? 'Tes erreurs guideront la prochaine session.' : 'Tous les repères sont justes. Essaie un autre mode pour les consolider.'}</p><ProgressStats progress={sessionProgress} sessionOnly/><div className="cbet-rule"><span>LE REPÈRE À EMPORTER</span><p>{mostMissed?.[0] ?? 'Qui possède les nuts ? Puis regarde la texture avant de choisir ton sizing.'}</p></div><div className="flex flex-wrap gap-3 mt-6"><Button variant="primary" onClick={start}>Nouvelle session →</Button><Button onClick={() => setSession(null)}>Modes et progression globale</Button></div></section>
      : question && <><div className="cbet-session-top"><span>{MODES.find(item => item.id === mode)?.title} <span className="text-muted">/ Flop {session.attempts.length + (session.answer ? 0 : 1)} sur {SESSION_LENGTH}</span></span><span className="text-signal">{sessionProgress.correct} bonnes réponses</span><Button size="sm" onClick={() => setSession(null)}>Quitter la session</Button></div><div className="cbet-session-track" role="progressbar" aria-label="Avancement de la session" aria-valuenow={session.attempts.length} aria-valuemin={0} aria-valuemax={SESSION_LENGTH}><span style={{ width: `${session.attempts.length / SESSION_LENGTH * 100}%` }}/></div><div className="cbet-play-grid"><section className="cbet-table-panel"><div className="cbet-table-meta"><span>BTN <b>TOI</b></span><span>vs BB</span><span>FLOP</span></div><Board question={question}/><div className="cbet-hint">{mode === 'learn' || session.answer ? <>{({ rainbow: 'Rainbow', 'two-tone': 'Deux couleurs', monotone: 'Monotone' })[classifyBoard(question.board.cards).suits]}{classifyBoard(question.board.cards).paired ? ' · Pairé' : ''}</> : 'Observe les nuts, puis la texture.'}</div><h2 ref={questionHeading} tabIndex={-1}>Quel sizing principal utiliserais-tu ?</h2><p className="text-muted text-sm">Choisis le repère pour l’ensemble de ta stratégie.</p><div className="cbet-answers" role="group" aria-label="Choisir un sizing">{SIZINGS.map(item => <button key={item.id} disabled={Boolean(session.answer)} onClick={() => answer(item.id)} className={`cbet-answer ${session.answer && item.id === question.correctAnswer.sizing ? 'is-correct' : session.answer?.answer === item.id ? 'is-wrong' : ''}`}><strong>{item.label}</strong><span>{item.detail}</span>{session.answer && item.id === question.correctAnswer.sizing && <small>Réponse attendue ✓</small>}{session.answer?.answer === item.id && item.id !== question.correctAnswer.sizing && <small>Ta réponse</small>}</button>)}</div>{!session.answer && <label className="cbet-confidence">Ton ressenti <span className="text-muted2">(facultatif)</span><select aria-label="Confiance dans ta réponse" value={confidence ?? ''} onChange={event => setConfidence((event.target.value || undefined) as Confidence | undefined)}><option value="">Non renseigné</option><option value="KNOWN">Je sais</option><option value="HESITATED">J’hésite</option><option value="UNKNOWN">Je ne sais pas</option></select></label>}</section><aside ref={feedbackArea} className={`cbet-feedback ${session.answer ? 'has-answer' : ''}`} aria-label="Explication">{feedback ? <><div role="status"><span className={feedback.correct ? 'text-green' : 'text-signal'}>{feedback.correct ? '✓ Correct' : '↗ À revoir'}</span><h3>{question.correctAnswer.sizingLabel}</h3><p>{question.explanation.short}</p>{!feedback.correct && <p className="text-signal text-sm mt-3">{feedback.adjustment}</p>}</div><div className="cbet-rule"><span>LA RÈGLE MENTALE</span><p>{question.explanation.mentalRule}</p></div>{mode === 'learn' ? <p className="text-sm text-muted leading-relaxed">{question.explanation.detailed}</p> : <details className="text-sm text-muted"><summary className="cursor-pointer">Comprendre le raisonnement</summary><p className="mt-3 leading-relaxed">{question.explanation.detailed}</p></details>}{question.correctAnswer.frequencyMin !== undefined && question.correctAnswer.frequencyMax !== undefined && <p className="text-xs text-muted">Fréquence indicative : {question.correctAnswer.frequencyMin}–{question.correctAnswer.frequencyMax} % de mises.</p>}<div className="flex flex-wrap gap-2">{categoriesOf(question).map(category => <span key={category} className="cbet-tag">{CATEGORY_LABELS[category]}</span>)}</div><Button variant="primary" onClick={next}>{session.attempts.length === SESSION_LENGTH ? 'Voir mon bilan' : 'Flop suivant'} →</Button></> : <><span className="section-label text-signal">TON RAISONNEMENT</span><h3>Commence par les nuts.</h3><ol><li>Qui possède les meilleures mains ?</li><li>À quel point le board est-il connecté ?</li><li>Quelle équité veux-tu faire folder ?</li><li>Quelle place pour tes mains moyennes ?</li></ol><p className="text-sm text-muted">Réponds pour découvrir le repère et sa logique.</p></>}</aside></div></>}
    <footer className="cbet-footnote">Modèle pédagogique simplifié, sans précision solver. Les sizings dépendent aussi des ranges et du contexte réel. Chaque réponse est sauvegardée ; quitter interrompt la session.</footer>
  </div></div>;
}
