import { VALUE_CASES } from './dataset';
import type { ValueAttempt,ValueCase,ValueFilter,ValueProgress } from './types';
import { VALUE_ACTIONS } from './types';

export function emptyValueProgress(): ValueProgress { return {attempts:0,correct:0,streak:0,bestStreak:0,families:{},streets:{},recent:[]}; }
export function valueCase(id: string) { const scenario=VALUE_CASES.find(item=>item.id===id); if(!scenario) throw new Error('Situation inconnue'); return scenario; }
export function recordValueAttempt(progress: ValueProgress, attempt: ValueAttempt): ValueProgress {
  if(progress.recent.some(item=>item.id===attempt.id)) return progress;
  const scenario=valueCase(attempt.caseId);
  const step=scenario.steps[attempt.step];
  if(!Number.isInteger(attempt.step) || !step || !VALUE_ACTIONS.some(item=>item.id===attempt.answer) || attempt.correct!==step.expected.includes(attempt.answer)) throw new Error('Réponse incohérente');
  const family=progress.families[scenario.family] ?? {attempts:0,correct:0};
  const street=progress.streets[step.street] ?? {attempts:0,correct:0};
  const streak=attempt.correct ? progress.streak+1 : 0;
  return {attempts:progress.attempts+1,correct:progress.correct+Number(attempt.correct),streak,bestStreak:Math.max(progress.bestStreak,streak),
    families:{...progress.families,[scenario.family]:{attempts:family.attempts+1,correct:family.correct+Number(attempt.correct)}},
    streets:{...progress.streets,[step.street]:{attempts:street.attempts+1,correct:street.correct+Number(attempt.correct)}},recent:[...progress.recent,attempt].slice(-200)};
}
export function selectValueCase(filter: ValueFilter,progress: ValueProgress,seen: string[],attempts: ValueAttempt[],random=Math.random): ValueCase {
  const pool=VALUE_CASES.filter(item=>filter==='mixed'||item.family===filter);
  const unseen=pool.filter(item=>!seen.includes(item.id));
  let candidates=unseen.length?unseen:pool.filter(item=>!seen.slice(-2).includes(item.id));
  if(!candidates.length)candidates=pool;
  const error=[...attempts].reverse().find(item=>!item.correct);
  if(seen.length%3===2 && error) {
    const target=valueCase(error.caseId);
    const related=candidates.filter(item=>item.family===target.family && item.id!==target.id);
    if(related.length)candidates=related;
  } else if(filter==='mixed') {
    const count=(item: ValueCase)=>seen.filter(id=>valueCase(id).family===item.family).length;
    const min=Math.min(...candidates.map(count)); candidates=candidates.filter(item=>count(item)===min);
  }
  const weights=candidates.map(item=>1/(1+progress.recent.filter(attempt=>attempt.caseId===item.id&&attempt.correct).length));
  let cursor=Math.max(0,Math.min(.999999,random()))*weights.reduce((sum,item)=>sum+item,0);
  for(let i=0;i<candidates.length;i++){cursor-=weights[i];if(cursor<0)return candidates[i];}
  return candidates[candidates.length-1];
}
