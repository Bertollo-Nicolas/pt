const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const math = require('../lib/math-drill.ts');
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
close(math.callEquity(10,5), .25);
close(math.callEquity(10,10), 1/3);
close(math.callEquity(10,7.5), .3);
close(math.callEquity(12,4), .2);
close(math.bluffFolds(10,5), 1/3);
close(math.bluffFolds(10,10), .5);
close(math.valuePerBluff(10,5), 3);
close(math.valuePerBluff(10,10), 2);
close(math.valuePerBluff(10,7.5), 7/3);
close(math.hitProbability(9,1), 9/47);
close(math.hitProbability(9,2), 1 - 38/47 * 37/46);
close(math.hitProbability(15,2) * 100, 54.11655874190564);
close(math.impliedGain(10,7.5,9/47), 85/6);
assert.equal(math.impliedGain(10,1,.5),0, 'Do not request negative future winnings');
assert.throws(() => math.impliedGain(10,5,0));
assert.throws(() => math.hitProbability(48,1));
assert.equal(math.parseMathAnswer('14,2'),14.2);
assert.equal(math.parseMathAnswer(' 33.3 '),33.3);
for(const input of ['', ' ', '25%', 'abc', '-2', '1e3', 'Infinity', '1.2.3']) assert.equal(math.parseMathAnswer(input),null);
const questions = math.MATH_QUESTIONS;
assert.equal(questions.length,126);
assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
for(const q of questions) {
  assert.ok(Number.isFinite(q.answer) && q.answer>=0);
  assert.ok(q.formula && q.calculation && q.lesson);
  assert.ok(math.checkMathAnswer(q,q.answer));
  assert.ok(math.checkMathAnswer(q,Number(q.answer.toFixed(1))));
  assert.equal(math.checkMathAnswer(q,NaN),false);
  assert.equal(math.checkMathAnswer(q,q.answer+2),false);
}
assert.equal(questions.find(q=>q.id==='outs-15-2').answer,54, 'Preserve the user course reference');
assert.ok(math.checkMathAnswer(questions.find(q=>q.id==='outs-15-2'),54));
assert.equal(math.checkMathAnswer(questions.find(q=>q.id==='outs-15-2'),60),false);
for (const [outs,one,two] of [[15,30,54],[12,24,48],[9,18,36],[8,16,32],[6,12,24],[4,8,16]]) {
  assert.equal(questions.find(q=>q.id===`outs-${outs}-1`).answer,one);
  assert.equal(questions.find(q=>q.id===`outs-${outs}-2`).answer,two);
}
assert.equal(questions.find(q=>q.id==='outs-12-2').answer,48);
assert.ok(questions.find(q=>q.id==='implied-10-0.75-9').calculation.includes('14,2'));
let progress = math.emptyMathProgress();
const attempt = (q, correct, id) => ({id,questionId:q.id,topic:q.topic,answer:q.answer+(correct?0:10),correct,responseTimeMs:1200,createdAt:'2026-10-19T10:00:00Z'});
const first = attempt(questions[0],true,'first');
progress = math.recordMathAttempt(progress,first);
assert.equal(math.recordMathAttempt(progress,first),progress);
progress = math.recordMathAttempt(progress,attempt(questions[1],false,'second'));
assert.equal(progress.attempts,2); assert.equal(progress.correct,1); assert.equal(progress.streak,0); assert.equal(progress.bestStreak,1);
assert.throws(()=>math.recordMathAttempt(progress,{...first,id:'bad',correct:false}));
for(let i=0;i<220;i++) progress=math.recordMathAttempt(progress,attempt(questions[0],true,`extra-${i}`));
assert.equal(progress.recent.length,200); assert.equal(progress.attempts,222);
assert.deepEqual(JSON.parse(JSON.stringify(progress)),progress);
const session=[];
for(let i=0;i<20;i++) {
 const q=math.selectMathQuestion('mixed',math.emptyMathProgress(),session,()=>.3);
 assert.ok(!session.some(a=>a.questionId===q.id));
 session.push(attempt(q,true,`mixed-${i}`));
}
assert.equal(new Set(session.map(a=>a.topic)).size,5,'Mixed sessions cover all themes');
const error = attempt(questions.find(q=>q.topic==='implied'),false,'error');
const follow = math.selectMathQuestion('mixed',math.emptyMathProgress(),[error,first],()=>.5);
assert.equal(follow.topic,'implied'); assert.notEqual(follow.id,error.questionId);
assert.equal(math.selectMathQuestion('ratio',progress,[],()=>.5).topic,'ratio');
console.log(`Math drill: ${questions.length} questions, formulas, approximations, validation, persistence and adaptive selection passed.`);
