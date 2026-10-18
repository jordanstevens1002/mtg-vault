import { titleFromFragments } from './ocr';
import type { LocalOCR } from './localOCR';

interface Result {
  items: { text: string; poly: [number, number][] }[];
}

export async function createPaddleOCR(progress: (message: string) => void): Promise<LocalOCR> {
  const worker = new Worker(new URL('./paddle.worker.ts', import.meta.url), { type: 'module' });
  let sequence = 0;
  const pending = new Map<
    number,
    { resolve: (value: Result[] | null) => void; reject: (error: Error) => void }
  >();
  function fail(error: Error) {
    pending.forEach((item) => item.reject(error));
    pending.clear();
    worker.terminate();
  }
  worker.onerror = (event) =>
    fail(new Error(event.message || 'PaddleOCR could not start; retry or use Tesseract.'));
  worker.onmessage = (event: MessageEvent<{ id: number; result: Result[] | null; error?: string }>) => {
    const item = pending.get(event.data.id);
    if (!item) return;
    pending.delete(event.data.id);
    if (event.data.error) item.reject(new Error(event.data.error));
    else item.resolve(event.data.result);
  };
  function ask(images?: ImageData[]): Promise<Result[] | null> {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = window.setTimeout(
        () => fail(new Error('PaddleOCR timed out; retry or use Tesseract.')),
        120000,
      );
      pending.set(id, {
        resolve: (result) => {
          window.clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      });
      worker.postMessage({ id, images });
    });
  }
  try {
    await ask();
  } catch (error) {
    worker.terminate();
    throw error;
  }
  return {
    async read(title, footer) {
      progress('Reading the name and printing hints…');
      const images = [title, footer].map((canvas) =>
        canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height),
      );
      const results = await ask(images);
      if (!results) throw new Error('PaddleOCR returned no result.');
      const [name, hints] = results;
      const fragments = name.items.map((item) => ({
        text: item.text,
        x0: Math.min(...item.poly.map((point) => point[0])),
        x1: Math.max(...item.poly.map((point) => point[0])),
        y0: Math.min(...item.poly.map((point) => point[1])),
        y1: Math.max(...item.poly.map((point) => point[1])),
      }));
      return {
        title: titleFromFragments(fragments, title.width),
        footer: hints.items.map((item) => item.text).join('\n'),
      };
    },
    async dispose() {
      fail(new Error('Scanner closed.'));
    },
  };
}
