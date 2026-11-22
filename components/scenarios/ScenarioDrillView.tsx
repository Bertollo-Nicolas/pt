'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { getRangeGroups } from '@/lib/range-options';
import { buildRangeMap, getRangeActionDefs } from '@/lib/poker';
import { ACTION_LABELS, defaultMoves, drawScenarioHand, emptyScenarioData, positionsFor, recordScenarioAttempt, simulateScenario, sourceHands, validateScenario, type Decision, type Position, type ScenarioAction, type ScenarioDrillData, type TrainingScenario } from '@/lib/scenario-drill';
import type { RmData } from '@/lib/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { DrillLengthField, useDrillLength } from '../drill/DrillLengthField';
import { bb, ScenarioTable } from './ScenarioTable';

const rangeValue=(catId:string,tabId:string)=>JSON.stringify([catId,tabId]);
function saveData(update:(previous:ScenarioDrillData)=>ScenarioDrillData) {
  const store=useAppStore.getState();store.saveConfig({scenarioDrill:update(store.config.scenarioDrill??emptyScenarioData())});
}
function RangeField({value,onChange,data}:{value:string;onChange:(value:string)=>void;data:RmData|null}) {
  return <label className="scenario-field">Range<select value={value} onChange={event=>onChange(event.target.value)}><option value="" disabled>Choisir une range</option>{getRangeGroups(data).map(group=><optgroup key={group.catId} label={group.path}>{group.tabs.map(tab=><option key={tab.id} value={rangeValue(group.catId,tab.id)}>{group.path} · {tab.name}</option>)}</optgroup>)}</select></label>;
}
function newScenario(catId:string,tabId:string,action:string):TrainingScenario {
  return {id:crypto.randomUUID(),name:`${action} face à une relance`,catId,tabId,sourceAction:action,players:2,hero:'SB',stack:25,moves:defaultMoves(2,'SB'),correct:'fold',explanation:''};
}
function Sequence({scenario}:{scenario:TrainingScenario}) {
  return <ol className="scenario-sequence" aria-label="Séquence avant la décision">{scenario.moves.map((move,index)=><li key={index}><span>{move.actor===scenario.hero?'Hero':move.actor}</span> {ACTION_LABELS[move.action]}{move.action==='raise'?` à ${bb(move.amount)} bb`:''}</li>)}<li className="is-question">Hero ({scenario.hero}) <b>?</b></li></ol>;
}

function Editor({initial,data,onClose}:{initial:TrainingScenario;data:RmData|null;onClose:()=>void}) {
  const [draft,setDraft]=useState(initial);
  const [dirty,setDirty]=useState(false);
  const [confirmClose,setConfirmClose]=useState(false);
  const patch=(value:Partial<TrainingScenario>)=>{setDirty(true);setDraft(previous=>({...previous,...value}));};
  const tab=data?.categories[draft.catId]?.tabs?.[draft.tabId];
  const actions=useMemo(()=>tab&&data?getRangeActionDefs(buildRangeMap(tab.rangeList,data.ranges)).map(([name])=>name).filter(name=>sourceHands(data,{...draft,sourceAction:name}).length):[],[tab,data,draft]);
  const state=simulateScenario(draft), error=validateScenario(draft,data), pool=sourceHands(data,draft);
  const setTable=(players:number,hero:Position)=>patch({players,hero,moves:defaultMoves(players,hero),correct:'fold'});
  const close=()=>dirty?setConfirmClose(true):onClose();
  return <div className="scenario-view is-editor"><header className="scenario-heading"><div><span className="eyebrow">CONSTRUIRE UN SCÉNARIO</span><h1>La situation, puis la décision.</h1></div><Button onClick={close}>Annuler</Button></header>
    <div className="scenario-editor-grid"><section className="scenario-panel scenario-editor-fields">
      <label className="scenario-field">Nom du scénario<input maxLength={100} value={draft.name} onChange={event=>patch({name:event.target.value})}/></label>
      <RangeField value={rangeValue(draft.catId,draft.tabId)} data={data} onChange={value=>{const [catId,tabId]=JSON.parse(value);patch({catId,tabId,sourceAction:''});}}/>
      <label className="scenario-field">Action source<select value={draft.sourceAction} onChange={event=>patch({sourceAction:event.target.value})}><option value="" disabled>Choisir une action détectée</option>{actions.map(action=><option key={action}>{action}</option>)}</select><small>{pool.length} mains éligibles · toute fréquence positive incluse</small></label>
      <div className="scenario-field-row"><label className="scenario-field">Table<select aria-label="Table" value={draft.players} onChange={event=>{const players=Number(event.target.value);setTable(players,positionsFor(players).includes(draft.hero)?draft.hero:'SB');}}>{[2,3,4,5,6].map(count=><option key={count} value={count}>{count===2?'Heads-up':`${count} joueurs`}</option>)}</select></label><label className="scenario-field">Hero<select aria-label="Position de Hero" value={draft.hero} onChange={event=>setTable(draft.players,event.target.value as Position)}>{positionsFor(draft.players).map(position=><option key={position}>{position}</option>)}</select></label><label className="scenario-field">Tapis / joueur<input type="number" min={2} max={1000} step={.5} value={draft.stack} onChange={event=>patch({stack:Number(event.target.value)})}/><small>bb, avant blindes</small></label></div>
      <label className="scenario-field">Bonne réponse de Hero<select value={draft.correct} onChange={event=>patch({correct:event.target.value as Decision})}>{(['fold','check','call','raise'] as Decision[]).map(action=><option key={action} value={action}>{ACTION_LABELS[action]}</option>)}</select></label>
      <label className="scenario-field">Explication (facultatif)<input maxLength={400} value={draft.explanation??''} onChange={event=>patch({explanation:event.target.value})} placeholder="Pourquoi jouer cette action ?"/></label>
      <div className="scenario-save"><p className={error?'text-signal':'text-muted'} role="status">{error||'Scénario prêt · pot et tapis calculés automatiquement.'}</p><Button variant="primary" disabled={Boolean(error)} onClick={()=>{saveData(previous=>({...previous,scenarios:[...previous.scenarios.filter(item=>item.id!==draft.id),{...draft,name:draft.name.trim()}]}));onClose();}}>Enregistrer le scénario →</Button></div>
    </section><section className="scenario-editor-preview"><div className="scenario-preview"><ScenarioTable scenario={draft} hand={pool[0]??'AKs'}/><span className="scenario-preview-caption">APERÇU · Hero toujours en bas · Blindes 0,5 / 1 bb</span></div>
      <div className="scenario-panel scenario-moves"><div className="scenario-section-title"><h2>Séquence avant Hero</h2><Button size="sm" disabled={draft.moves.length>=12} onClick={()=>patch({moves:[...draft.moves,{actor:positionsFor(draft.players).find(position=>position!==draft.hero)!,action:'check',amount:0}]})}>+ Action</Button></div><p className="text-xs text-muted">Dans l’ordre de jeu. Préflop sans ante ni tapis. Raise = montant total en bb.</p><div className="scenario-move-list">{draft.moves.map((move,index)=><div className="scenario-move-row" key={index}><span>{index+1}</span><select aria-label={`Joueur action ${index+1}`} value={move.actor} onChange={event=>patch({moves:draft.moves.map((item,i)=>i===index?{...item,actor:event.target.value as Position}:item)})}>{positionsFor(draft.players).map(position=><option key={position} value={position}>{position}{position===draft.hero?' · Hero':''}</option>)}</select><select aria-label={`Action ${index+1}`} value={move.action} onChange={event=>patch({moves:draft.moves.map((item,i)=>i===index?{...item,action:event.target.value as ScenarioAction,amount:event.target.value==='raise'?3:0}:item)})}>{Object.entries(ACTION_LABELS).map(([action,label])=><option key={action} value={action}>{label}</option>)}</select>{move.action==='raise'?<input aria-label={`Montant total action ${index+1} en bb`} type="number" min={2} step={.5} value={move.amount} onChange={event=>patch({moves:draft.moves.map((item,i)=>i===index?{...item,amount:Number(event.target.value)}:item)})}/>:<span className="scenario-auto-amount">auto</span>}<button aria-label={`Supprimer action ${index+1}`} onClick={()=>patch({moves:draft.moves.filter((_,i)=>i!==index)})}>×</button></div>)}</div><p className={state.error?'text-signal':'text-muted'}>{state.error||`Hero : ${state.choices.map(action=>ACTION_LABELS[action]).join(' / ')} · ${bb(state.toCall)} bb à payer`}</p></div>
    </section></div><Modal open={confirmClose} onClose={()=>setConfirmClose(false)}><h2 className="text-lg font-bold mb-3">Quitter sans enregistrer ?</h2><p className="text-muted text-sm mb-5">Les modifications de ce scénario seront perdues.</p><div className="flex gap-3"><Button onClick={()=>setConfirmClose(false)}>Continuer l’édition</Button><Button variant="danger" onClick={onClose}>Quitter</Button></div></Modal>
  </div>;
}

interface TrainingTable { id:string; scenario:TrainingScenario; hand:string; answer:Decision|null }
interface TrainingSession { scenarios:TrainingScenario[]; length:number; nextNumber:number; tables:TrainingTable[]; attempts:{name:string;hand:string;answer:Decision;expected:Decision}[] }
function deal(scenarios:TrainingScenario[],data:RmData|null,previous?:TrainingTable):TrainingTable {
  const alternatives=scenarios.length>1?scenarios.filter(item=>item.id!==previous?.scenario.id):scenarios;
  const scenario=alternatives[Math.floor(Math.random()*alternatives.length)];
  return {id:crypto.randomUUID(),scenario,hand:drawScenarioHand(data,scenario,previous?.hand)!,answer:null};
}
export function ScenarioDrillView({onLibrary}:{onLibrary:()=>void}) {
  const {rmData,config,lastSpot}=useAppStore();
  const saved=config.scenarioDrill??emptyScenarioData();
  const groups=useMemo(()=>getRangeGroups(rmData),[rmData]);
  const initial=lastSpot?rangeValue(lastSpot.catId,lastSpot.tabId):groups[0]?.tabs[0]?rangeValue(groups[0].catId,groups[0].tabs[0].id):'';
  const [range,setRange]=useState(initial);
  const currentRange=range||initial;
  const [selected,setSelected]=useState<string[]>([]);
  const [editor,setEditor]=useState<TrainingScenario|null>(null);
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const [tables,setTables]=useState(1);
  const length=useDrillLength(20);
  const [session,setSession]=useState<TrainingSession|null>(null);
  const [done,setDone]=useState(false);
  const [quit,setQuit]=useState(false);
  const [notice,setNotice]=useState('');
  const locked=useRef(new Set<string>());
  useEffect(()=>{if(!range&&initial)setRange(initial);},[initial,range]);
  const visible=saved.scenarios.filter(item=>rangeValue(item.catId,item.tabId)===currentRange);
  const selectedScenarios=visible.filter(item=>selected.includes(item.id)&&!validateScenario(item,rmData));
  const create=()=>{
    if(!currentRange)return;const [catId,tabId]=JSON.parse(currentRange);
    const tab=rmData?.categories[catId]?.tabs?.[tabId];
    const action=tab&&rmData?getRangeActionDefs(buildRangeMap(tab.rangeList,rmData.ranges)).find(([name])=>sourceHands(rmData,{catId,tabId,sourceAction:name}).length)?.[0]:'';
    setEditor(newScenario(catId,tabId,action??''));
  };
  const start=()=>{
    if(!length.count||!selectedScenarios.length)return;
    locked.current.clear();setDone(false);setNotice('');
    const count=Math.min(tables,length.count);
    setSession({scenarios:structuredClone(selectedScenarios),length:length.count,nextNumber:count,tables:Array.from({length:count},()=>deal(selectedScenarios,rmData)),attempts:[]});
  };
  const answer=(table:TrainingTable,action:Decision)=>{
    if(!session||table.answer||locked.current.has(table.id))return;
    try {
      saveData(previous=>recordScenarioAttempt(previous,table.scenario,table.hand,action,rmData,table.id));
      locked.current.add(table.id);
      setSession(previous=>previous?{...previous,tables:previous.tables.map(item=>item.id===table.id?{...item,answer:action}:item),attempts:[...previous.attempts,{name:table.scenario.name,hand:table.hand,answer:action,expected:table.scenario.correct}]}:previous);
    } catch {setNotice('La range a changé : termine cette session puis vérifie tes scénarios.');}
  };
  const next=(table:TrainingTable)=>{
    if(!session||!table.answer)return;
    const remaining=session.tables.filter(item=>item.id!==table.id);
    if(session.nextNumber<session.length){
      const eligible=session.scenarios.filter(item=>!validateScenario(item,rmData));
      if(!eligible.length){setNotice('Les ranges sources ne sont plus disponibles.');setDone(true);return;}
      setSession({...session,nextNumber:session.nextNumber+1,tables:session.tables.map(item=>item.id===table.id?deal(eligible,rmData,table):item)});
    } else if(!remaining.length) {setDone(true);} else setSession({...session,tables:remaining});
  };
  if(editor)return <Editor initial={editor} data={rmData} onClose={()=>setEditor(null)}/>;
  const score=session?.attempts.filter(item=>item.answer===item.expected).length??0;
  return <div className={`scenario-view ${session&&!done?'is-training':''}`}><header className="scenario-heading"><div><span className="eyebrow">PRÉFLOP / SCÉNARIOS PERSONNALISÉS</span><h1>Drills</h1><p>{session&&!done?'Lis la séquence. Prends la décision de Hero.':'Tes ranges. Tes situations. Tes décisions.'}</p></div>{session?<Button onClick={()=>done?setSession(null):setQuit(true)}>{done?'Retour aux scénarios':'Quitter la session'}</Button>:<Button variant="primary" disabled={!currentRange} onClick={create}>+ Nouveau scénario</Button>}</header>
    {notice&&<p role="alert" className="text-signal">{notice}</p>}
    {!session?<><div className="scenario-library-layout"><section className="scenario-panel scenario-library"><RangeField value={currentRange} data={rmData} onChange={value=>{setRange(value);setSelected([]);}}/>
      <div className="scenario-section-title"><h2>Scénarios <small>{visible.length}</small></h2><button className="text-link" onClick={()=>setSelected(visible.filter(item=>!validateScenario(item,rmData)).map(item=>item.id))}>Tout sélectionner</button></div>
      <div className="scenario-library-list">{visible.length?visible.map(scenario=>{const error=validateScenario(scenario,rmData);return <article className={`scenario-library-card ${selected.includes(scenario.id)?'is-selected':''}`} key={scenario.id}><label><input type="checkbox" checked={selected.includes(scenario.id)} disabled={Boolean(error)} onChange={event=>setSelected(previous=>event.target.checked?[...previous,scenario.id]:previous.filter(id=>id!==scenario.id))}/><span><strong>{scenario.name}</strong><small>{scenario.sourceAction} · {scenario.players===2?'HU':`${scenario.players} joueurs`} · Hero {scenario.hero} · {sourceHands(rmData,scenario).length} mains</small></span></label>{error&&<p className="text-signal text-xs">{error}</p>}<Sequence scenario={scenario}/><div className="scenario-card-controls"><button onClick={()=>setEditor(structuredClone(scenario))}>Modifier</button><button onClick={()=>{const copy=structuredClone(scenario);copy.id=crypto.randomUUID();copy.name=`${copy.name} (copie)`.slice(0,100);setEditor(copy);}}>Dupliquer</button><button onClick={()=>setDeleteId(scenario.id)}>Supprimer</button></div></article>;}):<div className="scenario-empty"><h2>{groups.length?'Construis ton premier scénario.':'Importe tes ranges pour commencer.'}</h2><p>{groups.length?'Exemple : limp/fold → Hero limp → Vilain raise 3 bb → Hero ?':'Les actions seront détectées à partir de ta bibliothèque.'}</p><Button onClick={groups.length?create:onLibrary}>{groups.length?'Créer un scénario':'Ouvrir ma bibliothèque'}</Button></div>}</div>
      {saved.scenarios.some(item=>!rmData?.categories[item.catId]?.tabs?.[item.tabId])&&<details className="scenario-unavailable"><summary>Scénarios avec une range introuvable</summary>{saved.scenarios.filter(item=>!rmData?.categories[item.catId]?.tabs?.[item.tabId]).map(item=><div key={item.id}>{item.name} <button onClick={()=>setEditor(structuredClone(item))}>Réassocier une range</button><button onClick={()=>setDeleteId(item.id)}>Supprimer</button></div>)}</details>}
    </section><aside className="scenario-panel scenario-launch"><span className="eyebrow">TA SESSION</span><h2>Entraîner les bonnes mains.</h2><p>{selectedScenarios.length} scénario{selectedScenarios.length>1?'s':''} sélectionné{selectedScenarios.length>1?'s':''}. Seules les mains associées à leur action source seront proposées.</p><DrillLengthField input={length.input} onChange={length.setInput} valid={length.count!==null} label="Nombre de situations" description="Le total de décisions, toutes tables confondues."/><label className="scenario-field">Tables simultanées<select value={tables} onChange={event=>setTables(Number(event.target.value))}>{[1,2,3].map(count=><option key={count} value={count}>{count} table{count>1?'s':''}</option>)}</select></label><Button variant="primary" disabled={!length.count||!selectedScenarios.length} onClick={start}>Lancer l’entraînement →</Button><div className="scenario-lifetime"><span>Décisions validées <b>{saved.total}</b></span><span>Précision globale <b>{saved.total?`${Math.round(saved.correct/saved.total*100)} %`:'—'}</b></span></div><small className="text-muted">Sauvegarde locale et synchronisation du compte via les paramètres de l’app.</small></aside></div></>
    :done?<section className="scenario-panel scenario-summary"><span className="eyebrow">SESSION TERMINÉE</span><h2>{score} / {session.attempts.length} décisions justes</h2><p>{session.attempts.length} situation{session.attempts.length>1?'s':''} jouée{session.attempts.length>1?'s':''} sur {session.length} prévues.</p><div className="scenario-errors">{session.attempts.filter(item=>item.answer!==item.expected).map((item,index)=><div key={index}><b>{item.hand} · {item.name}</b><span>{ACTION_LABELS[item.answer]} → <strong>{ACTION_LABELS[item.expected]}</strong></span></div>)}{session.attempts.length>0&&score===session.attempts.length&&<p>Toutes tes réponses sont justes.</p>}</div><Button variant="primary" onClick={()=>{setSession(null);setDone(false);}}>Choisir ma prochaine session →</Button></section>
    :<><div className="scenario-session-bar"><span>{session.attempts.length} / {session.length} décisions</span><span>{score} justes</span><progress value={session.attempts.length} max={session.length}/></div><div className="scenario-training-tables" style={{'--table-count':session.tables.length} as React.CSSProperties}>{session.tables.map(table=>{const state=simulateScenario(table.scenario),correct=table.answer===table.scenario.correct;return <section className={`scenario-training-table ${session.tables.length>1?'is-multi':''}`} key={table.id}><div className="scenario-table-title"><h2>{table.scenario.name}</h2><span>{table.scenario.players===2?'HEADS-UP':`${table.scenario.players} JOUEURS`}</span></div><Sequence scenario={table.scenario}/><ScenarioTable scenario={table.scenario} hand={table.hand} compact={session.tables.length>1}/><div className="scenario-decision">{table.answer?<><div className={correct?'text-green':'text-signal'} role="status"><strong>{correct?'✓ Correct':'À revoir'} · {ACTION_LABELS[table.scenario.correct]}</strong><p>{table.scenario.explanation||`La réponse configurée pour ce scénario est ${ACTION_LABELS[table.scenario.correct]}.`}</p></div><Button variant="primary" onClick={()=>next(table)}>Continuer →</Button></>:<div className="scenario-answer-buttons">{state.choices.map(action=><Button key={action} onClick={()=>answer(table,action)}>{action==='raise'?(state.currentBet>1?'Reraise':'Raise'):ACTION_LABELS[action]}{action==='call'?` ${bb(state.toCall)} bb`:''}</Button>)}</div>}</div></section>;})}</div></>}
    <Modal open={Boolean(deleteId)} onClose={()=>setDeleteId(null)}><h2 className="text-lg font-bold mb-3">Supprimer ce scénario ?</h2><p className="text-sm text-muted mb-5">Les autres scénarios et les statistiques seront conservés.</p><div className="flex gap-3"><Button onClick={()=>setDeleteId(null)}>Annuler</Button><Button variant="danger" onClick={()=>{saveData(previous=>({...previous,scenarios:previous.scenarios.filter(item=>item.id!==deleteId)}));setSelected(previous=>previous.filter(id=>id!==deleteId));setDeleteId(null);}}>Supprimer</Button></div></Modal>
    <Modal open={quit} onClose={()=>setQuit(false)}><h2 className="text-lg font-bold mb-3">Terminer la session ?</h2><p className="text-muted text-sm mb-5">Les réponses déjà validées sont sauvegardées.</p><div className="flex gap-3"><Button onClick={()=>setQuit(false)}>Continuer à jouer</Button><Button onClick={()=>{setDone(true);setQuit(false);}}>Voir mon bilan</Button></div></Modal>
  </div>;
}
