export function parseOCR(title: string, footer: string) {
  const name =
    title
      .split('\n')
      .map((line) =>
        line
          .replace(/[^\p{L}\p{N}\s,'’/-]/gu, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .find((line) => line.length > 2 && /\p{L}/u.test(line)) || '';
  const set = footer.match(/\b([A-Z][A-Z0-9]{1,5})\s*[•·|]\s*(?:EN|ENG)\b/i)?.[1]?.toLowerCase();
  const collector = footer.match(/(?:^|\s)(\d{1,4}[a-z]?)(?:\s*\/\s*\d+|\s+[A-Z]\b)/im)?.[1];
  return { name, set, collector };
}
