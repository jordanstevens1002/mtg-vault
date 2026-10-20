import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import Scan from './Scan';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('explains trusted HTTPS and keeps manual search available', async () => {
  vi.stubGlobal('isSecureContext', false);
  render(
    <MemoryRouter>
      <Scan />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('device-trusted HTTPS'),
  );
  expect(screen.getByRole('textbox', { name: 'Card name' })).toBeTruthy();
});

it('reports denied permissions without attempting to save stock', async () => {
  vi.stubGlobal('isSecureContext', true);
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(
    <MemoryRouter>
      <Scan />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('permission was denied'),
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
});
