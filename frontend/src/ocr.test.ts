import { parseOCR } from './ocr';

it('extracts a readable name and optional printing hints', () => {
  expect(parseOCR('Plains\n', '0250 C\nM21 • EN')).toEqual({ name: 'Plains', set: 'm21', collector: '0250' });
});

it('does not invent a name from an unreadable capture', () => {
  expect(parseOCR('## @@@', '')).toEqual({ name: '', set: undefined, collector: undefined });
});
