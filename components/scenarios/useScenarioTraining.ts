'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import type { RmData } from '@/lib/types';
import { drawScenarioHand, drawScenarioPath, handCards, emptyScenarioData, migrateScenario, moveOf, recordStepAttempt, recordStepTimeout, sequenceSteps, validateScenario, type TrainingScenario, type ScenarioDrillData } from '@/lib/scenario-drill';
import { validCheckpoint, type LiveSession, type LiveTable } from '@/lib/scenario-workspace';
import { advanceDecisionClock,createDecisionClock,validDecisionSeconds,type DecisionClock,type ClockAlert } from '@/lib/drill-clock';
import { drillAudio } from '@/lib/drill-audio';
export type {LiveSession,LiveTable} from '@/lib/scenario-workspace';
interface ClockAnchor {clock:DecisionClock;at:number;persistedAt:number;flash?:{kind:ClockAlert;until:number}}
export interface ClockView {key:string;remainingMs:number;flash:ClockAlert|null}
function deal(scenarios:TrainingScenario[],data:RmData|null,previous?:LiveTable,decisionSeconds=0):LiveTable{
  const candidates=scenarios.length>1?scenarios.filter(item=>item.id!==previous?.scenario.id):scenarios;
  const source=candidates[Math.floor(Math.random()*candidates.length)],hand=drawScenarioHand(data,source,previous?.hand);
  const scenario=drawScenarioPath(source);
  if(!hand)throw new Error('Source unavailable');
  const phase=sequenceSteps(scenario)[0].actor===scenario.hero?'question':'acting';
  return {id:crypto.randomUUID(),scenario,hand,cards:handCards(hand),cursor:0,phase,clock:phase==='question'?createDecisionClock(decisionSeconds):undefined,chosen:null,correct:null};
}
export function useScenarioTraining(data:RmData|null){
  const checkpoint=useAppStore(state=>state.config.drillWorkspace?.checkpoint);
  const initial=validCheckpoint(checkpoint)?checkpoint.session:null;
  const [session,setSession]=useState<LiveSession|null>(initial),[paused,setPausedState]=useState(Boolean(initial)),[notice,setNotice]=useState('');
  const live=useRef(session),pause=useRef(paused),interacted=useRef(false);live.current=session;pause.current=paused;
  const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const anchors=useRef(new Map<string,ClockAnchor>());
  const [clocks,setClocks]=useState<Record<string,ClockView>>({});
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
  const start=(scenarios:TrainingScenario[],length:number,count:number,decisionSeconds=0,soundEnabled=true,pauseAfterMistake=false)=>{
    const available=scenarios.map(migrateScenario).filter(item=>!validateScenario(item,data));
    if(!available.length||!Number.isSafeInteger(length)||length<1||count<1||count>6||!validDecisionSeconds(decisionSeconds))return null;
    interacted.current=true;setNotice('');const slots=Math.min(length,count);
    anchors.current.clear();setClocks({});drillAudio.stop();void drillAudio.prime(soundEnabled);
    const next:LiveSession={id:crypto.randomUUID(),scenarios:structuredClone(available),length,allocated:slots,completed:0,tables:Array.from({length:slots},()=>deal(available,data,undefined,decisionSeconds)),attempts:[],done:false,decisionSeconds,soundEnabled,pauseAfterMistake};
    publish(next,false);return next.id;
  };
  const submit=(table:LiveTable,optionId:string|null)=>{
    const current=live.current,actual=current?.tables.find(item=>item.id===table.id);
    if(!current||!actual||actual.phase!=='question'||actual.cursor!==table.cursor||actual.held||actual.infoOpen||pause.current)return;
    const key=actual.id+':'+actual.cursor,anchor=anchors.current.get(key);
    const remaining=anchor?Math.max(0,anchor.clock.remainingMs-(performance.now()-anchor.at)):actual.clock?.remainingMs;
    const timedOut=optionId===null||remaining===0;
    const step=sequenceSteps(actual.scenario)[actual.cursor],option=step.options?.find(item=>item.id===optionId);if(!option&&!timedOut)return;
    try{
      const store=useAppStore.getState();
      const stats=timedOut?recordStepTimeout(store.config.scenarioDrill??emptyScenarioData(),actual.scenario,actual.hand,actual.cursor,data,key):recordStepAttempt(store.config.scenarioDrill??emptyScenarioData(),actual.scenario,actual.hand,actual.cursor,optionId!,data,key);
      const correct=!timedOut&&optionId===step.correctId,expected=step.options!.find(item=>item.id===step.correctId)!.label;
      interacted.current=true;
      anchors.current.delete(key);
      if(['limp','call','raise','allin'].includes(moveOf(step).action))void drillAudio.play('chips');
      publish({...current,tables:current.tables.map(item=>item.id===actual.id?{...item,phase:'feedback',held:!correct&&Boolean(current.pauseAfterMistake),clock:undefined,chosen:timedOut?'__timeout__':optionId,correct}:item),attempts:[...current.attempts,{name:actual.scenario.name,hand:actual.hand,step:actual.cursor,given:timedOut?'Temps écoulé':option!.label,expected,correct,...(timedOut?{timedOut:true}:{})}]},false,stats);
    }catch{setNotice('La range source a change. Verifie tes scenarios.');publish(current,true);}
  };
  const submitRef=useRef(submit);submitRef.current=submit;
  const answer=(table:LiveTable,optionId:string)=>submit(table,optionId);
  useEffect(()=>{
    if(!live.current||live.current.done||paused||!live.current.decisionSeconds)return;
    const tick=()=>{
      const current=live.current;if(!current||current.done||pause.current)return;
      const now=performance.now(),wanted=new Set<string>(),views:Record<string,ClockView>={},expired:LiveTable[]=[];
      let persist=false;
      const tables=current.tables.map(table=>{
        if(table.phase!=='question'||table.held||table.infoOpen)return table;
        const key=table.id+':'+table.cursor;wanted.add(key);
        let anchor=anchors.current.get(key);
        if(!anchor){const clock=table.clock??createDecisionClock(current.decisionSeconds??0);if(!clock)return table;anchor={clock,at:now,persistedAt:now};anchors.current.set(key,anchor);}
        const next=advanceDecisionClock(anchor.clock,now-anchor.at);anchor.clock=next.clock;anchor.at=now;
        if(next.alert){anchor.flash={kind:next.alert,until:now+1000};void drillAudio.play(next.alert);persist=true;}
        if(now-anchor.persistedAt>=1000){anchor.persistedAt=now;persist=true;}
        views[table.id]={key,remainingMs:next.clock.remainingMs,flash:anchor.flash&&anchor.flash.until>now?anchor.flash.kind:null};
        if(next.expired)expired.push(table);
        return {...table,clock:{...next.clock}};
      });
      for(const key of anchors.current.keys())if(!wanted.has(key))anchors.current.delete(key);
      setClocks(views);
      if(persist||expired.length)publish({...current,tables});
      for(const table of expired)submitRef.current(table,null);
    };
    tick();const interval=setInterval(tick,100);return()=>clearInterval(interval);
  },[session?.id,session?.done,session?.decisionSeconds,paused,publish]);
  useEffect(()=>{
    const wanted=new Set<string>();
    if(session&&!session.done&&!paused)for(const table of session.tables){
      if(table.phase==='question'||table.held||table.infoOpen)continue;const key=table.id+':'+table.cursor+':'+table.phase;wanted.add(key);if(timers.current.has(key))continue;
      timers.current.set(key,setTimeout(()=>{
        timers.current.delete(key);const previous=live.current,current=previous?.tables.find(item=>item.id===table.id);
        if(!previous||previous.done||!current||current.cursor!==table.cursor||current.phase!==table.phase||current.held||current.infoOpen||pause.current)return;
        interacted.current=true;const steps=sequenceSteps(current.scenario),index=current.cursor+1;
        if(current.phase==='acting'&&['limp','call','raise','allin'].includes(moveOf(steps[current.cursor]).action))void drillAudio.play('chips');
        if(index<steps.length){const phase=steps[index].actor===current.scenario.hero?'question':'acting';publish({...previous,tables:previous.tables.map(item=>item.id===table.id?{...item,cursor:index,phase,clock:phase==='question'?createDecisionClock(previous.decisionSeconds??0):undefined,chosen:null,correct:null}:item)});return;}
        const remaining=previous.tables.filter(item=>item.id!==table.id);
        if(previous.allocated<previous.length){const eligible=previous.scenarios.filter(item=>!validateScenario(item,dataRef.current));if(eligible.length){const replacement=deal(eligible,dataRef.current,current,previous.decisionSeconds??0);publish({...previous,completed:previous.completed+1,allocated:previous.allocated+1,tables:previous.tables.map(item=>item.id===table.id?replacement:item)});return;}}
        publish({...previous,completed:previous.completed+1,tables:remaining,done:remaining.length===0});
      },table.phase==='feedback'?1000:450));
    }
    for(const [key,timer]of timers.current)if(!wanted.has(key)){clearTimeout(timer);timers.current.delete(key);}
  },[session,paused,publish]);
  const hasSession=Boolean(session);
  useEffect(()=>{drillAudio.setEnabled(session?.soundEnabled??true);if(paused||!hasSession||session?.done)drillAudio.stop();},[session?.soundEnabled,session?.done,paused,hasSession]);
  useEffect(()=>{const pending=timers.current;return()=>{for(const timer of pending.values())clearTimeout(timer);pending.clear();drillAudio.stop();};},[]);
  const setPaused=(value:boolean)=>{
    interacted.current=true;let current=live.current;
    if(value&&current){const now=performance.now();current={...current,tables:current.tables.map(table=>{const anchor=anchors.current.get(table.id+':'+table.cursor);return anchor&&table.phase==='question'?{...table,clock:{...anchor.clock,remainingMs:Math.max(0,anchor.clock.remainingMs-(now-anchor.at))}}:table;})};anchors.current.clear();setClocks({});drillAudio.stop();}
    if(!value)void drillAudio.prime(current?.soundEnabled??true);
    publish(current,value);
  };
  const setTableInfo=(id:string,open:boolean)=>{
    const current=live.current;if(!current)return;interacted.current=true;const now=performance.now();
    const tables=current.tables.map(table=>{if(table.id!==id)return table;const key=table.id+':'+table.cursor,anchor=anchors.current.get(key);anchors.current.delete(key);return {...table,infoOpen:open,...(open&&anchor?{clock:{...anchor.clock,remainingMs:Math.max(0,anchor.clock.remainingMs-(now-anchor.at))}}:{})};});publish({...current,tables});
  };
  const resumeTable=(id:string)=>{const current=live.current;if(!current||pause.current)return;interacted.current=true;publish({...current,tables:current.tables.map(table=>table.id===id?{...table,held:false}:table)});void drillAudio.prime(current.soundEnabled??true);};
  const setTrainingOptions=(patch:{decisionSeconds?:number;pauseAfterMistake?:boolean})=>{
    const current=live.current;if(!current)return;
    if(patch.decisionSeconds!==undefined&&!validDecisionSeconds(patch.decisionSeconds))return;
    interacted.current=true;const next={...current,...patch};
    if(patch.decisionSeconds!==undefined){drillAudio.stop();anchors.current.clear();setClocks({});next.tables=current.tables.map(table=>({...table,clock:table.phase==='question'?createDecisionClock(patch.decisionSeconds!):undefined}));}
    if(patch.pauseAfterMistake===false)next.tables=next.tables.map(table=>({...table,held:false}));
    publish(next);const store=useAppStore.getState();if(store.config.drillWorkspace?.setup)store.saveConfig({drillWorkspace:{...store.config.drillWorkspace,updatedAt:Date.now(),setup:{...store.config.drillWorkspace.setup,...patch}}});
  };
  const setSoundEnabled=(value:boolean)=>{interacted.current=true;if(value)void drillAudio.prime(true);else drillAudio.setEnabled(false);if(live.current)publish({...live.current,soundEnabled:value});};
  const finish=()=>{if(live.current){interacted.current=true;drillAudio.stop();publish({...live.current,done:true},false);}};
  const reset=()=>{interacted.current=true;anchors.current.clear();setClocks({});drillAudio.stop();publish(null,false);};
  return {session,start,answer,paused,setPaused,notice,finish,reset,clocks,setSoundEnabled,setTableInfo,resumeTable,setTrainingOptions};
}
