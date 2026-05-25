'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildRangeMap, tabKey } from '@/lib/poker';
import { DEFAULT_CFG, MAX_SESSIONS } from '@/lib/constants';
import { todayStr, addDays } from '@/lib/utils';
import type {
  RmData, RangeColor, SelectedTab, Mode,
  Session, ErrorEntry, SrsEntry, AppConfig,
} from '@/lib/types';

// ── Persisted (localStorage) ──────────────────────────────
interface Persisted {
  rmFileContent: string | null;
  config: Partial<AppConfig>;
  sessions: Session[];
  errors: Record<string, ErrorEntry>;
  heatmap: Record<string, number>;
  srs: Record<string, SrsEntry>;
  lastSpot: { catId: string; tabId: string } | null;
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
  loadRmFile: (content: string) => void;
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
}

export type AppStore = Persisted & Ephemeral & Actions;

function parseRmContent(content: string): { rmData: RmData; rangeColors: Record<string, RangeColor> } {
  const rmData: RmData = JSON.parse(content);
  const rangeColors: Record<string, RangeColor> = {};
  if (rmData.ranges) {
    for (const [id, r] of Object.entries(rmData.ranges)) {
      rangeColors[id] = { color: r.color || '#888', name: r.name || id };
    }
  }
  return { rmData, rangeColors };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Persisted defaults ────────────────────────────
      rmFileContent: null,
      config: {},
      sessions: [],
      errors: {},
      heatmap: {},
      srs: {},
      lastSpot: null,

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
      loadRmFile: (content) => {
        try {
          const { rmData, rangeColors } = parseRmContent(content);
          set({ rmFileContent: content, rmData, rangeColors });
        } catch {
          alert('Fichier .rm invalide');
        }
      },

      rehydrateRmData: () => {
        const { rmFileContent, rmData, srs } = get();

        // Clean up legacy interval: -1 proposal entries (migration from old schema)
        const cleanSrs = { ...srs };
        let changed = false;
        for (const key of Object.keys(cleanSrs)) {
          if (cleanSrs[key].interval === -1) {
            delete cleanSrs[key];
            changed = true;
          }
        }
        if (changed) set({ srs: cleanSrs });

        if (rmFileContent && !rmData) {
          try {
            const { rmData: d, rangeColors } = parseRmContent(rmFileContent);
            set({ rmData: d, rangeColors });
          } catch { /* ignore */ }
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
          const sessions = [...s.sessions, session];
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
        const [catId, tabId] = key.split('__');
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
    }),
    {
      name: 'range-trainer-v5',
      partialize: (s) => ({
        rmFileContent: s.rmFileContent,
        config: s.config,
        sessions: s.sessions,
        errors: s.errors,
        heatmap: s.heatmap,
        srs: s.srs,
        lastSpot: s.lastSpot,
      }),
    },
  ),
);

export function getCfg(store: Pick<AppStore, 'config'>): AppConfig {
  return { ...DEFAULT_CFG, ...store.config };
}
