import { allHands, buildRangeMap, getDecisionActions } from './poker';
import type { RmData } from './types';

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export type ScenarioAction = 'fold' | 'check' | 'limp' | 'call' | 'raise';
export type Decision = 'fold' | 'check' | 'call' | 'raise';
export interface ScenarioMove { actor: Position; action: ScenarioAction; amount: number }
export interface ScenarioOption { id: string; label: string; action: ScenarioAction; amount: number }
export interface ScenarioStep extends ScenarioMove { options?: ScenarioOption[]; correctId?: string; explanation?: string }
export interface TrainingScenario {
  id: string; name: string; catId: string; tabId: string; sourceAction: string;
  players: number; hero: Position; stack: number; moves: ScenarioMove[]; correct?: Decision; explanation?: string; version?: 2; steps?: ScenarioStep[];
}
export interface ScenarioAttempt { id: string; scenarioId: string; hand: string; answer: string; correct: boolean; date: string; step?: number; expected?: string }
export interface ScenarioDrillData { scenarios: TrainingScenario[]; attempts: ScenarioAttempt[]; total: number; correct: number; updatedAt?:number }
export const emptyScenarioData = (): ScenarioDrillData => ({ scenarios: [], attempts: [], total: 0, correct: 0 });
export const ACTION_LABELS: Record<ScenarioAction, string> = { fold:'Fold', check:'Check', limp:'Limp', call:'Call', raise:'Raise' };
export const positionsFor = (count: number): Position[] => count === 2 ? ['SB','BB'] : (['UTG','HJ','CO','BTN','SB','BB'] as Position[]).slice(6-count);
const round = (n: number) => Math.round(n*100)/100;

export function sourceHands(data: RmData | null, scenario: Pick<TrainingScenario,'catId'|'tabId'|'sourceAction'>) {
  const tab = data?.categories[scenario.catId]?.tabs?.[scenario.tabId];
  if (!data || !tab) return [];
  const map = buildRangeMap(tab.rangeList, data.ranges);
  // Exact action name, any positive frequency. Never substring-match limp/call to limp/fold.
  return allHands().map(item=>item.hand).filter(hand=>getDecisionActions(hand,map).some(action=>action.action===scenario.sourceAction&&action.freq>0));
}

export function replayScenario(scenario: TrainingScenario, moves: ScenarioMove[] = []) {
  const positions = positionsFor(scenario.players);
  const seats = positions.map(position=>({position, committed:position==='SB'?.5:position==='BB'?1:0, folded:false, lastAction:position==='SB'?'SB 0,5':position==='BB'?'BB 1':'En attente'}));
  let error = '';
  if (!Number.isInteger(scenario.players)||scenario.players<2||scenario.players>6||!positions.includes(scenario.hero)) error='Choisis entre 2 et 6 joueurs et une position Hero présente à la table.';
  if (!Number.isFinite(scenario.stack)||scenario.stack<2||scenario.stack>1000) error='Le tapis de départ doit être compris entre 2 et 1 000 bb.';
  let currentBet=1;
  let lastRaise=1;
  let pending=[...positions];
  for (const [index,move] of moves.entries()) {
    if (error) break;
    const seat=seats.find(item=>item.position===move.actor);
    const fail=(message:string)=>{error=`Action ${index+1} : ${message}`;};
    if (!seat||seat.folded) {fail('ce joueur ne peut plus agir.');break;}
    if(pending[0]!==move.actor) {fail(`c’est à ${pending[0]??'personne'} de jouer.`);break;}
    pending.shift();
    const toCall=round(currentBet-seat.committed);
    if (move.action==='fold') seat.folded=true;
    else if (move.action==='check') {if(toCall>0) {fail('check impossible face à une mise.');break;}}
    else if (move.action==='limp') {
      if(currentBet!==1||seat.position==='BB'||seat.committed>=1) {fail('limp impossible après une relance ou une contribution déjà à 1 bb.');break;}
      seat.committed=1;
    } else if(move.action==='call') {
      if(toCall<=0) {fail('aucune mise à payer.');break;}
      if(currentBet>=scenario.stack) {fail('les situations à tapis ne sont pas encore prises en charge.');break;}
      seat.committed=currentBet;
    } else if(move.action==='raise') {
      if(!Number.isFinite(move.amount)||move.amount<currentBet+lastRaise||move.amount>=scenario.stack) {fail(`raise total : au moins ${round(currentBet+lastRaise)} bb et inférieur au tapis.`);break;}
      lastRaise=round(move.amount-currentBet);currentBet=move.amount;seat.committed=currentBet;
      const seatIndex=positions.indexOf(move.actor);
      pending=[...positions.slice(seatIndex+1),...positions.slice(0,seatIndex)].filter(position=>!seats.find(item=>item.position===position)!.folded);
    } else {fail('action inconnue.');break;}
    seat.lastAction=ACTION_LABELS[move.action]+(move.action==='raise'?` ${round(move.amount)} bb`:'');
    if(seats.filter(item=>!item.folded).length<=1) pending=[];
  }
  const hero=seats.find(seat=>seat.position===scenario.hero);
  const toCall=round(Math.max(0,currentBet-(hero?.committed??0)));
  const choices: Decision[]=toCall>0?['fold','call','raise']:['check','raise'];
  // No side pots / all-ins in this first preflop trainer.
  if(currentBet+lastRaise>=scenario.stack) choices.splice(choices.indexOf('raise'),1);
  return { seats, pot:round(seats.reduce((sum,seat)=>sum+seat.committed,0)), toCall, currentBet, choices, error, nextActor:pending[0], lastRaise, minRaise:round(currentBet+lastRaise) };
}

// Legacy single-decision replay is retained for migration and existing saved data.
export function simulateScenario(scenario: TrainingScenario) {
  const state=replayScenario(scenario,scenario.moves);
  const hero=state.seats.find(seat=>seat.position===scenario.hero);
  let error=state.error;
  if(!error&&(hero?.folded||state.seats.filter(seat=>!seat.folded).length<2)) error='La situation doit laisser Hero et un adversaire dans le coup.';
  if(!error&&state.nextActor!==scenario.hero) error='La séquence ne donne pas la parole à Hero.';
  return {...state,error};
}

export function defaultMoves(count: number, hero: Position): ScenarioMove[] {
  const positions=positionsFor(count), index=positions.indexOf(hero);
  if(hero==='BB') return positions.slice(0,-1).map(actor=>({actor,action:actor==='SB'?'raise':'fold',amount:actor==='SB'?3:0}));
  return positions.flatMap((actor,i): ScenarioMove[]=>i<index?[{actor,action:'fold',amount:0}]:i===index?[{actor,action:'limp',amount:0}]:i===index+1?[{actor,action:'raise',amount:3}]:[{actor,action:'fold',amount:0}]);
}

export function validateScenario(scenario: TrainingScenario, data: RmData|null) {
  if(!scenario.name.trim()) return 'Donne un nom au scénario.';
  if(scenario.name.length>100) return 'Le nom est limité à 100 caractères.';
  if(scenario.steps) return validateSequence(scenario,data);
  if(scenario.moves.length>12) return 'Limite la séquence à 12 actions.';
  if(!sourceHands(data,scenario).length) return 'La range ou cette action ne contient aucune main disponible.';
  const state=simulateScenario(scenario);
  return state.error||(!state.choices.includes(scenario.correct!)?'La bonne réponse doit être une action possible pour Hero.':'');
}

export function drawScenarioHand(data: RmData|null, scenario: TrainingScenario, previous?: string, random=Math.random) {
  const pool=sourceHands(data,scenario);
  const candidates=pool.length>1?pool.filter(hand=>hand!==previous):pool;
  return candidates.length?candidates[Math.min(candidates.length-1,Math.floor(random()*candidates.length))]:null;
}

export function recordScenarioAttempt(data: ScenarioDrillData, scenario: TrainingScenario, hand: string, answer: Decision, ranges: RmData|null, id: string) {
  if(data.attempts.some(attempt=>attempt.id===id)) return data;
  if(validateScenario(scenario,ranges)||!sourceHands(ranges,scenario).includes(hand)||!simulateScenario(scenario).choices.includes(answer)) throw new Error('Décision invalide');
  const correct=answer===scenario.correct;
  return {...data,total:data.total+1,correct:data.correct+Number(correct),attempts:[...data.attempts,{id,scenarioId:scenario.id,hand,answer,correct,date:new Date().toISOString()}].slice(-200)};
}

export function handCards(hand: string, random=Math.random) {
  const suits=['♠','♥','♦','♣'];const first=Math.min(3,Math.floor(random()*4));
  const second=hand[2]==='s'?first:(first+1+Math.min(2,Math.floor(random()*3)))%4;
  return [{rank:hand[0],suit:suits[first]},{rank:hand[1],suit:suits[second]}];
}

export const moveOf = (step: ScenarioStep): ScenarioMove => {
  const option=step.options?.find(item=>item.id===step.correctId);
  return option?{actor:step.actor,action:option.action,amount:option.amount}:step;
};
export function possibleOptions(scenario: TrainingScenario, prefix: ScenarioMove[] = []): ScenarioOption[] {
  const state=replayScenario(scenario,prefix);
  const actor=state.nextActor??scenario.hero;
  const candidate: ScenarioOption[]=[
    {id:'fold',label:'Fold',action:'fold',amount:0},
    {id:'passive',label:state.toCall===0?'Check':state.currentBet===1&&actor!=='BB'?'Limp':'Call',action:state.toCall===0?'check':state.currentBet===1&&actor!=='BB'?'limp':'call',amount:0},
    {id:'raise',label:state.currentBet>1?'Reraise':'Raise',action:'raise',amount:round(Math.max(state.minRaise,state.currentBet*3))},
  ];
  return candidate.filter(option=>!replayScenario(scenario,[...prefix,{actor,...option}]).error);
}
export function sequenceSteps(scenario: TrainingScenario): ScenarioStep[] {
  if(scenario.steps) return scenario.steps;
  const steps: ScenarioStep[]=[];
  for(const move of scenario.moves) {
    if(move.actor===scenario.hero){
      const options=possibleOptions(scenario,steps.map(moveOf));
      let correct=options.find(option=>option.action===move.action);
      if(!correct){correct={id:'reference',label:ACTION_LABELS[move.action],action:move.action,amount:move.amount};options.push(correct);}
      correct.amount=move.amount;
      steps.push({...move,options,correctId:correct.id});
    } else steps.push({...move});
  }
  const state=replayScenario(scenario,steps.map(moveOf));
  const options=possibleOptions(scenario,steps.map(moveOf));
  let correct=options.find(option=>option.action===(scenario.correct??'fold'));
  if(!correct){correct={id:'reference',label:ACTION_LABELS[scenario.correct??'fold'],action:scenario.correct??'fold',amount:0};options.push(correct);}
  steps.push({actor:scenario.hero,action:correct.action,amount:correct.amount,options,correctId:correct.id,...(scenario.explanation?{explanation:scenario.explanation}:{})});
  // An invalid legacy script remains visible for repair, never silently rewritten.
  if(state.error) return steps;
  return steps;
}
export function migrateScenario(scenario: TrainingScenario): TrainingScenario {
  const {correct: _correct, explanation: _explanation, ...rest}=scenario;
  return {...rest,version:2,moves:[],steps:sequenceSteps(scenario)};
}
export function defaultSequence(scenario: TrainingScenario): ScenarioStep[] {
  return sequenceSteps({...scenario,steps:undefined,moves:defaultMoves(scenario.players,scenario.hero),correct:'fold'});
}
export function stateBeforeStep(scenario: TrainingScenario, index: number) {
  return replayScenario(scenario,sequenceSteps(scenario).slice(0,index).map(moveOf));
}
function validateSequence(scenario: TrainingScenario, data: RmData|null) {
  if(!sourceHands(data,scenario).length) return 'Range ou action source introuvable.';
  const steps=scenario.steps!;
  if(!steps.length||steps.length>20) return 'Prévois entre 1 et 20 étapes.';
  if(steps.at(-1)?.actor!==scenario.hero) return 'La dernière étape doit être une décision de Hero.';
  const prefix: ScenarioMove[]=[];
  for(const [index,step] of steps.entries()){
    const state=replayScenario(scenario,prefix);
    if(state.error) return `Étape ${index+1} : ${state.error}`;
    if(state.nextActor!==step.actor) return `Étape ${index+1} : la parole est à ${state.nextActor??'personne'}.`;
    if(step.actor===scenario.hero){
      const options=step.options??[];
      if(options.length<2||options.length>6) return `Étape ${index+1} : configure entre 2 et 6 boutons.`;
      if(new Set(options.map(option=>option.id)).size!==options.length) return `Étape ${index+1} : identifiants de boutons dupliqués.`;
      if(new Set(options.map(option=>option.label.trim().toLowerCase())).size!==options.length) return `Étape ${index+1} : donne des libellés distincts aux boutons.`;
      if(new Set(options.map(option=>`${option.action==='limp'?'call':option.action}:${option.action==='raise'?option.amount:0}`)).size!==options.length) return `Étape ${index+1} : deux boutons correspondent à la même action.`;
      if(!options.some(option=>option.id===step.correctId)) return `Étape ${index+1} : sélectionne la bonne réponse parmi les boutons.`;
      for(const option of options){
        if(!option.label.trim()||option.label.length>32) return `Étape ${index+1} : libellé de bouton requis (32 caractères max).`;
        const result=replayScenario(scenario,[...prefix,{actor:step.actor,action:option.action,amount:option.amount}]);
        if(result.error) return `Étape ${index+1}, bouton « ${option.label} » : ${result.error}`;
      }
    }
    const result=replayScenario(scenario,[...prefix,moveOf(step)]);
    if(result.error) return `Étape ${index+1} : ${result.error}`;
    prefix.push(moveOf(step));
  }
  return '';
}
export function recordStepAttempt(data: ScenarioDrillData, scenario: TrainingScenario, hand: string, stepIndex: number, optionId: string, ranges: RmData|null, id: string) {
  if(data.attempts.some(attempt=>attempt.id===id)) return data;
  const step=sequenceSteps(scenario)[stepIndex];
  const option=step?.options?.find(item=>item.id===optionId);
  if(!option||step.actor!==scenario.hero||validateScenario(scenario,ranges)||!sourceHands(ranges,scenario).includes(hand)) throw new Error('Décision invalide');
  const correct=optionId===step.correctId;
  const expected=step.options!.find(item=>item.id===step.correctId)!.label;
  return {...data,total:data.total+1,correct:data.correct+Number(correct),attempts:[...data.attempts,{id,scenarioId:scenario.id,hand,step:stepIndex,answer:option.label,correct,date:new Date().toISOString(),expected}].slice(-200)};
}
