const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {VALUE_CASES,VALUE_RULES}=require('../lib/value-drill/dataset.ts');
const {VALUE_ACTIONS,VALUE_FAMILIES}=require('../lib/value-drill/types.ts');
const {emptyValueProgress,recordValueAttempt,selectValueCase}=require('../lib/value-drill/engine.ts');
assert.equal(VALUE_RULES.length,29);assert.equal(VALUE_CASES.length,40);
assert.equal(new Set(VALUE_CASES.map(item=>item.id)).size,VALUE_CASES.length);
for(const scenario of VALUE_CASES){
  assert.equal(scenario.hero.length,2);
  const allCards=[...scenario.hero,...scenario.steps.at(-1).board];
  assert.equal(new Set(allCards).size,allCards.length,`Duplicate cards: ${scenario.id}`);
  assert.ok(allCards.every(card=>/^[2-9TJQKA][SHDC]$/.test(card)));
  for(const [index,step] of scenario.steps.entries()){
    assert.equal(step.board.length,{Flop:3,Turn:4,River:5}[step.street]);
    assert.ok(step.expected.length>0);
    assert.ok(step.expected.every(action=>VALUE_ACTIONS.some(item=>item.id===action)));
    if(index)assert.deepEqual(step.board.slice(0,-1),scenario.steps[index-1].board,'Runout must reveal one card at a time');
  }
  if(scenario.family!=='adaptations')assert.equal(scenario.steps.length,3);
}
const line=id=>VALUE_RULES.find(item=>item.id===id).line;
assert.deepEqual(line('hc-top'),[['POT'],['OVERBET'],['SHOVE']],'User correction: high connected is pot, overbet, shove');
assert.deepEqual(line('ph-top'),[['B80'],['B80'],['B80','SHOVE']]);
assert.deepEqual(line('pl-top'),[['B80'],['B80'],['B80','SHOVE']]);
assert.deepEqual(line('hc-pair'),[['B50'],['B33','B50'],['CHECK']]);
assert.deepEqual(line('ad-mid'),[['B50'],['B50'],['CHECK','B33']]);
assert.deepEqual(line('aw-good'),[['B80'],['POT'],['B33','SHOVE']]);
assert.deepEqual(line('ad-topset'),[['B50'],['POT'],['SHOVE']]);
assert.deepEqual(line('aw-topset'),[['B80'],['OVERBET'],['SHOVE']]);
assert.deepEqual(line('pl-mid'),[['B33'],['CHECK'],['CHECK']]);
assert.ok(VALUE_CASES.filter(item=>item.ruleId==='hc-mid').every(item=>item.hero.some(card=>'QJT9'.includes(card[0]))));
assert.ok(VALUE_CASES.filter(item=>item.ruleId==='pl-over').every(item=>'AKQJT'.includes(item.hero[0][0])));
assert.deepEqual(VALUE_CASES.find(item=>item.id==='adapt-four-straight').steps[0].expected,['B75']);
assert.deepEqual(VALUE_CASES.find(item=>item.id==='adapt-board-straight').steps[0].expected,['OVERBET']);
assert.ok(VALUE_CASES.filter(item=>item.ruleId==='flush').every(item=>item.steps[0].expected.includes('REDUCE')));
for(const rule of VALUE_RULES)assert.ok(VALUE_CASES.some(item=>item.ruleId===rule.id),`Uncovered course line ${rule.id}`);

let progress=emptyValueProgress();
const attempt=(scenario,step,answer,id)=>({id,caseId:scenario.id,step,answer,correct:scenario.steps[step].expected.includes(answer),responseTimeMs:900,createdAt:'2026-10-22T10:00:00Z'});
for(const scenario of VALUE_CASES)for(let step=0;step<scenario.steps.length;step++)for(const answer of scenario.steps[step].expected){
 const event=attempt(scenario,step,answer,`${scenario.id}-${step}-${answer}`);
 const next=recordValueAttempt(progress,event);assert.equal(next.correct,progress.correct+1);assert.equal(recordValueAttempt(next,event),next);progress=next;
}
const first=VALUE_CASES[0];
assert.throws(()=>recordValueAttempt(progress,{...attempt(first,0,'B80','bad'),correct:false}));
assert.throws(()=>recordValueAttempt(progress,{...attempt(first,0,'B80','badstep'),step:3}));
assert.throws(()=>recordValueAttempt(progress,{...attempt(first,0,'CHECK','badaction'),answer:'BOGUS'}));
progress=recordValueAttempt(progress,attempt(first,0,'CHECK','wrong'));assert.equal(progress.streak,0);
const previous=progress.attempts;
for(let i=0;i<210;i++)progress=recordValueAttempt(progress,attempt(first,0,'B80',`extra-${i}`));
assert.equal(progress.recent.length,200);assert.equal(progress.attempts,previous+210);
assert.deepEqual(JSON.parse(JSON.stringify(progress)),progress);
assert.ok(progress.streets.Flop.attempts&&progress.streets.Turn.attempts&&progress.streets.River.attempts);
const seen=[];
for(let i=0;i<6;i++){const scenario=selectValueCase('mixed',emptyValueProgress(),seen,[],()=>.5);assert.ok(!seen.includes(scenario.id));seen.push(scenario.id);}
assert.equal(new Set(seen.map(id=>VALUE_CASES.find(item=>item.id===id).family)).size,6,'Coverage before repetition');
const error=attempt(first,0,'CHECK','error');
const related=selectValueCase('mixed',emptyValueProgress(),[first.id,VALUE_CASES[6].id],[error],()=>.3);
assert.equal(related.family,first.family);assert.notEqual(related.id,first.id);
for(const family of VALUE_FAMILIES)assert.equal(selectValueCase(family.id,progress,[],[],()=>.5).family,family.id);
const small=[];for(let i=0;i<20;i++){const scenario=selectValueCase('paired_low',progress,small,[],()=>.2);assert.ok(!small.slice(-2).includes(scenario.id));small.push(scenario.id);}
console.log('Value drill: 29 course lines, 40 legal examples, street progression, alternatives, adaptations, persistence and selection passed.');
