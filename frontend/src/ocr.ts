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
  const set = footer.match(/\b([A-Z][A-Z0-9]{1,5})\s*[•·|]\s*(?:EN|ENG)\b/i)?.[1]?.toLowerCase();
  const collector = footer.match(/(?:^|\s)(\d{1,4}[a-z]?)(?:\s*\/\s*\d+|\s+[A-Z]\b)/im)?.[1];
  return { name, set, collector };
}
