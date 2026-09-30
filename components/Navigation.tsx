'use client';
import { useAppStore } from '@/store/appStore';
import { MODES } from './Header';
import { Icon } from './ui/Icon';
import { todayStr } from '@/lib/utils';
import { srsRequiresDrill } from '@/lib/srs';

export function Navigation({ onSettings, onLibrary, onClose, onLogout }: { onSettings: () => void; onLibrary: () => void; onClose?: () => void; onLogout: () => void }) {
  const { currentMode, setMode, srs } = useAppStore();
  const due = Object.values(srs).filter(entry => entry.nextReview <= todayStr() || srsRequiresDrill(entry)).length;
  return <aside className="main-navigation">
    <div className="brand"><span className="brand-symbol">r<span>↗</span></span><div>range<span className="brand-caption">TRAINER / PREFLOP</span></div>{onClose && <button className="icon-control ml-auto" onClick={onClose} aria-label="Fermer la navigation"><Icon name="close"/></button>}</div>
    <div className="workspace-select"><span className="workspace-avatar">P</span><div><strong>Mon espace poker</strong><span>Apprendre. Pratiquer. Progresser.</span></div></div>
    <nav aria-label="Navigation principale" className="nav-links">
      {MODES.map((mode, index) => <div key={mode.id}>
        {(index === 0 || index === 2 || index === 5) && <p className="nav-label">{index === 0 ? 'VUE D’ENSEMBLE' : index === 2 ? 'ENTRAÎNEMENT' : 'ANALYSE'}</p>}
        <button data-mode={mode.id} aria-current={currentMode === mode.id ? 'page' : undefined} onClick={() => { setMode(mode.id); onClose?.(); }} className={`nav-link ${currentMode === mode.id ? 'is-active' : ''}`}><Icon name={mode.icon} size={18}/><span>{mode.label}</span>{mode.id === 'srs' && due > 0 ? <span className="nav-count">{due}</span> : currentMode === mode.id ? <span className="nav-active-dot"/> : null}</button>
      </div>)}
    </nav>
    <div className="nav-bottom"><button className="library-card" onClick={onLibrary}><span className="flex items-center gap-2 text-text"><Icon name="folder" size={17}/>Ta bibliothèque<Icon name="chevron" size={14} className="ml-auto"/></span><span className="block mt-2 text-xs text-muted">Toutes tes ranges, au même endroit.</span></button>
      <button className="nav-link" onClick={onSettings}><Icon name="settings" size={17}/>Paramètres</button>
      <button className="nav-link" onClick={onLogout}><Icon name="logout" size={17}/>Déconnexion</button>
      <div className="nav-footer"><span className="h-1.5 w-1.5 bg-accent rounded-full"/>BUILD YOUR EDGE<span className="ml-auto">↗</span></div>
    </div>
  </aside>;
}
