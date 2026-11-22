'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSync } from '@/hooks/useSync';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Navigation } from './Navigation';
import { Dashboard } from './Dashboard';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { FlashView } from './flash/FlashView';
import { GrilleView } from './grille/GrilleView';
import { SrsView } from './srs/SrsView';
import { SrsToast } from './ui/SrsToast';
import { SettingsModal } from './modals/SettingsModal';
import { getRangeGroups } from '@/lib/range-options';
import { ScenarioDrillView } from './scenarios/ScenarioDrillView';

export default function RangeTrainer() {
  const { rehydrateRmData, selectedTab, currentMode, lastSpot, selectTab } = useAppStore();
  const { logout, syncState } = useSync();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const closeLibrary = useCallback(() => setLibraryOpen(false), []);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);
  const openLibrary = () => { setLibraryOpen(true); setNavigationOpen(false); };
  const openSettings = () => { setSettingsOpen(true); setNavigationOpen(false); setLibraryOpen(false); };
  useEffect(() => { rehydrateRmData(); }, [rehydrateRmData]);
  useEffect(() => {
    if (!selectedTab && lastSpot) selectTab(lastSpot.catId, lastSpot.tabId);
  }, [lastSpot, selectedTab, selectTab]);
  useEffect(() => {
    if (currentMode === 'roadmap' || currentMode === 'tracker' || currentMode === 'review') useAppStore.getState().setMode('home');
  }, [currentMode]);
  const renderMain = () => {
    if (currentMode === 'home') return <Dashboard onLibrary={openLibrary}/>;
    if (currentMode === 'srs') return <SrsView />;
    if (currentMode === 'drill') return <ScenarioDrillView onLibrary={openLibrary}/>;
    if (!selectedTab) return <ChooseRange onLibrary={openLibrary}/>;
    if (currentMode === 'flash') return <FlashView />;
    if (currentMode === 'grille') return <GrilleView />;
    return <Dashboard onLibrary={openLibrary}/>;
  };
  return <div className="app-shell">
    <div className="workspace-main"><Header onOpenSidebar={() => setNavigationOpen(true)} onOpenLibrary={openLibrary} onSettings={openSettings} onLogout={logout} syncState={syncState}/><main id="main-content" className="flex-1 overflow-hidden flex flex-col min-h-0">{renderMain()}</main></div>
    <Modal open={navigationOpen} onClose={closeNavigation} className="navigation-dialog"><Navigation onSettings={openSettings} onLibrary={openLibrary} onClose={closeNavigation} onLogout={logout}/></Modal>
    <Modal open={libraryOpen} onClose={closeLibrary} className="library-dialog"><Sidebar onOpenSettings={openSettings} onClose={closeLibrary}/></Modal>
    <SrsToast/><SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)}/>
  </div>;
}

function ChooseRange({ onLibrary }: { onLibrary: () => void }) {
  const { currentMode, rmData, selectTab } = useAppStore();
  const spots = getRangeGroups(rmData).flatMap(group => group.tabs.map(tab => ({ catId: group.catId, tabId: tab.id, name: tab.name, category: group.path })));
  return <div className="dashboard-scroll"><div className="choose-range"><span className="eyebrow">{currentMode === 'flash' ? 'FLASHCARDS / DÉCISION PAR DÉCISION' : 'RANGE BUILDER / VUE D’ENSEMBLE'}</span><h1>{currentMode === 'flash' ? 'Travaille tes réflexes.' : 'Reconstruis ta range.'}</h1><p>Choisis une range pour commencer ton entraînement.</p>{spots.length ? <div className="range-picker-grid">{spots.map(spot => <button key={`${spot.catId}-${spot.tabId}`} onClick={() => selectTab(spot.catId, spot.tabId)} className="range-picker-card"><Icon name="grid" size={20}/><span><small>{spot.category}</small><strong>{spot.name}</strong></span><Icon name="chevron" size={16}/></button>)}</div> : <div className="onboarding-panel"><Icon name="folder" size={32}/><h2>Tout commence avec tes ranges.</h2><p>Importe un fichier Range Manager pour retrouver tes positions et démarrer tes exercices.</p><button className="focus-cta" onClick={onLibrary}>Importer mes ranges<Icon name="upload" size={16}/></button></div>}</div></div>;
}
