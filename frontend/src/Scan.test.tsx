import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import Scan from './Scan';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
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

it('switches away from an ultrawide lens, releases tracks and remembers the selected camera', async () => {
  vi.stubGlobal('isSecureContext', true);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const events: string[] = [];
  const getUserMedia = vi.fn(async (options: MediaStreamConstraints) => {
    const id = (options.video as MediaTrackConstraints).deviceId ? 'main' : 'wide';
    events.push(`start:${id}`);
    return { getTracks: () => [{ stop: () => events.push(`stop:${id}`) }] };
  });
  const enumerateDevices = vi.fn().mockResolvedValue([
    { kind: 'videoinput', deviceId: 'wide', label: 'Rear 0.5×' },
    { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
    { kind: 'videoinput', deviceId: 'main', label: 'Rear 1×' },
  ]);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices } });
  const view = render(
    <MemoryRouter>
      <Scan />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await screen.findByRole('option', { name: 'Rear 1×' });
  expect(screen.queryByRole('option', { name: 'Microphone' })).toBeNull();
  await waitFor(() =>
    expect(
      (screen.getByRole('combobox', { name: 'Camera' }) as HTMLSelectElement).disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Camera' }), {
    target: { value: 'main' },
  });
  await waitFor(() => expect(events).toEqual(['start:wide', 'stop:wide', 'start:main']));
  expect(localStorage.getItem('vault:camera')).toBe('main');
  view.unmount();
  expect(events.at(-1)).toBe('stop:main');
  render(
    <MemoryRouter>
      <Scan />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(3));
  expect(getUserMedia).toHaveBeenLastCalledWith(
    expect.objectContaining({
      video: expect.objectContaining({ deviceId: { exact: 'main' } }),
    }),
  );
});

it('keeps capture available if the browser cannot list cameras', async () => {
  vi.stubGlobal('isSecureContext', true);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
      enumerateDevices: vi.fn().mockRejectedValue(new Error('Unavailable')),
    },
  });
  render(
    <MemoryRouter>
      <Scan />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  await screen.findByText('Camera list unavailable.', { exact: false });
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Capture and recognise' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
});
