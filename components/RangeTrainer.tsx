'use client';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSync } from '@/hooks/useSync';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MODES } from './Header';
import { Icon } from './ui/Icon';
import { FlashView } from './flash/FlashView';
import { GrilleView } from './grille/GrilleView';
import { SrsView } from './srs/SrsView';
import { TrackerView } from './tracker/TrackerView';
import { RoadmapView } from './roadmap/RoadmapView';
import { SrsToast } from './ui/SrsToast';
import { SettingsModal } from './modals/SettingsModal';

export default function RangeTrainer() {
  const { rehydrateRmData, selectedTab, currentMode, lastSpot, selectTab, setMode } = useAppStore();
  const { logout, syncState } = useSync();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    rehydrateRmData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTab && lastSpot) {
      selectTab(lastSpot.catId, lastSpot.tabId);
    }
  }, [lastSpot]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderMain = () => {
    if (currentMode === 'roadmap') return <RoadmapView />;
    if (currentMode === 'srs') return <SrsView />;
    if (currentMode === 'tracker') return <TrackerView />;
    if (!selectedTab) return <EmptyView />;
    switch (currentMode) {
      case 'flash':  return <FlashView />;
      case 'grille': return <GrilleView />;
      default:       return <EmptyView />;
    }
  };

  return (
    <div className="h-screen overflow-hidden flex bg-bg">

      {/* ── Mobile sidebar overlay ── */}
      <div className={`md:hidden fixed inset-0 z-40 transition-all duration-300 ${sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <button
          type="button"
          aria-label="Fermer le menu"
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <div className={`absolute left-0 inset-y-0 w-72 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar
            onOpenSettings={() => { setSettingsOpen(true); setSidebarOpen(false); }}
            onClose={() => setSidebarOpen(false)}
            onLogout={logout}
          />
        </div>
      </div>

      {/* ── Desktop sidebar (always visible) ── */}
      <div className="hidden md:block w-[272px] flex-shrink-0 h-full">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} onLogout={logout} />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <Header onOpenSidebar={() => setSidebarOpen(true)} syncState={syncState} />
        <main className="flex-1 overflow-hidden flex flex-col min-h-0 pb-[68px] sm:pb-0">
          {renderMain()}
        </main>
        <nav aria-label="Navigation principale" className="sm:hidden fixed inset-x-0 bottom-0 z-30 h-[68px] border-t border-border bg-bg2/95 backdrop-blur-md grid grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
          {MODES.map(mode => (
            <button key={mode.id} onClick={() => setMode(mode.id)} aria-current={currentMode === mode.id ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${currentMode === mode.id ? 'text-accent' : 'text-muted hover:text-text'}`}>
              <Icon name={mode.icon} size={20} />
              {mode.label}
            </button>
          ))}
        </nav>
      </div>

      <SrsToast />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function EmptyView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-4"><Icon name="target" size={28} /></div>
      <h3 className="text-base font-semibold text-text">Commence ton entraînement</h3>
      <p className="text-sm mt-2 max-w-md leading-relaxed">
        Ouvre un dossier dans le menu, puis sélectionne une position pour lancer un exercice.
      </p>
      <div className="mt-5 flex items-center gap-2 text-xs" aria-label="Parcours de démarrage">
        <span className="rounded-full bg-accent/15 text-accent px-2.5 py-1">1. Dossier</span>
        <span aria-hidden="true">→</span>
        <span className="rounded-full bg-bg3 text-muted px-2.5 py-1">2. Spot</span>
        <span aria-hidden="true">→</span>
        <span className="rounded-full bg-bg3 text-muted px-2.5 py-1">3. Mode</span>
      </div>
      <p className="text-xs mt-5">Pas encore de ranges ? Importe un fichier <strong className="text-text">.rm</strong> depuis Range Manager.</p>
    </div>
  );
}
