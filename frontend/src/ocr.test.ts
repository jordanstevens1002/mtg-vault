import { cardFrame, parseOCR, titleFromFragments } from './ocr';

it('extracts a readable name and optional printing hints', () => {
  expect(parseOCR('Plains\n', '0250 C\nM21 • EN')).toEqual({
    name: 'Plains',
    set: 'm21',
    collector: '0250',
  });
});

it('retains punctuation and digits that are part of real card names', () => {
  expect(parseOCR('Black Waltz No. 3', '').name).toBe('Black Waltz No. 3');
  expect(parseOCR('B.F.M. (Big Furry Monster)', '').name).toBe('B.F.M. (Big Furry Monster)');
});

it('does not invent a name from an unreadable capture', () => {
  expect(parseOCR('## @@@', '')).toEqual({
    name: '',
    set: undefined,
    collector: undefined,
  });
});

it.each([
  [1280, 960],
  [1920, 1080],
  [720, 1280],
])('keeps the capture guide aligned with %s×%s camera frames', (width, height) => {
  const frame = cardFrame(width, height);
  expect(frame.width / frame.height).toBeCloseTo(488 / 680);
  expect(frame.width).toBeLessThanOrEqual(width * 0.9 + 1e-6);
  expect(frame.height).toBeLessThanOrEqual(height * 0.88 + 1e-6);
  expect(frame.x + frame.width / 2).toBeCloseTo(width / 2);
  expect(frame.y + frame.height / 2).toBeCloseTo(height / 2);
});

it('excludes the separated mana group using geometry, including letters misread from symbols', () => {
  const word = (text: string, x0: number, x1: number) => ({
    text,
    x0,
    x1,
    y0: 10,
    y1: 50,
  });
  expect(
    titleFromFragments(
      [word('Lightning', 20, 250), word('Bolt', 265, 360), word('1', 1070, 1100), word('R', 1120, 1170)],
      1300,
    ),
  ).toBe('Lightning Bolt');
  expect(
    titleFromFragments([word('Sol', 20, 100), word('Ring', 115, 230), word('Q', 1100, 1140)], 1300),
  ).toBe('Sol Ring');
});

it('keeps legitimate numbers inside card names and handles a title near the mana group', () => {
  const word = (text: string, x0: number, x1: number) => ({
    text,
    x0,
    x1,
    y0: 10,
    y1: 50,
  });
  const fragments = [
    word('Black', 20, 170),
    word('Waltz', 180, 340),
    word('No.', 350, 420),
    word('3', 430, 465),
    word('2', 1090, 1130),
  ];
  expect(titleFromFragments(fragments, 1300)).toBe('Black Waltz No. 3');
  expect(
    titleFromFragments([word('1996', 20, 130), word('World', 145, 290), word('Champion', 305, 560)], 1300),
  ).toBe('1996 World Champion');
  expect(
    titleFromFragments(
      [
        word('A', 20, 40),
        word('long', 50, 150),
        word('name', 165, 340),
        word('ending', 355, 810),
        word('here', 825, 940),
        word('3', 1070, 1100),
      ],
      1300,
    ),
  ).toBe('A long name ending here');
});
