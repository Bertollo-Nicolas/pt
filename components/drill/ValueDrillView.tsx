'use client';
import { useEffect,useRef,useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { VALUE_CASES,VALUE_RULES } from '@/lib/value-drill/dataset';
import { emptyValueProgress,selectValueCase,valueCase } from '@/lib/value-drill/engine';
import { actionLabel,VALUE_ACTIONS,VALUE_FAMILIES,type ValueAction,type ValueAttempt,type ValueCase,type ValueFilter,type ValueProgress } from '@/lib/value-drill/types';
import { Button } from '../ui/Button';
import { DrillLengthField,useDrillLength } from './DrillLengthField';
import { DrillMemoDeck } from './DrillReference';

const SUITS: Record<string,{symbol:string;label:string}>={S:{symbol:'♠',label:'pique'},H:{symbol:'♥',label:'cœur'},D:{symbol:'♦',label:'carreau'},C:{symbol:'♣',label:'trèfle'}};
const RANKS: Record<string,string>={A:'As',K:'Roi',Q:'Dame',J:'Valet',T:'10'};
function Cards({cards,hero=false}:{cards:string[];hero?:boolean}){
  return <div className={`value-cards ${hero?'is-hero':''}`} aria-label={hero?'Main de Hero':'Board'}>{cards.map(card=><div key={card} className={`cbet-card suit-${card[1]}`} role="img" aria-label={`${RANKS[card[0]]??card[0]} de ${SUITS[card[1]].label}`}><span>{card[0]==='T'?'10':card[0]}</span><b aria-hidden="true">{SUITS[card[1]].symbol}</b><small aria-hidden="true">{card[0]==='T'?'10':card[0]}</small></div>)}</div>;
}
function Stats({progress}:{progress:ValueProgress}){
  return <section className="cbet-stats" aria-label="Progression value"><div className="cbet-stat-grid">{[
    ['Précision',progress.attempts?`${Math.round(progress.correct/progress.attempts*100)} %`:'—'],['Décisions',progress.attempts],['Série actuelle',progress.streak],['Meilleure série',progress.bestStreak],
  ].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><h3 className="font-semibold mt-6 mb-4">Par texture</h3><div className="cbet-categories">{VALUE_FAMILIES.map(family=>{
    const stats=progress.families[family.id];const accuracy=stats?.attempts?Math.round(stats.correct/stats.attempts*100):null;
    return <div key={family.id}><div className="flex justify-between gap-3 text-sm"><span>{family.title}</span><span className="text-muted">{accuracy===null?'À découvrir':`${accuracy} % · ${stats!.attempts}`}</span></div><div className="cbet-stat-track"><span style={{width:`${accuracy??0}%`}}/></div></div>;
  })}</div><div className="value-street-stats">{(['Flop','Turn','River'] as const).map(street=>{const stats=progress.streets[street];return <span key={street}>{street}<strong>{stats?.attempts?`${Math.round(stats.correct/stats.attempts*100)} %`:'—'}</strong></span>;})}</div></section>;
}
function Memo(){
  return <DrillMemoDeck title="Les lignes de ton cours." description="Flop → turn → river. Les alternatives sont toutes acceptées." pages={[
    ...VALUE_FAMILIES.filter(family=>family.id!=='adaptations').map(family=>({id:family.id,title:family.title,content:<div className="math-memo-body math-table-scroll"><table><thead><tr><th>Main</th><th>Flop</th><th>Turn</th><th>River</th></tr></thead><tbody>{VALUE_RULES.filter(rule=>rule.family===family.id).map(rule=><tr key={rule.id}><td>{rule.hand}</td>{rule.line.map((actions,index)=><td key={index}>{actions.map(actionLabel).join(' ou ')}</td>)}</tr>)}</tbody></table></div>})),
    {id:'adaptations',title:'Adaptations de texture',content:<div className="drill-reference-prose"><p>Flush possible turn ou river : réduire les sizings.</p><p>Sur quatre cartes vers une quinte : réduire d’un cran (pot → 75 %). Quinte supérieure à celle du board : overbet.</p><p>Board monotone : réduire d’un cran flop et turn ; réserver les très grosses mises pour la river.</p></div>},
    {id:'hero-ip',title:'Hero IP et catégories de mains',content:<div className="drill-reference-prose"><p>Hero IP face au profil passif du cours : value mergée à la turn ; trop peu de bluffs adverses pour chercher systématiquement à induce river. Les exercices supposent des checks adverses, sans relance.</p><p>Conventions confirmées : trips distingués par le kicker ; TP moyenne avec kicker Q à 9, en dehors de l’exception ace-high AJ+ ; La force absolue d’une PP (TT+ pour une PP forte) ne définit pas une overpaire : une overpaire est supérieure à toutes les cartes du board. Sur 552, 88 est donc une overpaire ; 33 et 44 sont des paires moyennes. Sur 556, A6 et K6 relèvent de la branche paire moyenne.</p><p>Si aucune branche ne correspond à notre main au flop : c-bet ⅓ pot. Cette règle ne définit pas les sizings des streets suivantes.</p></div>},
    {id:'profiles',title:'Adaptations aux profils',content:<div className="drill-reference-prose"><p>VPIP &gt; 45 et pas de check-raise → c-bet range.</p><p>Mauvaise calling station : VPIP &gt; 60, WTSD &gt; 35 → value et nut flush draws, pas de bluffs purs.</p><p>Calling station capable de folder : VPIP &gt; 45, WTSD &lt; 30 → seulement les meilleurs bluffs.</p></div>},
  ]}/>;
}

interface Session {scenario:ValueCase;step:number;seen:string[];attempts:ValueAttempt[];answer:ValueAttempt|null;startedAt:number;done:boolean;filter:ValueFilter;length:number}
export function ValueDrillView(){
  const progress=useAppStore(state=>state.config.valueDrill)??emptyValueProgress();
  const record=useAppStore(state=>state.recordValueAttempt);
  const length=useDrillLength(6);
  const [filter,setFilter]=useState<ValueFilter>('mixed');const [hints,setHints]=useState(false);const [session,setSession]=useState<Session|null>(null);
  const locked=useRef(false);const scroll=useRef<HTMLDivElement>(null);const feedback=useRef<HTMLElement>(null);const heading=useRef<HTMLHeadingElement>(null);
  const active=session?`${session.scenario.id}-${session.step}-${session.seen.length}-${session.done}`:'';
  useEffect(()=>{scroll.current?.scrollTo({top:0});heading.current?.focus({preventScroll:true});},[active]);
  const start=()=>{if(length.count===null)return;locked.current=false;const scenario=selectValueCase(filter,progress,[],[]);setSession({scenario,step:0,seen:[scenario.id],attempts:[],answer:null,startedAt:performance.now(),done:false,filter,length:length.count});};
  const answer=(action:ValueAction)=>{
    if(!session||session.answer||locked.current)return;locked.current=true;
    const attempt:ValueAttempt={id:crypto.randomUUID(),caseId:session.scenario.id,step:session.step,answer:action,correct:session.scenario.steps[session.step].expected.includes(action),responseTimeMs:Math.round(performance.now()-session.startedAt),createdAt:new Date().toISOString()};
    record(attempt);setSession({...session,answer:attempt,attempts:[...session.attempts,attempt]});
    requestAnimationFrame(()=>{if(window.matchMedia('(max-width:1150px)').matches)feedback.current?.scrollIntoView({block:'nearest',behavior:'smooth'});});
  };
  const next=()=>{
    if(!session?.answer)return;
    if(session.step+1<session.scenario.steps.length){locked.current=false;setSession({...session,step:session.step+1,answer:null,startedAt:performance.now()});return;}
    if(session.seen.length>=session.length){setSession({...session,done:true});return;}
    locked.current=false;const scenario=selectValueCase(session.filter,progress,session.seen,session.attempts);setSession({...session,scenario,step:0,seen:[...session.seen,scenario.id],answer:null,startedAt:performance.now()});
  };
  const scenario=session?.scenario;const step=scenario?.steps[session?.step??0];const score=session?.attempts.filter(item=>item.correct).length??0;
  const completed=session?session.seen.length-(session.answer&&session.step===session.scenario.steps.length-1?0:1):0;
  const last=Boolean(session&&session.step===session.scenario.steps.length-1);
  const qualitative=step?.expected.includes('REDUCE')||step?.expected.includes('LARGE_RIVER');
  const choiceIds=scenario?.family!=='adaptations'?['CHECK','B25','B33','B50','B66','B80','POT','OVERBET','SHOVE']
    :step?.expected.includes('REDUCE')?['REDUCE','KEEP','INCREASE']
    :step?.expected.includes('LARGE_RIVER')?['LARGE_FLOP','LARGE_TURN','LARGE_RIVER']
    :['CHECK','B50','B75','B80','POT','OVERBET','SHOVE'];
  const buttons=VALUE_ACTIONS.filter(action=>choiceIds.includes(action.id));
  const errors=session?.attempts.filter(item=>!item.correct)??[];
  const weak=VALUE_FAMILIES.map(family=>({...family,count:errors.filter(attempt=>valueCase(attempt.caseId).family===family.id).length})).filter(item=>item.count>0).sort((a,b)=>b.count-a.count);
  return <div ref={scroll} className={`cbet-scroll drill-value ${session?session.done?'is-summary':'is-playing':'is-setup'}`}><div className="cbet-workspace"><header className="cbet-heading"><div><span className="eyebrow text-signal">EXPLOIT / HERO IP</span><h1>Value vs fish passif</h1><p>Une main, une texture, puis une décision à chaque street.</p></div><span className="cbet-spot">Lignes de ton cours</span></header>
    {!session?<><div className="cbet-setup-grid"><section className="cbet-panel"><span className="section-label text-signal">CONSTRUIS TA LIGNE</span><h2>Flop. Turn. River.</h2><p className="text-sm text-muted mt-3 leading-relaxed">Choisis le sizing à chaque street. La turn et la river restent cachées jusqu’au moment de jouer. Les adaptations sont des situations séparées.</p><div className="drill-setup-controls"><label className="block mt-6 text-sm font-semibold">Textures à travailler<select className="cbet-select" value={filter} onChange={event=>setFilter(event.target.value as ValueFilter)}><option value="mixed">Toutes les textures + adaptations</option>{VALUE_FAMILIES.map(family=><option key={family.id} value={family.id}>{family.title}</option>)}</select></label><DrillLengthField input={length.input} onChange={length.setInput} valid={length.count!==null} label="Nombre de situations" description="Une situation comprend jusqu’à trois décisions, du flop à la river."/></div><label className="value-hint-toggle"><input type="checkbox" checked={hints} onChange={event=>setHints(event.target.checked)}/>Afficher la catégorie de main avant de répondre</label><div className="cbet-start"><Button variant="primary" onClick={start} disabled={length.count===null}>Lancer {length.count??"…"} situation{length.count===1?"":"s"} →</Button><span>{VALUE_CASES.length} exemples · Sans limite de temps</span></div></section><Stats progress={progress}/></div><Memo/></>
    :session.done?<section className="cbet-panel cbet-summary"><span className="section-label text-signal">SESSION TERMINÉE</span><h2>{score} / {session.attempts.length}<span> décisions justes</span></h2><p className="text-muted mt-3">{weak.length?'Tes priorités pour la prochaine session :':'Toutes les lignes sont justes. Varie les textures pour les consolider.'}</p><div className="drill-catalog-tags mt-4">{weak.map(item=><span key={item.id}>{item.title} · {item.count} erreur{item.count>1?'s':''}</span>)}</div><Stats progress={progress}/><div className="flex flex-wrap gap-3 mt-6"><Button variant="primary" onClick={start}>Nouvelle session →</Button><Button onClick={()=>setSession(null)}>Textures et fiches mémo</Button></div></section>
    :scenario&&step?<><div className="cbet-session-top"><span>Situation {session.seen.length} / {session.length} <span className="text-muted">· {step.street} · {VALUE_FAMILIES.find(item=>item.id===scenario.family)?.title}</span></span><span className="text-signal">{score} / {session.attempts.length} justes</span><Button size="sm" onClick={()=>setSession(null)}>Quitter la session</Button></div><div className="cbet-session-track" role="progressbar" aria-label="Situations terminées" aria-valuemin={0} aria-valuemax={session.length} aria-valuenow={completed}><span style={{width:`${completed/session.length*100}%`}}/></div>
    <div className="cbet-play-grid"><section className="cbet-table-panel"><div className="cbet-table-meta"><span>HERO IP</span><span>VS PASSIF</span><span>{step.street.toUpperCase()}</span></div><Cards cards={step.board}/><div className="value-hero"><span className="section-label">TA MAIN</span><Cards cards={scenario.hero} hero/>{(hints||session.answer)&&<p className="value-hand-label">{scenario.handLabel}</p>}</div>
      {session.step>0&&<div className="value-history" aria-label="Ligne de référence déjà jouée">{scenario.steps.slice(0,session.step).map((previous,index)=><span key={previous.street}>{previous.street} : {previous.expected.map(actionLabel).join(' ou ')}{[...session.attempts].reverse().find(item=>item.caseId===scenario.id&&item.step===index)?.correct===false?' · corrigé':''}</span>)}</div>}
      <h2 ref={heading} tabIndex={-1}>{scenario.family==='adaptations'?scenario.title:`Quel sizing ${step.street==='Flop'?'au flop':`à la ${step.street.toLowerCase()}`} ?`}</h2><p className="text-sm text-muted leading-relaxed">{scenario.context}</p><div className={`value-actions ${qualitative?'is-qualitative':''}`} role="group" aria-label="Choisir une action">{buttons.map(action=><button key={action.id} disabled={Boolean(session.answer)} onClick={()=>answer(action.id)} className={`cbet-answer ${session.answer&&step.expected.includes(action.id)?'is-correct':session.answer?.answer===action.id?'is-wrong':''}`}><strong>{action.label}</strong>{session.answer&&step.expected.includes(action.id)&&<small>Accepté ✓</small>}{session.answer?.answer===action.id&&!step.expected.includes(action.id)&&<small>Ta réponse</small>}</button>)}</div></section>
      <aside ref={feedback} className={`cbet-feedback ${session.answer?'has-answer':''}`} aria-label="Correction de la street">{session.answer?<><div role="status"><span className={session.answer.correct?'text-green':'text-signal'}>{session.answer.correct?'✓ Correct':'↗ À revoir'}</span><h3>{step.expected.map(actionLabel).join(' ou ')}</h3><p>{step.explanation}</p></div><div className="cbet-rule"><span>TA MAIN</span><p>{scenario.handLabel}</p></div>{step.expected.length>1&&<p className="text-xs text-muted">Ces alternatives sont toutes acceptées dans ton cours.</p>}<Button variant="primary" onClick={next}>{last?session.seen.length===session.length?'Voir mon bilan':'Situation suivante':`Passer à la ${scenario.steps[session.step+1].street.toLowerCase()}`} →</Button></>:<><span className="section-label text-signal">LE BON RÉFLEXE</span><h3>Value street par street.</h3><p className="text-sm text-muted">Identifie la texture, la force de ta main et son kicker. Applique la ligne du cours contre le profil passif.</p><p className="text-sm text-muted">La correction de cette street apparaît après ta réponse. Les sizings futurs restent cachés.</p></>}
      </aside></div></>:null}
    <footer className="cbet-footnote">Lignes du cours · Hero IP vs passif · Réponses sauvegardées · Overbet &gt; pot · Shove = tapis.</footer>
  </div></div>;
}
