/** Accept native exports and the formatting used when copying Winamax histories. */
export function normalizeHistory(raw: string): string {
  return raw.replace(/&#x20;|&#32;|&nbsp;|\u00a0/gi, ' ').replace(/\r/g, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/\[b\]\s*(ANTE\/BLINDS|PRE-FLOP|FLOP|TURN|RIVER|SHOW DOWN|SUMMARY)\s*\[\/b\]/gi, '[$1]')
    .replace(/\[\/?(?:b|i|u|color(?:=[^\]]+)?|size(?:=[^\]]+)?)\]/gi, '')
    .replace(/\*\*\*\s*(ANTE\/BLINDS|PRE-FLOP|FLOP|TURN|RIVER|SHOW DOWN|SUMMARY)\s*\*\*\*/gi, '[$1]')
    .replace(/\[(ANTE\/BLINDS|PRE-FLOP|FLOP|TURN|RIVER|SHOW DOWN|SUMMARY)\]/gi, match => match.toUpperCase())
    .trim();
}

export function historyCards(text: string): string[] {
  const suits: Record<string, string> = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
  return [...text.matchAll(/\[([^\]]+)\]/g)].flatMap(match => {
    const value = match[1].replace(/[\uFE0E\uFE0F]/g, '').trim();
    // Reject bracketed prose/markers rather than extracting card-like text from it.
    if (!/^(?:(?:10|[2-9TJQKA])\s*[cdhs♠♥♦♣][\s,]*)+$/i.test(value)) return [];
    return [...value.matchAll(/(10|[2-9TJQKA])\s*([cdhs♠♥♦♣])/gi)].map(card => `${card[1] === '10' ? 'T' : card[1].toUpperCase()}${suits[card[2]] ?? card[2].toUpperCase()}`);
  });
}

/** Read only adjacent card-only lines, never cards from a later action/street. */
export function historyCardBlock(lines: string[], index: number): string[] {
  const cards = historyCards(lines[index] ?? '');
  for (let next = index + 1; next < lines.length; next++) {
    const line = lines[next].trim();
    if (!line) continue;
    if (line.replace(/\[[^\]]*\]/g, '').trim() || !historyCards(line).length) break;
    cards.push(...historyCards(line));
  }
  return cards;
}

export function seatPosition(seat: number, seats: number[], button: number): string {
  const ordered = [...seats].sort((a, b) => a - b);
  const index = ordered.indexOf(seat);
  const buttonIndex = ordered.indexOf(button);
  if (index < 0 || buttonIndex < 0) return '?';
  const offset = (index - buttonIndex + ordered.length) % ordered.length;
  if (offset === 0) return ordered.length === 2 ? 'BTN / SB' : 'BTN';
  if (ordered.length === 2) return 'BB';
  if (offset === 1) return 'SB';
  if (offset === 2) return 'BB';
  const beforeButton = ordered.length - offset;
  return beforeButton === 1 ? 'CO' : beforeButton === 2 ? 'HJ' : offset === 3 ? 'UTG' : beforeButton === 3 ? 'LJ' : `UTG+${offset - 3}`;
}
