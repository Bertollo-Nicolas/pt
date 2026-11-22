'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { handCards, replayScenario, type ScenarioMove, type TrainingScenario } from '@/lib/scenario-drill';
export const bb=(value:number)=>value.toLocaleString('fr-FR',{maximumFractionDigits:2});
// Equal distances around a capsule perimeter, starting at the bottom centre.
export function capsuleSeat(index:number,count:number){
  const w=2.2,h=1,r=.5,straight=w-h,arc=Math.PI*r;
  let distance=index*(2*straight+2*arc)/count;
  let x=w/2,y=h;
  if(distance<=straight/2)x-=distance;
  else if((distance-=straight/2)<=arc){const angle=distance/r;x=r-r*Math.sin(angle);y=r+r*Math.cos(angle);}
  else if((distance-=arc)<=straight){x=r+distance;y=0;}
  else if((distance-=straight)<=arc){const angle=distance/r;x=w-r+r*Math.sin(angle);y=r-r*Math.cos(angle);}
  else{x=w-r-(distance-arc);y=h;}
  return {x:x/w*100,y:y*100};
}
export function ScenarioTable({scenario,hand,compact=false,moves=[],active,feedback}:{scenario:TrainingScenario;hand:string;compact?:boolean;moves?:ScenarioMove[];active?:string;feedback?:boolean|null}){
  const state=replayScenario(scenario,moves);
  const cards=useMemo(()=>handCards(hand),[hand]);
  const heroIndex=state.seats.findIndex(seat=>seat.position===scenario.hero);
  const ordered=[...state.seats.slice(heroIndex),...state.seats.slice(0,heroIndex)];
  const ref=useRef<HTMLDivElement>(null);const [width,setWidth]=useState(280);
  useEffect(()=>{const node=ref.current;if(!node)return;const resize=()=>setWidth(Math.max(120,Math.min(node.clientWidth-(compact?76:120),(node.clientHeight-(compact?104:140))*2.2,900)));const observer=new ResizeObserver(resize);observer.observe(node);resize();return()=>observer.disconnect();},[compact]);
  return <div ref={ref} className={`poker-stage ${compact?'is-compact':''}`} aria-label={`Table ${scenario.players===2?'heads-up':scenario.players+' joueurs'}`}>
    <div className="poker-plane" style={{width,height:width/2.2}}>
      <div className="poker-rail" aria-hidden="true"/>
      <div className="poker-pot"><span>POT</span><strong>{bb(state.pot)} <small>bb</small></strong><div className="poker-center-chips" aria-hidden="true"><i/><i/><i/></div>{active===scenario.hero&&state.toCall>0&&<small>À payer <b>{bb(state.toCall)} bb</b></small>}</div>
      {ordered.map((seat,index)=>{const {x,y}=capsuleSeat(index,ordered.length),hero=seat.position===scenario.hero;return <div key={seat.position}>
        <div className={`poker-seat ${hero?'is-hero':''} ${seat.folded?'is-folded':''} ${active===seat.position?'is-active':''} ${hero&&feedback!==undefined&&feedback!==null?feedback?'is-correct':'is-wrong':''}`} style={{left:x+'%',top:`calc(${y}% + ${y>70?Math.max(0,170-width/2.2)/2:y<30?-Math.max(0,170-width/2.2)/2:0}px)`}}>
          <div className="poker-cards" aria-label={hero?'Main de Hero : '+hand:seat.folded?'Cartes couchées':'Cartes adverses masquées'}>{hero?cards.map((card,i)=><div key={i} className={`poker-card suit-${card.suit==='♥'?'heart':card.suit==='♦'?'diamond':card.suit==='♣'?'club':'spade'}`}><b>{card.rank==='T'?'10':card.rank}</b><span>{card.suit}</span></div>):!seat.folded&&<><i className="poker-card card-back"/><i className="poker-card card-back"/></>}</div>
          <div className="poker-player"><span>{hero?'HERO':seat.position} <b>{hero?seat.position:''}</b></span><strong>{bb(scenario.stack-seat.committed)} <small>bb</small></strong><small>{seat.lastAction}</small></div>
        </div>
        {seat.committed>0&&<div className="poker-wager" style={{left:(50+(x-50)*.57)+'%',top:(50+(y-50)*.55)+'%'}} aria-label={seat.position+' a engagé '+bb(seat.committed)+' bb'}><i aria-hidden="true"/><span>{bb(seat.committed)}</span></div>}
      </div>;})}
    </div>
  </div>;
}
