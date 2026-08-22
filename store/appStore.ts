'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildRangeMap, tabKey } from '@/lib/poker';
import { DEFAULT_CFG, MAX_SESSIONS } from '@/lib/constants';
import { todayStr, addDays } from '@/lib/utils';
import { scheduleSrsReview, SRS_DRILL_HANDS, srsNeedsDrill } from '@/lib/srs';
import type {
  RmData, RangeColor, SelectedTab, Mode,
  Session, ErrorEntry, SrsEntry, AppConfig, Category, RangeInfo,
  TrackerImportSession, RoadmapProgressEntry,
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
  trackerSessions: TrackerImportSession[];
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
  roadmapQueue: Array<{ key: string; catId: string; tabId: string; name: string }>;
  roadmapQueueIndex: number;
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
  recordError: (hand: string, given: string, expected: string, spotKey?: string) => void;
  addSrs: (key: string, entry: SrsEntry) => void;
  updateSrs: (key: string, updates: Partial<SrsEntry>) => void;
  removeSrs: (key: string) => void;
  clearSrs: () => void;
  setPendingSrsKey: (key: string | null) => void;
  confirmSrsProposal: (key: string) => void;
  startSrsReview: (key: string) => void;
  startSrsDrill: (key: string) => void;
  progressSrsDrill: (key: string) => void;
  finishSrsReview: (key: string, score: number) => void;
  setCalendar: (year: number, month: number) => void;
  saveColorOverride: (name: string, color: string) => void;
  addTrackerSession: (session: TrackerImportSession) => void;
  startRoadmapSession: (queue: Array<{ key: string; catId: string; tabId: string; name: string }>) => void;
  advanceRoadmapSession: () => void;
  cancelRoadmapSession: () => void;
  updateRoadmapProgress: (key: string, updates: Partial<RoadmapProgressEntry>) => void;
  recordRoadmapFlash: (key: string, score: number) => void;
  finishRoadmapFlash: (key: string, session: NonNullable<RoadmapProgressEntry['flashSession']>, score: number) => void;
  closeRoadmapFlash: (key: string, score: number) => void;
  recordRoadmapGrille: (key: string, score: number) => void;
  resetRoadmapProgress: () => void;
  clearErrors: () => void;
  resetLearningData: () => void;
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
      trackerSessions: [],

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
      roadmapQueue: [],
      roadmapQueueIndex: 0,

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
          const createdAt = session.createdAt ?? new Date().toISOString();
          const id = session.id ?? `${session.key}_${createdAt}`;
          const sessions = [...s.sessions, { ...session, id, createdAt }];
          return { sessions: sessions.length > MAX_SESSIONS ? sessions.slice(-MAX_SESSIONS) : sessions };
        }),

      recordError: (hand, given, expected, spotKey) =>
        set((s) => {
          const errors = { ...s.errors };
          const selectedTab = get().selectedTab;
          const errorKey = spotKey ? `${spotKey}__${hand}` : hand;
          const prev = errors[errorKey] ?? { hand, key: spotKey, name: selectedTab?.name, catName: selectedTab?.catName, count: 0, givenActions: {}, expected };
          errors[errorKey] = {
            ...prev,
            count: prev.count + 1,
            givenActions: { ...prev.givenActions, [given]: (prev.givenActions[given] ?? 0) + 1 },
            expected,
          };
          return { errors, heatmap: { ...s.heatmap, [errorKey]: (s.heatmap[errorKey] ?? 0) + 1 } };
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
          ease: 2.3,
          reviews: 0,
          lapses: 0,
          streak: 0,
          consecutiveFailures: 0,
          drillRequired: false,
          drillProgress: 0,
        });
        set({ pendingSrsKey: null });
      },

      // Navigate to grille for an SRS review session
      startSrsReview: (key) => {
        const entry = get().srs[key];
        if (entry && srsNeedsDrill(entry)) {
          get().startSrsDrill(key);
          return;
        }
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

      startSrsDrill: (key) => {
        const entry = get().srs[key];
        if (!entry || !srsNeedsDrill(entry)) return;
        const parts = key.split('__');
        if (parts.length < 2) return;
        const tabId = parts.pop()!;
        const catId = parts.join('__');
        get().selectTab(catId, tabId);
        set({ srsReviewKey: null, currentMode: 'flash' });
      },

      progressSrsDrill: (key) => set((s) => {
        const entry = s.srs[key];
        if (!entry || !srsNeedsDrill(entry)) return s;
        const drillProgress = Math.min(SRS_DRILL_HANDS, (entry.drillProgress ?? 0) + 1);
        return {
          srs: {
            ...s.srs,
            [key]: {
              ...entry,
              consecutiveFailures: entry.consecutiveFailures ?? entry.lapses ?? 0,
              drillRequired: true,
              drillProgress,
              drillCompletedAt: drillProgress === SRS_DRILL_HANDS ? new Date().toISOString() : entry.drillCompletedAt,
            },
          },
        };
      }),

      // Called from GrilleView after Vérifier when in SRS review mode
      finishSrsReview: (key, score) => {
        const { srs, config } = get();
        const cfg = { ...DEFAULT_CFG, ...config };
        const entry = srs[key];
        if (!entry) { set({ srsReviewKey: null, currentMode: 'srs' }); return; }

        const today = todayStr();
        get().updateSrs(key, scheduleSrsReview(entry, score, cfg, today));
        set({ srsReviewKey: null, currentMode: 'srs' });
      },

      setCalendar: (year, month) => set({ calYear: year, calMonth: month }),

      saveColorOverride: (name, color) =>
        set(s => ({ colorOverrides: { ...s.colorOverrides, [name]: color } })),

      addTrackerSession: (session) =>
        set(s => ({ trackerSessions: [...s.trackerSessions, session].slice(-50) })),

      startRoadmapSession: (queue) => {
        const first = queue[0];
        if (!first) return;
        get().selectTab(first.catId, first.tabId);
        set({ roadmapQueue: queue, roadmapQueueIndex: 0, currentMode: 'flash' });
      },

      advanceRoadmapSession: () => {
        const { roadmapQueue, roadmapQueueIndex } = get();
        const nextIndex = roadmapQueueIndex + 1;
        const next = roadmapQueue[nextIndex];
        if (!next) {
          set({ roadmapQueue: [], roadmapQueueIndex: 0, currentMode: 'roadmap' });
          return;
        }
        get().selectTab(next.catId, next.tabId);
        set({ roadmapQueueIndex: nextIndex, currentMode: 'flash' });
      },

      cancelRoadmapSession: () => set({ roadmapQueue: [], roadmapQueueIndex: 0 }),

      updateRoadmapProgress: (key, updates) => set(s => {
        const now = new Date().toISOString();
        const current = s.config.roadmapProgress?.[key];
        const entry: RoadmapProgressEntry = {
          phase: 'discover', lessonCompleted: false, guidedCompleted: false,
          flashScore: null, grilleScore: null, validationDays: [], startedAt: now,
          ...current, ...updates, key, updatedAt: now,
        };
        return { config: { ...s.config, roadmapProgress: { ...(s.config.roadmapProgress ?? {}), [key]: entry } } };
      }),

      recordRoadmapFlash: (key, score) => {
        const entry = get().config.roadmapProgress?.[key];
        if (!entry || entry.phase !== 'practice') return;
        get().updateRoadmapProgress(key, { flashScore: Math.max(entry.flashScore ?? 0, score), phase: score >= 80 ? 'validate' : 'practice' });
      },

      finishRoadmapFlash: (key, session, score) => set(s => {
        const current = s.config.roadmapProgress?.[key];
        if (!current) return s;
        const entry: RoadmapProgressEntry = {
          ...current,
          flashSession: session,
          flashScore: Math.max(current.flashScore ?? 0, score),
          phase: score >= 80 ? 'validate' : 'practice',
          updatedAt: new Date().toISOString(),
        };
        return { config: { ...s.config, roadmapProgress: { ...(s.config.roadmapProgress ?? {}), [key]: entry } } };
      }),

      closeRoadmapFlash: (key, score) => set(s => {
        const current = s.config.roadmapProgress?.[key];
        if (!current) return s;
        const entry: RoadmapProgressEntry = {
          ...current,
          flashSession: undefined,
          flashScore: Math.max(current.flashScore ?? 0, score),
          phase: score >= 80 ? 'validate' : 'practice',
          updatedAt: new Date().toISOString(),
        };
        return { config: { ...s.config, roadmapProgress: { ...(s.config.roadmapProgress ?? {}), [key]: entry } } };
      }),

      recordRoadmapGrille: (key, score) => {
        const entry = get().config.roadmapProgress?.[key];
        if (!entry || (entry.phase !== 'validate' && (entry.flashScore ?? 0) < 80)) return;
        const cfg = getCfg(get());
        const passed = score >= cfg.grilleThreshold;
        const days = passed ? [...new Set([...entry.validationDays, todayStr()])] : entry.validationDays;
        const phase = passed ? 'retention' as const : 'validate' as const;
        get().updateRoadmapProgress(key, { grilleScore: Math.max(entry.grilleScore ?? 0, score), validationDays: days, phase });
        if (passed && !get().srs[key]) {
          const tab = get().selectedTab;
          get().addSrs(key, { key, name: tab?.name ?? key, catName: tab?.catName ?? '', interval: cfg.intervals[0], nextReview: addDays(todayStr(), cfg.intervals[0]), added: todayStr(), lastScore: score, drillProgress: 0 });
        }
      },

      resetRoadmapProgress: () => set(s => ({ config: { ...s.config, roadmapProgress: {}, roadmapPinned: [], roadmapSnoozed: [], roadmapKnown: [] } })),
      clearErrors: () => set({ errors: {}, heatmap: {} }),
      resetLearningData: () => set(s => ({ sessions: [], errors: {}, heatmap: {}, srs: {}, config: { ...s.config, roadmapProgress: {}, roadmapPinned: [], roadmapSnoozed: [], roadmapKnown: [] } })),
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
        trackerSessions: s.trackerSessions,
      }),
    },
  ),
);

export function getCfg(store: Pick<AppStore, 'config'>): AppConfig {
  return { ...DEFAULT_CFG, ...store.config };
}
