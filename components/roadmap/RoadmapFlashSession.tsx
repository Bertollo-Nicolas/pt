'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAppStore } from '@/store/appStore';
import { allHands, getDecisionActions, getDominant, getRangeActionDefs, getRangeMixedActionSets } from '@/lib/poker';
import { buildRoadmapFlashHands } from '@/lib/roadmap-flash';
import { hexRgba } from '@/lib/utils';
import type { HandAction, RoadmapFlashAnswer, RoadmapProgressEntry, SelectedTab } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RoadmapHandCards } from '@/components/flash/RoadmapHandCards';

interface AnswerButton { label: string; actions: string[]; color: string; color2?: string }

export function RoadmapFlashSession({ spotKey, selectedTab, progress }: { spotKey: string; selectedTab: SelectedTab; progress: RoadmapProgressEntry }) {
  const { updateRoadmapProgress, finishRoadmapFlash, closeRoadmapFlash, recordError, setMode } = useAppStore();
  const session = progress.flashSession!;
  const [feedback, setFeedback] = useState<RoadmapFlashAnswer | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const buttons = useMemo(() => buildButtons(selectedTab.rangeMap), [selectedTab.rangeMap]);
  const complete = session.index >= session.hands.length;
  const correct = session.answers.filter(answer => answer.outcome === 'correct').length;
  const wrong = session.answers.length - correct;
  const score = session.answers.length ? Math.round(correct / session.answers.length * 100) : 0;
  const currentHand = session.hands[session.index];

  useEffect(() => {
    const pending = session.answers[session.index] ?? null;
    setFeedback(pending);
    setShowCorrection(false);
    if (pending?.outcome !== 'correct') return;
    const timer = window.setTimeout(() => {
      const nextIndex = session.index + 1;
      const finishedSession = { ...session, index: nextIndex };
      if (nextIndex === session.hands.length) finishRoadmapFlash(spotKey, finishedSession, Math.round(session.answers.filter(item => item.outcome === 'correct').length / session.answers.length * 100));
      else updateRoadmapProgress(spotKey, { flashSession: finishedSession });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [session.index, session.answers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (button: AnswerButton) => {
    if (!currentHand || feedback) return;
    const result = evaluate(button, currentHand, selectedTab.rangeMap);
    const entry: RoadmapFlashAnswer = { hand: currentHand, given: button.label, expected: result.expected, outcome: result.outcome };
    const answers = [...session.answers, entry];
    setFeedback(entry);
    if (entry.outcome !== 'correct') recordError(currentHand, button.label, result.expected, spotKey);
    updateRoadmapProgress(spotKey, { flashSession: { ...session, answers } });
  };

  const continueAfterError = () => {
    if (!feedback) return;
    const nextIndex = session.index + 1;
    const finishedSession = { ...session, index: nextIndex };
    if (nextIndex === session.hands.length) finishRoadmapFlash(spotKey, finishedSession, Math.round(session.answers.filter(item => item.outcome === 'correct').length / session.answers.length * 100));
    else updateRoadmapProgress(spotKey, { flashSession: finishedSession });
  };

  const restart = () => updateRoadmapProgress(spotKey, { flashSession: { hands: buildRoadmapFlashHands(selectedTab.rangeMap), index: 0, answers: [], startedAt: new Date().toISOString() } });
  const leave = () => {
    if (complete && score >= 80) closeRoadmapFlash(spotKey, score);
    setMode('roadmap');
  };

  if (complete) return <RoadmapFlashSummary selectedTab={selectedTab} answers={session.answers} score={score} onRestart={restart} onLeave={leave}/>;

  const progressPct = Math.round(session.index / session.hands.length * 100);
  return <div className="flex-1 overflow-y-auto bg-gradient-to-b from-bg3/30 to-bg p-4 sm:p-6">
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-3"><div><div className="section-label text-accent">Validation Roadmap</div><h2 className="text-lg font-bold mt-1">{selectedTab.name}</h2></div><button onClick={leave} className="text-[11px] text-muted hover:text-text">Quitter</button></div>
      <div className="mt-5 rounded-xl border border-border bg-bg2 p-4">
        <div className="flex items-center justify-between text-xs"><span><strong>{session.index + 1}</strong> / {session.hands.length} mains</span><span className={clsx('font-bold', score >= 80 ? 'text-green' : 'text-muted')}>{session.answers.length ? `${score}%` : 'Objectif 80%'}</span></div>
        <div className="h-2 rounded-full bg-bg4 overflow-hidden mt-2"><div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }}/></div>
        <div className="flex justify-center gap-5 mt-3 text-[11px]"><span className="text-green">● {correct} correctes</span><span className="text-red">● {wrong} à revoir</span></div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-bg2 p-5 sm:p-8 text-center shadow-xl">
        <div className="text-[10px] text-muted uppercase tracking-wider">Quelle est l’action ?</div>
        <RoadmapHandCards hand={currentHand}/>
        <div className="flex flex-wrap justify-center gap-2">{buttons.map(button => <button key={button.label} disabled={Boolean(feedback)} onClick={() => answer(button)} className="min-h-11 px-4 rounded-lg border text-xs font-semibold disabled:opacity-45 transition-transform active:scale-95" style={buttonStyle(button)}>{button.label}</button>)}</div>
        {feedback && <div className={clsx('mt-6 rounded-lg border p-3 text-sm', feedback.outcome === 'correct' ? 'border-green/30 bg-green/10 text-green' : feedback.outcome === 'partial' ? 'border-orange/30 bg-orange/10 text-orange' : 'border-red/30 bg-red/10 text-red')}>
          <strong>{feedback.outcome === 'correct' ? 'Correct' : feedback.outcome === 'partial' ? 'Imprécis' : 'Erreur'}</strong>{feedback.outcome !== 'correct' && <div className="text-xs mt-1">Réponse attendue : {feedback.expected}</div>}
          {feedback.outcome !== 'correct' && <div className="flex flex-wrap justify-center gap-2 mt-3"><Button size="sm" onClick={() => setShowCorrection(true)}>Voir dans la range</Button><Button size="sm" variant="primary" onClick={continueAfterError}>J’ai compris →</Button></div>}
        </div>}
      </div>
      <p className="text-[10px] text-muted text-center mt-4">Progression enregistrée automatiquement après chaque réponse.</p>
    </div>
    <Modal open={showCorrection} onClose={() => setShowCorrection(false)} className="!max-w-[720px]"><CorrectionGrid selectedTab={selectedTab} currentHand={currentHand}/></Modal>
  </div>;
}

function RoadmapFlashSummary({ selectedTab, answers, score, onRestart, onLeave }: { selectedTab: SelectedTab; answers: RoadmapFlashAnswer[]; score: number; onRestart: () => void; onLeave: () => void }) {
  const passed = score >= 80;
  const errors = answers.filter(answer => answer.outcome !== 'correct');
  return <div className="flex-1 overflow-y-auto p-4 sm:p-7 bg-gradient-to-b from-bg3/30 to-bg"><div className="max-w-2xl mx-auto">
    <div className={clsx('rounded-2xl border p-6 text-center', passed ? 'border-green/35 bg-green/10' : 'border-orange/35 bg-orange/10')}><div className="text-4xl font-black">{score}%</div><h2 className="text-xl font-bold mt-2">{passed ? 'Flash validé' : 'Range à retravailler'}</h2><p className="text-xs text-muted mt-2">{passed ? 'La Grille est maintenant débloquée.' : `Il faut au moins 80 %. Une nouvelle session complète sera générée.`}</p></div>
    <div className="grid grid-cols-3 gap-2 mt-4 text-center"><Metric label="Mains" value={answers.length}/><Metric label="Correctes" value={answers.length - errors.length} good/><Metric label="À revoir" value={errors.length} warn={errors.length > 0}/></div>
    {errors.length > 0 && <div className="rounded-xl border border-border bg-bg2 mt-4 p-4"><div className="section-label">Heatmap des erreurs</div><ErrorHeatmap selectedTab={selectedTab} answers={answers}/><div className="space-y-2 mt-4">{errors.map(answer => <div key={answer.hand} className="flex items-center gap-3 rounded-lg bg-bg3 p-2.5"><strong className="w-10">{answer.hand}</strong><div className="min-w-0 text-[11px]"><div className="text-red truncate">Ta réponse : {answer.given}</div><div className="text-muted truncate">Attendu : {answer.expected}</div></div></div>)}</div></div>}
    <div className="flex flex-col sm:flex-row gap-2 mt-5"><Button className="flex-1" onClick={onLeave}>{passed ? 'Retour à la Roadmap' : 'Quitter'}</Button>{!passed && <Button variant="primary" className="flex-1" onClick={onRestart}>Recommencer une session complète</Button>}</div>
  </div></div>;
}

function CorrectionGrid({ selectedTab, currentHand }: { selectedTab: SelectedTab; currentHand: string }) { return <div><h3 className="font-bold">Correction · {currentHand}</h3><p className="text-[11px] text-muted mt-1">La main concernée est encadrée.</p><RangeGrid selectedTab={selectedTab} marked={new Set([currentHand])}/></div>; }
function ErrorHeatmap({ selectedTab, answers }: { selectedTab: SelectedTab; answers: RoadmapFlashAnswer[] }) { return <RangeGrid selectedTab={selectedTab} marked={new Set(answers.filter(answer => answer.outcome !== 'correct').map(answer => answer.hand))}/>; }
function RangeGrid({ selectedTab, marked }: { selectedTab: SelectedTab; marked: Set<string> }) { const defs = getRangeActionDefs(selectedTab.rangeMap); return <div className="grid grid-cols-13 gap-px mt-3">{allHands().map(({ hand }) => { const actions = getDecisionActions(hand, selectedTab.rangeMap); const color = defs.find(([name]) => name === actions[0]?.action)?.[1] ?? '#6b7280'; return <div key={hand} title={hand} className="aspect-square rounded-[2px] flex items-center justify-center text-[5px] sm:text-[7px] font-bold text-white" style={{ background: hexRgba(color, actions[0]?.action === 'Fold' ? .18 : .75), outline: marked.has(hand) ? '2px solid #e05555' : undefined, zIndex: marked.has(hand) ? 1 : 0 }}>{hand}</div>; })}</div>; }
function Metric({ label, value, good, warn }: { label: string; value: number; good?: boolean; warn?: boolean }) { return <div className="rounded-xl border border-border bg-bg2 p-3"><div className={clsx('text-xl font-bold', good && 'text-green', warn && 'text-red')}>{value}</div><div className="text-[9px] text-muted uppercase mt-1">{label}</div></div>; }

function buildButtons(rangeMap: Record<string, HandAction[]>): AnswerButton[] { const defs = getRangeActionDefs(rangeMap); const colors = new Map(defs); return [...defs.map(([label, color]) => ({ label, color, actions: [label] })), ...getRangeMixedActionSets(rangeMap).map(actions => ({ label: actions.join(' / '), actions, color: colors.get(actions[0]) ?? '#888', color2: colors.get(actions[1]) }))]; }
function buttonStyle(button: AnswerButton) { return button.actions.length === 1 ? { background: hexRgba(button.color, .22), borderColor: hexRgba(button.color, .55) } : { background: `linear-gradient(135deg,${hexRgba(button.color,.3)} 50%,${hexRgba(button.color2 ?? button.color,.3)} 50%)`, borderColor: hexRgba(button.color,.55) }; }
function evaluate(button: AnswerButton, hand: string, rangeMap: Record<string, HandAction[]>): { outcome: RoadmapFlashAnswer['outcome']; expected: string } { const actions = getDecisionActions(hand, rangeMap); const expected = actions.map(action => `${action.action}${action.freq < 1 ? ` ${Math.round(action.freq * 100)}%` : ''}`).join(' / '); if (button.actions.length > 1) { const actual = new Set(actions.map(action => action.action)); return { outcome: actual.size === button.actions.length && button.actions.every(action => actual.has(action)) ? 'correct' : 'wrong', expected }; } if (actions.length === 1) return { outcome: button.actions[0] === actions[0].action ? 'correct' : 'wrong', expected }; return { outcome: button.actions[0] === getDominant(actions)?.action ? 'partial' : 'wrong', expected }; }
