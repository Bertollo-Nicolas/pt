'use client';
import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAppStore } from '@/store/appStore';
import { countCombos, tabKey } from '@/lib/poker';
import { todayStr, diffDays } from '@/lib/utils';
import type { Category, SrsEntry } from '@/lib/types';

import { Modal, ModalTitle, ModalBody, ModalActions } from './ui/Modal';

export function Sidebar({ onOpenSettings, onClose, onLogout }: { onOpenSettings: () => void; onClose?: () => void; onLogout?: () => void }) {
  const { rmData, rmFiles, srs, importRmFile, deleteRmFile, renameRmFile, selectTab, setMode, selectedTabKey } = useAppStore();
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [showFiles, setShowFiles] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ name: string; content: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (f: File) => {
      const r = new FileReader();
      r.onload = async (e) => {
        const content = e.target?.result as string;
        if (!content) return;
        setPendingFile({ name: f.name.replace(/\.rm$/, ''), content });
        setNewFolderName(f.name.replace(/\.rm$/, ''));
      };
      r.readAsText(f);
    },
    [],
  );

  const confirmImport = async (targetName: string) => {
    if (!pendingFile) return;
    let finalName = targetName;
    if (!finalName.endsWith('.rm')) finalName += '.rm';

    importRmFile(finalName, pendingFile.content);

    // Also persist to DB
    try {
      await fetch('/api/rm-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: finalName, content: pendingFile.content }),
      });
    } catch { /* offline — localStorage fallback */ }
    
    setPendingFile(null);
  };

  const handleDeleteFile = async (name: string) => {
    if (!confirm(`Supprimer le dossier "${name.replace(/\.rm$/, '')}" ?`)) return;
    deleteRmFile(name);
    try {
      await fetch(`/api/rm-files?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    } catch { /* ignore */ }
  };

  const handleRenameFile = async (oldName: string) => {
    const currentName = oldName.replace(/\.rm$/, '');
    let newName = prompt('Nouveau nom pour ce dossier ?', currentName);
    if (newName === null || !newName || newName === currentName) return;
    
    if (!newName.endsWith('.rm')) newName += '.rm';
    renameRmFile(oldName, newName);

    try {
      await fetch('/api/rm-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, oldName }),
      });
    } catch { /* ignore */ }
  };

  const toggleCat = (id: string) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const today = todayStr();
  const dueCount = Object.values(srs).filter((e: SrsEntry) => e.nextReview <= today).length;

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
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('border-accent'); }}
        onDragLeave={() => dropRef.current?.classList.remove('border-accent')}
        onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('border-accent'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        className="mx-2.5 my-2 border border-dashed border-border2 rounded p-2.5 text-center cursor-pointer transition-all hover:border-accent hover:bg-accent/5 flex-shrink-0"
      >
        <strong className="text-[11px] block mb-0.5">📂 Importer un fichier .rm</strong>
        <p className="text-[10px] text-muted">Cliquer ou glisser-déposer</p>
      </div>
      <input
        ref={fileInputRef}
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
      <div className="flex-1 overflow-y-auto p-1.5 min-h-0 pb-0">
        {!rmData || (rmData.categories.root.children?.length ?? 0) === 0 ? (
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

      {/* Files management toggle */}
      <div className="px-2.5 py-2 border-t border-border flex-shrink-0">
        <button
          onClick={() => setShowFiles(!showFiles)}
          className="w-full text-[10px] text-muted hover:text-text flex items-center justify-between uppercase tracking-wider font-bold transition-colors cursor-pointer"
        >
          <span>📁 Gérer les dossiers ({Object.keys(rmFiles).length})</span>
          <span>{showFiles ? '▾' : '▸'}</span>
        </button>
        {showFiles && (
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto no-scrollbar">
            {Object.keys(rmFiles).map(name => (
              <div key={name} className="flex items-center justify-between gap-2 px-1.5 py-1 bg-bg3 rounded text-[10px] group">
                <span className="truncate text-muted group-hover:text-text transition-colors flex-1">{name.replace(/\.rm$/, '')}</span>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRenameFile(name)}
                    className="text-muted hover:text-accent transition-colors cursor-pointer"
                    title="Renommer"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteFile(name)}
                    className="text-muted hover:text-red transition-colors cursor-pointer"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — logout */}
      {onLogout && (
        <div className="flex-shrink-0 border-t border-border px-3 py-2">
          <button
            onClick={onLogout}
            className="w-full text-left text-[10px] text-muted hover:text-red transition-colors cursor-pointer py-1"
          >
            ⎋ Déconnexion
          </button>
        </div>
      )}

      {/* Import Modal */}
      <Modal open={!!pendingFile} onClose={() => setPendingFile(null)} className="max-w-[360px]">
        <ModalTitle>📂 Importer des ranges</ModalTitle>
        <ModalBody>
          Choisissez un dossier existant pour mettre à jour les ranges, ou créez-en un nouveau.
        </ModalBody>

        <div className="space-y-3 mb-6 mt-4">
          {/* Existing folders list */}
          {Object.keys(rmFiles).length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted uppercase font-bold tracking-wider ml-1">Mettre à jour un dossier</label>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto no-scrollbar">
                {Object.keys(rmFiles).map(name => (
                  <button
                    key={name}
                    onClick={() => confirmImport(name)}
                    className="w-full text-left px-3 py-2 bg-bg3 hover:bg-bg4 rounded border border-border text-[12px] transition-colors font-medium text-text"
                  >
                    {name.replace(/\.rm$/, '')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* New folder input */}
          <div className="space-y-2 pt-3 border-t border-border">
            <label className="text-[10px] text-muted uppercase font-bold tracking-wider ml-1">Nouveau dossier</label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex: Cash Game, MTT..."
                className="flex-1 bg-bg3 border border-border rounded px-3 py-2 text-[12px] text-text outline-none focus:border-accent/50"
                onKeyDown={(e) => { if (e.key === 'Enter' && newFolderName.trim()) confirmImport(newFolderName.trim()); }}
              />
              <button
                disabled={!newFolderName.trim()}
                onClick={() => confirmImport(newFolderName.trim())}
                className="bg-accent text-white px-4 py-2 rounded text-[11px] font-bold disabled:opacity-50 transition-opacity cursor-pointer whitespace-nowrap"
              >
                Créer
              </button>
            </div>
          </div>
        </div>

        <ModalActions>
          <button
            onClick={() => setPendingFile(null)}
            className="w-full py-2 bg-bg3 hover:bg-bg4 text-muted text-[11px] font-bold rounded transition-colors"
          >
            Annuler
          </button>
        </ModalActions>
      </Modal>
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
  srs: Record<string, SrsEntry>;
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
