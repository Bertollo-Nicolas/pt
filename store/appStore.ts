'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildRangeMap, tabKey } from '@/lib/poker';
import { DEFAULT_CFG, MAX_SESSIONS } from '@/lib/constants';
import { todayStr, addDays } from '@/lib/utils';
import type {
  RmData, RangeColor, SelectedTab, Mode,
  Session, ErrorEntry, SrsEntry, AppConfig, Category, RangeInfo,
} from '@/lib/types';

// ── Persisted (localStorage) ──────────────────────────────
interface Persisted {
  rmFiles: Record<string, string>; // name → content
  config: Partial<AppConfig>;
  sessions: Session[];
  errors: Record<string, ErrorEntry>;
  heatmap: Record<string, number>;
  srs: Record<string, SrsEntry>;
  lastSpot: { catId: string; tabId: string } | null;
  colorOverrides: Record<string, string>; // action name → hex color
}

// ── Ephemeral ─────────────────────────────────────────────
interface Ephemeral {
  rmData: RmData | null;
  rangeColors: Record<string, RangeColor>;
  selectedTab: SelectedTab | null;
  selectedTabKey: string | null;
  currentMode: Mode;
  pendingSrsKey: string | null;
  srsReviewKey: string | null;   // which entry is currently being reviewed
  calYear: number;
  calMonth: number;
}

// ── Actions ───────────────────────────────────────────────
interface Actions {
  importRmFile: (name: string, content: string) => void;
  deleteRmFile: (name: string) => void;
  renameRmFile: (oldName: string, newName: string) => void;
  rehydrateRmData: () => void;
  selectTab: (catId: string, tabId: string) => void;
  setMode: (mode: Mode) => void;
  saveConfig: (cfg: Partial<AppConfig>) => void;
  addSession: (session: Session) => void;
  recordError: (hand: string, given: string, expected: string) => void;
  addSrs: (key: string, entry: SrsEntry) => void;
  updateSrs: (key: string, updates: Partial<SrsEntry>) => void;
  removeSrs: (key: string) => void;
  clearSrs: () => void;
  setPendingSrsKey: (key: string | null) => void;
  confirmSrsProposal: (key: string) => void;
  startSrsReview: (key: string) => void;
  finishSrsReview: (key: string, score: number) => void;
  setCalendar: (year: number, month: number) => void;
  saveColorOverride: (name: string, color: string) => void;
}

export type AppStore = Persisted & Ephemeral & Actions;

function mergeRmFiles(files: Record<string, string>): { rmData: RmData; rangeColors: Record<string, RangeColor> } {
  const merged: RmData = { ranges: {}, categories: { root: { name: 'root', children: [] } } };
  const rangeColors: Record<string, RangeColor> = {};

  for (const [fileName, content] of Object.entries(files)) {
    try {
      const data: RmData = JSON.parse(content);
      const folderId = fileName.replace(/\.rm$/, '').replace(/[^a-zA-Z0-9]/g, '_');
      
      // Add folder to root if not exists
      if (!merged.categories[folderId]) {
        merged.categories[folderId] = { name: fileName.replace(/\.rm$/, ''), children: [] };
        merged.categories.root.children!.push(folderId);
      }

      // Merge ranges
      if (data.ranges) {
        for (const [id, r] of Object.entries(data.ranges) as [string, RangeInfo][]) {
          const newRangeId = `${folderId}__${id}`;
          merged.ranges[newRangeId] = r;
          rangeColors[newRangeId] = { color: r.color || '#888', name: r.name || id };
        }
      }

      // Merge categories into folder
      if (data.categories) {
        // Map old IDs to new prefixed IDs to avoid collisions
        const idMap: Record<string, string> = {};
        for (const oldId of Object.keys(data.categories)) {
          if (oldId === 'root') continue;
          idMap[oldId] = `${folderId}__${oldId}`;
        }

        for (const [oldId, cat] of Object.entries(data.categories) as [string, Category][]) {
          if (oldId === 'root') {
            // Root children from this file go into our folder
            if (cat.children) {
              for (const childId of cat.children) {
                const newId = idMap[childId];
                if (newId) merged.categories[folderId].children!.push(newId);
              }
            }
            continue;
          }

          const newId = idMap[oldId];
          const newCat: Category = { ...cat };
          if (cat.children) newCat.children = cat.children.map(c => idMap[c]).filter(Boolean);
          
          if (cat.tabs) {
            newCat.tabs = {};
            for (const [tId, t] of Object.entries(cat.tabs)) {
              // Prefix range IDs in the tab's rangeList
              const nextRangeList = t.rangeList.map(rl => ({
                ...rl,
                id: `${folderId}__${rl.id}`
              }));
              newCat.tabs[tId] = { ...t, rangeList: nextRangeList };
            }
          }

          merged.categories[newId] = newCat;
        }
      }
    } catch (e) {
      console.error('Failed to parse RM file:', fileName, e);
    }
  }

  return { rmData: merged, rangeColors };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Persisted defaults ────────────────────────────
      rmFiles: {},
      config: {},
      sessions: [],
      errors: {},
      heatmap: {},
      srs: {},
      lastSpot: null,
      colorOverrides: {},

      // ── Ephemeral defaults ────────────────────────────
      rmData: null,
      rangeColors: {},
      selectedTab: null,
      selectedTabKey: null,
      currentMode: 'flash',
      pendingSrsKey: null,
      srsReviewKey: null,
      calYear: new Date().getFullYear(),
      calMonth: new Date().getMonth(),

      // ── Actions ───────────────────────────────────────
      importRmFile: (name, content) => {
        set((s) => {
          const nextFiles = { ...s.rmFiles, [name]: content };
          const { rmData, rangeColors } = mergeRmFiles(nextFiles);
          return { rmFiles: nextFiles, rmData, rangeColors };
        });
      },

      deleteRmFile: (name) => {
        set((s) => {
          const nextFiles = { ...s.rmFiles };
          delete nextFiles[name];
          const { rmData, rangeColors } = mergeRmFiles(nextFiles);
          return { rmFiles: nextFiles, rmData, rangeColors };
        });
      },

      renameRmFile: (oldName, newName) => {
        if (!newName.endsWith('.rm')) newName += '.rm';
        set((s) => {
          const content = s.rmFiles[oldName];
          if (!content) return s;

          const nextFiles = { ...s.rmFiles };
          delete nextFiles[oldName];
          nextFiles[newName] = content;

          // Migrate SRS keys
          const oldPrefix = oldName.replace(/\.rm$/, '').replace(/[^a-zA-Z0-9]/g, '_');
          const newPrefix = newName.replace(/\.rm$/, '').replace(/[^a-zA-Z0-9]/g, '_');
          const nextSrs = { ...s.srs };
          let srsChanged = false;

          for (const key of Object.keys(nextSrs)) {
            if (key.startsWith(`${oldPrefix}__`)) {
              const newKey = key.replace(`${oldPrefix}__`, `${newPrefix}__`);
              nextSrs[newKey] = { ...nextSrs[key], key: newKey };
              delete nextSrs[key];
              srsChanged = true;
            }
          }

          const { rmData, rangeColors } = mergeRmFiles(nextFiles);
          return { 
            rmFiles: nextFiles, 
            rmData, 
            rangeColors, 
            srs: srsChanged ? nextSrs : s.srs 
          };
        });
      },

      rehydrateRmData: () => {
        const { rmFiles, rmData, srs } = get();

        // ── 1. Clean up legacy interval: -1 proposal entries ──
        const cleanSrs = { ...srs };
        let srsChanged = false;
        for (const key of Object.keys(cleanSrs)) {
          if (cleanSrs[key].interval === -1) {
            delete cleanSrs[key];
            srsChanged = true;
          }
        }

        // ── 2. Handle legacy single-file migration ──
        const raw = localStorage.getItem('range-trainer-v5');
        const defaultFileName = 'Mes Ranges.rm';
        const defaultFolderId = 'Mes_Ranges';

        if (raw && Object.keys(rmFiles).length === 0) {
          try {
            const parsed = JSON.parse(raw);
            const legacyContent = parsed.state?.rmFileContent;
            if (legacyContent && typeof legacyContent === 'string') {
              const nextFiles = { [defaultFileName]: legacyContent };
              const { rmData: d, rangeColors } = mergeRmFiles(nextFiles);
              
              // Migrate ALL SRS keys that don't already have a folder prefix
              for (const key of Object.keys(cleanSrs)) {
                if (key.split('__').length <= 2) {
                  const entry = cleanSrs[key];
                  const newKey = `${defaultFolderId}__${key}`;
                  cleanSrs[newKey] = { ...entry, key: newKey };
                  delete cleanSrs[key];
                  srsChanged = true;
                }
              }

              set({ rmFiles: nextFiles, rmData: d, rangeColors, srs: cleanSrs });
              return;
            }
          } catch (e) { console.error('Migration failed', e); }
        }

        // ── 3. Ongoing migration check for SRS keys ──
        // If we have at least one file, try to map legacy keys to the first one
        const fileNames = Object.keys(rmFiles);
        if (fileNames.length > 0) {
          const firstFolderId = fileNames[0].replace(/\.rm$/, '').replace(/[^a-zA-Z0-9]/g, '_');
          for (const key of Object.keys(cleanSrs)) {
            // Legacy keys look like "catId__tabId" (2 segments)
            // New keys look like "folderId__catId__tabId" (3+ segments)
            if (key.split('__').length === 2) {
              const entry = cleanSrs[key];
              const newKey = `${firstFolderId}__${key}`;
              cleanSrs[newKey] = { ...entry, key: newKey };
              delete cleanSrs[key];
              srsChanged = true;
            }
          }
        }

        if (srsChanged) set({ srs: cleanSrs });

        if (Object.keys(rmFiles).length > 0 && !rmData) {
          const { rmData: d, rangeColors } = mergeRmFiles(rmFiles);
          set({ rmData: d, rangeColors });
        }
      },

      selectTab: (catId, tabId) => {
        const { rmData, rangeColors } = get();
        if (!rmData) return;
        const cat = rmData.categories[catId];
        const tab = cat?.tabs?.[tabId];
        if (!tab || !cat) return;
        const key = tabKey(catId, tabId);
        set({
          selectedTab: {
            name: tab.name,
            catName: cat.name,
            rangeList: tab.rangeList,
            rangeMap: buildRangeMap(tab.rangeList, rangeColors),
          },
          selectedTabKey: key,
          lastSpot: { catId, tabId },
        });
      },

      setMode: (mode) => set({ currentMode: mode }),

      saveConfig: (cfg) => set((s) => ({ config: { ...s.config, ...cfg } })),

      addSession: (session) =>
        set((s) => {
          const idx = s.sessions.findIndex(x => x.key === session.key && x.date === session.date);
          let sessions: Session[];
          if (idx !== -1) {
            sessions = [...s.sessions];
            sessions[idx] = session;
          } else {
            sessions = [...s.sessions, session];
          }
          return { sessions: sessions.length > MAX_SESSIONS ? sessions.slice(-MAX_SESSIONS) : sessions };
        }),

      recordError: (hand, given, expected) =>
        set((s) => {
          const errors = { ...s.errors };
          const prev = errors[hand] ?? { hand, count: 0, givenActions: {}, expected };
          errors[hand] = {
            ...prev,
            count: prev.count + 1,
            givenActions: { ...prev.givenActions, [given]: (prev.givenActions[given] ?? 0) + 1 },
            expected,
          };
          return { errors, heatmap: { ...s.heatmap, [hand]: (s.heatmap[hand] ?? 0) + 1 } };
        }),

      addSrs: (key, entry) => set((s) => ({ srs: { ...s.srs, [key]: entry } })),

      updateSrs: (key, updates) =>
        set((s) => {
          if (!s.srs[key]) return s;
          return { srs: { ...s.srs, [key]: { ...s.srs[key], ...updates } } };
        }),

      removeSrs: (key) => set((s) => {
        const srs = { ...s.srs };
        delete srs[key];
        return { srs };
      }),

      clearSrs: () => set({ srs: {} }),

      setPendingSrsKey: (key) => set({ pendingSrsKey: key }),

      // Confirm a proposal toast → actually add to SRS
      confirmSrsProposal: (key) => {
        const { selectedTab, config } = get();
        if (!selectedTab) return;
        const cfg = { ...DEFAULT_CFG, ...config };
        const today = todayStr();
        get().addSrs(key, {
          key,
          name: selectedTab.name,
          catName: selectedTab.catName,
          interval: 0,
          nextReview: addDays(today, cfg.intervals[0] ?? 1),
          lastScore: null,
          added: today,
        });
        set({ pendingSrsKey: null });
      },

      // Navigate to grille for an SRS review session
      startSrsReview: (key) => {
        // SRS keys are folderId__catId__tabId. 
        // Since the multi-folder update, catId itself is prefixed with folderId (folderId__catId).
        // So we need to split and take all but the last segment as catId.
        const parts = key.split('__');
        if (parts.length < 2) return;
        
        const tabId = parts.pop()!;
        const catId = parts.join('__');
        
        get().selectTab(catId, tabId);
        set({ srsReviewKey: key, currentMode: 'grille' });
      },

      // Called from GrilleView after Vérifier when in SRS review mode
      finishSrsReview: (key, score) => {
        const { srs, config } = get();
        const cfg = { ...DEFAULT_CFG, ...config };
        const entry = srs[key];
        if (!entry) { set({ srsReviewKey: null, currentMode: 'srs' }); return; }

        const today = todayStr();
        if (score >= cfg.grilleThreshold) {
          const nextIdx = Math.min(entry.interval + 1, cfg.intervals.length - 1);
          get().updateSrs(key, {
            lastScore: score,
            interval: nextIdx,
            nextReview: addDays(today, cfg.intervals[nextIdx]),
          });
        } else {
          get().updateSrs(key, {
            lastScore: score,
            interval: Math.max(0, entry.interval - 1),
            nextReview: addDays(today, cfg.intervals[0] ?? 1),
          });
        }
        set({ srsReviewKey: null, currentMode: 'srs' });
      },

      setCalendar: (year, month) => set({ calYear: year, calMonth: month }),

      saveColorOverride: (name, color) =>
        set(s => ({ colorOverrides: { ...s.colorOverrides, [name]: color } })),
    }),
    {
      name: 'range-trainer-v5',
      partialize: (s) => ({
        rmFiles: s.rmFiles,
        config: s.config,
        sessions: s.sessions,
        errors: s.errors,
        heatmap: s.heatmap,
        srs: s.srs,
        lastSpot: s.lastSpot,
        colorOverrides: s.colorOverrides,
      }),
    },
  ),
);

export function getCfg(store: Pick<AppStore, 'config'>): AppConfig {
  return { ...DEFAULT_CFG, ...store.config };
}
