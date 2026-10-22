import type { ValueAction, ValueCase, ValueFamily } from './types';
import { actionLabel } from './types';

export interface ValueRule { id: string; family: Exclude<ValueFamily,'adaptations'>; hand: string; line: [ValueAction[],ValueAction[],ValueAction[]]; note?: string }
export const VALUE_RULES: ValueRule[] = [
  {id:'ph-top',family:'paired_high',hand:'Trips · kicker fort',line:[['B80'],['B80'],['B80','SHOVE']]},
  {id:'ph-low',family:'paired_high',hand:'Trips · kicker faible',line:[['B50'],['B50'],['B50']]},
  {id:'ph-over',family:'paired_high',hand:'Overpaire',line:[['B33'],['B50'],['B33']]},
  {id:'ph-mid',family:'paired_high',hand:'PP moyenne',line:[['B33'],['B50'],['CHECK']]},
  {id:'ph-small',family:'paired_high',hand:'Petite PP',line:[['B33'],['CHECK'],['CHECK']]},
  {id:'pl-top',family:'paired_low',hand:'Trips · kicker fort',line:[['B80'],['B80'],['B80','SHOVE']]},
  {id:'pl-low',family:'paired_low',hand:'Trips · kicker faible',line:[['B50'],['B50'],['B50']]},
  {id:'pl-over',family:'paired_low',hand:'PP forte · TT+',line:[['B33'],['B50'],['B33']]},
  {id:'pl-mid',family:'paired_low',hand:'PP moyenne',line:[['B33'],['CHECK'],['CHECK']]},
  {id:'hc-top',family:'high_connected',hand:'Top paire · top kicker',line:[['POT'],['OVERBET'],['SHOVE']]},
  {id:'hc-mid',family:'high_connected',hand:'Top paire · kicker Q à 9',line:[['B80'],['B80'],['CHECK']]},
  {id:'hc-pair',family:'high_connected',hand:'Paire moyenne',line:[['B50'],['B33','B50'],['CHECK']]},
  {id:'hc-small',family:'high_connected',hand:'Petite paire',line:[['B33'],['CHECK'],['CHECK']]},
  {id:'lc-nuts',family:'low_connected',hand:'Nuts',line:[['POT'],['POT'],['SHOVE']]},
  {id:'lc-set',family:'low_connected',hand:'Brelan',line:[['POT'],['POT'],['B50']]},
  {id:'lc-over',family:'low_connected',hand:'Overpaire moyenne',line:[['B80'],['B80'],['B50']]},
  {id:'lc-top',family:'low_connected',hand:'Top paire',line:[['B80'],['B80'],['B33']]},
  {id:'ad-dp',family:'ace_dry',hand:'Deux paires / set',line:[['POT'],['POT'],['SHOVE']]},
  {id:'ad-topset',family:'ace_dry',hand:'Top set',line:[['B50'],['POT'],['SHOVE']],note:'Exception du cours : top set → demi-pot au flop.'},
  {id:'ad-good',family:'ace_dry',hand:'Top paire · bon kicker (AJ+)',line:[['B80'],['B80'],['B66']]},
  {id:'ad-mid',family:'ace_dry',hand:'Top paire · kicker moyen',line:[['B50'],['B50'],['CHECK','B33']]},
  {id:'ad-weak',family:'ace_dry',hand:'Top paire faible / PP au-dessus de la 2e paire',line:[['B33'],['B33'],['CHECK']]},
  {id:'ad-small',family:'ace_dry',hand:'Petite PP',line:[['B25'],['CHECK'],['CHECK']]},
  {id:'aw-dp',family:'ace_drawy',hand:'Deux paires / set',line:[['OVERBET'],['OVERBET'],['SHOVE']]},
  {id:'aw-topset',family:'ace_drawy',hand:'Top set',line:[['B80'],['OVERBET'],['SHOVE']],note:'Exception du cours : top set → 80 % au flop.'},
  {id:'aw-good',family:'ace_drawy',hand:'Top paire · bon kicker (AJ+)',line:[['B80'],['POT'],['B33','SHOVE']]},
  {id:'aw-mid',family:'ace_drawy',hand:'Top paire · kicker moyen',line:[['B50'],['B50'],['CHECK']]},
  {id:'aw-weak',family:'ace_drawy',hand:'Top paire faible / PP au-dessus de la 2e paire',line:[['B33'],['B50'],['CHECK']]},
  {id:'aw-small',family:'ace_drawy',hand:'Petite PP',line:[['B25'],['CHECK'],['CHECK']]},
];

// Examples illustrate the supplied course lines; they do not invent a strategy.
// Middle boundary kickers not clarified by the user are deliberately avoided.
const samples: [string,string,string][] = [
  ['ph-top','AS QH','QS QD 4C 2H 8S'], ['ph-low','5S QH','QS QD 4C 2H 8S'],
  ['ph-over','AS AH','QS QD 4C 2H 8S'], ['ph-mid','9S 9H','QS QD 4C 2H 8S'], ['ph-small','3S 3H','QS QD 4C 2H 8S'],
  ['pl-top','AS 5H','5S 5D 2C 3H 7S'], ['pl-low','6S 5H','5S 5D 2C 3H 7S'],
  ['pl-over','KS KH','5S 5D 2C 3H 7S'], ['pl-mid','8S 8H','5S 5D 2C 3H 7S'],
  ['hc-top','AS KH','KS JD TC 2H 4S'], ['hc-mid','QS KH','KS JD TC 2H 4S'],
  ['hc-pair','QS JH','KS JD TC 2H 4S'], ['hc-small','9S 9H','KS JD TC 2H 4S'],
  ['lc-nuts','TS 9H','8S 7D 6C 2H 3S'], ['lc-set','8H 8D','8S 7D 6C 2H 3S'],
  ['lc-over','9S 9H','8S 7D 6C 2H 3S'], ['lc-top','AS 8H','8S 7D 6C 2H 3S'],
  ['ad-dp','AH 7H','AS 7D 4C 2H 8S'], ['ad-dp','7S 7H','AS 7D 4C 2H 8S'],
  ['ad-topset','AH AD','AS 7D 4C 2H 8S'], ['ad-good','AH JS','AS 7D 4C 2H 8S'],
  ['ad-mid','AH TS','AS 7D 4C 2H 8S'], ['ad-weak','AH 5S','AS 7D 4C 2H 8S'],
  ['ad-weak','KS KH','AS 7D 4C 2H 8S'], ['ad-small','5S 5H','AS 7D 4C 2H 8S'],
  ['aw-dp','AH 8H','AS 8S 6D 2H 3C'], ['aw-dp','6S 6H','AS 8S 6D 2H 3C'],
  ['aw-topset','AH AD','AS 8S 6D 2H 3C'], ['aw-good','AH JS','AS 8S 6D 2H 3C'],
  ['aw-mid','AH TS','AS 8S 6D 2H 3C'], ['aw-weak','AH 5S','AS 8S 6D 2H 3C'],
  ['aw-weak','KS KH','AS 8S 6D 2H 3C'], ['aw-small','4S 4H','AS 8S 6D 2H 3C'],
];
export const VALUE_CASES: ValueCase[] = samples.map(([ruleId,hero,runout])=>{
  const rule=VALUE_RULES.find(item=>item.id===ruleId)!;
  const cards=runout.split(' ');
  return {id:`${ruleId}-${hero.replaceAll(' ','-')}`,ruleId,family:rule.family,hero:hero.split(' ') as [string,string],handLabel:rule.hand,
    title:'Ligne de value du cours',context:'Hero IP contre un joueur récréatif passif. Vilain checke à chaque street ; il paie les mises précédentes. Pas de relance. Suis la ligne de référence du cours.',
    steps:rule.line.map((expected,index)=>({street:(['Flop','Turn','River'] as const)[index],board:cards.slice(0,3+index),expected,
      explanation:`${rule.hand} : ${expected.map(actionLabel).join(' ou ')} à cette street.${index===0 && rule.note ? ` ${rule.note}` : ''}`}))};
});

VALUE_CASES.push(
  {id:'adapt-flush-turn',ruleId:'flush',family:'adaptations',hero:['KH','QC'],handLabel:'Top paire · flush possible',title:'Une couleur devient possible à la turn',context:'Flop K♠ J♠ T♦, puis 4♠ à la turn. La ligne de référence prévoyait 80 % turn. Quelle adaptation indique le cours ?',steps:[{street:'Turn',board:['KS','JS','TD','4S'],expected:['REDUCE'],explanation:'Si une flush rentre turn, le cours demande de réduire les sizings. Aucun nouveau pourcentage précis n’est imposé.'}]},
  {id:'adapt-flush-river',ruleId:'flush',family:'adaptations',hero:['AH','KC'],handLabel:'Top paire · flush possible',title:'Une couleur devient possible à la river',context:'Une troisième carte de la même couleur arrive à la river. Quelle adaptation indique le cours ?',steps:[{street:'River',board:['KS','JS','TD','2H','4S'],expected:['REDUCE'],explanation:'Si une flush rentre river, on réduit le sizing par rapport à la ligne de référence.'}]},
  {id:'adapt-four-straight',ruleId:'four-straight',family:'adaptations',hero:['TS','2H'],handLabel:'Quinte sur quatre cartes connectées',title:'Quatre cartes vers une quinte',context:'Tu as une quinte sur un board avec quatre cartes consécutives. La mise de référence était pot. Quel sizing indique le cours pour générer davantage de calls ?',steps:[{street:'Turn',board:['9C','8D','7H','6S'],expected:['B75'],explanation:'Sur quatre cartes vers une quinte, on descend d’un cran : l’exemple du cours fait passer pot à 75 %.'}]},
  {id:'adapt-board-straight',ruleId:'board-straight',family:'adaptations',hero:['TS','AH'],handLabel:'Quinte supérieure à celle du board',title:'Une quinte sur le board',context:'Le board fait quinte, mais ton T te donne une quinte supérieure. Quelle adaptation indique le cours ?',steps:[{street:'River',board:['5C','6D','7H','8S','9C'],expected:['OVERBET'],explanation:'Exception du cours : lorsqu’on possède une quinte supérieure à celle du board, on overbet.'}]},
  {id:'adapt-mono-flop',ruleId:'monotone',family:'adaptations',hero:['AH','KD'],handLabel:'Top paire sur flop monotone',title:'Flop monotone',context:'Tu appliques les principes du cours sur un flop monotone. Comment adapter ton sizing flop par rapport à une ligne de référence non monotone ?',steps:[{street:'Flop',board:['KS','9S','4S'],expected:['REDUCE'],explanation:'Sur un board monotone, le cours réduit les sizings d’un cran au flop et à la turn.'}]},
  {id:'adapt-mono-turn',ruleId:'monotone',family:'adaptations',hero:['AH','KD'],handLabel:'Top paire sur board monotone',title:'Turn après un flop monotone',context:'Le flop était monotone. La turn est une carte d’une autre couleur. Quel principe du cours s’applique encore au sizing turn ?',steps:[{street:'Turn',board:['KS','9S','4S','2D'],expected:['REDUCE'],explanation:'Le cours garde des sizings réduits à la turn après un flop monotone, puis réserve les très grosses mises pour la river.'}]},
  {id:'adapt-mono-river',ruleId:'monotone',family:'adaptations',hero:['AS','QS'],handLabel:'Couleur max sur runout non pairé',title:'Value river après un flop monotone',context:'Tu as la couleur max sur un runout non pairé. Selon le principe général du cours, à quelle street réserves-tu les très grosses mises ?',steps:[{street:'River',board:['KS','9S','4S','2D','7H'],expected:['LARGE_RIVER'],explanation:'Le cours réserve les très grosses mises pour la river sur ces textures. Il ne donne pas ici de pourcentage précis à imposer.'}]},
);
