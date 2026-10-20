import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { DeckWorkspace } from './Decks';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('blocks a second removal until delayed deck refresh replaces the submitted list', async () => {
  let entries = ['A', 'B'].map((name) => ({
    card_id: name,
    name,
    quantity: 1,
    section: 'mainboard',
    preferred_printing_id: null,
    data: {},
  }));
  let release: (() => void) | undefined;
  let delay = false;
  const writes: string[][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        entries = JSON.parse(options.body as string).entries.map((entry: { card_id: string }) => ({
          ...entry,
          name: entry.card_id,
          data: {},
        }));
        writes.push(entries.map((entry) => entry.card_id));
        delay = true;
        return { ok: true, json: async () => ({ entries: entries.length }) };
      }
      if (url === '/api/v1/decks/test') {
        if (delay)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return {
          ok: true,
          json: async () => ({
            id: 'test',
            name: 'Plan',
            state: 'planned',
            format: 'casual',
            quantity: entries.length,
            entries: [...entries],
            sources: [],
            shortages: {},
          }),
        };
      }
      return { ok: true, json: async () => (url.endsWith('/locations') ? [] : { validated: false }) };
    }),
  );
  render(
    <MemoryRouter initialEntries={['/decks/test']}>
      <Routes>
        <Route path="/decks/:id" element={<DeckWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '1 × A' });
  // A refresh begun before the edit must finish before its snapshot can be edited.
  delay = true;
  act(() => window.dispatchEvent(new Event('vault:changed')));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  expect((screen.getAllByRole('button', { name: 'Remove entry' })[0] as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(async () => {
    delay = false;
    release!();
    release = undefined;
  });
  await waitFor(() =>
    expect((screen.getAllByRole('button', { name: 'Remove entry' })[0] as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );

  fireEvent.click(screen.getAllByRole('button', { name: 'Remove entry' })[0]);
  await screen.findByText('Entry removed');
  expect((screen.getAllByRole('button', { name: 'Remove entry' })[1] as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove entry' })[1]);
  expect(writes).toEqual([['B']]);
  await waitFor(() => expect(release).toBeTypeOf('function'));
  await act(async () => {
    delay = false;
    release!();
  });
  await waitFor(() => expect(screen.queryByRole('heading', { name: '1 × A' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Remove entry' }));
  await waitFor(() => expect(writes).toEqual([['B'], []]));
});
