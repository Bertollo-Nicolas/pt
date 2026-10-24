const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {VALUE_CASES,VALUE_RULES}=require('../lib/value-drill/dataset.ts');
const {VALUE_ACTIONS,VALUE_FAMILIES}=require('../lib/value-drill/types.ts');
const {emptyValueProgress,recordValueAttempt,selectValueCase}=require('../lib/value-drill/engine.ts');
assert.equal(VALUE_RULES.length,29);assert.equal(VALUE_CASES.length,50);
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
  if(scenario.family!=='adaptations'&&scenario.ruleId!=='fallback')assert.equal(scenario.steps.length,3);
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
const rank=card=>'23456789TJQKA'.indexOf(card[0]);
for(const scenario of VALUE_CASES.filter(item=>['pl-over','ph-over','lc-over'].includes(item.ruleId))){
  assert.equal(rank(scenario.hero[0]),rank(scenario.hero[1]));
  for(const step of scenario.steps)assert.ok(step.board.every(card=>rank(card)<rank(scenario.hero[0])),`Not an overpair: ${scenario.id} ${step.street}`);
}
const eights=VALUE_CASES.find(item=>item.hero.join(' ')==='8S 8H'&&item.family==='paired_low');
assert.equal(eights.ruleId,'pl-over');
assert.deepEqual(eights.steps.map(step=>step.expected),[['B33'],['B50'],['B33']]);
assert.deepEqual(eights.steps.at(-1).board.map(card=>card[0]),['5','5','2','6','7']);
for(const hero of ['3S 3H','4S 4H','AS 6H','KS 6H'])assert.ok(VALUE_CASES.some(item=>item.ruleId==='pl-mid'&&item.hero.join(' ')===hero));
for(const scenario of VALUE_CASES.filter(item=>['pl-mid','ph-mid'].includes(item.ruleId))){
  const flop=scenario.steps[0].board;
  const paired=flop.find(card=>flop.filter(other=>rank(other)===rank(card)).length===2);
  assert.ok(paired);
  if(rank(scenario.hero[0])===rank(scenario.hero[1]))assert.ok(rank(scenario.hero[0])<rank(paired),'A medium PP must not be an overpair');
  else assert.ok(scenario.hero.some(card=>flop.some(other=>rank(other)===rank(card))),'Unpaired hand must connect with the board');
}
const fallbacks=VALUE_CASES.filter(item=>item.ruleId==='fallback');
assert.equal(fallbacks.length,6);
for(const scenario of fallbacks){assert.equal(scenario.steps.length,1);assert.equal(scenario.steps[0].street,'Flop');assert.deepEqual(scenario.steps[0].expected,['B33']);}
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
console.log('Value drill: 29 course lines, 50 legal examples, overpair classification, flop fallback, street progression, alternatives, adaptations, persistence and selection passed.');
