export type MathTopic = 'call' | 'outs' | 'bluff' | 'ratio' | 'implied';
export type MathFilter = MathTopic | 'mixed';
export interface MathQuestion {
  id: string;
  topic: MathTopic;
  prompt: string;
  context: string;
  facts: { label: string; value: string }[];
  answer: number;
  unit: '%' | 'bb' | 'values';
  tolerance: number;
  formula: string;
  calculation: string;
  lesson: string;
}
export interface MathAttempt { id: string; questionId: string; topic: MathTopic; answer: number; correct: boolean; responseTimeMs: number; createdAt: string }
export interface MathStats { attempts: number; correct: number }
export interface MathProgress extends MathStats {
  streak: number; bestStreak: number; totalTimeMs: number;
  topics: Partial<Record<MathTopic, MathStats>>;
  recent: MathAttempt[];
}
export const MATH_TOPICS: { id: MathTopic; title: string; description: string; formula: string; rule: string }[] = [
  { id: 'call', title: 'Cote de call', description: 'Le prix à payer pour rester dans le coup.', formula: 'Call ÷ (pot avant la mise + mise adverse + call)', rule: 'Le pot doit inclure la mise adverse. Avec une mise de demi-pot, il faut 25 % d’équité.' },
  { id: 'outs', title: 'Outs et probabilités', description: 'Transformer tes outs en chances de toucher.', formula: '≈ outs × 2 sur une carte ; ≈ outs × 4 sur deux cartes', rule: 'Ce sont des approximations. Deux cartes supposent de voir turn ET river sans nouveau paiement. Les outs doivent être propres et sans doublons.' },
  { id: 'bluff', title: 'Rentabilité d’un bluff', description: 'Combien de folds faut-il pour rentrer dans ses frais ?', formula: 'Mise ÷ (pot avant la mise + mise)', rule: 'Bluff pur, sans équité ni investissement futur : le seuil est une fréquence de fold, pas une équité de call.' },
  { id: 'ratio', title: 'Ratio value / bluff', description: 'Construire une mise polarisée à la river.', formula: 'Value par bluff = (pot avant la mise + mise) ÷ mise', rule: 'Modèle river polarisé : la value gagne toujours, les bluffs perdent toujours si payés. ½ pot → 3 values pour 1 bluff, soit 25 % de bluffs parmi les mises.' },
  { id: 'implied', title: 'Cote implicite', description: 'Ce qu’il reste à gagner après avoir touché.', formula: 'Gain supplémentaire = max(0, call ÷ probabilité − pot final après call)', rule: 'Modèle sur la prochaine carte : outs propres, aucun paiement supplémentaire si tu rates, et gain futur estimé chez vilain lorsque tu touches. Ce gain n’est jamais garanti.' },
];
export const BET_SIZES = [
  { label: 'Pot', fraction: 1 }, { label: '¾ pot', fraction: 3 / 4 },
  { label: '⅔ pot', fraction: 2 / 3 }, { label: '½ pot', fraction: 1 / 2 },
  { label: '⅓ pot', fraction: 1 / 3 }, { label: '¼ pot', fraction: 1 / 4 },
];
export const DRAW_TYPES = [
  { label: 'Flush draw + 2 overcards', outs: 15, note: 'Suppose les 6 outs d’overcards gagnants et distincts des 9 outs couleur.' },
  { label: 'Flush draw + gutshot', outs: 12, note: '9 + 4 − 1 out commun = 12. Un flush draw + OESD donne généralement 15 outs, pas 12.' },
  { label: 'Flush draw', outs: 9, note: 'Suppose les 9 cartes de couleur gagnantes.' },
  { label: 'OESD', outs: 8, note: 'Tirage quinte ouvert aux deux extrémités.' },
  { label: '2 overcards', outs: 6, note: 'Suppose qu’une paire suffit pour gagner.' },
  { label: 'Gutshot', outs: 4, note: 'Un seul rang permet de compléter la quinte.' },
];
export function formatMath(value: number, digits = 1) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}
export function callEquity(potBeforeBet: number, bet: number) { return bet / (potBeforeBet + 2 * bet); }
export function bluffFolds(potBeforeBet: number, bet: number) { return bet / (potBeforeBet + bet); }
export function valuePerBluff(potBeforeBet: number, bet: number) { return (potBeforeBet + bet) / bet; }
export function hitProbability(outs: number, cards: 1 | 2, unseen = 47) {
  if (!Number.isInteger(outs) || outs < 0 || outs > unseen || unseen < cards) throw new Error('Outs invalides');
  return cards === 1 ? outs / unseen : 1 - (unseen - outs) / unseen * (unseen - outs - 1) / (unseen - 1);
}
export function impliedGain(potBeforeBet: number, call: number, probability: number) {
  if (probability <= 0 || probability > 1) throw new Error('Probabilité invalide');
  return Math.max(0, call / probability - (potBeforeBet + 2 * call));
}
export function emptyMathProgress(): MathProgress { return { attempts: 0, correct: 0, streak: 0, bestStreak: 0, totalTimeMs: 0, topics: {}, recent: [] }; }
export function parseMathAnswer(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
export function checkMathAnswer(question: MathQuestion, answer: number) { return Number.isFinite(answer) && Math.abs(answer - question.answer) <= question.tolerance + 1e-9; }
export function recordMathAttempt(progress: MathProgress, attempt: MathAttempt): MathProgress {
  if (progress.recent.some(item => item.id === attempt.id)) return progress;
  const question = MATH_QUESTIONS.find(item => item.id === attempt.questionId);
  if (!question || question.topic !== attempt.topic || !Number.isFinite(attempt.answer) || attempt.correct !== checkMathAnswer(question, attempt.answer)) throw new Error('Réponse de maths incohérente');
  const previous = progress.topics[attempt.topic] ?? { attempts: 0, correct: 0 };
  const streak = attempt.correct ? progress.streak + 1 : 0;
  return { attempts: progress.attempts + 1, correct: progress.correct + Number(attempt.correct), streak,
    bestStreak: Math.max(progress.bestStreak, streak), totalTimeMs: progress.totalTimeMs + Math.max(0, attempt.responseTimeMs),
    topics: { ...progress.topics, [attempt.topic]: { attempts: previous.attempts + 1, correct: previous.correct + Number(attempt.correct) } },
    recent: [...progress.recent, attempt].slice(-200) };
}
export function buildMathQuestions(): MathQuestion[] {
  const questions: MathQuestion[] = [];
  for (const pot of [6, 10, 12, 20, 30]) for (const size of BET_SIZES) {
    const bet = pot * size.fraction;
    const facts = [{ label: 'Pot avant la mise', value: `${formatMath(pot)} bb` }, { label: 'Mise', value: `${formatMath(bet, 2)} bb · ${size.label}` }];
    questions.push({ id: `call-${pot}-${size.label}`, topic: 'call', context: 'Vilain mise. Tu dois payer la même somme. Modèle sans rake ni mise future.',
      prompt: 'Quelle équité minimale faut-il pour call ?', facts, answer: callEquity(pot, bet) * 100, unit: '%', tolerance: .6,
      formula: MATH_TOPICS[0].formula, calculation: `${formatMath(bet, 2)} ÷ (${formatMath(pot)} + ${formatMath(bet, 2)} + ${formatMath(bet, 2)}) × 100 = ${formatMath(callEquity(pot, bet) * 100)} %`, lesson: MATH_TOPICS[0].rule });
    questions.push({ id: `bluff-${pot}-${size.label}`, topic: 'bluff', context: 'Tu bluffes sans aucune équité si tu es payé. Aucun autre investissement prévu.',
      prompt: 'Quel pourcentage de folds rend ton bluff à l’équilibre ?', facts, answer: bluffFolds(pot, bet) * 100, unit: '%', tolerance: .6,
      formula: MATH_TOPICS[2].formula, calculation: `${formatMath(bet, 2)} ÷ (${formatMath(pot)} + ${formatMath(bet, 2)}) × 100 = ${formatMath(bluffFolds(pot, bet) * 100)} %`, lesson: MATH_TOPICS[2].rule });
  }
  for (const size of BET_SIZES) for (const bluffs of [1, 3, 6]) {
    const answer = valuePerBluff(1, size.fraction) * bluffs;
    questions.push({ id: `ratio-${size.label}-${bluffs}`, topic: 'ratio', context: MATH_TOPICS[3].rule,
      prompt: `Pour ${bluffs} combo${bluffs > 1 ? 's' : ''} de bluff, combien de combos de value faut-il ?`,
      facts: [{ label: 'Mise river', value: size.label }, { label: 'Combos de bluff', value: String(bluffs) }],
      answer, unit: 'values', tolerance: .06, formula: MATH_TOPICS[3].formula,
      calculation: `(${formatMath(1 + size.fraction, 3)} ÷ ${formatMath(size.fraction, 3)}) × ${bluffs} = ${formatMath(answer)} combos de value`, lesson: 'Une proportion de bluffs parmi les mises est différente du ratio bluffs / value. Ce modèle est réservé à la river.' });
  }
  for (const draw of DRAW_TYPES) for (const cards of [1, 2] as const) {
    const exact = hitProbability(draw.outs, cards) * 100;
    const approximate = draw.outs * (cards === 1 ? 2 : 4);
    questions.push({ id: `outs-${draw.outs}-${cards}`, topic: 'outs', context: `${draw.note} ${cards === 2 ? 'Tu vois les deux cartes restantes sans nouveau paiement.' : 'Tu es au flop et tu ne considères que la turn.'}`,
      prompt: `Avec la règle ×${cards === 1 ? 2 : 4}, quelle chance approximative de toucher ?`,
      facts: [{ label: 'Tirage', value: draw.label }, { label: 'Outs propres', value: String(draw.outs) }, { label: 'Cartes à venir', value: String(cards) }],
      answer: approximate, unit: '%', tolerance: .1, formula: MATH_TOPICS[1].formula,
      calculation: `${draw.outs} × ${cards === 1 ? 2 : 4} = ${approximate} % (approximation). Probabilité exacte : ${formatMath(exact)} %.`,
      lesson: 'Toucher un out n’est pas une garantie de gagner si les outs sont sales ou si vilain peut encore te dépasser. La règle ×4 devient moins précise avec beaucoup d’outs.' });
  }
  for (const pot of [6, 10, 20, 30]) for (const fraction of [.5, .75, 1]) for (const outs of [4, 8, 9]) {
    const call = pot * fraction;
    const probability = hitProbability(outs, 1);
    const answer = impliedGain(pot, call, probability);
    questions.push({ id: `implied-${pot}-${fraction}-${outs}`, topic: 'implied', context: 'Flop → turn seulement. Outs propres ; tu abandonnes sans frais si tu rates. Montant supplémentaire à prendre à vilain lorsque tu touches.',
      prompt: 'Combien de bb supplémentaires dois-tu gagner après avoir touché ?',
      facts: [{ label: 'Pot avant la mise', value: `${pot} bb` }, { label: 'À payer', value: `${formatMath(call)} bb` }, { label: 'Outs / cartes inconnues', value: `${outs} / 47` }],
      answer, unit: 'bb', tolerance: .06, formula: MATH_TOPICS[4].formula,
      calculation: `${formatMath(call)} × (47 ÷ ${outs}) − (${pot} + 2 × ${formatMath(call)}) = ${formatMath(answer)} bb supplémentaires.`,
      lesson: 'C’est le gain futur minimal conditionnel à toucher, pas une somme déjà acquise. Ton investissement futur ne compte pas comme un gain pris à vilain.' });
  }
  return questions;
}
export const MATH_QUESTIONS = buildMathQuestions();
export function selectMathQuestion(filter: MathFilter, progress: MathProgress, session: MathAttempt[], random = Math.random): MathQuestion {
  const pool = MATH_QUESTIONS.filter(question => filter === 'mixed' || question.topic === filter);
  const unseen = pool.filter(question => !session.some(attempt => attempt.questionId === question.id));
  let candidates = unseen.length ? unseen : pool.filter(question => !session.slice(-3).some(attempt => attempt.questionId === question.id));
  if (!candidates.length) candidates = pool;
  if (filter === 'mixed') {
    const error = [...session].reverse().find(attempt => !attempt.correct);
    const topics = MATH_TOPICS.map(topic => ({ id: topic.id, count: session.filter(attempt => attempt.topic === topic.id).length }));
    const min = Math.min(...topics.map(topic => topic.count));
    const eligible = session.length % 3 === 2 && error ? [error.topic] : topics.filter(topic => topic.count === min).map(topic => topic.id);
    const related = candidates.filter(question => eligible.includes(question.topic));
    if (related.length) candidates = related;
  }
  const weights = candidates.map(question => 1 / (1 + progress.recent.filter(attempt => attempt.questionId === question.id && attempt.correct).length));
  let cursor = Math.max(0, Math.min(.999999, random())) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index++) { cursor -= weights[index]; if (cursor < 0) return candidates[index]; }
  return candidates[candidates.length - 1];
}
