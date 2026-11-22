import type { TrainingScenario } from './scenario-drill';
export interface LiveTable { id:string; scenario:TrainingScenario; hand:string; cards?:{rank:string;suit:string}[];cursor:number; phase:'acting'|'question'|'feedback'; chosen:string|null; correct:boolean|null }
export interface PlayedDecision { name:string;hand:string;step:number;given:string;expected:string;correct:boolean }
export interface LiveSession { id:string;scenarios:TrainingScenario[];length:number;allocated:number;completed:number;tables:LiveTable[];attempts:PlayedDecision[];done:boolean }
export interface DrillSetup {range:string;selected:string[];length:string;tables:number}
export interface DrillWorkspace {
  updatedAt:number;
  setup?:DrillSetup;
  draft?:TrainingScenario|null;
  editorStep?:number;
  checkpoint?:{session:LiveSession;paused:boolean}|null;
}
export function validCheckpoint(value:DrillWorkspace['checkpoint']):value is NonNullable<DrillWorkspace['checkpoint']>{
  if(!value||!value.session||typeof value.session.id!=='string')return false;
  const session=value.session;
  return Number.isSafeInteger(session.length)&&session.length>0&&Array.isArray(session.tables)&&session.tables.length<=6&&Array.isArray(session.scenarios)&&Array.isArray(session.attempts)&&session.tables.every(table=>typeof table.id==='string'&&typeof table.hand==='string'&&Number.isInteger(table.cursor)&&table.cursor>=0&&Array.isArray(table.scenario?.steps)&&table.cursor<table.scenario.steps.length&&['acting','question','feedback'].includes(table.phase));
}
