'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import type { RmData } from '@/lib/types';
import { drawScenarioHand, handCards, emptyScenarioData, migrateScenario, recordStepAttempt, sequenceSteps, validateScenario, type TrainingScenario, type ScenarioDrillData } from '@/lib/scenario-drill';
import { validCheckpoint, type LiveSession, type LiveTable } from '@/lib/scenario-workspace';
export type {LiveSession,LiveTable} from '@/lib/scenario-workspace';
function deal(scenarios:TrainingScenario[],data:RmData|null,previous?:LiveTable):LiveTable{
  const candidates=scenarios.length>1?scenarios.filter(item=>item.id!==previous?.scenario.id):scenarios;
  const scenario=candidates[Math.floor(Math.random()*candidates.length)],hand=drawScenarioHand(data,scenario,previous?.hand);
  if(!hand)throw new Error('Source unavailable');
  return {id:crypto.randomUUID(),scenario,hand,cards:handCards(hand),cursor:0,phase:sequenceSteps(scenario)[0].actor===scenario.hero?'question':'acting',chosen:null,correct:null};
}
export function useScenarioTraining(data:RmData|null){
  const checkpoint=useAppStore(state=>state.config.drillWorkspace?.checkpoint);
  const initial=validCheckpoint(checkpoint)?checkpoint.session:null;
  const [session,setSession]=useState<LiveSession|null>(initial),[paused,setPausedState]=useState(Boolean(initial)),[notice,setNotice]=useState('');
  const live=useRef(session),pause=useRef(paused),interacted=useRef(false);live.current=session;pause.current=paused;
  const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const dataRef=useRef(data);dataRef.current=data;
  const publish=useCallback((next:LiveSession|null,nextPaused=pause.current,stats?:ScenarioDrillData)=>{
    live.current=next;pause.current=nextPaused;setSession(next);setPausedState(nextPaused);
    const store=useAppStore.getState();
    store.saveConfig({...(stats?{scenarioDrill:stats}:{}),drillWorkspace:{...store.config.drillWorkspace,updatedAt:Date.now(),checkpoint:next?{session:next,paused:nextPaused}:null}});
  },[]);
  useEffect(()=>{
    if(interacted.current||!validCheckpoint(checkpoint))return;
    live.current=checkpoint.session;pause.current=true;setSession(checkpoint.session);setPausedState(true);
  },[checkpoint]);
  const start=(scenarios:TrainingScenario[],length:number,count:number)=>{
    const available=scenarios.map(migrateScenario).filter(item=>!validateScenario(item,data));
    if(!available.length||!Number.isSafeInteger(length)||length<1||count<1||count>6)return null;
    interacted.current=true;setNotice('');const slots=Math.min(length,count);
    const next:LiveSession={id:crypto.randomUUID(),scenarios:structuredClone(available),length,allocated:slots,completed:0,tables:Array.from({length:slots},()=>deal(available,data)),attempts:[],done:false};
    publish(next,false);return next.id;
  };
  const answer=(table:LiveTable,optionId:string)=>{
    const current=live.current,actual=current?.tables.find(item=>item.id===table.id);
    if(!current||!actual||actual.phase!=='question'||actual.cursor!==table.cursor||pause.current)return;
    const step=sequenceSteps(actual.scenario)[actual.cursor],option=step.options?.find(item=>item.id===optionId);if(!option)return;
    try{
      const key=actual.id+':'+actual.cursor,store=useAppStore.getState();
      const stats=recordStepAttempt(store.config.scenarioDrill??emptyScenarioData(),actual.scenario,actual.hand,actual.cursor,optionId,data,key);
      const correct=optionId===step.correctId,expected=step.options!.find(item=>item.id===step.correctId)!.label;
      interacted.current=true;
      publish({...current,tables:current.tables.map(item=>item.id===actual.id?{...item,phase:'feedback',chosen:optionId,correct}:item),attempts:[...current.attempts,{name:actual.scenario.name,hand:actual.hand,step:actual.cursor,given:option.label,expected,correct}]},false,stats);
    }catch{setNotice('La range source a change. Verifie tes scenarios.');publish(current,true);}
  };
  useEffect(()=>{
    const wanted=new Set<string>();
    if(session&&!session.done&&!paused)for(const table of session.tables){
      if(table.phase==='question')continue;const key=table.id+':'+table.cursor+':'+table.phase;wanted.add(key);if(timers.current.has(key))continue;
      timers.current.set(key,setTimeout(()=>{
        timers.current.delete(key);const previous=live.current,current=previous?.tables.find(item=>item.id===table.id);
        if(!previous||previous.done||!current||current.cursor!==table.cursor||current.phase!==table.phase||pause.current)return;
        interacted.current=true;const steps=sequenceSteps(current.scenario),index=current.cursor+1;
        if(index<steps.length){publish({...previous,tables:previous.tables.map(item=>item.id===table.id?{...item,cursor:index,phase:steps[index].actor===current.scenario.hero?'question':'acting',chosen:null,correct:null}:item)});return;}
        const remaining=previous.tables.filter(item=>item.id!==table.id);
        if(previous.allocated<previous.length){const eligible=previous.scenarios.filter(item=>!validateScenario(item,dataRef.current));if(eligible.length){const replacement=deal(eligible,dataRef.current,current);publish({...previous,completed:previous.completed+1,allocated:previous.allocated+1,tables:previous.tables.map(item=>item.id===table.id?replacement:item)});return;}}
        publish({...previous,completed:previous.completed+1,tables:remaining,done:remaining.length===0});
      },table.phase==='feedback'?1000:450));
    }
    for(const [key,timer]of timers.current)if(!wanted.has(key)){clearTimeout(timer);timers.current.delete(key);}
  },[session,paused,publish]);
  useEffect(()=>{const pending=timers.current;return()=>{for(const timer of pending.values())clearTimeout(timer);pending.clear();};},[]);
  const setPaused=(value:boolean)=>{interacted.current=true;publish(live.current,value);};
  const finish=()=>{if(live.current){interacted.current=true;publish({...live.current,done:true},false);}};
  const reset=()=>{interacted.current=true;publish(null,false);};
  return {session,start,answer,paused,setPaused,notice,finish,reset};
}
