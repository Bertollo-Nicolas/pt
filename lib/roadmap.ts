import type { RmData, Session, ErrorEntry, SrsEntry, AppConfig, RoadmapPhase, RoadmapProgressEntry } from './types';
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
  heroPosition: string;
  villainPosition: string | null;
  displayName: string;
  recommended: boolean;
  lockReason: string | null;
  essential: boolean;
  pinned: boolean;
  snoozed: boolean;
  known: boolean;
  practiceDays: number;
  prerequisiteKeys: string[];
  unlocked: boolean;
  phase: RoadmapPhase;
  progress: RoadmapProgressEntry | null;
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
  const today = todayStr();
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
      const progress = config?.roadmapProgress?.[key] ?? null;
      const phase = resolvedPhase(progress, config?.grilleThreshold ?? 80);
      const known = config?.roadmapKnown?.includes(key) ?? false;
      const pinned = config?.roadmapPinned?.includes(key) ?? false;
      const snoozed = config?.roadmapSnoozed?.includes(key) ?? false;
      const mastery = known ? 100 : phaseMastery(progress, phase);
      const due = Boolean(phase === 'retention' && srs[key] && srs[key].nextReview <= today);
      const positions = detectSpotPositions(stageId, categoryPaths.get(catId) ?? cat.name, cat.name, tab.name);
      const position = positions.hero;
      const base = stageBase(stageId) * positionWeight(classificationLabel);
      const learningGap = Math.max(0, 100 - mastery) * 0.45;
      const priority = Math.round(base + learningGap + (due ? 45 : 0) + (pinned ? 60 : 0) - (snoozed ? 120 : 0));
      const status: RoadmapStatus = due ? 'due' : phase === 'retention' || known ? 'mastered' : phase === 'validate' ? 'consolidate' : progress ? 'learning' : 'new';
      const days = progress?.validationDays.length ?? 0;
      const importance = importanceScore(stageId, classificationLabel);
      const essential = importance >= 4;
      grouped.get(stageId)!.push({
        key, catId, tabId, name: tab.name, catName: cat.name, stageId, mastery, priority, status, due,
        reason: due ? 'Révision mémoire arrivée à échéance' : pinned ? 'Épinglée dans tes priorités' : snoozed ? 'Reportée temporairement' : stageReason(stageId),
        level: masteryLevel(mastery, days), importance, memory: due ? 'due' : srs[key] ? (mastery >= 85 ? 'stable' : 'scheduled') : 'none',
        flashScore: progress?.flashScore ?? null, grilleScore: progress?.grilleScore ?? null, stability: Math.min(100, days * 50),
        errorCount: 0, position, heroPosition: positions.hero, villainPosition: positions.villain,
        displayName: spotDisplayName(stageId, positions.hero, positions.villain, tab.name),
        recommended: importance >= 4, lockReason: null, essential, pinned, snoozed, known, practiceDays: days,
        prerequisiteKeys: [], unlocked: stageId === 'open', phase, progress,
      });
    }
  }

  attachDependencies(grouped);
  const allLookup = new Map([...grouped.values()].flat().map(spot => [spot.key, spot]));
  return STAGES.map(definition => {
    const spots = grouped.get(definition.id)!.sort(compareRoadmapSpots);
    const mastery = spots.length ? Math.round(spots.reduce((sum, spot) => sum + spot.mastery, 0) / spots.length) : 0;
    const completed = spots.filter(spot => spot.mastery >= 85).length;
    const resolvedSpots = spots.map(spot => {
      const prerequisitesReady = (spot.stageId === 'open' || spot.prerequisiteKeys.length > 0) && spot.prerequisiteKeys.every(key => {
        const prerequisite = allLookup.get(key);
        return !prerequisite || prerequisite.known || prerequisite.phase === 'retention';
      });
      const nodeUnlocked = spot.due || spot.known || prerequisitesReady;
      return {
        ...spot,
        unlocked: nodeUnlocked,
        lockReason: nodeUnlocked ? null : prerequisiteLabel(spot, allLookup),
        status: nodeUnlocked ? spot.status : 'locked' as const,
      };
    });
    const unlocked = definition.id === 'open' || resolvedSpots.some(spot => spot.unlocked);
    return {
      ...definition,
      spots: resolvedSpots,
      mastery, completed, unlocked,
    };
  });
}

function attachDependencies(grouped: Map<RoadmapStageId, RoadmapSpot[]>): void {
  const opens = grouped.get('open') ?? [];
  const threebets = grouped.get('threebet') ?? [];
  const findOpen = (position: string) => opens.filter(spot => spot.heroPosition === position).map(spot => spot.key);
  // La défense globale n'arrive qu'après la validation de toutes les fondations Open.
  for (const spot of grouped.get('defense') ?? []) spot.prerequisiteKeys = opens.map(open => open.key);
  // Une position Open validée ouvre toutes les branches jouées depuis cette position.
  for (const spot of threebets) spot.prerequisiteKeys = findOpen(spot.heroPosition);
  for (const spot of grouped.get('vs-threebet') ?? []) spot.prerequisiteKeys = findOpen(spot.heroPosition);
  // Vs 4-bet dépend du 3-bet de la même confrontation lorsque celui-ci existe.
  for (const spot of grouped.get('vs-fourbet') ?? []) {
    const exact = threebets.filter(candidate => candidate.heroPosition === spot.heroPosition && (!spot.villainPosition || candidate.villainPosition === spot.villainPosition));
    spot.prerequisiteKeys = (exact.length ? exact : threebets.filter(candidate => candidate.heroPosition === spot.heroPosition)).map(candidate => candidate.key);
  }
}

const POSITION_ORDER = ['UTG', 'HJ', 'CO', 'BU', 'SB', 'BB', 'Autres'];

function compareRoadmapSpots(a: RoadmapSpot, b: RoadmapSpot): number {
  const hero = POSITION_ORDER.indexOf(a.heroPosition) - POSITION_ORDER.indexOf(b.heroPosition);
  if (hero) return hero;
  const villain = POSITION_ORDER.indexOf(a.villainPosition ?? 'Autres') - POSITION_ORDER.indexOf(b.villainPosition ?? 'Autres');
  return villain || b.priority - a.priority || a.displayName.localeCompare(b.displayName);
}

function prerequisiteLabel(spot: RoadmapSpot, lookup: Map<string, RoadmapSpot>): string {
  const missing = spot.prerequisiteKeys.map(key => lookup.get(key)).filter((item): item is RoadmapSpot => Boolean(item && !item.known && item.phase !== 'retention'));
  if (spot.stageId === 'defense') return `Valide tous les Opens (${missing.length} restant${missing.length > 1 ? 's' : ''})`;
  const first = missing[0];
  return first ? `Valide ${first.displayName}` : 'Prérequis non disponible';
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

function detectSpotPositions(stage: RoadmapStageId, categoryPath: string, categoryName: string, tabName: string): { hero: string; villain: string | null } {
  const categoryPositions = extractPositions(categoryName);
  const pathPositions = extractPositions(categoryPath);
  const tabPositions = extractPositions(tabName);
  const versus = extractVersusPosition(tabName) ?? extractVersusPosition(`${categoryName} ${tabName}`) ?? extractVersusPosition(categoryPath);

  if (stage === 'open') {
    return { hero: tabPositions[0] ?? categoryPositions[0] ?? pathPositions.at(-1) ?? 'Autres', villain: null };
  }

  // Dans les exports .rm, la catégorie porte généralement Hero (ex. « SB 3bet »)
  // et l'onglet porte l'adversaire (ex. « vs BU »).
  const hero = categoryPositions.find(position => position !== versus)
    ?? pathPositions.slice().reverse().find(position => position !== versus)
    ?? tabPositions.find(position => position !== versus)
    ?? categoryPositions[0]
    ?? pathPositions.at(-1)
    ?? tabPositions[0]
    ?? 'Autres';
  const villain = versus ?? tabPositions.find(position => position !== hero) ?? pathPositions.slice().reverse().find(position => position !== hero) ?? null;
  return { hero, villain };
}

function extractPositions(value: string): string[] {
  const result: string[] = [];
  for (const match of normalize(value).matchAll(/\b(utg|hj|co|bu|btn|sb|bb)\b/g)) {
    const position = match[1].toUpperCase() === 'BTN' ? 'BU' : match[1].toUpperCase();
    if (!result.includes(position)) result.push(position);
  }
  return result;
}

function extractVersusPosition(value: string): string | null {
  const match = normalize(value).match(/(?:vs|versus|face a?)\s+(utg|hj|co|bu|btn|sb|bb)/);
  if (!match) return null;
  return match[1].toUpperCase() === 'BTN' ? 'BU' : match[1].toUpperCase();
}

function spotDisplayName(stage: RoadmapStageId, hero: string, villain: string | null, fallback: string): string {
  if (stage === 'open') return `Open ${hero}`;
  const matchup = villain ? `${hero} vs ${villain}` : hero !== 'Autres' ? hero : fallback;
  return `${STAGES.find(item => item.id === stage)?.title ?? ''} · ${matchup}`;
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

function resolvedPhase(progress: RoadmapProgressEntry | null, grilleThreshold: number): RoadmapPhase {
  if (!progress) return 'discover';
  if ((progress.grilleScore ?? 0) >= grilleThreshold) return 'retention';
  if (progress.phase === 'practice' && (progress.flashScore ?? 0) >= 80) return 'validate';
  return progress.phase;
}

function phaseMastery(progress: RoadmapProgressEntry | null, phase: RoadmapPhase): number {
  if (!progress) return 0;
  if (phase === 'discover') return 5;
  if (phase === 'understand') return 20;
  if (phase === 'practice') return Math.max(35, Math.round((progress.flashScore ?? 0) * 0.6));
  if (phase === 'validate') return Math.max(65, 65 + progress.validationDays.length * 10);
  return 100;
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
