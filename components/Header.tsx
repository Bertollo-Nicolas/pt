'use client';
import { useAppStore } from '@/store/appStore';
import type { Mode } from '@/lib/types';
import { Icon, type IconName } from './ui/Icon';

export const MODES: { id: Mode; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Vue d’ensemble', icon: 'grid' },
  { id: 'roadmap', label: 'Mon parcours', icon: 'roadmap' },
  { id: 'flash', label: 'Flashcards', icon: 'flash' },
  { id: 'grille', label: 'Range builder', icon: 'target' },
  { id: 'srs', label: 'Révisions', icon: 'calendar' },
  { id: 'tracker', label: 'Analyse du jeu', icon: 'chart' },
  { id: 'review', label: 'Revue de mains', icon: 'search' },
];

export function Header({ onOpenSidebar, onOpenLibrary, syncState }: { onOpenSidebar: () => void; onOpenLibrary: () => void; syncState: 'loading' | 'saving' | 'synced' | 'offline' }) {
  const { currentMode, selectedTab } = useAppStore();
  const training = currentMode === 'flash' || currentMode === 'grille';
  return <header className="workspace-header">
    <button onClick={onOpenSidebar} className="icon-control md:hidden" aria-label="Ouvrir la navigation"><Icon name="menu" /></button>
    <div className="flex items-center gap-3 min-w-0 text-sm">
      <span className="text-muted hidden sm:inline">Espace personnel</span><span className="text-muted2 hidden sm:inline">/</span>
      <span className="truncate">{MODES.find(mode => mode.id === currentMode)?.label}</span>
      {training && selectedTab && <><span className="text-muted2">/</span><span className="truncate text-muted hidden lg:inline">{selectedTab.name}</span></>}
    </div>
    <div className="ml-auto flex items-center gap-5">
      <span className="hidden lg:flex items-center gap-2 text-xs text-muted" role="status"><span className={`h-1.5 w-1.5 rounded-full ${syncState === 'synced' ? 'bg-green' : syncState === 'offline' ? 'bg-orange' : 'bg-muted animate-pulse'}`} />{syncState === 'synced' ? 'À jour' : syncState === 'offline' ? 'Hors ligne' : 'Synchronisation…'}</span>
      <button className="library-trigger" onClick={onOpenLibrary}><Icon name="folder" size={16}/><span>Mes ranges</span><Icon name="chevron" size={13}/></button>
    </div>
  </header>;
}
