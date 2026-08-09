'use client';
import clsx from 'clsx';
import { useAppStore } from '@/store/appStore';
import type { Mode } from '@/lib/types';

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'flash',  label: 'Flash',  icon: '⚡' },
  { id: 'grille', label: 'Grille', icon: '⊞' },
  { id: 'srs',    label: 'SRS',    icon: '📅' },
  { id: 'tracker', label: 'Tracker', icon: '📊' },
];

export function Header({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { selectedTab, currentMode, setMode } = useAppStore();

  return (
    <header className="flex items-center gap-2 px-3 md:px-5 py-2.5 border-b border-border flex-shrink-0 bg-bg/95">
      {/* Hamburger — mobile only */}
      <button
        onClick={onOpenSidebar}
        className="md:hidden flex-shrink-0 w-10 h-10 flex items-center justify-center rounded border border-border text-muted hover:text-text hover:border-border2 transition-colors text-base leading-none"
        title="Menu"
        aria-label="Ouvrir le menu"
      >
        ☰
      </button>

      {/* Spot name */}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold truncate leading-tight">
          {selectedTab?.name ?? 'Sélectionne un spot'}
        </h2>
        <p className="text-[10px] text-muted truncate hidden sm:block leading-tight mt-0.5">
          {selectedTab?.catName ?? 'Importe un .rm puis clique sur un spot'}
        </p>
      </div>

      {/* Mode tabs */}
      <nav aria-label="Modes d'entraînement" className="flex gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
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
            <span aria-hidden="true" className="sm:hidden">{m.icon}</span>
            <span className="hidden sm:inline">{m.icon} {m.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
