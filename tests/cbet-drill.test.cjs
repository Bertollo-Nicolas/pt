const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { QUESTIONS } = require('../lib/cbet-drill/dataset.ts');
const { SIZINGS } = require('../lib/cbet-drill/types.ts');
const { classifyBoard, evaluateAnswer, emptyProgress, recordAttempt, selectQuestion, questionWeight, weakestCategories } = require('../lib/cbet-drill/engine.ts');

assert.ok(QUESTIONS.length >= 50);
assert.equal(new Set(QUESTIONS.map(q => q.id)).size, QUESTIONS.length);
assert.equal(new Set(QUESTIONS.map(q => [...q.board.cards].sort().join(''))).size, QUESTIONS.length);
for (const q of QUESTIONS) {
  const classification = classifyBoard(q.board.cards);
  assert.equal(q.spot, 'BTN_VS_BB');
  assert.ok(q.explanation.mentalRule && q.explanation.short && q.explanation.detailed);
  if (q.correctAnswer.frequencyMin !== undefined) {
    assert.ok(q.correctAnswer.frequencyMin <= q.correctAnswer.frequencyMax);
    assert.ok(q.correctAnswer.frequencyMax <= 100);
  }
  if (q.board.texture === 'monotone') assert.equal(classification.suits, 'monotone');
  if (q.board.texture === 'paired') assert.equal(classification.paired, true);
  for (const answer of SIZINGS) assert.equal(evaluateAnswer(q, answer.id).correct, answer.id === q.correctAnswer.sizing);
}
assert.equal(classifyBoard(['AS', '2H', '3D']).connected, true, 'Ace-low connectivity');
assert.equal(classifyBoard(['KS', '7H', '2D']).connected, false);
assert.equal(classifyBoard(['KS', 'KH', '2S']).paired, true);
assert.equal(classifyBoard(['KS', 'KH', '2S']).suits, 'two-tone');
assert.throws(() => classifyBoard(['AS', 'AS', '2H']));
assert.throws(() => classifyBoard(['1S', 'KH', '2H']));

const byBoard = board => QUESTIONS.find(q => q.board.cards.join(' ') === board);
const t62 = classifyBoard(['TS', '6H', '2D']);
assert.deepEqual(new Set(t62.gutshotHands), new Set(['98', '97', '87', '54', '53', '43']));
assert.ok(!t62.gutshotHands.includes('65'), 'A pair with a backdoor is not a gutshot');
for (const cards of [['QS', '8H', '4D'], ['JS', '7H', '4D'], ['JS', '8H', '2D'], ['QS', '6H', '3D']]) {
  assert.equal(classifyBoard(cards).multipleStraightDraws, true, `Rainbow ${cards} must account for straight draws`);
}
for (const cards of [['KS', '7H', '2D'], ['KS', '8H', '3D'], ['QS', '7H', '2D'], ['QS', '7H', '3D']]) {
  assert.equal(classifyBoard(cards).multipleStraightDraws, false, 'Course disconnected examples remain separate');
}
const q84 = classifyBoard(['QS', '8H', '4D']);
for (const hand of ['75', '65', 'T9', 'JT']) assert.ok(q84.gutshotHands.includes(hand));
assert.equal(classifyBoard(['9S', '8H', '2D']).eightOutHands.includes('76'), true);
assert.equal(classifyBoard(['9S', '8H', '2D']).gutshotHands.includes('76'), false, 'Open-ended draws are not counted as gutshots');
const q84Reverse = classifyBoard(['4S', 'QH', '8C']);
assert.deepEqual(new Set(q84Reverse.gutshotHands), new Set(q84.gutshotHands), 'Card order and rainbow suits do not change rank connectivity');
for (const board of ['TS 6H 2D', 'JS 7D 4C', 'JH 8C 2D']) {
  assert.equal(byBoard(board).board.texture, 'drawy');
  assert.equal(byBoard(board).correctAnswer.sizing, 'MEDIUM');
  assert.equal(byBoard(board).correctAnswer.sizingLabel, '50 % du pot');
  assert.equal(byBoard(board).correctAnswer.frequencyMin, undefined, 'Do not invent frequencies for the new heuristic');
}
assert.equal(byBoard('KS 7H 2D').correctAnswer.sizing, 'SMALL');
assert.equal(byBoard('QS 7C 2H').correctAnswer.sizing, 'SMALL');
assert.equal(byBoard('KS QS 8D').correctAnswer.sizing, 'BIG');
for (const board of ['7S 6S 5H', '6H 5H 4C', '7H 6D 5C', '8H 7S 6D']) {
  assert.equal(byBoard(board).correctAnswer.sizing, 'MEDIUM', 'Connected BB nuts must not imply big bets, including rainbow');
}
assert.equal(byBoard('AS KH 4D').correctAnswer.sizing, 'OVERBET');
assert.equal(byBoard('AS JH 6D').correctAnswer.sizing, 'BIG');
assert.equal(byBoard('AS 9H 4D').correctAnswer.sizing, 'SMALL');
assert.equal(byBoard('AS 5H 2D').correctAnswer.sizing, 'SMALL');
assert.equal(byBoard('AH KH 4H').correctAnswer.sizing, 'SMALL', 'Monotone takes priority over ace-high rule');
assert.equal(byBoard('AS AH 7D').correctAnswer.sizing, 'SMALL', 'Paired ace-high override');
assert.equal(byBoard('9S 9H 8S').correctAnswer.sizing, 'MEDIUM');

const q = byBoard('7S 6S 5H');
const attempt = (question, correct, id = 'attempt-1') => ({ id, questionId: question.id, answer: correct ? question.correctAnswer.sizing : 'CHECK', correct, responseTimeMs: 1500, createdAt: '2026-10-08T10:00:00Z' });
let p = recordAttempt(emptyProgress(), q, attempt(q, false));
assert.equal(p.attempts, 1); assert.equal(p.correct, 0); assert.equal(p.categories.extra_drawy.attempts, 1);
assert.equal(p.categories.nuts_advantage.attempts, 1);
assert.equal(p.questions[q.id].correct, 0);
assert.equal(recordAttempt(p, q, attempt(q, false)), p, 'Duplicate events ignored');
assert.throws(() => recordAttempt(p, q, { ...attempt(q, false, 'invalid'), correct: true }));
p = recordAttempt(p, q, attempt(q, true, 'attempt-2'));
p = recordAttempt(p, q, attempt(q, true, 'attempt-3'));
assert.equal(p.streak, 2); assert.equal(p.bestStreak, 2); assert.equal(p.totalTimeMs, 4500);
p = recordAttempt(p, q, attempt(q, false, 'attempt-4'));
assert.equal(p.streak, 0); assert.equal(p.bestStreak, 2);
assert.equal(weakestCategories(p)[0].accuracy, .5);
const serialized = JSON.parse(JSON.stringify(p));
assert.deepEqual(serialized, p, 'Progress survives local/account JSON persistence');
for (let i = 0; i < 250; i++) p = recordAttempt(p, q, attempt(q, true, `extra-${i}`));
assert.equal(p.recent.length, 200); assert.equal(p.attempts, 254, 'Lifetime aggregates survive bounded history');

let adaptive = recordAttempt(emptyProgress(), q, attempt(q, false));
const chosen = selectQuestion(QUESTIONS, adaptive, [q.id, QUESTIONS[0].id], () => .5);
assert.equal(chosen.board.texture, 'extra_drawy', 'A different board in the failed texture returns soon');
assert.notEqual(chosen.id, q.id);
assert.ok(questionWeight(chosen, adaptive, Date.now()) > questionWeight(QUESTIONS[0], adaptive, Date.now()), 'Weak categories receive higher weights');
let seen = [];
for (let i = 0; i < 20; i++) {
  const selected = selectQuestion(QUESTIONS, adaptive, seen, () => (i % 10) / 10);
  assert.ok(!seen.includes(selected.id), 'No exact board repeats when enough unseen boards exist');
  seen.push(selected.id);
}
const beginner = QUESTIONS.filter(q => q.difficulty === 1);
const coverage = [];
for (let i = 0; i < 8; i++) coverage.push(selectQuestion(QUESTIONS, emptyProgress(), coverage, () => 0).id);
assert.equal(new Set(coverage.map(id => QUESTIONS.find(q => q.id === id).board.texture)).size, 5, 'Standard decisions cover all five textures');
seen = [];
for (let i = 0; i < 40; i++) {
  const selected = selectQuestion(beginner, emptyProgress(), seen, () => .4);
  assert.ok(!seen.slice(-3).includes(selected.id), 'Small pools avoid immediate repetition');
  seen.push(selected.id);
}
assert.throws(() => selectQuestion([], emptyProgress(), []));
assert.equal(selectQuestion([q], emptyProgress(), [q.id]).id, q.id, 'A one-board pool cannot deadlock');
console.log(`C-bet drill: ${QUESTIONS.length} boards validated; classification, scoring, persistence and adaptive selection passed.`);
