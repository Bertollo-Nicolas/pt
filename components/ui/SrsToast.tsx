'use client';
import { useAppStore, getCfg } from '@/store/appStore';
import { Icon } from './Icon';

export function SrsToast() {
  const store = useAppStore();
  const { pendingSrsKey, selectedTabKey, selectedTab, srs, confirmSrsProposal, setPendingSrsKey } = store;
  const cfg = getCfg(store);

  // Show only when: there's a pending proposal for the CURRENT tab, not already in SRS
  if (!pendingSrsKey || pendingSrsKey !== selectedTabKey || !selectedTab || srs[pendingSrsKey]) {
    return null;
  }

  return (
    <div role="status" className="fixed top-[64px] left-3 right-3 sm:right-auto md:top-4 md:left-[288px] z-50 bg-bg2 border border-accent/50 rounded-xl p-4 shadow-2xl sm:w-[280px]">
      <div className="text-xs font-bold text-text mb-1 flex items-center gap-2"><Icon name="calendar" size={15}/>Ajouter au SRS ?</div>
      <div className="text-[11px] text-muted mb-3 leading-relaxed">
        <strong className="text-text">{selectedTab.name}</strong>
        <span className="block text-[10px] mt-0.5">
          {selectedTab.catName} · seuil {cfg.threshold}% atteint
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => confirmSrsProposal(pendingSrsKey)}
          className="flex-1 min-h-9 px-2 py-1.5 text-xs font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity cursor-pointer"
        >
          Oui
        </button>
        <button
          onClick={() => setPendingSrsKey(null)}
          className="flex-1 min-h-9 px-2 py-1.5 text-xs rounded border border-border text-muted hover:text-text transition-colors cursor-pointer"
        >
          Non
        </button>
      </div>
    </div>
  );
}
