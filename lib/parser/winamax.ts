import { normalizeHand } from '../poker';
import type { PreflopStat } from '../types';

export function parseWinamaxHH(content: string, heroName: string): PreflopStat[] {
  // Standardize line endings and split hands
  const hands = content.replace(/\r\n/g, '\n').split('\n\n').filter(h => h.trim().length > 0);
  const stats: PreflopStat[] = [];

  for (const handText of hands) {
    try {
      const stat = parseHand(handText, heroName);
      if (stat) stats.push(stat);
    } catch (e) {
      console.error('Error parsing hand:', e);
    }
  }

  return stats;
}

function parseHand(text: string, heroName: string): PreflopStat | null {
  const lines = text.split('\n').map(l => l.trim());
  if (lines.length < 5) return null;

  // 1. Header & Metadata
  const header = lines[0];
  const dateMatch = header.match(/ - (\d{4}\/\d{2}\/\d{2}) /);
  if (!dateMatch) return null;
  const day = dateMatch[1].replace(/\//g, '-');

  const bbMatch = header.match(/\((\d+(?:\.\d+)?)€\/(\d+(?:\.\d+)?)€\)/);
  if (!bbMatch) return null;
  const bbSize = parseFloat(bbMatch[2]);

  // 2. Button and Players
  const tableLine = lines[1];
  const buttonMatch = tableLine.match(/Seat #(\d+) is the button/);
  if (!buttonMatch) return null;
  const buttonSeat = parseInt(buttonMatch[1]);

  const players: { seat: number; name: string; stack: number }[] = [];
  let lineIdx = 2;
  while (lines[lineIdx] && lines[lineIdx].startsWith('Seat ')) {
    const m = lines[lineIdx].match(/Seat (\d+): (.+?) \((.+?)€\)/);
    if (m) {
      players.push({
        seat: parseInt(m[1]),
        name: m[2],
        stack: parseFloat(m[3])
      });
    }
    lineIdx++;
  }
  
  if (!players.find(p => p.name === heroName)) return null;

  // 3. Determine Positions
  const activePlayers = players.sort((a, b) => a.seat - b.seat);
  const btnIdx = activePlayers.findIndex(p => p.seat === buttonSeat);
  
  // Rotate so index 0 is SB (the one after BTN)
  const rotated = [];
  for (let i = 1; i <= activePlayers.length; i++) {
    rotated.push(activePlayers[(btnIdx + i) % activePlayers.length]);
  }

  // Map to names
  const posMap: Record<string, string> = {}; // Name -> Position
  const count = rotated.length;
  
  // Sequence: SB, BB, UTG, MP, CO, BTN
  const posLabels = count === 6 
    ? ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN']
    : count === 5
    ? ['SB', 'BB', 'UTG', 'CO', 'BTN']
    : count === 4
    ? ['SB', 'BB', 'CO', 'BTN']
    : count === 3
    ? ['SB', 'BB', 'BTN']
    : ['BTN', 'BB']; // 2-max

  rotated.forEach((p, i) => {
    posMap[p.name] = posLabels[i];
  });

  const heroPos = posMap[heroName];

  // 4. Hero's Hand
  let heroHandRaw: string[] = [];
  const dealtLine = lines.find(l => l.startsWith(`Dealt to ${heroName}`));
  if (dealtLine) {
    const m = dealtLine.match(/\[(.+?) (.+?)\]/);
    if (m) heroHandRaw = [m[1], m[2]];
  }
  if (heroHandRaw.length === 0) return null;
  const heroHand = normalizeHand(heroHandRaw);

  // 5. Action Analysis (Pre-flop RFI)
  const preflopStart = lines.findIndex(l => l.startsWith('*** PRE-FLOP ***'));
  const flopStart = lines.findIndex(l => l.startsWith('*** FLOP ***'));
  const summaryStart = lines.findIndex(l => l.startsWith('*** SUMMARY ***'));
  
  const preflopLines = lines.slice(preflopStart + 1, flopStart > 0 ? flopStart : summaryStart);
  
  let rfiSpot = true;
  let heroAction = '';
  let heroFirstActionLine = -1;

  for (let i = 0; i < preflopLines.length; i++) {
    const line = preflopLines[i];
    
    // Check if someone entered before Hero
    const playerActionMatch = line.match(/^(.+?) (folds|calls|raises|checks)/);
    if (playerActionMatch) {
      const pName = playerActionMatch[1];
      const action = playerActionMatch[2];
      
      if (pName === heroName) {
        heroFirstActionLine = i;
        if (action === 'raises') heroAction = 'Raise';
        else if (action === 'calls') heroAction = 'Call';
        else if (action === 'folds') heroAction = 'Fold';
        else if (action === 'checks') heroAction = 'Check';
        break;
      }
      
      if (action !== 'folds') {
        rfiSpot = false;
        break;
      }
    }
  }

  // We only care about RFI spots for V1
  if (!rfiSpot || !heroAction) return null;
  // Also, BB can't really RFI in the same sense, but SB can.
  if (heroPos === 'BB' && heroAction === 'Check') return null; // Natural BB behavior

  // 6. Net BB Calculation
  let invested = 0;
  // Blinds
  const blindLines = lines.slice(lines.findIndex(l => l.startsWith('*** ANTE/BLINDS ***')) + 1, preflopStart);
  for (const l of blindLines) {
    if (l.startsWith(heroName)) {
      const m = l.match(/posts (?:small blind|big blind|ante|blind) (\d+(?:\.\d+)?)€/);
      if (m) invested += parseFloat(m[1]);
    }
  }
  // Pre-flop and Post-flop
  const actionLines = lines.slice(preflopStart + 1, summaryStart);
  for (const l of actionLines) {
    if (l.startsWith(heroName)) {
      // calls 0.04€
      // raises 0.12€ to 0.18€
      // bets 0.05€
      const m = l.match(/(?:calls|raises|bets|posts) (\d+(?:\.\d+)?)€/);
      if (m) invested += parseFloat(m[1]);
    }
  }

  let won = 0;
  const summaryLines = lines.slice(summaryStart + 1);
  for (const l of summaryLines) {
    if (l.includes(heroName) && l.includes(' won ')) {
      const m = l.match(/won (\d+(?:\.\d+)?)€/);
      if (m) won += parseFloat(m[1]);
    }
  }

  const net_bb = (won - invested) / bbSize;

  return {
    day,
    position: heroPos,
    hand: heroHand,
    action: heroAction,
    count: 1,
    net_bb
  };
}
