export type Sizing = 'CHECK' | 'SMALL' | 'MEDIUM' | 'BIG' | 'OVERBET';
export type Texture = 'dry' | 'drawy' | 'extra_drawy' | 'monotone' | 'paired';
export type Category = Texture | 'ace_high' | 'nuts_advantage' | 'equity_denial';
export type Confidence = 'KNOWN' | 'HESITATED' | 'UNKNOWN';
export interface DrillQuestion {
  id: string;
  spot: 'BTN_VS_BB';
  board: { cards: [string, string, string]; texture: Texture };
  tags: Category[];
  correctAnswer: { sizing: Sizing; sizingLabel: string; frequencyMin?: number; frequencyMax?: number };
  explanation: { short: string; detailed: string; mentalRule: string };
  difficulty: 1 | 2 | 3 | 4;
}
export interface DrillAttempt {
  id: string;
  questionId: string;
  answer: Sizing;
  correct: boolean;
  responseTimeMs: number;
  confidence?: Confidence;
  createdAt: string;
}
export interface Mastery {
  attempts: number;
  correct: number;
  streak: number;
  lastSeenAt: string;
}
export interface DrillProgress {
  attempts: number;
  correct: number;
  streak: number;
  bestStreak: number;
  totalTimeMs: number;
  categories: Partial<Record<Category, Mastery>>;
  questions: Record<string, Mastery>;
  recent: DrillAttempt[];
}
export const CATEGORY_LABELS: Record<Category, string> = {
  dry: 'Secs', drawy: 'À tirages', extra_drawy: 'Très connectés', monotone: 'Monotones',
  paired: 'Pairés', ace_high: 'Ace-high', nuts_advantage: 'Avantage de nuts', equity_denial: 'Protection d’équité',
};
export const SIZINGS: { id: Sizing; label: string; detail: string }[] = [
  { id: 'CHECK', label: 'Check', detail: 'Majoritaire' },
  { id: 'SMALL', label: 'Petite mise', detail: '25–33 %' },
  { id: 'MEDIUM', label: 'Mise moyenne', detail: '40–50 %' },
  { id: 'BIG', label: 'Grosse mise', detail: '60–75 %' },
  { id: 'OVERBET', label: 'Pot / Overbet', detail: '100 % et plus' },
];
