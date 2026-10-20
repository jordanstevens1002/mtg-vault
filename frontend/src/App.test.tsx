import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import App from './App';

vi.mock('./localOCR', () => ({ warmPaddleOCR: vi.fn(async () => ({})) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('groups a card and labels physical ownership accessibly', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('/cards?')
          ? {
              items: [
                {
                  id: 'one',
                  name: 'Plains',
                  data: { type_line: 'Basic Land — Plains' },
                  owned: 10,
                  in_decks: 3,
                  available: 7,
                  cover_id: null,
                },
              ],
              total: 1,
            }
          : url.includes('/summary')
            ? { owned: 10, in_decks: 3, available: 7 }
            : {},
    })),
  );
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Plains' })).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Plains: 3 in decks out of 10 owned' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'White' }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('colors=W'), expect.anything()),
  );
});

it('keeps filters from a bookmarked catalogue URL', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ items: [], total: 0 }) })),
  );
  render(
    <MemoryRouter initialEntries={['/?scope=catalogue&q=Plains&mana_min=0']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('textbox', { name: 'Search cards' }).getAttribute('value')).toBe('Plains');
  expect(await screen.findByRole('heading', { name: 'Explore the catalogue' })).toBeTruthy();
});

function filterCatalogue() {
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('/card-filters')
        ? {
            types: ['Creature', 'Land'],
            subtypes: { Creature: ['Human', 'Wizard'], Land: ['Forest', 'Plains'] },
            all_subtypes: ['Forest', 'Human', 'Plains', 'Wizard'],
          }
        : { items: [], total: 0 },
  }));
  vi.stubGlobal('fetch', fetcher);
  return () =>
    new URL([...fetcher.mock.calls].reverse().find(([url]) => url.includes('/cards?'))![0], 'http://vault')
      .searchParams;
}

it('limits subtype options to the selected type and clears an incompatible subtype', async () => {
  const params = filterCatalogue();
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  const type = screen.getByRole('combobox', { name: 'Card type' });
  const subtype = screen.getByRole('combobox', { name: 'Subtype' });
  await screen.findByRole('option', { name: 'Creature' });
  fireEvent.change(type, { target: { value: 'Creature' } });
  expect(within(subtype).queryByRole('option', { name: 'Forest' })).toBeNull();
  fireEvent.change(subtype, { target: { value: 'Human' } });
  await waitFor(() => expect(params().get('subtype')).toBe('Human'));
  fireEvent.change(type, { target: { value: 'Land' } });
  await waitFor(() => expect(params().has('subtype')).toBe(false));
  expect(within(subtype).getByRole('option', { name: 'Plains' })).toBeTruthy();
  expect(within(subtype).queryByRole('option', { name: 'Human' })).toBeNull();
});

it('builds an exact mana cost with repeated pips and a generic range, then removes and clears pips', async () => {
  const params = filterCatalogue();
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByLabelText('Mana cost options'));
  fireEvent.click(screen.getByRole('button', { name: 'Add White mana' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add White mana' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Generic mana' }), { target: { value: '2' } });
  await waitFor(() => expect(params().get('mana_cost')).toBe('{2}{W}{W}'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove White mana pip 1' }));
  await waitFor(() => expect(params().get('mana_cost')).toBe('{2}{W}'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear mana cost' }));
  await waitFor(() => expect(params().has('mana_cost')).toBe(false));
  fireEvent.change(screen.getByRole('slider', { name: 'Generic mana' }), { target: { value: '1' } });
  fireEvent.change(screen.getByRole('slider', { name: 'Generic mana' }), { target: { value: '0' } });
  await waitFor(() => expect(params().get('mana_cost')).toBe('{0}'));
});

it('collapses the mana picker outside and on Escape without losing the selected cost', () => {
  const params = filterCatalogue();
  render(
    <MemoryRouter initialEntries={['/?mana_cost=%7B2%7D%7BW%7D']}>
      <App />
    </MemoryRouter>,
  );
  const summary = screen.getByLabelText('Mana cost options: {2}{W}');
  const dropdown = summary.closest('details')!;
  expect(dropdown.open).toBe(false);
  fireEvent.click(summary);
  expect(dropdown.open).toBe(true);
  fireEvent.pointerDown(screen.getByRole('heading', { name: 'Your library' }));
  expect(dropdown.open).toBe(false);
  expect(params().get('mana_cost')).toBe('{2}{W}');
  fireEvent.click(summary);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(dropdown.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});

it('polls background sync and refreshes an initially empty catalogue when it completes', async () => {
  let poll: (() => void) | undefined;
  const timer = vi.spyOn(window, 'setInterval').mockImplementation((callback, delay) => {
    if (delay === 3000) poll = callback as () => void;
    return 123 as unknown as ReturnType<typeof window.setInterval>;
  });
  vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
  let complete = false;
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.endsWith('/catalogue-sync')
      ? { running: !complete, last_success: complete ? '2026-10-20T00:00:00Z' : null, printings: complete ? 1 : 0, error: null }
      : url.includes('/cards?')
        ? { items: complete ? [{ id: 'one', name: 'Plains', data: {}, owned: 0, in_decks: 0, available: 0 }] : [], total: complete ? 1 : 0 }
        : {},
  }));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<MemoryRouter initialEntries={['/?scope=catalogue']}><App /></MemoryRouter>);
  await screen.findByText('Catalogue synchronising…');
  await waitFor(() => expect(poll).toBeTypeOf('function'));
  expect(screen.queryByRole('heading', { name: 'Plains' })).toBeNull();
  complete = true;
  poll!();
  await screen.findByRole('heading', { name: 'Plains' });
  expect(screen.queryByText('Catalogue synchronising…')).toBeNull();
  expect(timer).toHaveBeenCalledWith(expect.any(Function), 30000);
  view.unmount();
  expect(window.clearInterval).toHaveBeenCalledWith(123);
});
