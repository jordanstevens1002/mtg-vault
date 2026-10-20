import { afterEach, expect, it, vi } from 'vitest';
import { requestCamera } from './camera';

afterEach(() => vi.unstubAllGlobals());

it('requests the exact chosen lens with audio disabled', async () => {
  const getUserMedia = vi.fn().mockResolvedValue({});
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  await requestCamera('standard-rear');
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: { deviceId: { exact: 'standard-rear' }, width: { ideal: 1280 }, height: { ideal: 960 } },
  });
});

it('recovers a stale saved device using an automatic rear camera', async () => {
  const media = {};
  const getUserMedia = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('Gone', 'OverconstrainedError'))
    .mockResolvedValueOnce(media);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  expect(await requestCamera('old-device')).toEqual({ media, reset: true });
  expect(getUserMedia).toHaveBeenLastCalledWith(
    expect.objectContaining({
      audio: false,
      video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
    }),
  );
});

it('does not repeat permission requests after a denial', async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  await expect(requestCamera('saved')).rejects.toThrow('Denied');
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});
