export interface TextFragment {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function cardFrame(width: number, height: number) {
  const cardWidth = Math.min(width * 0.9, (height * 0.88 * 488) / 680);
  const cardHeight = (cardWidth * 680) / 488;
  return { x: (width - cardWidth) / 2, y: (height - cardHeight) / 2, width: cardWidth, height: cardHeight };
}

// Mana occupies the right of the name bar. Use geometry rather than deleting
// trailing digits: names such as Pip-Boy 3000 and Black Waltz No. 3 are real.
export function titleFromFragments(fragments: TextFragment[], width: number) {
  const words = fragments.filter((word) => word.text.trim()).sort((a, b) => a.x0 - b.x0);
  const first = words.find((word) => /\p{L}/u.test(word.text));
  if (!first) return '';
  const height = Math.max(1, first.y1 - first.y0);
  const line = words.filter((word) => Math.abs((word.y0 + word.y1 - first.y0 - first.y1) / 2) < height);
  const kept: TextFragment[] = [];
  for (const word of line) {
    const previous = kept.at(-1);
    // A separated right-hand group is the mana cost, even when a symbol was
    // misread as an ordinary letter. Normal word spaces remain in the name.
    if (previous && word.x0 > width * 0.6 && word.x0 - previous.x1 > height * 0.9) break;
    kept.push(word);
  }
  return kept.map((word) => word.text).join(' ');
}

export interface PrintingHints {
  set?: string;
  collector?: string;
}

export const normaliseCollector = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^0+(?=\d)/, '');

export function parsePrintingHints(footer: string): PrintingHints {
  const sets = new Set<string>();
  const collectors = new Map<string, string>();
  for (const raw of footer.split(/[\r\n]+/)) {
    const line = raw.split(/©|copyright|wizards|\(c\)/i)[0];
    for (const match of line.matchAll(/\b([A-Z0-9]{2,6})\s*(?:[•·⋅|★*«»<>]\s*)?(?:ENG|EN)\b/gi)) {
      if (/[A-Z]/i.test(match[1])) sets.add(match[1].toLowerCase());
    }
    const simplified = line
      .replace(/\b[A-Z0-9]{2,6}\s*(?:[•·⋅|★*«»<>]\s*)?(?:ENG|EN)\b/gi, '')
      .replace(/\b(\d{1,5}[a-z]?)\s*\/\s*\d{1,5}\b/gi, '$1');
    const numbers = [
      ...line.matchAll(/\b(\d{1,5}[a-z]?)\s*\/\s*\d{1,5}\b/gi),
      ...simplified.matchAll(/\b(\d{1,5}[a-z]?)\s+[CURMSPBTL]\b/gi),
      ...simplified.matchAll(/\b[CURMSPBTL]\s+(\d{1,5}[a-z]?)\b/gi),
      ...simplified.matchAll(/(?:^|\s)[CURMS]\s*(\d{3,5}[a-z]?)\b/gi),
    ];
    const alone = line.trim().match(/^(\d{1,5}[a-z]?)$/i);
    if (alone) collectors.set(normaliseCollector(alone[1]), alone[1].toLowerCase());
    for (const match of numbers) collectors.set(normaliseCollector(match[1]), match[1].toLowerCase());
  }
  return {
    set: sets.size === 1 ? [...sets][0] : undefined,
    collector: collectors.size === 1 ? [...collectors.values()][0] : undefined,
  };
}

export async function readPrintingText(
  read: (image: HTMLCanvasElement) => Promise<string>,
  primary: HTMLCanvasElement,
  fallback?: HTMLCanvasElement,
) {
  const text = await read(primary).catch(() => '');
  const hints = parsePrintingHints(text);
  if (!fallback || (hints.set && hints.collector)) return text;
  const wider = await read(fallback).catch(() => '');
  return `${text}\n${wider}`;
}

export function printingMatches<
  T extends { id: string; data: { set: string; collector_number: string; lang: string } },
>(printings: T[], hints: PrintingHints) {
  const ranked = printings
    .map((printing) => {
      const set = !!hints.set && printing.data.set.toLowerCase() === hints.set.toLowerCase();
      const collector =
        !!hints.collector &&
        normaliseCollector(printing.data.collector_number) === normaliseCollector(hints.collector);
      return {
        printing,
        score: Number(set) * 2 + Number(collector),
        exact: set && collector && printing.data.lang === 'en',
      };
    })
    .sort((a, b) => b.score - a.score);
  const exact = ranked.filter((entry) => entry.exact);
  return {
    printings: ranked.map((entry) => entry.printing),
    suggested: exact.length === 1 ? exact[0].printing.id : '',
    ambiguous: exact.length > 1,
  };
}

export function parseOCR(title: string, footer: string) {
  const name =
    title
      .split('\n')
      .map((line) =>
        line
          .replace(/[^\p{L}\p{N}\s,'’/.:&!?()_-]/gu, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .find((line) => line.length > 2 && /\p{L}/u.test(line)) || '';
  return { name, ...parsePrintingHints(footer) };
}
