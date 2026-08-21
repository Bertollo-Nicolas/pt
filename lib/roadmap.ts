import type { RmData, Session, ErrorEntry, SrsEntry, AppConfig } from './types';
import { buildLearningSpots } from './learning';
import { tabKey } from './poker';
import { todayStr } from './utils';

export type RoadmapStageId = 'open' | 'defense' | 'threebet' | 'vs-threebet' | 'vs-fourbet';
export type RoadmapStatus = 'due' | 'mastered' | 'consolidate' | 'learning' | 'new' | 'locked';
export type MasteryLevel = 'Découverte' | 'Initié' | 'Solide' | 'Maîtrisé' | 'Automatisé';

export interface RoadmapSpot {
  key: string;
  catId: string;
  tabId: string;
  name: string;
  catName: string;
  stageId: RoadmapStageId;
  mastery: number;
  priority: number;
  status: RoadmapStatus;
  reason: string;
  due: boolean;
  level: MasteryLevel;
  importance: 1 | 2 | 3 | 4 | 5;
  memory: 'due' | 'scheduled' | 'stable' | 'none';
  flashScore: number | null;
  grilleScore: number | null;
  stability: number;
  errorCount: number;
  position: string;
  essential: boolean;
  pinned: boolean;
  snoozed: boolean;
  known: boolean;
  practiceDays: number;
  prerequisiteKeys: string[];
  unlocked: boolean;
}

export interface RoadmapStage {
  id: RoadmapStageId;
  title: string;
  description: string;
  spots: RoadmapSpot[];
  mastery: number;
  completed: number;
  unlocked: boolean;
}

const STAGES: Array<Omit<RoadmapStage, 'spots' | 'mastery' | 'completed' | 'unlocked'>> = [
  { id: 'open', title: 'Open', description: 'Construire les fondations et les ranges utilisées le plus souvent.' },
  { id: 'defense', title: 'Défense', description: 'Défendre les blindes face aux sizings d’open les plus fréquents.' },
  { id: 'threebet', title: '3-bet', description: 'Ajouter l’agression préflop une fois les ranges de base stables.' },
  { id: 'vs-threebet', title: 'Vs 3-bet', description: 'Réagir correctement quand votre open rencontre un 3-bet.' },
  { id: 'vs-fourbet', title: 'Vs 4-bet', description: 'Travailler les branches rares et à forte valeur du préflop.' },
];

export function buildRoadmap(rmData: RmData | null, sessions: Session[], errors: Record<string, ErrorEntry>, srs: Record<string, SrsEntry>, config?: Partial<AppConfig>): RoadmapStage[] {
  if (!rmData) return STAGES.map(stage => ({ ...stage, spots: [], mastery: 0, completed: 0, unlocked: stage.id === 'open' }));
  const learning = new Map(buildLearningSpots(sessions, errors).map(spot => [spot.key, spot]));
  const today = todayStr();
  const practiceDays = buildPracticeDays(sessions);
  const grouped = new Map<RoadmapStageId, RoadmapSpot[]>(STAGES.map(stage => [stage.id, []]));
  const categoryPaths = buildCategoryPaths(rmData);

  for (const [catId, cat] of Object.entries(rmData.categories)) {
    for (const tabId of cat.tabList ?? []) {
      const tab = cat.tabs?.[tabId];
      if (!tab) continue;
      const classificationLabel = `${categoryPaths.get(catId) ?? cat.name} ${tab.name}`;
      const stageId = classifyStage(classificationLabel);
      if (!stageId) continue;
      const key = tabKey(catId, tabId);
      const insight = learning.get(key);
      const known = config?.roadmapKnown?.includes(key) ?? false;
      const pinned = config?.roadmapPinned?.includes(key) ?? false;
      const snoozed = config?.roadmapSnoozed?.includes(key) ?? false;
      const mastery = known ? 100 : insight?.mastery ?? 0;
      const due = Boolean(srs[key] && srs[key].nextReview <= today);
      const position = detectPosition(`${cat.name} ${tab.name}`);
      const base = stageBase(stageId) * positionWeight(classificationLabel);
      const errorBoost = Math.min(32, (insight?.errorCount ?? 0) * 3);
      const learningGap = Math.max(0, 100 - mastery) * 0.45;
      const priority = Math.round(base + errorBoost + learningGap + (due ? 45 : 0) + (pinned ? 60 : 0) - (snoozed ? 120 : 0));
      const status: RoadmapStatus = due ? 'due' : mastery >= 85 ? 'mastered' : mastery >= 70 ? 'consolidate' : insight ? 'learning' : 'new';
      const days = practiceDays.get(key)?.size ?? 0;
      const importance = importanceScore(stageId, classificationLabel);
      const essential = importance >= 4;
      grouped.get(stageId)!.push({
        key, catId, tabId, name: tab.name, catName: cat.name, stageId, mastery, priority, status, due,
        reason: due ? 'Révision SRS arrivée à échéance' : pinned ? 'Épinglée dans tes priorités' : snoozed ? 'Reportée temporairement' : errorBoost >= 12 ? 'Erreurs récentes à corriger' : stageReason(stageId),
        level: masteryLevel(mastery, days), importance, memory: due ? 'due' : srs[key] ? (mastery >= 85 ? 'stable' : 'scheduled') : 'none',
        flashScore: insight?.flashScore ?? null, grilleScore: insight?.grilleScore ?? null, stability: insight?.stability ?? 0,
        errorCount: insight?.errorCount ?? 0, position, essential, pinned, snoozed, known, practiceDays: days,
        prerequisiteKeys: [], unlocked: stageId === 'open',
      });
    }
  }

  attachDependencies(grouped);
  const allLookup = new Map([...grouped.values()].flat().map(spot => [spot.key, spot]));
  let previousReady = true;
  return STAGES.map((definition, index) => {
    const spots = grouped.get(definition.id)!.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
    const mastery = spots.length ? Math.round(spots.reduce((sum, spot) => sum + spot.mastery, 0) / spots.length) : 0;
    const completed = spots.filter(spot => spot.mastery >= 85).length;
    const unlocked = index === 0 || previousReady;
    const essentials = spots.filter(spot => spot.essential);
    const readyEssentials = essentials.filter(spot => spot.known || (spot.mastery >= 80 && spot.practiceDays >= 2));
    previousReady = essentials.length === 0 || readyEssentials.length / essentials.length >= 0.8;
    return {
      ...definition,
      spots: spots.map(spot => {
        const prerequisitesReady = spot.prerequisiteKeys.every(key => {
          const prerequisite = allLookup.get(key);
          return !prerequisite || prerequisite.known || (prerequisite.mastery >= 80 && prerequisite.practiceDays >= 2);
        });
        const nodeUnlocked = spot.due || spot.known || (unlocked && prerequisitesReady);
        return { ...spot, unlocked: nodeUnlocked, status: nodeUnlocked ? spot.status : 'locked' as const };
      }),
      mastery, completed, unlocked,
    };
  });
}

function attachDependencies(grouped: Map<RoadmapStageId, RoadmapSpot[]>): void {
  const opens = grouped.get('open') ?? [];
  const threebets = grouped.get('threebet') ?? [];
  const findByPosition = (spots: RoadmapSpot[], position: string) => spots.filter(spot => spot.position === position).map(spot => spot.key);
  for (const spot of grouped.get('defense') ?? []) spot.prerequisiteKeys = findByPosition(opens, opponentPosition(spot.name));
  for (const spot of threebets) spot.prerequisiteKeys = findByPosition(opens, spot.position);
  for (const spot of grouped.get('vs-threebet') ?? []) spot.prerequisiteKeys = findByPosition(opens, spot.position);
  for (const spot of grouped.get('vs-fourbet') ?? []) spot.prerequisiteKeys = findByPosition(threebets, spot.position);
}

export function roadmapMilestones(stages: RoadmapStage[]): Array<{ label: string; achieved: boolean }> {
  const all = stages.flatMap(stage => stage.spots);
  const open = stages.find(stage => stage.id === 'open');
  return [
    { label: 'Toutes les ranges Open découvertes', achieved: Boolean(open?.spots.length && open.spots.every(spot => spot.mastery > 0 || spot.known)) },
    { label: 'Première range maîtrisée', achieved: all.some(spot => spot.mastery >= 85) },
    { label: 'Fondations Open solides', achieved: Boolean(open && open.mastery >= 80) },
    { label: 'Première branche 3-bet débloquée', achieved: Boolean(stages.find(stage => stage.id === 'threebet')?.unlocked) },
  ];
}

export function buildDailyRoadmapSession(stages: RoadmapStage[], minutes: 10 | 20 | 30): RoadmapSpot[] {
  const count = minutes === 10 ? 2 : minutes === 20 ? 4 : 6;
  const all = stages.flatMap(stage => stage.spots);
  const due = all.filter(spot => spot.due && !spot.snoozed).sort((a, b) => b.priority - a.priority);
  const current = all.filter(spot => spot.status !== 'locked' && !spot.due && !spot.snoozed && spot.mastery < 85).sort((a, b) => b.priority - a.priority);
  const weak = all.filter(spot => spot.mastery > 0 && spot.mastery < 75 && !spot.due && !spot.snoozed).sort((a, b) => b.errorCount - a.errorCount || a.mastery - b.mastery);
  const targets = [
    ...due.slice(0, Math.max(1, Math.round(count * 0.3))),
    ...current.slice(0, Math.max(1, Math.round(count * 0.5))),
    ...weak.slice(0, Math.max(1, Math.round(count * 0.2))),
  ];
  const unique = new Map(targets.map(spot => [spot.key, spot]));
  for (const spot of all.filter(spot => !spot.snoozed).sort((a, b) => b.priority - a.priority)) {
    if (unique.size >= count) break;
    unique.set(spot.key, spot);
  }
  return [...unique.values()].slice(0, count);
}

export function weeklyRoadmapProgress(sessions: Session[]): { sessions: number; spots: number; scoreDelta: number } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const previousCutoff = new Date(cutoff);
  previousCutoff.setDate(previousCutoff.getDate() - 7);
  const recent = sessions.filter(session => new Date(session.createdAt ?? session.date) >= cutoff);
  const previous = sessions.filter(session => {
    const date = new Date(session.createdAt ?? session.date);
    return date >= previousCutoff && date < cutoff;
  });
  const score = (session: Session) => session.mode === 'grille' ? session.score ?? 0 : (() => {
    const total = (session.correct ?? 0) + (session.wrong ?? 0) + (session.imprecision ?? 0);
    return total ? ((session.correct ?? 0) / total) * 100 : 0;
  })();
  const average = (items: Session[]) => items.length ? items.reduce((sum, item) => sum + score(item), 0) / items.length : 0;
  const scoreDelta = previous.length && recent.length ? Math.round(average(recent) - average(previous)) : 0;
  return { sessions: recent.length, spots: new Set(recent.map(session => session.key.replace(/^(flash|grille)_/, ''))).size, scoreDelta };
}

function buildCategoryPaths(rmData: RmData): Map<string, string> {
  const paths = new Map<string, string>();
  const visit = (id: string, parentPath: string, seen: Set<string>) => {
    if (seen.has(id)) return;
    const category = rmData.categories[id];
    if (!category) return;
    const nextSeen = new Set(seen).add(id);
    const path = id === 'root' ? parentPath : [parentPath, category.name].filter(Boolean).join(' / ');
    paths.set(id, path);
    for (const childId of category.children ?? []) visit(childId, path, nextSeen);
  };
  visit('root', '', new Set());
  for (const [id, category] of Object.entries(rmData.categories)) {
    if (!paths.has(id)) paths.set(id, category.name);
  }
  return paths;
}

export function nextRoadmapSpot(stages: RoadmapStage[]): RoadmapSpot | null {
  const due = stages.flatMap(stage => stage.spots).filter(spot => spot.due).sort((a, b) => b.priority - a.priority)[0];
  if (due) return due;
  for (const stage of stages) {
    if (!stage.unlocked) continue;
    const next = stage.spots.find(spot => spot.status !== 'mastered');
    if (next) return next;
  }
  return stages.flatMap(stage => stage.spots).sort((a, b) => b.priority - a.priority)[0] ?? null;
}

function classifyStage(value: string): RoadmapStageId | null {
  const text = normalize(value);
  if (/vs\s*4\s*bet|vs4bet|face.*4bet/.test(text)) return 'vs-fourbet';
  if (/vs\s*3\s*bet|vs3bet|face.*3bet/.test(text)) return 'vs-threebet';
  if (/3\s*bet|3bet/.test(text)) return 'threebet';
  if (/bb\s*vs|defen|vs\s*(2|2\.5|3)x/.test(text)) return 'defense';
  if (/open|rfi|first in/.test(text)) return 'open';
  return null;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ');
}

function buildPracticeDays(sessions: Session[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const session of sessions) {
    const key = session.key.replace(/^(flash|grille)_/, '');
    const days = result.get(key) ?? new Set<string>();
    days.add(session.date);
    result.set(key, days);
  }
  return result;
}

function detectPosition(value: string): string {
  const text = normalize(value);
  for (const position of ['UTG', 'HJ', 'CO', 'BU', 'BTN', 'SB', 'BB']) {
    if (new RegExp(`\\b${position.toLowerCase()}\\b`).test(text)) return position === 'BTN' ? 'BU' : position;
  }
  return 'Autres';
}

function opponentPosition(value: string): string {
  const match = normalize(value).match(/vs\s+(utg|hj|co|bu|btn|sb|bb)/);
  if (!match) return 'Autres';
  return match[1].toUpperCase() === 'BTN' ? 'BU' : match[1].toUpperCase();
}

function importanceScore(stage: RoadmapStageId, value: string): 1 | 2 | 3 | 4 | 5 {
  const weight = stageBase(stage) * positionWeight(value);
  return weight >= 108 ? 5 : weight >= 88 ? 4 : weight >= 64 ? 3 : weight >= 42 ? 2 : 1;
}

function masteryLevel(mastery: number, practiceDays: number): MasteryLevel {
  if (mastery >= 92 && practiceDays >= 3) return 'Automatisé';
  if (mastery >= 85 && practiceDays >= 2) return 'Maîtrisé';
  if (mastery >= 70) return 'Solide';
  if (mastery > 0) return 'Initié';
  return 'Découverte';
}

function stageBase(stage: RoadmapStageId): number {
  return { open: 100, defense: 92, threebet: 72, 'vs-threebet': 56, 'vs-fourbet': 34 }[stage];
}

function positionWeight(value: string): number {
  const text = normalize(value);
  if (/btn|bu|bouton/.test(text)) return 1.18;
  if (/sb/.test(text)) return 1.1;
  if (/bb/.test(text)) return 1.06;
  if (/co/.test(text)) return 1;
  if (/hj/.test(text)) return 0.92;
  if (/utg/.test(text)) return 0.86;
  return 0.95;
}

function stageReason(stage: RoadmapStageId): string {
  return {
    open: 'Fondation très fréquente pour toutes les branches suivantes',
    defense: 'Spot fréquent à fort impact sur votre volume réel',
    threebet: 'Étape suivante après la maîtrise des ranges de base',
    'vs-threebet': 'Dépend directement de vos opens et de vos 3-bets',
    'vs-fourbet': 'Spot rare à travailler après les branches précédentes',
  }[stage];
}
