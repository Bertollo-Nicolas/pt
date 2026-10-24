'use client';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { BET_SIZES, DRAW_TYPES, MATH_TOPICS, callEquity, bluffFolds, valuePerBluff, hitProbability, formatMath as f,
  emptyMathProgress, parseMathAnswer, checkMathAnswer, selectMathQuestion,
  type MathAttempt, type MathFilter, type MathProgress, type MathQuestion, type MathTopic } from '@/lib/math-drill';
import { Button } from '../ui/Button';
import { DrillLengthField, useDrillLength } from './DrillLengthField';
import { Icon } from '../ui/Icon';
import { DrillExplanation, DrillMemoDeck } from './DrillReference';

function MathStats({ progress }: { progress: MathProgress }) {
  return <section className="cbet-stats" aria-label="Progression en maths">
    <div className="cbet-stat-grid">{[
      ['Précision', progress.attempts ? `${Math.round(progress.correct / progress.attempts * 100)} %` : '—'],
      ['Calculs effectués', progress.attempts], ['Série actuelle', progress.streak], ['Meilleure série', progress.bestStreak],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <h3 className="font-semibold mt-6 mb-4">Tes repères par thème</h3>
    <div className="cbet-categories">{MATH_TOPICS.map(topic => {
      const stats = progress.topics[topic.id];
      const accuracy = stats?.attempts ? Math.round(stats.correct / stats.attempts * 100) : null;
      return <div key={topic.id}><div className="flex justify-between gap-3 text-sm"><span>{topic.title}</span><span className="text-muted">{accuracy === null ? 'À découvrir' : `${accuracy} % · ${stats!.attempts}`}</span></div><div className="cbet-stat-track"><span style={{ width: `${accuracy ?? 0}%` }}/></div></div>;
    })}</div>
  </section>;
}

function MathMemo() {
  return <DrillMemoDeck title="Les repères à garder." description="Formules, arrondis et limites des modèles." pages={MATH_TOPICS.map(topic => ({id:topic.id,title:topic.title,content:<div className="math-memo-body"><div className="cbet-rule"><span>FORMULE</span><p>{topic.formula}</p></div><p className="text-muted text-sm leading-relaxed my-4">{topic.rule}</p>
        {(topic.id === 'call' || topic.id === 'bluff' || topic.id === 'ratio') && <div className="math-table-scroll"><table><thead><tr><th>Sizing</th><th>{topic.id === 'call' ? 'Équité pour call' : topic.id === 'bluff' ? 'Folds nécessaires' : 'Value / bluff'}</th></tr></thead><tbody>{BET_SIZES.map(size => <tr key={size.label}><td>{size.label}</td><td>{topic.id === 'call' ? `${f(callEquity(1, size.fraction) * 100)} %` : topic.id === 'bluff' ? `${f(bluffFolds(1, size.fraction) * 100)} %` : `${f(valuePerBluff(1, size.fraction))} / 1`}</td></tr>)}</tbody></table></div>}
        {topic.id === 'outs' && <><div className="math-table-scroll"><table><thead><tr><th>Tirage</th><th>Outs</th><th>Repères du cours · 1 / 2 cartes</th><th>Exact 1 / 2 cartes</th></tr></thead><tbody>{DRAW_TYPES.map(draw => <tr key={draw.outs}><td>{draw.label}</td><td>{draw.outs}</td><td>{draw.oneStreet} % / {draw.twoStreets} %</td><td>{f(hitProbability(draw.outs, 1) * 100)} % / {f(hitProbability(draw.outs, 2) * 100)} %</td></tr>)}</tbody></table></div><p className="text-xs text-muted mt-3">Calcul exact depuis le flop : 47 cartes inconnues. Un flush draw + gutshot donne généralement 12 outs ; un flush draw + OESD, 15. Le repère du cours pour 15 outs est 30 % sur une carte et 54 % sur deux cartes.</p></>}
        {topic.id === 'implied' && <div className="text-sm leading-relaxed"><p>Exemple : pot 10 bb, vilain mise 7,5 bb, flush draw de 9 outs au flop.</p><p className="text-muted mt-2">1. Cote du tirage : (47 − 9) ÷ 9 ≈ 4,22.</p><p className="text-muted mt-2">2. Cote du pot : (10 + 7,5) ÷ 7,5 ≈ 2,33.</p><p className="text-signal mt-2">3. Gain supplémentaire : (4,22 − 2,33) × 7,5 ≈ 14,2 bb.</p><p className="text-muted mt-2">Si la différence est négative ou nulle, aucun gain futur supplémentaire n’est nécessaire dans ce modèle.</p></div>}
        {topic.id === 'call' && <p className="text-xs text-muted mt-3">« Call / (pot + call) » fonctionne si « pot » désigne le pot déjà augmenté de la mise adverse. Ici, on affiche toujours le pot AVANT la mise pour éviter toute ambiguïté.</p>}
        {topic.id === 'ratio' && <p className="text-xs text-muted mt-3">Demi-pot : 3 values pour 1 bluff = 25 % de bluffs parmi nos mises, pas 25 % de notre range totale.</p>}
      </div>
    }))} footer={<p className="cbet-footnote">Références : <a href="https://www.pokerstars.com/poker/learn/lesson/calculating-outs/" target="_blank" rel="noreferrer" className="underline">outs et approximations</a> · <a href="https://www.pokerstars.com/poker/learn/strategies/calculating-implied-odds-and-when-it-matters/" target="_blank" rel="noreferrer" className="underline">cotes implicites</a> · <a href="https://blog.gtowizard.com/does-your-range-affect-your-strategy/" target="_blank" rel="noreferrer" className="underline">équilibre river</a>.</p>}/>;
}

type Session = { question: MathQuestion; attempts: MathAttempt[]; answer: MathAttempt | null; startedAt: number; done: boolean; filter: MathFilter; length: number };
export function MathDrillView() {
  const progress = useAppStore(state => state.config.mathDrill) ?? emptyMathProgress();
  const record = useAppStore(state => state.recordMathAttempt);
  const [filter, setFilter] = useState<MathFilter>('call');
  const length = useDrillLength(filter === 'mixed' ? 20 : 10);
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLElement>(null);
  const activeId = session?.question.id;
  const done = session?.done;
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); if (activeId && !done) inputRef.current?.focus({ preventScroll: true }); }, [activeId, done]);
  const clearAnswer = () => { setInput(''); setError(''); locked.current = false; };
  const start = (target = filter) => {
    const count = length.getCount(target === 'mixed' ? 20 : 10);
    if (count === null) return;
    clearAnswer();
    setSession({ question: selectMathQuestion(target, progress, []), attempts: [], answer: null, startedAt: performance.now(), done: false, filter: target, length: count });
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || session.answer || locked.current) return;
    const value = parseMathAnswer(input);
    if (value === null) { setError('Entre un nombre positif, avec une virgule ou un point si nécessaire.'); return; }
    locked.current = true;
    const attempt: MathAttempt = { id: crypto.randomUUID(), questionId: session.question.id, topic: session.question.topic, answer: value,
      correct: checkMathAnswer(session.question, value), responseTimeMs: Math.round(performance.now() - session.startedAt), createdAt: new Date().toISOString() };
    record(attempt); setSession({ ...session, answer: attempt, attempts: [...session.attempts, attempt] }); setError('');
    requestAnimationFrame(() => { if (window.matchMedia('(max-width: 1150px)').matches) feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  };
  const next = () => {
    if (!session?.answer) return;
    if (session.attempts.length >= session.length) { setSession({ ...session, done: true }); return; }
    clearAnswer(); setSession({ ...session, question: selectMathQuestion(session.filter, progress, session.attempts), answer: null, startedAt: performance.now() });
  };
  const selected = MATH_TOPICS.find(topic => topic.id === filter);
  const question = session?.question;
  const score = session?.attempts.filter(attempt => attempt.correct).length ?? 0;
  const weak = MATH_TOPICS.map(topic => ({ ...topic, wrong: session?.attempts.filter(attempt => attempt.topic === topic.id && !attempt.correct).length ?? 0 })).filter(topic => topic.wrong > 0).sort((a, b) => b.wrong - a.wrong);
  return <div ref={scroller} className={`cbet-scroll drill-math ${session ? session.done ? 'is-summary' : 'is-playing' : 'is-setup'}`}><div className="cbet-workspace">
    <header className="cbet-heading"><div><span className="eyebrow text-signal">MATHS / LES FONDAMENTAUX DU POKER</span><h1>Moins d’hésitation.<br className="sm:hidden"/> Plus de repères.</h1><p>Calcule, vérifie et comprends ce que le résultat signifie.</p></div><span className="cbet-spot"><Icon name="chart"/>Maths</span></header>
    {!session ? <>
      <div className="math-topic-grid" role="group" aria-label="Choisir un thème de maths">{MATH_TOPICS.map((topic, index) => <button key={topic.id} aria-pressed={filter === topic.id} className={`math-topic ${filter === topic.id ? 'is-selected' : ''}`} onClick={() => setFilter(topic.id)}><span>0{index + 1}</span><strong>{topic.title}</strong><p>{topic.description}</p></button>)}<button className={`math-topic ${filter === 'mixed' ? 'is-selected' : ''}`} aria-pressed={filter === 'mixed'} onClick={() => setFilter('mixed')}><span>↗</span><strong>Mode mixte</strong><p>Les cinq thèmes, avec un retour sur tes erreurs.</p></button></div>
      <div className="cbet-setup-grid mt-6"><section className="cbet-panel"><span className="section-label text-signal">{filter === 'mixed' ? 'CONSOLIDER' : 'APPRENDRE UN REPÈRE'}</span><h2>{selected?.title ?? 'Mélange les situations.'}</h2><p className="text-muted text-sm leading-relaxed mt-3">{selected?.rule ?? 'Des calculs qui alternent les cinq thèmes. Les thèmes ratés reviennent sur un autre exemple pendant la session.'}</p><DrillLengthField input={length.input} onChange={length.setInput} valid={length.count !== null} label="Nombre de calculs"/><div className="cbet-start"><Button variant="primary" onClick={() => start()} disabled={length.count === null}>Lancer {length.count ?? "…"} calcul{length.count === 1 ? "" : "s"} →</Button><span>Réponse libre · Correction détaillée · Sans limite de temps</span></div></section><MathStats progress={progress}/></div><MathMemo/>
    </> : session.done ? <section className="cbet-panel cbet-summary"><span className="section-label text-signal">SESSION TERMINÉE</span><h2>{score} / {session.length}<span> calculs justes</span></h2><p className="text-muted mt-3">{weak.length ? 'Les repères à retravailler :' : 'Tous les calculs sont justes. Passe au mode mixte pour varier les situations.'}</p><div className="math-summary-topics">{weak.map(topic => <Button key={topic.id} onClick={() => { setFilter(topic.id); start(topic.id); }}>{topic.title} · {topic.wrong} erreur{topic.wrong > 1 ? 's' : ''} →</Button>)}</div><MathStats progress={progress}/><div className="flex flex-wrap gap-3 mt-6"><Button variant="primary" onClick={() => start(session.filter)}>Recommencer →</Button><Button onClick={() => setSession(null)}>Thèmes et fiches mémo</Button></div></section> : question && <>
      <div className="cbet-session-top"><span>{MATH_TOPICS.find(topic => topic.id === question.topic)?.title} <span className="text-muted">/ Calcul {session.attempts.length + (session.answer ? 0 : 1)} sur {session.length}</span></span><span className="text-signal">{score} justes</span><Button size="sm" onClick={() => setSession(null)}>Quitter la session</Button></div>
      <div className="cbet-session-track" role="progressbar" aria-label="Avancement des calculs" aria-valuenow={session.attempts.length} aria-valuemin={0} aria-valuemax={session.length}><span style={{ width: `${session.attempts.length / session.length * 100}%` }}/></div>
      <div className="cbet-play-grid"><section className="cbet-panel math-question"><span className="section-label">À TOI DE CALCULER</span><div className="math-facts">{question.facts.map(fact => <div key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}</div><p className="text-sm text-muted leading-relaxed mb-5">{question.context}</p><h2>{question.prompt}</h2>
        <form onSubmit={submit} className="math-answer-form"><label htmlFor="math-answer">Ta réponse <span className="text-muted font-normal">{question.unit === '%' ? '(en %)' : question.unit === 'bb' ? '(en bb)' : '(combos de value)'}</span></label><div className="math-answer-row"><input ref={inputRef} id="math-answer" type="text" inputMode="decimal" autoComplete="off" value={input} disabled={Boolean(session.answer)} onChange={event => setInput(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'math-answer-error' : 'math-rounding'} placeholder={question.unit === '%' ? 'Ex. 25' : 'Ex. 14,2'}/><span>{question.unit === 'values' ? 'combos' : question.unit}</span></div><p id="math-rounding" className="text-xs text-muted">{question.unit === '%' ? question.topic === 'outs' ? 'Utilise le repère du cours pour le nombre d’outs et l’horizon demandés.' : 'Tu peux arrondir au pourcentage entier le plus proche.' : 'Arrondis au dixième si nécessaire.'}</p>{error && <p id="math-answer-error" role="alert" className="text-red text-sm">{error}</p>}<Button type="submit" variant="primary" disabled={Boolean(session.answer)}>Valider ma réponse →</Button></form>
        {!session.answer && <DrillExplanation label="Besoin de la formule ?" text={question.formula}/>}
      </section><aside ref={feedbackRef} className={`cbet-feedback ${session.answer ? 'has-answer' : ''}`} aria-label="Correction du calcul">{session.answer ? <><div role="status"><span className={session.answer.correct ? 'text-green' : 'text-signal'}>{session.answer.correct ? '✓ Correct' : '↗ À revoir'}</span><h3>{f(question.answer)} {question.unit === 'values' ? 'combos de value' : question.unit}</h3><p className="text-sm text-muted">Ta réponse : {f(session.answer.answer)} {question.unit === 'values' ? 'combos' : question.unit}</p></div><div className="cbet-rule"><span>LE CALCUL</span><p className="whitespace-pre-line">{question.calculation}</p></div><DrillExplanation label="Comprendre ce résultat" text={question.lesson}/><Button variant="primary" onClick={next}>{session.attempts.length === session.length ? 'Voir mon bilan' : 'Calcul suivant'} →</Button></> : <><span className="section-label text-signal">LE BON RÉFLEXE</span><h3>Nomme les montants.</h3><p className="text-sm text-muted">Repère le pot avant la mise, ce qui est ajouté et ce qui est demandé. Ne confonds pas équité de call et fréquence de fold.</p><p className="text-sm text-muted">Valide ton calcul pour découvrir la formule appliquée et son interprétation.</p></>}</aside></div>
    </>}
    <footer className="cbet-footnote">Modèles sans rake · Réponses sauvegardées · Quitter ou changer d’onglet interrompt la session.</footer>
  </div></div>;
}
