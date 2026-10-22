import { beforeEach, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());
vi.mock('./paddle', () => ({ createPaddleOCR: create }));
beforeEach(() => {
  vi.resetModules();
  create.mockReset();
});

it('shares background preparation and reuses it when the scanner opens', async () => {
  const runtime = { read: vi.fn(async () => ({ title: 'Plains', footer: '' })), dispose: vi.fn() };
  create.mockResolvedValue(runtime);
  const { warmPaddleOCR } = await import('./localOCR');
  const first = warmPaddleOCR();
  expect(warmPaddleOCR()).toBe(first);
  const ready = await first;
  await ready.read({} as HTMLCanvasElement, {} as HTMLCanvasElement);
  expect(await warmPaddleOCR()).toBe(ready);
  expect(create).toHaveBeenCalledTimes(1);
});

it('retries after failed background preparation and failed recognition', async () => {
  const runtime = { read: vi.fn().mockRejectedValue(new Error('inference failed')), dispose: vi.fn() };
  create.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(runtime);
  const { warmPaddleOCR } = await import('./localOCR');
  await expect(warmPaddleOCR()).rejects.toThrow('offline');
  const ready = await warmPaddleOCR();
  await expect(ready.read({} as HTMLCanvasElement, {} as HTMLCanvasElement)).rejects.toThrow(
    'inference failed',
  );
  await warmPaddleOCR();
  expect(create).toHaveBeenCalledTimes(3);
  expect(runtime.dispose).toHaveBeenCalledTimes(1);
});
