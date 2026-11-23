'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {allHands,buildRangeMap,getDecisionActions,getRangeActionDefs} from '@/lib/poker';
import type {RmData} from '@/lib/types';
import type {LiveTable} from '@/lib/scenario-workspace';
import {Icon} from '../ui/Icon';

export function ScenarioRangeInfo({table,data,onClose}:{table:LiveTable;data:RmData|null;onClose:()=>void}){
  const body=useRef<HTMLDivElement>(null),[size,setSize]=useState(200);
  useEffect(()=>{const node=body.current;if(!node)return;const resize=()=>setSize(Math.max(100,Math.min(node.clientWidth,node.clientHeight)-4));const observer=new ResizeObserver(resize);observer.observe(node);resize();return()=>observer.disconnect();},[]);
  const tab=data?.categories[table.scenario.catId]?.tabs?.[table.scenario.tabId];
  const map=useMemo(()=>tab&&data?buildRangeMap(tab.rangeList,data.ranges):{},[tab,data]);
  return <aside className="table-range-info" aria-label="Range de la table">
    <header><div><strong>{tab?.name??'Range indisponible'}</strong><small>{table.scenario.sourceAction} · Main jouée : <b>{table.hand}</b></small></div><button aria-label="Fermer la range" onClick={onClose}><Icon name="close" size={18}/></button></header>
    {tab?<><div ref={body} className="table-range-body"><div className="table-range-grid" style={{width:size,height:size,fontSize:Math.max(6,Math.min(14,size/13*.34))}}>{allHands().map(({hand})=>{const actions=getDecisionActions(hand,map),total=actions.reduce((sum,action)=>sum+action.freq,0)||1;let offset=0;const stops=actions.flatMap(action=>{const start=offset;offset+=action.freq/total*100;return [`${action.color} ${start}%`,`${action.color} ${offset}%`];});return <div key={hand} data-current={hand===table.hand} aria-label={hand===table.hand?`${hand}, main jouée`:hand} title={hand+' : '+actions.map(action=>`${action.action} ${Math.round(action.freq*100)}%`).join(' / ')} style={{background:stops.length?`linear-gradient(90deg,${stops.join(',')})`:'#393940'}}>{hand}</div>;})}</div></div><footer>{getRangeActionDefs(map).map(([name,color])=><span key={name}><i style={{background:color}}/>{name}</span>)}</footer></>:<p>La range source n’est plus disponible.</p>}
    <small className="table-range-note">Cette table est suspendue pendant la consultation.</small>
  </aside>;
}
