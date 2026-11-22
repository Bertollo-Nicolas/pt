import { allHands, buildRangeMap, getDecisionActions } from './poker';
import type { RmData } from './types';

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export type ScenarioAction = 'fold' | 'check' | 'limp' | 'call' | 'raise';
export type Decision = 'fold' | 'check' | 'call' | 'raise';
export interface ScenarioMove { actor: Position; action: ScenarioAction; amount: number }
export interface TrainingScenario {
  id: string; name: string; catId: string; tabId: string; sourceAction: string;
  players: number; hero: Position; stack: number; moves: ScenarioMove[]; correct: Decision; explanation?: string;
}
export interface ScenarioAttempt { id: string; scenarioId: string; hand: string; answer: Decision; correct: boolean; date: string }
export interface ScenarioDrillData { scenarios: TrainingScenario[]; attempts: ScenarioAttempt[]; total: number; correct: number }
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

export function simulateScenario(scenario: TrainingScenario) {
  const positions = positionsFor(scenario.players);
  const seats = positions.map(position=>({position, committed:position==='SB'?.5:position==='BB'?1:0, folded:false, lastAction:position==='SB'?'SB 0,5':position==='BB'?'BB 1':'En attente'}));
  let error = '';
  if (!Number.isInteger(scenario.players)||scenario.players<2||scenario.players>6||!positions.includes(scenario.hero)) error='Choisis entre 2 et 6 joueurs et une position Hero présente à la table.';
  if (!Number.isFinite(scenario.stack)||scenario.stack<2||scenario.stack>1000) error='Le tapis de départ doit être compris entre 2 et 1 000 bb.';
  let currentBet=1;
  let lastRaise=1;
  let pending=[...positions];
  for (const [index,move] of scenario.moves.entries()) {
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
  }
  const hero=seats.find(seat=>seat.position===scenario.hero);
  const toCall=round(Math.max(0,currentBet-(hero?.committed??0)));
  if(!error&&(hero?.folded||seats.filter(seat=>!seat.folded).length<2)) error='La situation doit laisser Hero et au moins un adversaire dans le coup.';
  if(!error&&pending[0]!==scenario.hero) error=pending.length?`La prochaine décision appartient à ${pending[0]}, pas à Hero (${scenario.hero}).`:'Le tour de mise est terminé : aucune décision à poser à Hero.';
  const choices: Decision[]=toCall>0?['fold','call','raise']:['check','raise'];
  // No side pots / all-ins in this first preflop trainer.
  if(currentBet+lastRaise>=scenario.stack) choices.splice(choices.indexOf('raise'),1);
  return { seats, pot:round(seats.reduce((sum,seat)=>sum+seat.committed,0)), toCall, currentBet, choices, error };
}

export function defaultMoves(count: number, hero: Position): ScenarioMove[] {
  const positions=positionsFor(count), index=positions.indexOf(hero);
  if(hero==='BB') return positions.slice(0,-1).map(actor=>({actor,action:actor==='SB'?'raise':'fold',amount:actor==='SB'?3:0}));
  return positions.flatMap((actor,i): ScenarioMove[]=>i<index?[{actor,action:'fold',amount:0}]:i===index?[{actor,action:'limp',amount:0}]:i===index+1?[{actor,action:'raise',amount:3}]:[{actor,action:'fold',amount:0}]);
}

export function validateScenario(scenario: TrainingScenario, data: RmData|null) {
  if(!scenario.name.trim()) return 'Donne un nom au scénario.';
  if(scenario.name.length>100) return 'Le nom est limité à 100 caractères.';
  if(scenario.moves.length>12) return 'Limite la séquence à 12 actions.';
  if(!sourceHands(data,scenario).length) return 'La range ou cette action ne contient aucune main disponible.';
  const state=simulateScenario(scenario);
  return state.error||(!state.choices.includes(scenario.correct)?'La bonne réponse doit être une action possible pour Hero.':'');
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
