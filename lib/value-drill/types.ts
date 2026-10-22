export type ValueFamily = 'paired_high' | 'paired_low' | 'high_connected' | 'low_connected' | 'ace_dry' | 'ace_drawy' | 'adaptations';
export type ValueFilter = ValueFamily | 'mixed';
export type Street = 'Flop' | 'Turn' | 'River';
export type ValueAction = 'CHECK' | 'B25' | 'B33' | 'B50' | 'B66' | 'B75' | 'B80' | 'POT' | 'OVERBET' | 'SHOVE' | 'REDUCE' | 'KEEP' | 'INCREASE' | 'LARGE_FLOP' | 'LARGE_TURN' | 'LARGE_RIVER';
export interface ValueStep { street: Street; board: string[]; expected: ValueAction[]; explanation: string }
export interface ValueCase { id: string; family: ValueFamily; hero: [string,string]; handLabel: string; title: string; context: string; steps: ValueStep[]; ruleId: string }
export interface ValueAttempt { id: string; caseId: string; step: number; answer: ValueAction; correct: boolean; responseTimeMs: number; createdAt: string }
export interface ValueStats { attempts: number; correct: number }
export interface ValueProgress extends ValueStats { streak: number; bestStreak: number; families: Partial<Record<ValueFamily,ValueStats>>; streets: Partial<Record<Street,ValueStats>>; recent: ValueAttempt[] }
export const VALUE_FAMILIES: { id: ValueFamily; title: string }[] = [
  { id:'paired_high',title:'Pairé haut' }, { id:'paired_low',title:'Pairé bas' },
  { id:'high_connected',title:'Haut connecté' }, { id:'low_connected',title:'Bas connecté' },
  { id:'ace_dry',title:'Ace dry' }, { id:'ace_drawy',title:'Ace drawy' }, { id:'adaptations',title:'Adaptations' },
];
export const VALUE_ACTIONS: { id: ValueAction; label: string }[] = [
  {id:'CHECK',label:'Check'}, {id:'B25',label:'25 %'}, {id:'B33',label:'33 %'},
  {id:'B50',label:'50 %'}, {id:'B66',label:'66 %'}, {id:'B80',label:'80 %'},
  {id:'POT',label:'Pot'}, {id:'OVERBET',label:'Overbet'}, {id:'SHOVE',label:'Shove'},
  {id:'B75',label:'75 %'}, {id:'REDUCE',label:'Réduire d’un cran'}, {id:'KEEP',label:'Maintenir le sizing'}, {id:'INCREASE',label:'Augmenter le sizing'},
  {id:'LARGE_FLOP',label:'Réserver la grosse mise pour le flop'}, {id:'LARGE_TURN',label:'Réserver la grosse mise pour la turn'}, {id:'LARGE_RIVER',label:'Réserver la grosse mise pour la river'},
];
export const actionLabel = (id: ValueAction) => VALUE_ACTIONS.find(action=>action.id===id)!.label;
