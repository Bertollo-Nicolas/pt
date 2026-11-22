'use client';
import { useAppStore } from '@/store/appStore';
import type { Mode } from '@/lib/types';
import { Icon, type IconName } from './ui/Icon';
import { TrainingRangeSelect } from './TrainingRangeSelect';
import { modePath,navigateWorkspace } from '@/lib/workspace-navigation';
export const MODES:{id:Mode;label:string;icon:IconName}[]=[
  {id:'home',label:'Accueil',icon:'grid'},
  {id:'flash',label:'Flashcards',icon:'flash'},
  {id:'grille',label:'Range builder',icon:'target'},
  {id:'srs',label:'Révisions',icon:'calendar'},
  {id:'drill',label:'Drills',icon:'roadmap'},
];
export function Header({onOpenSidebar,onOpenLibrary,onSettings,onLogout,syncState}:{onOpenSidebar:()=>void;onOpenLibrary:()=>void;onSettings?:()=>void;onLogout?:()=>void;syncState:'loading'|'saving'|'synced'|'offline'}){
  const {currentMode,lastSpot}=useAppStore();
  const training=currentMode==='flash'||currentMode==='grille';
  return <><header className="app-topbar"><button className="mobile-menu icon-control" onClick={onOpenSidebar} aria-label="Ouvrir la navigation"><Icon name="menu"/></button><button className="app-wordmark" onClick={()=>navigateWorkspace('/')} aria-label="Range, accueil"><span>r<span>↗</span></span>range<small>TRAINING</small></button>
    <nav aria-label="Navigation principale" className="app-topnav">{MODES.map(mode=><a key={mode.id} href={modePath(mode.id,lastSpot)} data-mode={mode.id} aria-current={currentMode===mode.id?'page':undefined} onClick={event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();navigateWorkspace(modePath(mode.id,lastSpot));}}><Icon name={mode.icon} size={15}/>{mode.label}</a>)}</nav>
    <div className="app-topbar-tools"><span className={`connection-dot is-${syncState}`} role="status" aria-label={syncState==='synced'?'Synchronisé':syncState==='offline'?'Hors ligne':'Synchronisation en cours'} title={syncState==='synced'?'Synchronisé':syncState==='offline'?'Hors ligne':'Synchronisation en cours'}/><button className="topbar-library" aria-label="Bibliothèque" onClick={onOpenLibrary}><Icon name="folder" size={16}/><span>Bibliothèque</span></button>{onSettings&&<button className="topbar-icon" onClick={onSettings} aria-label="Paramètres"><Icon name="settings" size={17}/></button>}{onLogout&&<button className="topbar-icon" onClick={onLogout} aria-label="Déconnexion"><Icon name="logout" size={17}/></button>}</div>
  </header>{training&&<div className="active-range-bar"><span>RANGE ACTIVE</span><TrainingRangeSelect/><button onClick={onOpenLibrary}>Gérer les ranges <Icon name="chevron" size={13}/></button></div>}</>;
}
