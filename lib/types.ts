// ── .rm file types ───────────────────────────────────────
export interface RangeInfo {
  color: string;
  name: string;
}

export interface RangeEntry {
  id: string;
  hands: string[]; // e.g. "AKs:0.5" or "AKs"
}

export interface Tab {
  name: string;
  rangeList: RangeEntry[];
}

export interface Category {
  name: string;
  children?: string[];
  tabList?: string[];
  tabs?: Record<string, Tab>;
}

export interface RmData {
  ranges: Record<string, RangeInfo>;
  categories: Record<string, Category>;
}

// ── Derived types ─────────────────────────────────────────
export interface RangeColor {
  color: string;
  name: string;
}

export interface HandAction {
  action: string;
  color: string;
  freq: number;
  id: string;
}

export interface SelectedTab {
  name: string;
  catName: string;
  rangeList: RangeEntry[];
  rangeMap: Record<string, HandAction[]>;
}

export type HandType = 'pair' | 'suited' | 'offsuit';

export interface HandItem {
  hand: string;
  type: HandType;
}

// ── App modes ─────────────────────────────────────────────
export type Mode = 'flash' | 'grille' | 'srs';

// ── Session / Stats ───────────────────────────────────────
export interface Session {
  key: string;
  date: string;
  name: string;
  catName: string;
  mode: 'flash' | 'grille';
  correct?: number;
  wrong?: number;
  imprecision?: number;
  bestStreak?: number;
  score?: number;
  missed?: number;
  extra?: number;
  wrongAct?: number;
}

export interface ErrorEntry {
  hand: string;
  count: number;
  givenActions: Record<string, number>;
  expected: string;
}

// ── SRS ───────────────────────────────────────────────────
export interface SrsEntry {
  key: string;
  name: string;
  catName: string;
  interval: number;
  nextReview: string; // ISO date string YYYY-MM-DD
  lastScore: number | null;
  added: string;
}

// ── Settings ──────────────────────────────────────────────
export interface AppConfig {
  threshold: number;
  minHands: number;
  grilleThreshold: number;
  intervals: number[];
}
