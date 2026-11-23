import {moveOf,scenarioPaths,sequenceSteps,sourceHands,type TrainingScenario} from './scenario-drill';
import type {RmData} from './types';

interface DecisionProgress { shown:number; correctStreak:number; wrong:number }
export interface ScenarioSchedulerState {
  hands:Record<string,number>;
  values:Record<string,number>;
  branches:Record<string,number>;
  decisions:Record<string,DecisionProgress>;
  scenarios:Record<string,number>;
  recent:string[];
}
const handKey=(scenario:TrainingScenario,hand:string)=>JSON.stringify([scenario.catId,scenario.tabId,scenario.sourceAction,hand]);
const branchKey=(scenario:TrainingScenario,hand:string)=>JSON.stringify([scenario.id,hand,sequenceSteps(scenario).map(moveOf)]);
export function scenarioDecisionKey(scenario:TrainingScenario,hand:string,index:number){
  const steps=sequenceSteps(scenario),expected=moveOf(steps[index]);
  return JSON.stringify([scenario.id,scenario.catId,scenario.tabId,scenario.sourceAction,hand,index,steps.slice(0,index).map(moveOf),expected.action,expected.amount]);
}
function registerDeal(state:ScenarioSchedulerState,scenario:TrainingScenario,hand:string):ScenarioSchedulerState{
  const key=handKey(scenario,hand),branch=branchKey(scenario,hand);
  return {...state,hands:{...state.hands,[key]:(state.hands[key]??0)+1},values:{...state.values,[hand]:(state.values[hand]??0)+1},branches:{...state.branches,[branch]:(state.branches[branch]??0)+1},scenarios:{...state.scenarios,[scenario.id]:(state.scenarios[scenario.id]??0)+1},recent:[...state.recent,hand].slice(-6)};
}
/** Plain JSON so a refresh cannot reset coverage or mastery. */
export function createScenarioScheduler(active:{scenario:TrainingScenario;hand:string}[]=[]):ScenarioSchedulerState{
  let state:ScenarioSchedulerState={hands:{},values:{},branches:{},decisions:{},scenarios:{},recent:[]};
  for(const table of active)state=registerDeal(state,table.scenario,table.hand);
  return state;
}
export function recordScenarioOutcome(state:ScenarioSchedulerState,scenario:TrainingScenario,hand:string,index:number,correct:boolean):ScenarioSchedulerState{
  if(sequenceSteps(scenario)[index]?.actor!==scenario.hero)throw new Error('La progression porte sur une décision de Hero.');
  const key=scenarioDecisionKey(scenario,hand,index),previous=state.decisions[key]??{shown:0,correctStreak:0,wrong:0};
  return {...state,decisions:{...state.decisions,[key]:{shown:previous.shown+1,correctStreak:correct?previous.correctStreak+1:0,wrong:previous.wrong+Number(!correct)}}};
}
function decisionProgress(state:ScenarioSchedulerState,scenario:TrainingScenario,hand:string){
  return sequenceSteps(scenario).flatMap((step,index)=>step.actor===scenario.hero?[state.decisions[scenarioDecisionKey(scenario,hand,index)]]:[]);
}
const mastered=(progress:(DecisionProgress|undefined)[])=>progress.length>0&&progress.every(item=>(item?.correctStreak??0)>=2);
const retry=(progress:(DecisionProgress|undefined)[])=>progress.some(item=>(item?.wrong??0)>0&&(item?.correctStreak??0)<2);
const choose=<T,>(values:T[],random:()=>number)=>values[Math.min(values.length-1,Math.floor(Math.max(0,random())*values.length))];

export function drawSmartScenarioHand(scenarios:TrainingScenario[],data:RmData|null,input:ScenarioSchedulerState,active:{hand:string}[]=[],previousScenarioId?:string,random=Math.random){
  let state=input;
  const pool=scenarios.flatMap(source=>{
    const paths=scenarioPaths(source).map(path=>({...source,steps:path.steps}));
    return sourceHands(data,source).map(hand=>({source,hand,paths,progress:paths.flatMap(path=>decisionProgress(state,path,hand))}));
  });
  if(!pool.length)throw new Error('Aucune main éligible');
  let candidates=pool.filter(item=>!mastered(item.progress));
  if(!candidates.length){
    state={...state,decisions:Object.fromEntries(Object.entries(state.decisions).map(([key,value])=>[key,{...value,correctStreak:0}]))};
    candidates=pool;
  }
  const activeHands=new Set(active.map(table=>table.hand));
  const inactive=candidates.filter(item=>!activeHands.has(item.hand));
  if(inactive.length)candidates=inactive;
  else {
    // A mastered filler is preferable to showing the same hand on two tables.
    const otherHands=pool.filter(item=>!activeHands.has(item.hand));
    if(otherHands.length)candidates=otherHands;
  }
  const fresh=candidates.filter(item=>!state.recent.includes(item.hand));
  if(fresh.length)candidates=fresh;
  const minimum=Math.min(...candidates.map(item=>state.hands[handKey(item.source,item.hand)]??0));
  candidates=candidates.filter(item=>(state.hands[handKey(item.source,item.hand)]??0)===minimum);
  const minValue=Math.min(...candidates.map(item=>state.values[item.hand]??0));
  candidates=candidates.filter(item=>(state.values[item.hand]??0)===minValue);
  const retries=candidates.filter(item=>retry(item.progress));
  if(minimum>0&&retries.length)candidates=retries;
  const minScenario=Math.min(...candidates.map(item=>state.scenarios[item.source.id]??0));
  candidates=candidates.filter(item=>(state.scenarios[item.source.id]??0)===minScenario);
  const different=candidates.filter(item=>item.source.id!==previousScenarioId);
  if(different.length)candidates=different;
  const selected=choose(candidates,random);
  let paths=selected.paths.filter(path=>!mastered(decisionProgress(state,path,selected.hand)));
  if(!paths.length)paths=selected.paths;
  const minBranch=Math.min(...paths.map(path=>state.branches[branchKey(path,selected.hand)]??0));
  paths=paths.filter(path=>(state.branches[branchKey(path,selected.hand)]??0)===minBranch);
  const scenario=choose(paths,random);
  return {scenario,hand:selected.hand,scheduler:registerDeal(state,scenario,selected.hand)};
}
