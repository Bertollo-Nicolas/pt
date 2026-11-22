'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { getRangeGroups } from '@/lib/range-options';
import { buildRangeMap, getRangeActionDefs } from '@/lib/poker';
import { ACTION_LABELS, defaultSequence, emptyScenarioData, migrateScenario, moveOf, possibleOptions, positionsFor, replayScenario, sequenceSteps, sourceHands, validateScenario, type Position, type ScenarioAction, type ScenarioOption, type ScenarioStep, type TrainingScenario } from '@/lib/scenario-drill';
import type { RmData } from '@/lib/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { bb, ScenarioTable } from './ScenarioTable';
export const rangeValue=(catId:string,tabId:string)=>JSON.stringify([catId,tabId]);
export function RangeField({value,onChange,data}:{value:string;onChange:(value:string)=>void;data:RmData|null}){
  return <label className="studio-field">Range<select aria-label="Range" value={value} onChange={event=>onChange(event.target.value)}><option value="" disabled>Choisir une range</option>{getRangeGroups(data).map(group=><optgroup key={group.catId} label={group.path}>{group.tabs.map(tab=><option key={tab.id} value={rangeValue(group.catId,tab.id)}>{group.path} / {tab.name}</option>)}</optgroup>)}</select></label>;
}
export function ScenarioEditor({initial,data,onClose}:{initial:TrainingScenario;data:RmData|null;onClose:()=>void}){
  const [draft,setDraft]=useState(()=>migrateScenario(initial));
  const [selected,applySelected]=useState(()=>useAppStore.getState().config.drillWorkspace?.draft?.id===initial.id?useAppStore.getState().config.drillWorkspace?.editorStep??0:0),[dirty,setDirty]=useState(false),[touched,setTouched]=useState(false),[confirmClose,setConfirmClose]=useState(false);
  const setSelected=(value:number)=>{setTouched(true);applySelected(value);};
  useEffect(()=>{
    if(touched)return;
    setDraft(migrateScenario(initial));
    const workspace=useAppStore.getState().config.drillWorkspace;
    if(workspace?.draft?.id===initial.id)applySelected(workspace.editorStep??0);
  },[initial,touched]);
  useEffect(()=>{
    const store=useAppStore.getState(),workspace=store.config.drillWorkspace;
    if(!touched)return;
    if(JSON.stringify(workspace?.draft)===JSON.stringify(draft)&&workspace?.editorStep===selected)return;
    store.saveConfig({drillWorkspace:{...workspace,updatedAt:Date.now(),draft,editorStep:selected}});
  },[draft,touched,selected]);
  const patch=(value:Partial<TrainingScenario>)=>{setTouched(true);setDirty(true);setDraft(previous=>({...previous,...value}));};
  const steps=sequenceSteps(draft);
  const index=Math.min(selected,steps.length-1),step=steps[index];
  const prefix=steps.slice(0,Math.max(0,index)).map(moveOf);
  const pool=sourceHands(data,draft),error=validateScenario(draft,data);
  const tab=data?.categories[draft.catId]?.tabs?.[draft.tabId];
  const actions=useMemo(()=>data&&tab?getRangeActionDefs(buildRangeMap(tab.rangeList,data.ranges)).map(([name])=>name).filter(sourceAction=>sourceHands(data,{...draft,sourceAction}).length):[],[data,tab,draft]);
  const patchStep=(i:number,updates:Partial<ScenarioStep>)=>patch({steps:steps.map((item,j)=>j===i?{...item,...updates}:item)});
  const patchOption=(i:number,id:string,updates:Partial<ScenarioOption>)=>patchStep(i,{options:steps[i].options!.map(option=>option.id===id?{...option,...updates}:option)});
  const configureTable=(players:number,hero:Position)=>{const updated={...draft,players,hero};patch({...updated,steps:defaultSequence(updated)});setSelected(0);};
  const close=()=>dirty?setConfirmClose(true):onClose();
  const add=()=>{
    const state=replayScenario(draft,steps.map(moveOf));
    const actor=state.nextActor??draft.hero;
    const options=possibleOptions(draft,steps.map(moveOf));
    const item:ScenarioStep=actor===draft.hero?{actor,action:'check',amount:0,options,correctId:options[0]?.id}:{actor,action:state.currentBet>1?'call':'check',amount:0};
    patch({steps:[...steps,item]});setSelected(steps.length);
  };
  return <div className="studio-editor"><header className="page-titlebar"><div><span className="overline">DRILLS / ÉDITEUR</span><h1>Construire une séquence</h1></div><div className="title-actions"><Button onClick={close}>Retour</Button><Button variant="primary" disabled={Boolean(error)} onClick={()=>{const store=useAppStore.getState(),saved=store.config.scenarioDrill??emptyScenarioData();store.saveConfig({drillWorkspace:{...store.config.drillWorkspace,updatedAt:Date.now(),draft:null,editorStep:0},scenarioDrill:{...saved,scenarios:[...saved.scenarios.filter(item=>item.id!==draft.id),{...draft,name:draft.name.trim()}]}});onClose();}}>Enregistrer</Button></div></header>
    <div className="studio-editor-layout">
      <aside className="studio-context"><div className="panel-heading"><span className="step-number">01</span><h2>Le contexte</h2></div>
        <label className="studio-field">Nom du scénario<input aria-label="Nom du scénario" maxLength={100} value={draft.name} onChange={event=>patch({name:event.target.value})}/></label>
        <RangeField value={rangeValue(draft.catId,draft.tabId)} onChange={value=>{const [catId,tabId]=JSON.parse(value);patch({catId,tabId,sourceAction:''});}} data={data}/>
        <label className="studio-field">Filtrer les mains par action<select aria-label="Action source" value={draft.sourceAction} onChange={event=>patch({sourceAction:event.target.value})}><option value="" disabled>Choisir une action</option>{actions.map(action=><option key={action}>{action}</option>)}</select><small>{pool.length} mains éligibles · fréquences positives</small></label>
        <div className="studio-field-pair"><label className="studio-field">Format<select aria-label="Format de table" value={draft.players} onChange={event=>{const count=Number(event.target.value);configureTable(count,positionsFor(count).includes(draft.hero)?draft.hero:'SB');}}>{[2,3,4,5,6].map(count=><option value={count} key={count}>{count===2?'Heads-up':count+' joueurs'}</option>)}</select></label><label className="studio-field">Position Hero<select aria-label="Position de Hero" value={draft.hero} onChange={event=>configureTable(draft.players,event.target.value as Position)}>{positionsFor(draft.players).map(position=><option key={position}>{position}</option>)}</select></label></div>
        <label className="studio-field">Tapis initial par joueur <span className="input-unit"><input aria-label="Tapis initial" type="number" min={2} max={1000} step={.5} value={draft.stack} onChange={event=>patch({stack:Number(event.target.value)})}/><b>bb</b></span></label>
        <div className="studio-guidance"><strong>Jouer depuis la première action</strong><p>Chaque étape de Hero est une question. Configure ses boutons et coche la réponse juste dans la séquence.</p><small>Préflop · Blindes 0,5 / 1 · Sans ante ni tapis.</small></div>
        <p className={error?'studio-validation is-error':'studio-validation'} role="status">{error||'✓ Séquence valide, prête à enregistrer.'}</p>
      </aside>
      <section className="studio-preview"><div className="preview-title"><span>APERÇU DE LA TABLE</span><b>Étape {index+1} / {steps.length}</b></div><ScenarioTable scenario={draft} hand={pool[0]??'AKs'} moves={prefix} active={step?.actor}/><div className="preview-decision"><span>{step?.actor===draft.hero?'DÉCISION DE HERO':'ACTION ADVERSE'}</span><h2>{step?.actor===draft.hero?'Quelle action joues-tu ?':step?step.actor+' · '+ACTION_LABELS[step.action]+(step.action==='raise'?' à '+bb(step.amount)+' bb':''):'Ajoute une étape'}</h2>{step?.actor===draft.hero&&<div className="preview-options">{step.options?.map(option=><span key={option.id}>{option.label}{option.id===step.correctId&&<b>✓</b>}</span>)}</div>}</div></section>
      <section className="studio-script"><div className="panel-heading"><span className="step-number">02</span><h2>La séquence</h2><span className="count-tag">{steps.length} étapes</span></div><p className="script-intro">Dans l’ordre de jeu. Choisis une étape pour la configurer.</p>
        <div className="studio-step-list">{steps.map((item,i)=>{const hero=item.actor===draft.hero,move=moveOf(item);return <article className={`studio-step ${i===index?'is-selected':''} ${hero?'is-question':''}`} key={i}>
          <button className="studio-step-toggle" aria-expanded={i===index} onClick={()=>setSelected(i)}><span className="script-index">{String(i+1).padStart(2,'0')}</span><span><b>{hero?'Hero':item.actor} <small>{hero?'À jouer':'Automatique'}</small></b><span>{hero?(item.options?.find(option=>option.id===item.correctId)?.label??'Réponse à configurer'):ACTION_LABELS[move.action]+(move.action==='raise'?' · '+bb(move.amount)+' bb':'')}</span></span><span>{i===index?'−':'+'}</span></button>
          {i===index&&<div className="studio-step-body"><div className="script-step-tools"><label>Joueur<select aria-label={`Joueur étape ${i+1}`} value={item.actor} onChange={event=>{const actor=event.target.value as Position;if(actor===draft.hero){const options=possibleOptions(draft,steps.slice(0,i).map(moveOf));patchStep(i,{actor,options,correctId:options[0]?.id});}else patchStep(i,{actor,options:undefined,correctId:undefined});}}>{positionsFor(draft.players).map(position=><option key={position} value={position}>{position}{position===draft.hero?' · Hero':''}</option>)}</select></label><button aria-label={`Supprimer étape ${i+1}`} onClick={()=>{patch({steps:steps.filter((_,j)=>j!==i)});setSelected(Math.max(0,i-1));}}>Supprimer</button></div>
            {hero?<><div className="options-caption"><strong>Boutons de réponse</strong><span>✓ = bonne réponse</span></div>{item.options?.map((option,j)=><div className="script-option" key={option.id}><input type="radio" name={`correct-${i}`} aria-label={`Bonne réponse étape ${i+1} bouton ${j+1}`} checked={item.correctId===option.id} onChange={()=>patchStep(i,{correctId:option.id})}/><div><input aria-label={`Libellé étape ${i+1} bouton ${j+1}`} maxLength={32} placeholder="Libellé du bouton" value={option.label} onChange={event=>patchOption(i,option.id,{label:event.target.value})}/><div className="option-action-fields"><select aria-label={`Action étape ${i+1} bouton ${j+1}`} value={option.action} onChange={event=>patchOption(i,option.id,{action:event.target.value as ScenarioAction,amount:event.target.value==='raise'?3:0})}>{Object.entries(ACTION_LABELS).map(([action,label])=><option value={action} key={action}>{label}</option>)}</select>{option.action==='raise'&&<input aria-label={`Montant étape ${i+1} bouton ${j+1}`} type="number" step={.5} value={option.amount} onChange={event=>patchOption(i,option.id,{amount:Number(event.target.value)})}/>}</div></div><button aria-label={`Supprimer bouton ${j+1} étape ${i+1}`} onClick={()=>patchStep(i,{options:item.options!.filter(other=>other.id!==option.id),correctId:item.correctId===option.id?undefined:item.correctId})}>×</button></div>)}<button className="add-option" disabled={(item.options?.length??0)>=6} onClick={()=>patchStep(i,{options:[...(item.options??[]),{id:crypto.randomUUID(),label:'Bouton '+((item.options?.length??0)+1),action:'fold',amount:0}]})}>+ Ajouter un bouton</button><label className="studio-field">Explication après la réponse<input aria-label={`Explication étape ${i+1}`} maxLength={400} value={item.explanation??''} onChange={event=>patchStep(i,{explanation:event.target.value})} placeholder="Facultatif"/></label></>:<div className="opponent-action"><label className="studio-field">Action automatique<select aria-label={`Action adverse étape ${i+1}`} value={item.action} onChange={event=>patchStep(i,{action:event.target.value as ScenarioAction,amount:event.target.value==='raise'?3:0})}>{Object.entries(ACTION_LABELS).map(([action,label])=><option key={action} value={action}>{label}</option>)}</select></label>{item.action==='raise'&&<label className="studio-field">Raise total (bb)<input aria-label={`Montant adverse étape ${i+1}`} type="number" step={.5} value={item.amount} onChange={event=>patchStep(i,{amount:Number(event.target.value)})}/></label>}</div>}
          </div>}
        </article>;})}</div><button className="add-step" disabled={steps.length>=20} onClick={add}>+ Ajouter une étape</button><div className="auto-next-note">Dernière décision → juste / faux → main suivante automatiquement.</div>
      </section>
    </div><Modal open={confirmClose} onClose={()=>setConfirmClose(false)}><h2 className="text-lg font-bold mb-3">Quitter sans enregistrer ?</h2><p className="text-muted text-sm mb-5">Le brouillon est conservé. Tu pourras reprendre les modifications plus tard.</p><div className="flex gap-3"><Button onClick={()=>setConfirmClose(false)}>Continuer l’édition</Button><Button variant="danger" onClick={onClose}>Quitter</Button></div></Modal>
  </div>;
}
