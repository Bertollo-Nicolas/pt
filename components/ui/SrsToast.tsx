'use client';
import { useAppStore, getCfg } from '@/store/appStore';

export function SrsToast() {
  const store = useAppStore();
  const { pendingSrsKey, selectedTabKey, selectedTab, srs, confirmSrsProposal, setPendingSrsKey } = store;
  const cfg = getCfg(store);

  // Show only when: there's a pending proposal for the CURRENT tab, not already in SRS
  if (!pendingSrsKey || pendingSrsKey !== selectedTabKey || !selectedTab || srs[pendingSrsKey]) {
    return null;
  }

  return (
    <div className="fixed top-[52px] left-3 md:top-4 md:left-[280px] z-50 bg-bg2 border border-accent/50 rounded-lg p-3 shadow-xl w-[240px]">
      <div className="text-[11px] font-bold text-text mb-0.5">🧠 Ajouter au SRS ?</div>
      <div className="text-[10px] text-muted mb-2.5 leading-relaxed">
        <strong className="text-text">{selectedTab.name}</strong>
        <span className="block text-[9px] mt-px">
          {selectedTab.catName} · seuil {cfg.threshold}% atteint
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => confirmSrsProposal(pendingSrsKey)}
          className="flex-1 px-2 py-1.5 text-[11px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity cursor-pointer"
        >
          Oui
        </button>
        <button
          onClick={() => setPendingSrsKey(null)}
          className="flex-1 px-2 py-1.5 text-[11px] rounded border border-border text-muted hover:text-text transition-colors cursor-pointer"
        >
          Non
        </button>
      </div>
    </div>
  );
}
