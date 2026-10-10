const RANKS = '23456789TJQKA';
const STRAIGHTS = Array.from({ length: 10 }, (_, index) => index === 0
  ? [14, 2, 3, 4, 5] : Array.from({ length: 5 }, (_, offset) => index + 1 + offset));

export function classifyBoard(cards: [string, string, string]) {
  if (new Set(cards).size !== 3 || cards.some(card => !/^[2-9TJQKA][SHDC]$/.test(card))) throw new Error('Flop invalide');
  const ranks = cards.map(card => RANKS.indexOf(card[0]) + 2);
  const suits = new Set(cards.map(card => card[1])).size;
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  const span = unique[unique.length - 1] - unique[0];
  const wheelSpan = ranks.includes(14) ? Math.max(...ranks.filter(rank => rank !== 14)) - 1 : Infinity;
  const gutshotHands: string[] = [];
  const eightOutHands: string[] = [];
  // Enumerate hole-card rank classes, not backdoors or individual suit combos.
  for (let low = 2; low <= 14; low++) for (let high = low + 1; high <= 14; high++) {
    const holding = new Set([...ranks, low, high]);
    if (STRAIGHTS.some(straight => straight.every(rank => holding.has(rank)))) continue;
    const draws = STRAIGHTS.map(straight => ({ straight, missing: straight.filter(rank => !holding.has(rank)) }))
      .filter(draw => draw.missing.length === 1);
    if (!draws.length) continue;
    const outs = new Set(draws.map(draw => draw.missing[0]));
    const hand = `${RANKS[high - 2]}${RANKS[low - 2]}`;
    // Double gutshots have two completing ranks and are kept out of the gutshot count.
    if (outs.size >= 2) eightOutHands.push(hand);
    else gutshotHands.push(hand); // Includes one-ended wheel/Broadway draws.
  }
  return {
    suits: suits === 1 ? 'monotone' : suits === 2 ? 'two-tone' : 'rainbow',
    paired: unique.length < 3, aceHigh: ranks.includes(14),
    connected: unique.length === 3 && Math.min(span, wheelSpan) <= 4,
    gutshotHands, eightOutHands,
    // Course-calibrated educational boundary, not a solver frequency or equity.
    // Q73 has three gutshot classes; Q84 has six. A lone gutshot isn't enough.
    multipleStraightDraws: gutshotHands.length >= 4 || eightOutHands.length > 0,
  };
}
