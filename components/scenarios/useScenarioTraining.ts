'use client';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import type { RmData } from '@/lib/types';
import { drawScenarioHand, emptyScenarioData, migrateScenario, recordStepAttempt, sequenceSteps, validateScenario, type TrainingScenario } from '@/lib/scenario-drill';

export interface LiveTable {
  id:string; scenario:TrainingScenario; hand:string; cursor:number;
  phase:'acting'|'question'|'feedback'; chosen:string|null; correct:boolean|null;
}
interface PlayedDecision { name:string; hand:string; step:number; given:string; expected:string; correct:boolean }
export interface LiveSession { scenarios:TrainingScenario[]; length:number; allocated:number; completed:number; tables:LiveTable[]; attempts:PlayedDecision[]; done:boolean }
function deal(scenarios:TrainingScenario[],data:RmData|null,previous?:LiveTable):LiveTable {
  const alternatives=scenarios.length>1?scenarios.filter(item=>item.id!==previous?.scenario.id):scenarios;
  const scenario=alternatives[Math.floor(Math.random()*alternatives.length)];
  const hand=drawScenarioHand(data,scenario,previous?.hand);
  if(!hand) throw new Error('Range source indisponible');
  return {id:crypto.randomUUID(),scenario,hand,cursor:0,phase:sequenceSteps(scenario)[0].actor===scenario.hero?'question':'acting',chosen:null,correct:null};
}
export function useScenarioTraining(data:RmData|null) {
  const [session,setSession]=useState<LiveSession|null>(null);
  const [paused,setPaused]=useState(false);
  const [notice,setNotice]=useState('');
  const locks=useRef(new Set<string>());
  const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const dataRef=useRef(data);dataRef.current=data;
  const start=(scenarios:TrainingScenario[],length:number,count:number)=>{
    const available=scenarios.map(migrateScenario).filter(scenario=>!validateScenario(scenario,data));
    if(!available.length||!Number.isSafeInteger(length)||length<1) return;
    const slots=Math.min(count,length);locks.current.clear();setNotice('');setPaused(false);
    setSession({scenarios:structuredClone(available),length,allocated:slots,completed:0,tables:Array.from({length:slots},()=>deal(available,data)),attempts:[],done:false});
  };
  const answer=(table:LiveTable,optionId:string)=>{
    const key=`${table.id}:${table.cursor}`;
    if(table.phase!=='question'||paused||locks.current.has(key)) return;
    const step=sequenceSteps(table.scenario)[table.cursor];
    const option=step.options?.find(item=>item.id===optionId);
    if(!option) return;
    try {
      const store=useAppStore.getState();
      store.saveConfig({scenarioDrill:recordStepAttempt(store.config.scenarioDrill??emptyScenarioData(),table.scenario,table.hand,table.cursor,optionId,data,key)});
      locks.current.add(key);
      const correct=optionId===step.correctId;
      const expected=step.options!.find(item=>item.id===step.correctId)!.label;
      setSession(previous=>previous?{...previous,tables:previous.tables.map(item=>item.id===table.id?{...item,phase:'feedback',chosen:optionId,correct}:item),attempts:[...previous.attempts,{name:table.scenario.name,hand:table.hand,step:table.cursor,given:option.label,expected,correct}]}:previous);
    } catch {setNotice('La range source a changé. Reviens aux scénarios pour la vérifier.');setPaused(true);}
  };
  useEffect(()=>{
    const wanted=new Set<string>();
    if(session&&!session.done&&!paused) for(const table of session.tables){
      if(table.phase==='question') continue;
      const key=`${table.id}:${table.cursor}:${table.phase}`;wanted.add(key);
      if(timers.current.has(key)) continue;
      const timer=setTimeout(()=>{
        timers.current.delete(key);
        setSession(previous=>{
          const current=previous?.tables.find(item=>item.id===table.id);
          if(!previous||previous.done||!current||current.cursor!==table.cursor||current.phase!==table.phase) return previous;
          const steps=sequenceSteps(current.scenario),nextIndex=current.cursor+1;
          if(nextIndex<steps.length) return {...previous,tables:previous.tables.map(item=>item.id===table.id?{...item,cursor:nextIndex,phase:steps[nextIndex].actor===current.scenario.hero?'question':'acting',chosen:null,correct:null}:item)};
          const remaining=previous.tables.filter(item=>item.id!==table.id);
          if(previous.allocated<previous.length){
            const eligible=previous.scenarios.filter(item=>!validateScenario(item,dataRef.current));
            if(eligible.length){const replacement=deal(eligible,dataRef.current,current);return {...previous,completed:previous.completed+1,allocated:previous.allocated+1,tables:previous.tables.map(item=>item.id===table.id?replacement:item)};}
          }
          return {...previous,completed:previous.completed+1,tables:remaining,done:remaining.length===0};
        });
      },table.phase==='feedback'?1000:450);
      timers.current.set(key,timer);
    }
    for(const [key,timer] of timers.current) if(!wanted.has(key)){clearTimeout(timer);timers.current.delete(key);}
  },[session,paused]);
  useEffect(()=>{const pending=timers.current;return()=>{for(const timer of pending.values()) clearTimeout(timer);pending.clear();};},[]);
  const finish=()=>{setSession(previous=>previous?{...previous,done:true}:previous);setPaused(false);};
  return {session,start,answer,paused,setPaused,notice,finish,reset:()=>{setSession(null);setPaused(false);}};
}
