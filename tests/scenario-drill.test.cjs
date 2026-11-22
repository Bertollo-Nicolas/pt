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
assert.deepEqual(state.choices,['fold','call','raise']);assert.equal(validateScenario(scenario,ranges),'');
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
assert.deepEqual(simulateScenario({...scenario,hero:'BB',moves:[{actor:'SB',action:'limp',amount:0}],correct:'check'}).choices,['check','raise']);
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
