import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import App from './App';

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
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('colors=W'), expect.anything()));
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
