'use client';
import { useMemo } from 'react';
import { handCards, simulateScenario, type TrainingScenario } from '@/lib/scenario-drill';

export const bb = (value: number) => value.toLocaleString('fr-FR',{maximumFractionDigits:2});
export function ScenarioTable({scenario,hand,compact=false}:{scenario:TrainingScenario;hand:string;compact?:boolean}) {
  const state=simulateScenario(scenario);
  const cards=useMemo(()=>handCards(hand),[hand]);
  const heroIndex=state.seats.findIndex(seat=>seat.position===scenario.hero);
  const ordered=[...state.seats.slice(heroIndex),...state.seats.slice(0,heroIndex)];
  return <div className={`scenario-table-wrap ${compact?'is-compact':''}`} aria-label={`Table ${scenario.players===2?'heads-up':`${scenario.players} joueurs`}`}>
    <div className="scenario-felt"/>
    <div className="scenario-pot"><span className="scenario-pot-caption">POT TOTAL</span><strong>{bb(state.pot)} <small>bb</small></strong><div className="scenario-pot-chips" aria-hidden="true"><i/><i/><i/></div><span>À payer : <b>{bb(state.toCall)} bb</b></span></div>
    {ordered.map((seat,index)=>{
      const angle=Math.PI/2+index*2*Math.PI/ordered.length;
      const x=50+(compact?35:38)*Math.cos(angle),y=47+35*Math.sin(angle);
      const hero=seat.position===scenario.hero;
      return <div key={seat.position}>
        <div className={`scenario-seat ${hero?'is-hero':''} ${seat.folded?'is-folded':''}`} style={{left:`${x}%`,top:`${y}%`}}>
          <div className="scenario-holecards" aria-label={hero?`Main de Hero : ${hand}`:seat.folded?'Cartes couchées':'Cartes adverses masquées'}>{hero?cards.map((card,i)=><div key={i} className={`scenario-card suit-${card.suit==='♥'?'heart':card.suit==='♦'?'diamond':card.suit==='♣'?'club':'spade'}`}><b>{card.rank==='T'?'10':card.rank}</b><span>{card.suit}</span></div>):!seat.folded&&<><div className="scenario-card is-hidden"/><div className="scenario-card is-hidden"/></>}</div>
          <div className="scenario-player"><span>{hero?'HERO':`VILAIN ${index}`} · {seat.position}</span><strong>{bb(scenario.stack-seat.committed)} bb</strong><small>{hero?'À toi de jouer':seat.lastAction}</small></div>
        </div>
        {seat.committed>0&&<div className="scenario-wager" style={{left:`${50+(x-50)*.62}%`,top:`${47+(y-47)*.52}%`}} aria-label={`${seat.position} a engagé ${bb(seat.committed)} bb`}><i aria-hidden="true"/>{bb(seat.committed)}</div>}
      </div>;
    })}
  </div>;
}
