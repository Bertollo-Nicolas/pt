import type { ReviewHand } from '../types';

const header = /^Winamax Poker - .*?HandId:\s*#([^\s]+).*$/gm;

function clean(raw: string): string {
  return raw.replace(/&#x20;|&nbsp;/gi, ' ').replace(/\r/g, '')
    .replace(/\[b\](ANTE\/BLINDS|PRE-FLOP|FLOP|TURN|RIVER|SHOW DOWN|SUMMARY)\[\/b\]/gi, '[$1]')
    .replace(/\*\*\* (ANTE\/BLINDS|PRE-FLOP|FLOP|TURN|RIVER|SHOW DOWN|SUMMARY) \*\*\*/gi, '[$1]')
    .trim();
}

function positionFor(raw: string, hero: string): string {
  const button = Number(raw.match(/Seat #(\d+) is the button/)?.[1]);
  const seats = [...raw.matchAll(/^Seat (\d+): (.+?) \(/gm)].map(match => ({ seat: Number(match[1]), name: match[2] })).sort((a, b) => a.seat - b.seat);
  const buttonIndex = seats.findIndex(player => player.seat === button);
  const heroIndex = seats.findIndex(player => player.name === hero);
  if (buttonIndex < 0 || heroIndex < 0) return 'Position inconnue';
  const fromButton = (heroIndex - buttonIndex + seats.length) % seats.length;
  if (fromButton === 0) return 'BTN';
  if (seats.length === 2) return 'BB';
  if (fromButton === 1) return 'SB';
  if (fromButton === 2) return 'BB';
  const remaining = seats.length - fromButton;
  return remaining === 1 ? 'CO' : remaining === 2 ? 'HJ' : 'UTG';
}

function street(raw: string, name: string, next?: string): string {
  const start = raw.indexOf(`[${name}]`);
  if (start < 0) return '';
  const end = next ? raw.indexOf(`[${next}]`, start + name.length + 2) : -1;
  return raw.slice(start, end < 0 ? undefined : end);
}

function classify(raw: string, hero: string, cards: string): string[] {
  const tags: string[] = [];
  const pre = street(raw, 'PRE-FLOP', 'FLOP');
  const flop = street(raw, 'FLOP', 'TURN');
  const turn = street(raw, 'TURN', 'RIVER');
  const river = street(raw, 'RIVER', 'SHOW DOWN');
  const board = flop.match(/\[([2-9TJQKA])[CDHS]\]\s*\[([2-9TJQKA])[CDHS]\]\s*\[([2-9TJQKA])[CDHS]\]/i);
  const ranks = [...cards.matchAll(/\[([2-9TJQKA])[CDHS]\]/gi)].map(match => match[1].toUpperCase());
  const escaped = hero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heroAction = (section: string, action: string) => new RegExp(`^${escaped} (?:${action})\\b`, 'm').test(section);
  const preCalls = (pre.match(/^.+? calls /gm) ?? []).length;
  if (preCalls >= 2) tags.push('Multiway');
  if (!/ raises /m.test(pre) && preCalls > 0) tags.push('Pot limpé');
  if (heroAction(pre, 'raises')) tags.push('Relance préflop');
  else if (heroAction(pre, 'calls')) tags.push('Call préflop');
  if (flop) tags.push('Flop');
  if (turn) tags.push('Turn');
  if (river) tags.push('River');
  if (board && ranks.length === 2) {
    const boardRanks = board.slice(1).map(rank => rank.toUpperCase());
    if (ranks[0] === ranks[1] && boardRanks.includes(ranks[0])) tags.push('Brelan floppé');
    else if (ranks.some(rank => boardRanks.includes(rank))) tags.push('Paire au flop');
  }
  if (heroAction(flop, 'bets|raises')) tags.push('Mise flop');
  if (heroAction(turn, 'bets|raises')) tags.push('Mise turn');
  if (heroAction(river, 'bets|raises')) tags.push('Mise river');
  if (/\[SHOW DOWN\]/.test(raw)) tags.push('Showdown');
  if (new RegExp(`^${escaped} collected`, 'm').test(raw)) tags.push('Pot gagné');
  return tags;
}

export function parseReviewHands(input: string): ReviewHand[] {
  const normalized = clean(input);
  const matches = [...normalized.matchAll(header)];
  const result: ReviewHand[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const raw = normalized.slice(match.index, matches[i + 1]?.index).trim();
    const dealt = raw.match(/Dealt to (.+?)\s*\[([2-9TJQKA][CDHS])\]\s*\[([2-9TJQKA][CDHS])\]/i);
    if (!dealt || !/\[PRE-FLOP\]/.test(raw)) continue;
    const hero = dealt[1].trim();
    const cards = `[${dealt[2].toUpperCase()}] [${dealt[3].toUpperCase()}]`;
    result.push({
      id: match[1], handId: match[1], raw,
      importedAt: new Date().toISOString(),
      playedAt: raw.match(/(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} UTC)/)?.[1] ?? '',
      hero, heroCards: cards, position: positionFor(raw, hero),
      stakes: raw.match(/\(([\d.,]+€\/[\d.,]+€)\)/)?.[1] ?? '',
      tags: classify(raw, hero, cards), reviewed: false, note: '',
    });
  }
  return result;
}
