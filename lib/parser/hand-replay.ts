import { historyCards, historyCardBlock, normalizeHistory, seatPosition } from './hand-history';

export type ReplayStreet = 'Installation' | 'Préflop' | 'Flop' | 'Turn' | 'River' | 'Résultat';
export interface ReplayPlayer {
  seat: number;
  name: string;
  position: string;
  stack: number;
  committed: number;
  folded: boolean;
  cards: string[];
  lastAction: string;
}
export interface ReplayFrame {
  street: ReplayStreet;
  board: string[];
  players: ReplayPlayer[];
  pot: number;
  label: string;
  actor?: string;
  result: boolean;
}
export interface HandReplay {
  frames: ReplayFrame[];
  bigBlind: number | null;
  warnings: string[];
}

const amount = (value: string) => Number(value.replace(',', '.'));
const rounded = (value: number) => Math.round(value * 100000) / 100000;

/** Snapshots contain only information available at that point in the hand. */
export function buildHandReplay(raw: string, hero: string, knownHeroCards?: string): HandReplay {
  const lines = normalizeHistory(raw).split('\n').map(line => line.trim()).filter(Boolean);
  const warnings = new Set<string>();
  const button = Number(lines.find(line => /Seat #\d+ is the button/.test(line))?.match(/Seat #(\d+)/)?.[1]);
  const players: ReplayPlayer[] = [];
  for (const line of lines) {
    if (/^\[(ANTE\/BLINDS|PRE-FLOP)\]/.test(line)) break;
    const seat = line.match(/^Seat (\d+): (.+?) \(([\d.,]+)(?:€|\$|\s*chips)?\)/);
    if (seat) players.push({ seat: Number(seat[1]), name: seat[2], position: '?', stack: amount(seat[3]), committed: 0, folded: false, cards: [], lastAction: '' });
  }
  players.sort((a, b) => a.seat - b.seat);
  for (const player of players) player.position = seatPosition(player.seat, players.map(p => p.seat), button);
  const dealtIndex = lines.findIndex(line => {
    const name = line.match(/^Dealt to\s+(.+?)(?:\s*\[|$)/i)?.[1].trim();
    return name === hero.trim();
  });
  const heroPlayer = players.find(player => player.name === hero);
  if (heroPlayer) {
    const rawCards = dealtIndex >= 0 ? historyCardBlock(lines, dealtIndex) : [];
    const savedCards = historyCards(knownHeroCards ?? '');
    heroPlayer.cards = rawCards.length === 2 ? rawCards : savedCards.length === 2 ? savedCards : [];
    if (!heroPlayer.cards.length) warnings.add('Les cartes de Hero ne sont pas présentes dans cet historique.');
  }
  if (players.length < 2 || !heroPlayer) warnings.add('Les sièges ou le joueur principal sont incomplets.');
  if (players.some(player => player.position === '?')) warnings.add('Le bouton est absent : certaines positions ne sont pas disponibles.');
  const blindLine = lines.find(line => / posts big blind /.test(line));
  const blindMatch = blindLine?.match(/posts big blind ([\d.,]+)/);
  const headerBlinds = lines[0]?.match(/\(([\d.,]+)[€$]?\/([\d.,]+)[€$]?\)/);
  const parsedBlind = headerBlinds ? amount(headerBlinds[2]) : blindMatch ? amount(blindMatch[1]) : 0;
  const bigBlind = parsedBlind > 0 ? parsedBlind : null;
  if (!bigBlind) warnings.add('Grosse blinde introuvable : les montants sont affichés en unités de l’historique.');
  let street: ReplayStreet = 'Installation';
  let board: string[] = [];
  let pot = 0;
  let inHand = false;
  let result = false;
  const frames: ReplayFrame[] = [];
  const snapshot = (label: string, actor?: string) => frames.push({ street, board: [...board], players: players.map(player => ({ ...player, cards: [...player.cards] })), pot: rounded(pot), label, actor, result });
  snapshot('Les joueurs prennent place');
  const contribute = (player: ReplayPlayer, value: number, ante = false) => {
    if (!Number.isFinite(value) || value < -0.0001 || value > player.stack + 0.0001) warnings.add('Certains montants sont incohérents : consulte l’historique pour vérifier le pot.');
    const paid = Math.max(0, Math.min(player.stack, value));
    player.stack = rounded(player.stack - paid);
    if (!ante) player.committed = rounded(player.committed + paid);
    pot = rounded(pot + paid);
  };
  for (const [lineIndex, line] of lines.entries()) {
    if (/^\[SUMMARY\]/i.test(line)) break; // Never count summary awards a second time.
    if (/^\[ANTE\/BLINDS\]/i.test(line)) { inHand = true; continue; }
    const marker = line.match(/^\[(PRE-FLOP|FLOP|TURN|RIVER|SHOW DOWN)\]/i)?.[1].toUpperCase();
    if (marker) {
      inHand = true;
      if (marker === 'SHOW DOWN') { result = true; street = 'Résultat'; continue; }
      street = ({ 'PRE-FLOP': 'Préflop', FLOP: 'Flop', TURN: 'Turn', RIVER: 'River' } as const)[marker as 'PRE-FLOP' | 'FLOP' | 'TURN' | 'RIVER'];
      if (marker !== 'PRE-FLOP') {
        for (const player of players) { player.committed = 0; player.lastAction = ''; }
        const cards = historyCardBlock(lines, lineIndex);
        const expected = marker === 'FLOP' ? 3 : marker === 'TURN' ? 4 : 5;
        board = cards.length === expected ? cards : [...board, ...cards];
        if (board.length !== expected) warnings.add('Le board est incomplet ou comporte plusieurs runouts : vérifie l’historique.');
      }
      snapshot(street);
      continue;
    }
    if (!inHand || line.startsWith('Dealt to ')) continue;
    const returned = line.match(/^Uncalled bet \(?([\d.,]+)[€$]?\)? returned to (.+)$/i);
    if (returned) {
      const player = players.find(p => p.name === returned[2]);
      if (player) {
        const refund = amount(returned[1]);
        if (refund > pot || refund > player.committed) warnings.add('Une mise rendue ne correspond pas aux contributions enregistrées.');
        player.stack = rounded(player.stack + refund);
        player.committed = rounded(Math.max(0, player.committed - refund));
        pot = rounded(Math.max(0, pot - refund));
        player.lastAction = 'Mise non suivie rendue';
        snapshot(`${player.name} récupère sa mise non suivie`, player.name);
      }
      continue;
    }
    // Match longest names first: names may contain spaces or action words.
    const player = [...players].sort((a, b) => b.name.length - a.name.length).find(p => line.startsWith(`${p.name} `));
    if (!player) {
      if (/\b(posts|raises|calls|bets|checks|folds|collected|shows|mucks)\b/.test(line)) warnings.add('Une action ne correspond à aucun siège connu.');
      continue;
    }
    const action = line.slice(player.name.length + 1);
    const chips = action.match(/^(?:posts (?:small blind|big blind|ante|blind)|calls|bets) ([\d.,]+)/);
    const raise = action.match(/^raises ([\d.,]+)[€$]? to ([\d.,]+)/);
    const collected = action.match(/^collected ([\d.,]+)/);
    if (chips) {
      contribute(player, amount(chips[1]), action.startsWith('posts ante'));
      player.lastAction = action.startsWith('posts') ? 'Blinde / ante' : action.startsWith('calls') ? 'Call' : 'Bet';
    } else if (raise) {
      contribute(player, amount(raise[2]) - player.committed);
      player.lastAction = 'Raise';
    } else if (/^folds\b/.test(action)) { player.folded = true; player.lastAction = 'Fold'; }
    else if (/^checks\b/.test(action)) player.lastAction = 'Check';
    else if (/^(shows|mucks)\b/.test(action)) {
      result = true; street = 'Résultat';
      const cards = historyCards(action);
      if (cards.length) player.cards = cards;
      player.lastAction = action.startsWith('shows') ? 'Montre ses cartes' : 'Muck';
    } else if (collected) {
      result = true; street = 'Résultat';
      const won = amount(collected[1]);
      player.stack = rounded(player.stack + won);
      pot = rounded(Math.max(0, pot - won));
      player.lastAction = 'Pot remporté';
    } else {
      if (/^(raises|posts|calls|bets|is all-in)/.test(action)) warnings.add('Une action de mise n’a pas pu être interprétée : les montants peuvent être incomplets.');
      continue;
    }
    snapshot(`${player.name} · ${action}`, player.name);
  }
  if (frames.length === 1) warnings.add('Aucune action exploitable dans cet historique.');
  return { frames, bigBlind, warnings: [...warnings] };
}
