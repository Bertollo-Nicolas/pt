export interface TrackerRangeOption {
  key: string;
  label: string;
}

export interface TrackerMappingSuggestion {
  spot: string;
  rangeKey: string;
  rangeLabel: string;
  confidence: 'exact' | 'fallback';
  reason: string;
}

type Family = 'open' | 'vs-open' | 'vs-3bet' | 'vs-4bet';

interface SpotDescriptor {
  family: Family;
  hero: string;
  villains: string[];
  size: number | null;
}

interface RangeDescriptor extends TrackerRangeOption {
  family: Family;
  hero: string;
  villains: string[];
  sizeMin: number | null;
  sizeMax: number | null;
}

export function suggestTrackerMappings(
  spots: string[],
  options: TrackerRangeOption[],
): TrackerMappingSuggestion[] {
  const ranges = options.map(describeRange).filter((range): range is RangeDescriptor => range !== null);
  const suggestions: TrackerMappingSuggestion[] = [];

  for (const spot of spots) {
    const target = describeSpot(spot);
    if (!target) continue;

    const candidates = ranges
      .map(range => ({ range, ...scoreRange(target, range) }))
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) continue;
    const best = candidates[0];
    if (candidates[1]?.score === best.score) continue;

    suggestions.push({
      spot,
      rangeKey: best.range.key,
      rangeLabel: best.range.label,
      confidence: best.exactSize ? 'exact' : 'fallback',
      reason: best.exactSize
        ? 'Position, adversaire, famille et sizing correspondent.'
        : 'Position, adversaire et famille correspondent ; la range ne distingue pas le sizing.',
    });
  }

  return suggestions;
}

function describeSpot(spot: string): SpotDescriptor | null {
  const normalized = normalizeText(spot);
  let match = normalized.match(/^(HJ|CO|BTN|SB|BB) UNOPENED$/);
  if (match) return { family: 'open', hero: match[1], villains: [], size: null };

  match = normalized.match(/^(HJ|CO|BTN|SB|BB)(?: 3BET)? VS (UTG|HJ|CO|BTN|SB|BB) OPEN(?: ([\d.]+)X)?$/);
  if (match) {
    return {
      family: 'vs-open',
      hero: match[1],
      villains: [match[2]],
      size: match[3] ? Number(match[3]) : null,
    };
  }

  match = normalized.match(/^(HJ|CO|BTN|SB|BB)(?: 4BET)? VS (UTG|HJ|CO|BTN|SB|BB) 3BET(?: ([\d.]+)X)?$/);
  if (match) {
    return {
      family: 'vs-3bet',
      hero: match[1],
      villains: [match[2]],
      size: match[3] ? Number(match[3]) : null,
    };
  }

  match = normalized.match(/^(HJ|CO|BTN|SB|BB) VS (UTG|HJ|CO|BTN|SB|BB) 4BET\+?(?: ([\d.]+)X)?$/);
  if (match) {
    return {
      family: 'vs-4bet',
      hero: match[1],
      villains: [match[2]],
      size: match[3] ? Number(match[3]) : null,
    };
  }

  return null;
}

function describeRange(option: TrackerRangeOption): RangeDescriptor | null {
  const segments = option.label.split(/\s+\/\s+/).map(segment => normalizeText(segment)).filter(Boolean);
  const vs4betIdx = segments.findIndex(segment => segment === 'VS 4BET');
  const vs3betIdx = segments.findIndex(segment => segment === 'VS 3BET');
  const threeBetIdx = segments.findIndex(segment => segment === '3BET');
  const bbSizingIdx = segments.findIndex(segment => /^BB VS [\d.]+X$/.test(segment));
  const openIdx = segments.findIndex(segment => segment === 'OPEN');

  let family: Family;
  let heroSegment: string;
  let detailSegment: string;

  if (vs4betIdx >= 0) {
    family = 'vs-4bet';
    heroSegment = segments[vs4betIdx + 1] ?? '';
    detailSegment = segments[vs4betIdx + 2] ?? '';
  } else if (vs3betIdx >= 0) {
    family = 'vs-3bet';
    heroSegment = segments[vs3betIdx + 1] ?? '';
    detailSegment = segments[vs3betIdx + 2] ?? '';
  } else if (threeBetIdx >= 0) {
    family = 'vs-open';
    heroSegment = segments[threeBetIdx + 1] ?? '';
    detailSegment = segments[threeBetIdx + 2] ?? '';
  } else if (bbSizingIdx >= 0) {
    family = 'vs-open';
    heroSegment = 'BB';
    detailSegment = `${segments[bbSizingIdx]} ${segments[bbSizingIdx + 1] ?? ''}`;
  } else if (openIdx >= 0) {
    family = 'open';
    heroSegment = segments[segments.length - 1] ?? '';
    detailSegment = '';
  } else {
    return null;
  }

  const hero = extractPositions(heroSegment)[0];
  if (!hero) return null;
  const villains = extractPositions(detailSegment.replace(/^BB VS [\d.]+X /, ''));
  const size = extractSize(detailSegment);

  return {
    ...option,
    family,
    hero,
    villains,
    sizeMin: size?.[0] ?? null,
    sizeMax: size?.[1] ?? null,
  };
}

function scoreRange(target: SpotDescriptor, range: RangeDescriptor): { score: number; exactSize: boolean } {
  if (target.family !== range.family || target.hero !== range.hero) return { score: 0, exactSize: false };
  if (target.villains.length > 0 && !target.villains.some(villain => range.villains.includes(villain))) {
    return { score: 0, exactSize: false };
  }

  let score = 100;
  if (range.villains.length === 1) score += 10;

  if (target.size !== null) {
    if (range.sizeMin !== null && range.sizeMax !== null) {
      if (target.size < range.sizeMin || target.size > range.sizeMax) return { score: 0, exactSize: false };
      return { score: score + 20, exactSize: true };
    }
    return { score, exactSize: false };
  }

  if (range.sizeMin !== null) return { score: score - 20, exactSize: false };
  return { score: score + 20, exactSize: true };
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/BUTTON/g, 'BTN')
    .replace(/\bBU\b/g, 'BTN')
    .replace(/\s+/g, ' ');
}

function extractPositions(value: string): string[] {
  return [...new Set((normalizeText(value).match(/UTG|HJ|CO|BTN|SB|BB/g) ?? []))];
}

function extractSize(value: string): [number, number] | null {
  const normalized = normalizeText(value);
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:BB|X)/);
  if (range) return [Number(range[1]), Number(range[2])];
  const single = normalized.match(/(\d+(?:\.\d+)?)\s*(?:BB|X)/);
  return single ? [Number(single[1]), Number(single[1])] : null;
}
