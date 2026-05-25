'use client';
import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAppStore } from '@/store/appStore';
import { countCombos, tabKey } from '@/lib/poker';
import { todayStr, diffDays } from '@/lib/utils';
import type { Category } from '@/lib/types';

export function Sidebar({ onOpenSettings, onClose }: { onOpenSettings: () => void; onClose?: () => void }) {
  const { rmData, srs, loadRmFile, selectTab, setMode, selectedTabKey } = useAppStore();
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(
    (f: File) => {
      const r = new FileReader();
      r.onload = (e) => { if (e.target?.result) loadRmFile(e.target.result as string); };
      r.readAsText(f);
    },
    [loadRmFile],
  );

  const toggleCat = (id: string) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const today = todayStr();
  const dueCount = Object.values(srs).filter((e) => e.nextReview <= today).length;

  return (
    <aside className="bg-bg2 border-r border-border flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="px-3.5 pt-3.5 pb-2.5 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <div className="text-[15px] font-bold tracking-tight">
            Range <span className="text-accent">Trainer</span>{' '}
            <span className="text-[10px] text-muted font-normal">v5</span>
          </div>
          <div className="text-[10px] text-muted mt-0.5 hidden sm:block">Compatible .rm — Range Manager</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onOpenSettings}
            className="bg-transparent border border-border rounded px-2 py-1 text-muted cursor-pointer text-sm hover:text-text hover:border-border2 transition-colors"
            title="Paramètres"
          >
            ⚙️
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden bg-transparent border border-border rounded px-2 py-1 text-muted cursor-pointer text-sm hover:text-text hover:border-border2 transition-colors"
              title="Fermer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div
        ref={dropRef}
        onClick={() => document.getElementById('rm-file-input')?.click()}
        onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('border-accent'); }}
        onDragLeave={() => dropRef.current?.classList.remove('border-accent')}
        onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('border-accent'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        className="mx-2.5 my-2 border border-dashed border-border2 rounded p-2.5 text-center cursor-pointer transition-all hover:border-accent hover:bg-accent/5 flex-shrink-0"
      >
        <strong className="text-[11px] block mb-0.5">📂 Importer un fichier .rm</strong>
        <p className="text-[10px] text-muted">Cliquer ou glisser-déposer</p>
      </div>
      <input
        id="rm-file-input"
        type="file"
        accept=".rm,.json"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />

      {/* Search */}
      <div className="px-2.5 py-1.5 border-b border-border flex-shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍  Rechercher un spot…"
          className="w-full bg-bg3 border border-border rounded px-2 py-1 text-xs text-text placeholder-muted outline-none focus:border-border2"
        />
      </div>

      {/* SRS banner */}
      {dueCount > 0 && (
        <div
          onClick={() => setMode('srs')}
          className="mx-2.5 my-1.5 bg-red/5 border border-red/25 rounded p-2 cursor-pointer hover:bg-red/10 flex-shrink-0"
        >
          <div className="text-[11px] font-bold text-red">🔴 {dueCount} range{dueCount > 1 ? 's' : ''} à réviser aujourd&apos;hui</div>
          <div className="text-[10px] text-muted mt-0.5">Cliquer pour voir</div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 min-h-0">
        {!rmData ? (
          <p className="p-3 text-[11px] text-muted text-center">Importe un fichier .rm</p>
        ) : (
          (rmData.categories.root.children ?? []).map((id) => (
            <TreeNode
              key={id}
              id={id}
              cats={rmData.categories}
              openCats={openCats}
              onToggle={toggleCat}
              search={search.toLowerCase()}
              selectedTabKey={selectedTabKey}
              srs={srs}
              today={today}
              onSelectTab={(catId, tabId) => selectTab(catId, tabId)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function TreeNode({
  id, cats, openCats, onToggle, search,
  selectedTabKey, srs, today, onSelectTab,
}: {
  id: string;
  cats: Record<string, Category>;
  openCats: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  selectedTabKey: string | null;
  srs: Record<string, import('@/lib/types').SrsEntry>;
  today: string;
  onSelectTab: (catId: string, tabId: string) => void;
}) {
  const cat = cats[id];
  if (!cat) return null;
  const isOpen = openCats.has(id);

  if (cat.children) {
    return (
      <div className="mb-0.5">
        <div
          onClick={() => onToggle(id)}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted cursor-pointer rounded hover:bg-bg3 hover:text-text transition-colors"
        >
          <span className={clsx('text-[8px] transition-transform duration-150', isOpen && 'rotate-90')}>▶</span>
          {cat.name}
        </div>
        {isOpen && (
          <div className="pl-1.5">
            {cat.children.map((cid) => (
              <TreeNode key={cid} id={cid} cats={cats} openCats={openCats} onToggle={onToggle}
                search={search} selectedTabKey={selectedTabKey} srs={srs} today={today} onSelectTab={onSelectTab} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (cat.tabList && cat.tabs) {
    return (
      <div className="mb-0.5">
        <div
          onClick={() => onToggle(id)}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted cursor-pointer rounded hover:bg-bg3 hover:text-text transition-colors"
        >
          <span className={clsx('text-[8px] transition-transform duration-150', isOpen && 'rotate-90')}>▶</span>
          {cat.name}
        </div>
        {isOpen && (
          <div className="pl-1.5">
            {cat.tabList.map((tid) => {
              const tab = cat.tabs![tid];
              if (!tab) return null;
              const key = tabKey(id, tid);
              const name = (cat.name + ' ' + tab.name).toLowerCase();
              if (search && !name.includes(search)) return null;
              const srsEntry = srs[key];
              const isDue = srsEntry && srsEntry.nextReview <= today;
              const days = srsEntry && !isDue ? diffDays(today, srsEntry.nextReview) : null;
              const isSelected = selectedTabKey === key;

              return (
                <div
                  key={tid}
                  onClick={() => onSelectTab(id, tid)}
                  className={clsx(
                    'flex items-center justify-between px-2 py-1 text-xs cursor-pointer rounded mb-px transition-all duration-150 gap-1',
                    isSelected ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-bg3 hover:text-text',
                  )}
                >
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tab.name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full', isSelected ? 'bg-accent/20 text-accent' : 'bg-bg3 text-muted')}>
                      {countCombos(tab.rangeList)}
                    </span>
                    {srsEntry && (
                      <span className={clsx('text-[9px] px-1.5 py-px rounded-full font-bold', isDue ? 'bg-red/20 text-red border border-red/40' : days !== null && days <= 3 ? 'bg-orange/15 text-orange border border-orange/30' : 'bg-green/15 text-green border border-green/30')}>
                        {isDue ? 'À réviser' : days !== null && days <= 3 ? `J+${days}` : 'SRS ✓'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}
