import type { Category, DrillAttempt, DrillProgress, DrillQuestion, Mastery, Sizing } from './types';
import { SIZINGS } from './types';
export { classifyBoard } from './board';

export function emptyProgress(): DrillProgress {
  return { attempts: 0, correct: 0, streak: 0, bestStreak: 0, totalTimeMs: 0, categories: {}, questions: {}, recent: [] };
}
export function categoriesOf(question: DrillQuestion): Category[] {
  return [...new Set([question.board.texture, ...question.tags])];
}
export function evaluateAnswer(question: DrillQuestion, answer: Sizing) {
  const correct = answer === question.correctAnswer.sizing;
  const delta = SIZINGS.findIndex(item => item.id === answer) - SIZINGS.findIndex(item => item.id === question.correctAnswer.sizing);
  return { correct, adjustment: correct ? '' : answer === 'CHECK' ? 'Tu checks trop dans le modèle de cet exercice.' : delta > 0 ? 'Ton sizing est trop grand pour le repère de cet exercice.' : 'Ton sizing est trop petit pour le repère de cet exercice.' };
}

export function recordAttempt(progress: DrillProgress, question: DrillQuestion, attempt: DrillAttempt): DrillProgress {
  // Repeated UI events must never count the same decision twice.
  if (progress.recent.some(item => item.id === attempt.id)) return progress;
  if (attempt.questionId !== question.id || attempt.correct !== evaluateAnswer(question, attempt.answer).correct) throw new Error('Réponse incohérente');
  const update = (previous?: Mastery): Mastery => ({
    attempts: (previous?.attempts ?? 0) + 1,
    correct: (previous?.correct ?? 0) + Number(attempt.correct),
    streak: attempt.correct ? (previous?.streak ?? 0) + 1 : 0,
    lastSeenAt: attempt.createdAt,
  });
  const streak = attempt.correct ? progress.streak + 1 : 0;
  const categories = { ...progress.categories };
  for (const category of categoriesOf(question)) categories[category] = update(categories[category]);
  return {
    attempts: progress.attempts + 1, correct: progress.correct + Number(attempt.correct),
    streak, bestStreak: Math.max(streak, progress.bestStreak), totalTimeMs: progress.totalTimeMs + Math.max(0, attempt.responseTimeMs),
    categories, questions: { ...progress.questions, [question.id]: update(progress.questions[question.id]) },
    recent: [...progress.recent, attempt].slice(-200),
  };
}

export function weakestCategories(progress: DrillProgress) {
  return Object.entries(progress.categories)
    .map(([category, stats]) => ({ category: category as Category, ...stats!, accuracy: stats!.correct / stats!.attempts }))
    .filter(item => item.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
}

export function questionWeight(question: DrillQuestion, progress: DrillProgress, now: number): number {
  const stats = progress.questions[question.id];
  const categories = categoriesOf(question).map(category => progress.categories[category]).filter((item): item is Mastery => Boolean(item));
  const errorRate = categories.length ? categories.reduce((sum, item) => sum + 1 - item.correct / item.attempts, 0) / categories.length : 0;
  const unresolvedError = Boolean(stats && stats.streak === 0 && stats.correct < stats.attempts);
  const age = stats ? Math.max(0, now - Date.parse(stats.lastSeenAt)) : Infinity;
  const recency = Math.min(1, age / 86_400_000);
  const lowExposure = 1 / (1 + (stats?.attempts ?? 0));
  return 0.15 + errorRate * 0.5 + recency * 0.3 + lowExposure * 0.2 + (unresolvedError ? 0.3 : 0);
}

export function selectQuestion(pool: DrillQuestion[], progress: DrillProgress, sessionIds: string[], random = Math.random, now = Date.now()): DrillQuestion {
  if (!pool.length) throw new Error('Aucune question disponible');
  // Prefer an unseen board; small beginner pools may cycle, but not immediately.
  const unseen = pool.filter(question => !sessionIds.includes(question.id));
  let candidates = unseen.length ? unseen : pool.filter(question => !sessionIds.slice(-3).includes(question.id));
  if (!candidates.length) candidates = pool;
  // Every third decision targets weaknesses (~30%); the others maintain coverage.
  const adaptive = sessionIds.length % 3 === 2;
  const lastError = [...progress.recent].reverse().find(attempt => !attempt.correct && progress.questions[attempt.questionId]?.streak === 0);
  const errorQuestion = pool.find(question => question.id === lastError?.questionId);
  if (adaptive && errorQuestion) {
    const related = candidates.filter(question => question.id !== errorQuestion.id && question.board.texture === errorQuestion.board.texture);
    if (related.length) candidates = related;
  }
  if (!adaptive) {
    const exposure = (question: DrillQuestion) => sessionIds.filter(id => pool.find(item => item.id === id)?.board.texture === question.board.texture).length;
    const minimum = Math.min(...candidates.map(exposure));
    candidates = candidates.filter(question => exposure(question) === minimum);
  }
  const weights = candidates.map(question => adaptive ? questionWeight(question, progress, now) : 1 / (1 + (progress.questions[question.id]?.attempts ?? 0)));
  let target = Math.max(0, Math.min(0.999999, random())) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index++) {
    target -= weights[index];
    if (target < 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}
