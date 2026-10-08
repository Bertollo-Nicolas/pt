import type { Category, DrillQuestion, Sizing, Texture } from './types';

// Editorial model from codex_cbet_drill_spec.md. Answers are deliberately authored,
// never inferred from suit distribution or connectivity. These are not solver outputs.
const rules = {
  dry: ['Un petit sizing suffit sur ce flop sec.', 'BTN peut miser une large partie de sa range sans faire grossir inutilement le pot. Les mains moyennes et les bluffs peu coûteux bénéficient du même petit sizing.', 'Peu de connexion : petit sizing, fréquence élevée.'],
  drawy: ['La connexion accompagne ici un avantage de nuts pour BTN.', 'Dans ce modèle, les grosses paires et les meilleures combinaisons de BTN permettent une construction plus polarisée. Les tirages donnent une raison de faire payer davantage, avec moins de mises.', 'Connexion + avantage de nuts : grosse mise possible.'],
  extra: ['BB possède beaucoup de nuts sur ce board bas et connecté.', 'Les quintes, doubles paires et gros tirages de BB limitent la pression que BTN peut exercer. On retient une mise intermédiaire autour de 40 %, avec davantage de checks.', 'Très connecté ne veut pas dire miser très gros.'],
  mono: ['Une petite mise est le point de départ sur un flop monotone.', 'La couleur déjà possible réduit la valeur relative de nombreuses mains. Le modèle privilégie un petit sizing plutôt qu’une grosse mise automatique pour protéger.', 'Monotone : commencer petit, sans surprotéger.'],
  pairHigh: ['La paire haute et la faible connexion favorisent une petite mise.', 'BTN peut conserver de nombreuses mains moyennes dans sa range de mise. La paire sur le board n’impose pas à elle seule une stratégie polarisée.', 'Pairé et sec : petit sizing.'],
  pairMid: ['La paire moyenne et les tirages appellent un sizing intermédiaire.', 'Le modèle retient environ 40 % pour cette famille. Il ne faut pas appliquer mécaniquement le petit sizing des boards pairés hauts et secs.', 'Un flop pairé garde sa texture : regarder aussi les tirages.'],
  aceTop: ['Deux cartes très hautes renforcent l’avantage de nuts de BTN.', 'Sur AKx ou AQx non monotone et non pairé, le modèle choisit une range de mise plus polarisée : pot ou overbet, à faible fréquence, autour de 30–40 %.', 'AKx / AQx : grosse pression, peu de mises.'],
  aceBroadway: ['AJx / ATx se jouent ici avec une grosse mise à faible fréquence.', 'Le modèle retient environ deux tiers du pot avec 30–40 % de mises. La présence de l’As ne suffit pas à choisir le même sizing sur tous les ace-high.', 'AJx / ATx : deux tiers, à faible fréquence.'],
  aceLow: ['L’As accompagné de cartes plus basses conserve un petit sizing.', 'BTN doit garder ses mains moyennes dans sa stratégie. Le modèle privilégie un tiers du pot, avec une fréquence modérée : l’As seul n’est pas une raison d’overbet.', 'As + cartes basses : un tiers reste le repère.'],
} as const;
type Rule = keyof typeof rules;
type Row = [cards: string, texture: Texture, sizing: Sizing, rule: Rule, difficulty: DrillQuestion['difficulty'], tags?: Category[]];

// Each row defines its own strategic answer; new boards only require a new row.
const rows: Row[] = [
  ['KS 7H 2D', 'dry', 'SMALL', 'dry', 1, ['equity_denial']],
  ['QH 8S 3D', 'dry', 'SMALL', 'dry', 1],
  ['JS 7D 4C', 'dry', 'SMALL', 'dry', 1],
  ['KC 8D 3H', 'dry', 'SMALL', 'dry', 1],
  ['QS 7C 2H', 'dry', 'SMALL', 'dry', 1],
  ['JH 8C 2D', 'dry', 'SMALL', 'dry', 2, ['equity_denial']],
  ['KH 9C 4S', 'dry', 'SMALL', 'dry', 2],
  ['QC 6D 2S', 'dry', 'SMALL', 'dry', 2],
  ['TS 6H 2D', 'dry', 'SMALL', 'dry', 3, ['equity_denial']],
  ['KD 7C 3S', 'dry', 'SMALL', 'dry', 3],
  ['KS QS 8D', 'drawy', 'BIG', 'drawy', 1, ['nuts_advantage']],
  ['JH TH 7C', 'drawy', 'BIG', 'drawy', 1, ['nuts_advantage']],
  ['QC 9C 8S', 'drawy', 'BIG', 'drawy', 2, ['nuts_advantage']],
  ['KD QD 7S', 'drawy', 'BIG', 'drawy', 2, ['nuts_advantage']],
  ['QS JS 6H', 'drawy', 'BIG', 'drawy', 2, ['nuts_advantage']],
  ['KH JH 8C', 'drawy', 'BIG', 'drawy', 2, ['nuts_advantage']],
  ['KC QH 8D', 'drawy', 'BIG', 'drawy', 4, ['nuts_advantage']],
  ['JD TC 7H', 'drawy', 'BIG', 'drawy', 4, ['nuts_advantage']],
  ['QD JH 8C', 'drawy', 'BIG', 'drawy', 3, ['nuts_advantage']],
  ['KS JS 9D', 'drawy', 'BIG', 'drawy', 3, ['nuts_advantage']],
  ['7S 6S 5H', 'extra_drawy', 'MEDIUM', 'extra', 1, ['nuts_advantage']],
  ['6H 5H 4C', 'extra_drawy', 'MEDIUM', 'extra', 1, ['nuts_advantage']],
  ['8D 7D 6C', 'extra_drawy', 'MEDIUM', 'extra', 2, ['nuts_advantage']],
  ['9C 8C 7S', 'extra_drawy', 'MEDIUM', 'extra', 2, ['nuts_advantage']],
  ['5S 4S 3H', 'extra_drawy', 'MEDIUM', 'extra', 2, ['nuts_advantage']],
  ['7H 6D 5C', 'extra_drawy', 'MEDIUM', 'extra', 4, ['nuts_advantage']],
  ['6C 5D 4S', 'extra_drawy', 'MEDIUM', 'extra', 4, ['nuts_advantage']],
  ['8H 7S 6D', 'extra_drawy', 'MEDIUM', 'extra', 4, ['nuts_advantage']],
  ['9H 8D 7S', 'extra_drawy', 'MEDIUM', 'extra', 3, ['nuts_advantage']],
  ['5C 4D 3S', 'extra_drawy', 'MEDIUM', 'extra', 3, ['nuts_advantage']],
  ['KS 8S 3S', 'monotone', 'SMALL', 'mono', 1],
  ['QH 9H 4H', 'monotone', 'SMALL', 'mono', 1],
  ['JC 7C 2C', 'monotone', 'SMALL', 'mono', 1],
  ['TD 8D 5D', 'monotone', 'SMALL', 'mono', 2],
  ['9S 6S 3S', 'monotone', 'SMALL', 'mono', 2],
  ['AH KH 4H', 'monotone', 'SMALL', 'mono', 4, ['ace_high']],
  ['AC QC 7C', 'monotone', 'SMALL', 'mono', 4, ['ace_high']],
  ['7D 6D 5D', 'monotone', 'SMALL', 'mono', 4, ['nuts_advantage']],
  ['AS 9S 2S', 'monotone', 'SMALL', 'mono', 3, ['ace_high']],
  ['KH QH JH', 'monotone', 'SMALL', 'mono', 3],
  ['KS KH 3D', 'paired', 'SMALL', 'pairHigh', 1],
  ['QH QC 4S', 'paired', 'SMALL', 'pairHigh', 1],
  ['JS JD 2C', 'paired', 'SMALL', 'pairHigh', 1],
  ['AS AH 7D', 'paired', 'SMALL', 'pairHigh', 4, ['ace_high']],
  ['9S 9H 8S', 'paired', 'MEDIUM', 'pairMid', 2],
  ['8C 8D 7C', 'paired', 'MEDIUM', 'pairMid', 2],
  ['7H 7S 6H', 'paired', 'MEDIUM', 'pairMid', 3],
  ['TC TH 9C', 'paired', 'MEDIUM', 'pairMid', 4],
  ['KD KC 5H', 'paired', 'SMALL', 'pairHigh', 3],
  ['QD QS 2H', 'paired', 'SMALL', 'pairHigh', 3],
  ['AS KH 4D', 'dry', 'OVERBET', 'aceTop', 2, ['ace_high', 'nuts_advantage']],
  ['AH QC 7D', 'dry', 'OVERBET', 'aceTop', 2, ['ace_high', 'nuts_advantage']],
  ['AD KD 6S', 'drawy', 'OVERBET', 'aceTop', 4, ['ace_high', 'nuts_advantage']],
  ['AC QH 3S', 'dry', 'OVERBET', 'aceTop', 3, ['ace_high', 'nuts_advantage']],
  ['AS JH 6D', 'dry', 'BIG', 'aceBroadway', 2, ['ace_high']],
  ['AH TC 4S', 'dry', 'BIG', 'aceBroadway', 2, ['ace_high']],
  ['AD JD 7C', 'drawy', 'BIG', 'aceBroadway', 4, ['ace_high']],
  ['AC TH 8S', 'drawy', 'BIG', 'aceBroadway', 3, ['ace_high']],
  ['AS 9H 4D', 'dry', 'SMALL', 'aceLow', 2, ['ace_high', 'equity_denial']],
  ['AH 8C 3D', 'dry', 'SMALL', 'aceLow', 2, ['ace_high']],
  ['AD 7S 2C', 'dry', 'SMALL', 'aceLow', 3, ['ace_high']],
  ['AC 6H 3S', 'dry', 'SMALL', 'aceLow', 3, ['ace_high']],
  ['AS 5H 2D', 'drawy', 'SMALL', 'aceLow', 4, ['ace_high']],
  ['AH 4C 2S', 'drawy', 'SMALL', 'aceLow', 4, ['ace_high']],
];

export const QUESTIONS: DrillQuestion[] = rows.map(([cards, texture, sizing, rule, difficulty, tags = []]) => {
  const [short, detailed, mentalRule] = rules[rule];
  const frequencies: Record<Rule, [number, number]> = {
    dry: [70, 90], drawy: [40, 60], extra: [45, 55], mono: [40, 60],
    pairHigh: [60, 80], pairMid: [40, 60], aceTop: [30, 40], aceBroadway: [30, 40], aceLow: [40, 60],
  };
  const labels: Record<Sizing, string> = { CHECK: 'Check majoritaire', SMALL: '25–33 % du pot', MEDIUM: '≈ 40 % du pot', BIG: '60–75 % du pot', OVERBET: 'Pot / Overbet' };
  return {
    id: `btn-bb-${cards.replaceAll(' ', '-').toLowerCase()}`, spot: 'BTN_VS_BB',
    board: { cards: cards.split(' ') as [string, string, string], texture }, tags,
    correctAnswer: { sizing, sizingLabel: labels[sizing], frequencyMin: frequencies[rule][0], frequencyMax: frequencies[rule][1] },
    explanation: { short, detailed, mentalRule }, difficulty,
  };
});
