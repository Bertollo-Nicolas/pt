'use client';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSync } from '@/hooks/useSync';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { FlashView } from './flash/FlashView';
import { GrilleView } from './grille/GrilleView';
import { SrsView } from './srs/SrsView';
import { TrackerView } from './tracker/TrackerView';
import { SrsToast } from './ui/SrsToast';
import { SettingsModal } from './modals/SettingsModal';

export default function RangeTrainer() {
  const { rehydrateRmData, selectedTab, currentMode, lastSpot, selectTab } = useAppStore();
  const { logout } = useSync();
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
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          {renderMain()}
        </main>
      </div>

      <SrsToast />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function EmptyView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted px-6 text-center">
      <div aria-hidden="true" className="text-[48px] mb-3">🎯</div>
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
