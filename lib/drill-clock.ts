export interface DecisionClock { remainingMs:number; ten:boolean; five:boolean }
export type ClockAlert='ten'|'five';
export function validDecisionSeconds(value:number){return Number.isSafeInteger(value)&&value>=0&&value<=3600;}
export function createDecisionClock(seconds:number):DecisionClock|undefined {
  return validDecisionSeconds(seconds)&&seconds>0?{remainingMs:seconds*1000,ten:false,five:false}:undefined;
}
export function advanceDecisionClock(clock:DecisionClock,elapsedMs:number){
  const remainingMs=Math.max(0,clock.remainingMs-Math.max(0,Number.isFinite(elapsedMs)?elapsedMs:0));
  const next={...clock,remainingMs};let alert:ClockAlert|null=null;
  if(remainingMs===0){next.ten=true;next.five=true;}
  else if(remainingMs<=5000&&!next.five){next.ten=true;next.five=true;alert='five';}
  else if(remainingMs<=10000&&!next.ten){next.ten=true;alert='ten';}
  return {clock:next,alert,expired:remainingMs===0};
}
