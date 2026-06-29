import { normalizeHand } from '../poker';
import type { PreflopStat } from '../types';

export function parseWinamaxHH(content: string, heroName: string): PreflopStat[] {
  if (!heroName) return [];
  
  // Standardize line endings and split hands by one or more blank lines
  const hands = content.replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(h => h.trim().length > 0);
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
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 5) return null;

  // 1. Header & Metadata
  const header = lines[0];
  // Match date like 2026/06/07
  const dateMatch = header.match(/(\d{4}\/\d{2}\/\d{2})/);
  if (!dateMatch) return null;
  const day = dateMatch[1].replace(/\//g, '-');

  // Match BB like (0.01€/0.02€)
  const bbMatch = header.match(/\((?:[\d.,]+€\/)?([\d.,]+)€\)/);
  if (!bbMatch) return null;
  const bbSize = parseAmount(bbMatch[1]);

  // 2. Button and Players
  const tableLine = lines[1];
  const buttonMatch = tableLine.match(/Seat #(\d+)/);
  if (!buttonMatch) return null;
  const buttonSeat = parseInt(buttonMatch[1]);

  const players: { seat: number; name: string; stack: number }[] = [];
  let lineIdx = 2;
  while (lines[lineIdx] && lines[lineIdx].startsWith('Seat ')) {
    // Seat 1: File el mout (2€) or Seat 1: Name (2.02€)
    const m = lines[lineIdx].match(/Seat (\d+): (.+?) \(([\d.,]+)€\)/);
    if (m) {
      players.push({
        seat: parseInt(m[1]),
        name: m[2],
        stack: parseAmount(m[3])
      });
    }
    lineIdx++;
  }
  
  // Find Hero in players (case-insensitive)
  const heroPlayer = players.find(p => p.name.toLowerCase() === heroName.toLowerCase());
  if (!heroPlayer) return null;
  const actualHeroName = heroPlayer.name;

  // 3. Determine Positions
  const activePlayers = players.sort((a, b) => a.seat - b.seat);
  const btnIdx = activePlayers.findIndex(p => p.seat === buttonSeat);
  if (btnIdx === -1) return null;
  
  // Rotate so index 0 is the player AFTER BTN
  const rotated = [];
  for (let i = 1; i <= activePlayers.length; i++) {
    rotated.push(activePlayers[(btnIdx + i) % activePlayers.length]);
  }

  // Map to names
  const posMap: Record<string, string> = {}; // Name -> Position
  const count = rotated.length;
  
  // Sequence: SB, BB, UTG, UTG+1, MP, LJ, HJ, CO, BTN
  let posLabels: string[] = [];
  if (count === 6) posLabels = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'];
  else if (count === 5) posLabels = ['SB', 'BB', 'HJ', 'CO', 'BTN'];
  else if (count === 4) posLabels = ['SB', 'BB', 'CO', 'BTN'];
  else if (count === 3) posLabels = ['SB', 'BB', 'BTN'];
  else if (count === 2) posLabels = ['BB', 'BTN']; // S1=BTN/SB, S2=BB. After BTN is BB. So rotated[0]=BB, rotated[1]=BTN.
  else {
    // Fallback for full ring or unknown
    posLabels = rotated.map((_, i) => i === 0 ? 'SB' : i === 1 ? 'BB' : i === count - 1 ? 'BTN' : `P${i}`);
  }

  rotated.forEach((p, i) => {
    posMap[p.name] = posLabels[i] || `P${i}`;
  });

  const heroPos = posMap[actualHeroName];

  // 4. Hero's Hand
  let heroHandRaw: string[] = [];
  const dealtLine = lines.find(l => l.startsWith(`Dealt to ${actualHeroName}`));
  if (dealtLine) {
    const m = dealtLine.match(/\[(.+?)\]/);
    if (m) {
      heroHandRaw = m[1].split(/[\s,]+/).filter(Boolean);
    }
  }
  if (heroHandRaw.length < 2) return null;
  const heroHand = normalizeHand(heroHandRaw);

  // 5. Action Analysis
  const preflopStart = lines.findIndex(l => l.startsWith('*** PRE-FLOP ***'));
  const flopStart = lines.findIndex(l => l.startsWith('*** FLOP ***'));
  const summaryStart = lines.findIndex(l => l.startsWith('*** SUMMARY ***'));
  
  const preflopLines = lines.slice(preflopStart + 1, flopStart > 0 ? flopStart : summaryStart);
  
  let raisesBefore = 0;
  let limpsBefore = 0;
  let heroAction = '';
  let openerPosition: string | null = null;
  let openerSizing: string | null = null;
  let lastRaiserPosition: string | null = null;
  let lastRaiseSizing: string | null = null;

  for (const line of preflopLines) {
    if (line.includes('posts small blind') || line.includes('posts big blind')) continue;

    const playerActionMatch = line.match(/^(.+?) (folds|calls|raises|checks|collected|bets)/);
    if (playerActionMatch) {
      const pName = playerActionMatch[1];
      const action = playerActionMatch[2];
      
      if (pName === actualHeroName) {
        if (action === 'raises') {
          if (raisesBefore === 0) heroAction = 'Raise';
          else if (raisesBefore === 1) heroAction = '3bet';
          else heroAction = '4bet+';
        } else if (action === 'calls') {
          if (raisesBefore === 0) heroAction = 'Call'; // Limp
          else heroAction = 'Cold Call';
        } else if (action === 'folds') {
          heroAction = 'Fold';
        } else if (action === 'checks') {
          heroAction = 'Check';
        } else if (action === 'collected') {
          return null; // Hand ended or won by default
        }
        break;
      }
      
      if (action === 'raises') {
        raisesBefore++;
        const raiseTo = parseRaiseTo(line);
        const sizing = raiseTo != null ? bucketSizing(raiseTo / bbSize) : null;
        const raiserPosition = posMap[pName] ?? null;
        if (raisesBefore === 1) {
          openerPosition = raiserPosition;
          openerSizing = sizing;
        }
        lastRaiserPosition = raiserPosition;
        lastRaiseSizing = sizing;
      } else if (action === 'calls' && raisesBefore === 0) {
        limpsBefore++;
      }
    }
  }

  if (!heroAction) return null;
  if (heroPos === 'BB' && heroAction === 'Check') return null;

  // 6. Net BB Calculation
  let invested = 0;
  // Blinds
  const blindLines = lines.slice(lines.findIndex(l => l.startsWith('*** ANTE/BLINDS ***')) + 1, preflopStart);
  for (const l of blindLines) {
    if (l.startsWith(actualHeroName)) {
      const m = l.match(/posts (?:small blind|big blind|ante|blind) ([\d.,]+)€/);
      if (m) invested += parseAmount(m[1]);
    }
  }
  // Pre-flop and Post-flop
  const actionLines = lines.slice(preflopStart + 1, summaryStart);
  for (const l of actionLines) {
    if (l.startsWith(actualHeroName)) {
      const m = l.match(/(?:calls|raises|bets|posts) ([\d.,]+)€/);
      if (m) invested += parseAmount(m[1]);
    }
  }

  let won = 0;
  const summaryLines = lines.slice(summaryStart + 1);
  for (const l of summaryLines) {
    if (l.includes(actualHeroName) && l.includes(' won ')) {
      const m = l.match(/won ([\d.,]+)€/);
      if (m) won += parseAmount(m[1]);
    }
  }

  const net_bb = (won - invested) / bbSize;

  return {
    day,
    position: heroPos,
    spot: buildSpot({
      position: heroPos,
      raisesBefore,
      limpsBefore,
      heroAction,
      openerPosition,
      openerSizing,
      lastRaiserPosition,
      lastRaiseSizing,
    }),
    hand: heroHand,
    action: heroAction,
    count: 1,
    net_bb
  };
}

function parseAmount(value: string): number {
  return parseFloat(value.replace(',', '.'));
}

function parseRaiseTo(line: string): number | null {
  const toMatch = line.match(/raises [\d.,]+€ to ([\d.,]+)€/);
  if (toMatch) return parseAmount(toMatch[1]);
  const raiseMatch = line.match(/raises ([\d.,]+)€/);
  return raiseMatch ? parseAmount(raiseMatch[1]) : null;
}

function bucketSizing(sizeBb: number): string {
  const common = [2, 2.5, 3, 3.5, 4, 5, 6, 7.5, 9, 10, 12];
  const nearest = common.reduce((best, n) => Math.abs(n - sizeBb) < Math.abs(best - sizeBb) ? n : best, common[0]);
  if (Math.abs(nearest - sizeBb) <= 0.18) return `${nearest}x`;
  if (sizeBb < 2.25) return '2x';
  if (sizeBb < 2.75) return '2.5x';
  if (sizeBb < 3.25) return '3x';
  if (sizeBb < 4.5) return '4x';
  return `${Math.round(sizeBb)}x`;
}

function buildSpot({
  position,
  raisesBefore,
  limpsBefore,
  heroAction,
  openerPosition,
  openerSizing,
  lastRaiserPosition,
  lastRaiseSizing,
}: {
  position: string;
  raisesBefore: number;
  limpsBefore: number;
  heroAction: string;
  openerPosition: string | null;
  openerSizing: string | null;
  lastRaiserPosition: string | null;
  lastRaiseSizing: string | null;
}): string {
  if (position === 'BB' && heroAction === 'Check') return 'BB check';
  if (raisesBefore === 0 && limpsBefore === 0) return `${position} unopened`;
  if (raisesBefore === 0 && limpsBefore > 0) return `${position} vs limp`;
  if (heroAction === '3bet' && raisesBefore === 1) {
    return `${position} 3bet vs ${openerPosition ?? 'open'} open${openerSizing ? ` ${openerSizing}` : ''}`;
  }
  if (heroAction === '4bet+' && raisesBefore >= 2) {
    return `${position} 4bet vs ${lastRaiserPosition ?? 'villain'} 3bet${lastRaiseSizing ? ` ${lastRaiseSizing}` : ''}`;
  }
  if (raisesBefore === 1) {
    return `${position} vs ${openerPosition ?? 'open'} open${openerSizing ? ` ${openerSizing}` : ''}`;
  }
  if (raisesBefore === 2) {
    return `${position} vs ${lastRaiserPosition ?? 'villain'} 3bet${lastRaiseSizing ? ` ${lastRaiseSizing}` : ''}`;
  }
  return `${position} vs ${lastRaiserPosition ?? 'villain'} 4bet+${lastRaiseSizing ? ` ${lastRaiseSizing}` : ''}`;
}
