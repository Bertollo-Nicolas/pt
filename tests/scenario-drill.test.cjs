const assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {sourceHands,simulateScenario,validateScenario,defaultMoves,drawScenarioHand,handCards,emptyScenarioData,recordScenarioAttempt,positionsFor}=require('../lib/scenario-drill.ts');
const ranges={ranges:{lf:{name:'Limp / Fold',color:'#abc'},lc:{name:'Limp / Call',color:'#def'},r:{name:'Raise',color:'#123'}},categories:{a:{name:'SB',tabList:['one'],tabs:{one:{name:'25 bb',rangeList:[{id:'lf',hands:['AKs','88:0.4','55:0']},{id:'lc',hands:['AQs','88:0.6']},{id:'r',hands:['AA']}]}}}}};
const scenario={id:'test',name:'Face au raise',catId:'a',tabId:'one',sourceAction:'Limp / Fold',players:2,hero:'SB',stack:25,moves:defaultMoves(2,'SB'),correct:'fold'};
assert.deepEqual(new Set(sourceHands(ranges,scenario)),new Set(['AKs','88']));
assert.equal(sourceHands(null,scenario).length,0);
assert.equal(sourceHands(ranges,{...scenario,sourceAction:'Limp'}).length,0,'No substring match');
assert.ok(!sourceHands(ranges,scenario).includes('55'),'Zero-frequency action excluded');
const state=simulateScenario(scenario);
assert.equal(state.error,'');assert.equal(state.pot,4);assert.equal(state.toCall,2);
assert.equal(state.seats.find(seat=>seat.position==='SB').committed,1);
assert.equal(state.seats.find(seat=>seat.position==='BB').committed,3);
assert.deepEqual(state.choices,['fold','call','raise','allin']);assert.equal(validateScenario(scenario,ranges),'');
assert.ok(validateScenario({...scenario,correct:'check'},ranges));
for(let count=2;count<=6;count++) for(const hero of positionsFor(count)) {
  const item={...scenario,players:count,hero,moves:defaultMoves(count,hero)};
  assert.equal(simulateScenario(item).error,'',`${count} players / ${hero}`);
  assert.equal(validateScenario(item,ranges),'');
}
const six={...scenario,players:6,moves:defaultMoves(6,'SB')};
assert.equal(simulateScenario(six).seats.filter(seat=>seat.folded).length,4);
assert.equal(simulateScenario(six).pot,4);
assert.ok(simulateScenario({...scenario,moves:[{actor:'BB',action:'raise',amount:3}]}).error,'Wrong turn');
assert.ok(simulateScenario({...scenario,moves:[{actor:'SB',action:'check',amount:0}]}).error,'Cannot check facing a bet');
assert.ok(simulateScenario({...scenario,moves:[{actor:'SB',action:'limp',amount:0},{actor:'BB',action:'raise',amount:1.5}]}).error,'Minimum raise');
assert.ok(simulateScenario({...scenario,moves:[{actor:'SB',action:'limp',amount:0},{actor:'BB',action:'raise',amount:25}]}).error,'All in unsupported');
assert.ok(simulateScenario({...scenario,moves:[{actor:'SB',action:'limp',amount:0},{actor:'BB',action:'check',amount:0}]}).error,'Round is complete');
assert.equal(simulateScenario({...scenario,hero:'BB',moves:[{actor:'SB',action:'limp',amount:0}],correct:'check'}).toCall,0);
assert.deepEqual(simulateScenario({...scenario,hero:'BB',moves:[{actor:'SB',action:'limp',amount:0}],correct:'check'}).choices,['check','raise','allin']);
for(let i=0;i<100;i++)assert.ok(['88','AKs'].includes(drawScenarioHand(ranges,scenario)));
assert.equal(drawScenarioHand(ranges,scenario,'AKs',()=>0),'88');
assert.equal(drawScenarioHand(null,scenario),null);
for(const hand of ['AKs','AKo','88'])for(let i=0;i<20;i++){
  const cards=handCards(hand);assert.equal(cards[0].rank,hand[0]);assert.equal(cards[1].rank,hand[1]);
  assert.equal(cards[0].suit===cards[1].suit,hand.endsWith('s'));
}
let progress=recordScenarioAttempt(emptyScenarioData(),scenario,'AKs','fold',ranges,'one');
assert.equal(progress.total,1);assert.equal(progress.correct,1);
assert.equal(recordScenarioAttempt(progress,scenario,'AKs','call',ranges,'one'),progress);
assert.throws(()=>recordScenarioAttempt(progress,scenario,'AA','fold',ranges,'outside'));
assert.throws(()=>recordScenarioAttempt(progress,scenario,'88','check',ranges,'illegal'));
progress=recordScenarioAttempt(progress,scenario,'88','call',ranges,'two');
assert.equal(progress.correct,1);assert.equal(progress.total,2);
for(let i=0;i<210;i++)progress=recordScenarioAttempt(progress,scenario,'88','fold',ranges,`extra-${i}`);
assert.equal(progress.attempts.length,200);assert.equal(progress.total,212);assert.equal(progress.correct,211);
assert.deepEqual(JSON.parse(JSON.stringify(progress)),progress);
console.log('Scenario drill: exact range/action filtering, mixed hands, HU and 3–6 seats, turn order, betting/pot/stack accounting, legal decisions, cards and persistent results passed.');

const {migrateScenario,sequenceSteps,stateBeforeStep,moveOf,replayScenario,recordStepAttempt,defaultSequence,possibleOptions}=require('../lib/scenario-drill.ts');
const migrated=migrateScenario(scenario);
const fresh={...scenario,moves:[],correct:undefined,version:2,steps:defaultSequence(scenario)};
assert.equal(validateScenario(fresh,ranges),'','New authored default sequence');
assert.equal(migrated.version,2);
assert.equal(migrated.correct,undefined,'No global correct answer in v2');
assert.deepEqual(migrated.moves,[]);
assert.deepEqual(sequenceSteps(migrated).map(step=>step.actor),['SB','BB','SB']);
assert.deepEqual(sequenceSteps(migrated).map(moveOf).map(move=>move.action),['limp','raise','fold']);
assert.equal(validateScenario(migrated,ranges),'');
assert.equal(stateBeforeStep(migrated,0).pot,1.5,'Begin before Hero limps');
assert.equal(stateBeforeStep(migrated,1).pot,2,'First Hero action changes contributions');
assert.equal(stateBeforeStep(migrated,2).pot,4,'Then villain raises');
assert.equal(stateBeforeStep(migrated,2).toCall,2);
for(let count=2;count<=6;count++)for(const hero of positionsFor(count)){
  const item=migrateScenario({...scenario,players:count,hero,moves:defaultMoves(count,hero)});
  assert.equal(validateScenario(item,ranges),'',`Sequential ${count} / ${hero}`);
  assert.equal(item.steps.at(-1).actor,hero);
  assert.ok(item.steps.filter(step=>step.actor===hero).every(step=>step.options.length>=2&&step.correctId));
}
const configurable=structuredClone(migrated);
configurable.steps[0].options.find(option=>option.id===configurable.steps[0].correctId).label='Compléter';
assert.equal(validateScenario(configurable,ranges),'');
let sequential=recordStepAttempt(emptyScenarioData(),configurable,'AKs',0,configurable.steps[0].correctId,ranges,'hand1:0');
assert.equal(sequential.attempts[0].answer,'Compléter');assert.equal(sequential.correct,1);
const wrong=configurable.steps[2].options.find(option=>option.id!==configurable.steps[2].correctId);
sequential=recordStepAttempt(sequential,configurable,'AKs',2,wrong.id,ranges,'hand1:2');
assert.equal(sequential.total,2);assert.equal(sequential.correct,1);assert.equal(sequential.attempts[1].expected,'Fold');
assert.equal(recordStepAttempt(sequential,configurable,'AKs',2,wrong.id,ranges,'hand1:2'),sequential);
assert.throws(()=>recordStepAttempt(sequential,configurable,'AKs',1,'fold',ranges,'villain'),'Opponent action is automatic');
assert.throws(()=>recordStepAttempt(sequential,configurable,'AQs',0,configurable.steps[0].correctId,ranges,'outside-v2'));
const duplicate=structuredClone(configurable);duplicate.steps[0].options[2]={...duplicate.steps[0].options[0],id:'other',label:'Other fold'};
assert.match(validateScenario(duplicate,ranges),/même action/);
const noAnswer=structuredClone(configurable);delete noAnswer.steps[0].correctId;assert.ok(validateScenario(noAnswer,ranges));
const earlyEnd=structuredClone(configurable);earlyEnd.steps.pop();assert.ok(validateScenario(earlyEnd,ranges));
const illegalOption=structuredClone(configurable);illegalOption.steps[0].options[0].action='check';assert.ok(validateScenario(illegalOption,ranges));
// Three Hero decisions with two re-raises, replayed by canonical correct actions.
const extended=structuredClone(migrated);extended.steps=[];extended.stack=50;
const authored=[{actor:'SB',action:'limp',amount:0},{actor:'BB',action:'raise',amount:3},{actor:'SB',action:'raise',amount:9},{actor:'BB',action:'raise',amount:18},{actor:'SB',action:'fold',amount:0}];
for(const move of authored){
  if(move.actor==='SB'){
    const options=possibleOptions(extended,extended.steps.map(moveOf));
    const correct=options.find(option=>option.action===move.action);assert.ok(correct);correct.amount=move.amount;
    extended.steps.push({...move,options,correctId:correct.id});
  }else extended.steps.push(move);
}
assert.equal(validateScenario(extended,ranges),'');assert.equal(stateBeforeStep(extended,4).pot,27);assert.equal(stateBeforeStep(extended,4).toCall,9);
assert.equal(replayScenario(extended,extended.steps.map(moveOf)).nextActor,undefined,'Fold ends the hand');
assert.deepEqual(migrateScenario(migrated),migrated,'Idempotent migration');
assert.deepEqual(JSON.parse(JSON.stringify(configurable)),configurable);
console.log('Sequential scenarios: first action, per-step configurable buttons/correct answers, automatic opponents, canonical continuation, three Hero decisions, migration and per-decision persistence passed.');

// Explicit all-in uses the full initial stack including posted blinds.
const shove={...scenario,stack:15};
let jam=replayScenario(shove,[{actor:'SB',action:'allin',amount:0}]);
assert.equal(jam.error,'');assert.equal(jam.pot,16);assert.equal(jam.nextActor,'BB');assert.equal(jam.seats[0].committed,15);
jam=replayScenario(shove,[{actor:'SB',action:'allin',amount:0},{actor:'BB',action:'call',amount:0}]);
assert.equal(jam.error,'');assert.equal(jam.pot,30);assert.equal(jam.nextActor,undefined);
assert.ok(replayScenario(shove,[{actor:'SB',action:'allin',amount:0},{actor:'BB',action:'call',amount:0},{actor:'SB',action:'check',amount:0}]).error);
assert.ok(replayScenario(shove,[{actor:'SB',action:'allin',amount:0},{actor:'BB',action:'allin',amount:0}]).error,'Use call against an equal-stack shove');
const facing={...shove,hero:'BB'};
assert.deepEqual(possibleOptions(facing,[{actor:'SB',action:'allin',amount:0}]).map(o=>o.action),['fold','call']);
assert.equal(replayScenario({...shove,stack:5},[{actor:'SB',action:'raise',amount:3},{actor:'BB',action:'allin',amount:0},{actor:'SB',action:'call',amount:0}]).pot,10,'Short all-in below min raise');
const multiJam=replayScenario({...shove,players:3},[{actor:'BTN',action:'allin',amount:0},{actor:'SB',action:'call',amount:0},{actor:'BB',action:'call',amount:0}]);
assert.equal(multiJam.error,'');assert.equal(multiJam.pot,45);assert.equal(multiJam.nextActor,undefined);
const jamScenario={...migrated,steps:[{actor:'SB',action:'limp',amount:0,options:possibleOptions(shove),correctId:'passive'},{actor:'BB',action:'allin',amount:0},{actor:'SB',action:'call',amount:0,options:[{id:'f',label:'Fold',action:'fold',amount:0},{id:'c',label:'Call',action:'call',amount:0}],correctId:'c'}],stack:15};
assert.equal(validateScenario(jamScenario,ranges),'');
const jamAttempt=recordStepAttempt(emptyScenarioData(),jamScenario,'AKs',2,'c',ranges,'jam:2');assert.equal(jamAttempt.correct,1);
console.log('All-in: open shove, short raise, call/fold, equal stacks, three-way pot, ended round and scoring passed.');
