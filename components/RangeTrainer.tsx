'use client';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { FlashView } from './flash/FlashView';
import { GrilleView } from './grille/GrilleView';
import { SrsView } from './srs/SrsView';
import { SrsToast } from './ui/SrsToast';
import { SettingsModal } from './modals/SettingsModal';

export default function RangeTrainer() {
  const { rehydrateRmData, selectedTab, currentMode, lastSpot, selectTab } = useAppStore();
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
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <div className={`absolute left-0 inset-y-0 w-72 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar
            onOpenSettings={() => { setSettingsOpen(true); setSidebarOpen(false); }}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      </div>

      {/* ── Desktop sidebar (always visible) ── */}
      <div className="hidden md:block w-[272px] flex-shrink-0 h-full">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
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
    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-muted px-6 text-center">
      <div className="text-[44px]">🎯</div>
      <p className="text-[13px]">Importe un fichier <strong className="text-text">.rm</strong> depuis Range Manager</p>
      <p className="text-[11px]">File → Export dans Range Manager</p>
    </div>
  );
}
