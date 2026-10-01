import type { ReviewHand } from '../types';
import { historyCardBlock, normalizeHistory, seatPosition } from './hand-history';

const header = /^Winamax Poker - .*?HandId:\s*#([^\s]+).*$/gm;

function positionFor(raw: string, hero: string): string {
  const setup = raw.split(/\[(?:ANTE\/BLINDS|PRE-FLOP)\]/)[0];
  const button = Number(setup.match(/Seat #(\d+) is the button/)?.[1]);
  const seats = [...setup.matchAll(/^Seat (\d+): (.+?) \(/gm)].map(match => ({ seat: Number(match[1]), name: match[2] }));
  const heroSeat = seats.find(player => player.name === hero)?.seat;
  const position = heroSeat === undefined ? '?' : seatPosition(heroSeat, seats.map(player => player.seat), button);
  return position === '?' ? 'Position inconnue' : position;
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
  const board = historyCardBlock(flop.split('\n'), 0).slice(0, 3);
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
  if (board.length === 3 && ranks.length === 2) {
    const boardRanks = board.map(card => card[0]);
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
  const normalized = normalizeHistory(input);
  const matches = [...normalized.matchAll(header)];
  const result: ReviewHand[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const raw = normalized.slice(match.index, matches[i + 1]?.index).trim();
    const lines = raw.split('\n');
    const dealtIndex = lines.findIndex(line => /^Dealt to\s+/i.test(line.trim()));
    const hero = lines[dealtIndex]?.trim().match(/^Dealt to\s+(.+?)(?:\s*\[|$)/i)?.[1].trim();
    const dealtCards = dealtIndex >= 0 ? historyCardBlock(lines, dealtIndex) : [];
    if (!hero || dealtCards.length !== 2 || !/\[PRE-FLOP\]/.test(raw)) continue;
    const cards = dealtCards.map(card => `[${card}]`).join(' ');
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
