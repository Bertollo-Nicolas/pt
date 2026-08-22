'use client';
import clsx from 'clsx';
import { useAppStore } from '@/store/appStore';
import type { Mode } from '@/lib/types';
import { Icon, type IconName } from './ui/Icon';
import { IconButton } from './ui/Primitives';

export const MODES: { id: Mode; label: string; icon: IconName }[] = [
  { id: 'roadmap', label: 'Roadmap', icon: 'roadmap' },
  { id: 'flash',  label: 'Flash',  icon: 'flash' },
  { id: 'grille', label: 'Grille', icon: 'grid' },
  { id: 'srs',    label: 'SRS',    icon: 'calendar' },
  { id: 'tracker', label: 'Tracker', icon: 'chart' },
];

export function Header({ onOpenSidebar, syncState }: { onOpenSidebar: () => void; syncState: 'loading' | 'saving' | 'synced' | 'offline' }) {
  const { selectedTab, currentMode, setMode, rmData, lastSpot, selectTab } = useAppStore();
  const spots = rmData ? Object.entries(rmData.categories).flatMap(([catId, cat]) =>
    (cat.tabList ?? []).filter(tabId => cat.tabs?.[tabId]).map(tabId => ({ catId, tabId, name: cat.tabs![tabId].name }))) : [];
  const currentIndex = lastSpot ? spots.findIndex(spot => spot.catId === lastSpot.catId && spot.tabId === lastSpot.tabId) : -1;
  const moveSpot = (delta: number) => {
    if (currentIndex < 0 || spots.length === 0) return;
    const target = spots[(currentIndex + delta + spots.length) % spots.length];
    selectTab(target.catId, target.tabId);
  };

  return (
    <header className="flex items-center gap-2 px-3 md:px-5 py-2.5 border-b border-border flex-shrink-0 bg-bg/95">
      {/* Hamburger — mobile only */}
      <button
        onClick={onOpenSidebar}
        className="md:hidden flex-shrink-0 w-10 h-10 flex items-center justify-center rounded border border-border text-muted hover:text-text hover:border-border2 transition-colors text-base leading-none"
        title="Menu"
        aria-label="Ouvrir le menu"
      >
        <Icon name="menu" />
      </button>

      {/* Spot name */}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold truncate leading-tight">
          {currentMode === 'roadmap' ? 'Roadmap' : selectedTab?.name ?? 'Sélectionne un spot'}
        </h2>
        <p className="text-[11px] text-muted truncate hidden sm:block leading-tight mt-0.5">
          {currentMode === 'roadmap' ? 'Ton parcours guidé par priorité' : selectedTab ? `${selectedTab.catName} / ${selectedTab.name}` : 'Importe un .rm puis clique sur un spot'}
        </p>
      </div>

      {currentMode !== 'roadmap' && selectedTab && spots.length > 1 && (
        <div className="hidden md:flex items-center gap-1" aria-label="Parcourir les spots">
          <IconButton icon="chevron" label="Spot précédent" onClick={() => moveSpot(-1)} className="!w-8 !h-8 [&>svg]:rotate-180"/>
          <IconButton icon="chevron" label="Spot suivant" onClick={() => moveSpot(1)} className="!w-8 !h-8"/>
        </div>
      )}

      <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-muted" title={syncState === 'synced' ? 'Données synchronisées' : syncState === 'saving' ? 'Synchronisation en cours' : syncState === 'offline' ? 'Mode hors ligne' : 'Chargement des données'}>
        <span className={`w-1.5 h-1.5 rounded-full ${syncState === 'synced' ? 'bg-green' : syncState === 'saving' || syncState === 'loading' ? 'bg-orange animate-pulse' : 'bg-red'}`}/>
        {syncState === 'synced' ? 'Synchronisé' : syncState === 'saving' ? 'Enregistrement…' : syncState === 'offline' ? 'Hors ligne' : 'Chargement…'}
      </div>

      {/* Mode tabs */}
      <nav aria-label="Modes d'entraînement" className="hidden sm:flex gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
        {MODES.map((m) => (
          <button
            key={m.id}
            data-mode={m.id}
            onClick={() => setMode(m.id)}
            className={clsx(
              'flex-shrink-0 min-h-8 rounded border transition-all duration-150 text-[11px] font-medium',
              'px-2 py-1 sm:px-3',
              currentMode === m.id
                ? 'bg-accent border-accent text-white'
                : 'bg-transparent border-border text-muted hover:text-text hover:border-border2',
            )}
            aria-label={m.label}
            aria-pressed={currentMode === m.id}
          >
            <Icon name={m.icon} size={15} className="inline-block mr-1.5 align-[-2px]" />
            <span>{m.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
