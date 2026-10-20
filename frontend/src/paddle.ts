import { readPrintingText, titleFromFragments } from './ocr';
import type { LocalOCR } from './localOCR';

interface Result {
  items: { text: string; poly: [number, number][] }[];
}

export async function createPaddleOCR(progress: (message: string) => void): Promise<LocalOCR> {
  const worker = new Worker(new URL('./paddle.worker.ts', import.meta.url), { type: 'module' });
  let sequence = 0;
  let stopped = false;
  const pending = new Map<
    number,
    { resolve: (value: Result[] | null) => void; reject: (error: Error) => void }
  >();
  function fail(error: Error) {
    stopped = true;
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
    if (stopped) return Promise.reject(new Error('PaddleOCR stopped; retry recognition.'));
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
    // Exercise detection and recognition before the first camera capture.
    const sample = document.createElement('canvas');
    sample.width = 320;
    sample.height = 80;
    const context = sample.getContext('2d');
    if (!context) throw new Error('Recognition requires canvas support.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, sample.width, sample.height);
    context.fillStyle = 'black';
    context.font = '32px sans-serif';
    context.fillText('Magic card', 20, 50);
    await ask([context.getImageData(0, 0, sample.width, sample.height)]);
  } catch (error) {
    worker.terminate();
    throw error;
  }
  return {
    async read(title, footer, fallback) {
      progress('Reading the name and printing hints…');
      const images = [title].map((canvas) =>
        canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height),
      );
      const results = await ask(images);
      if (!results) throw new Error('PaddleOCR returned no result.');
      const [name] = results;
      const hints = await readPrintingText(
        async (canvas) => {
          const result = await ask([
            canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height),
          ]);
          return result?.[0]?.items.map((item) => item.text).join('\n') || '';
        },
        footer,
        fallback,
      );
      const fragments = name.items.map((item) => ({
        text: item.text,
        x0: Math.min(...item.poly.map((point) => point[0])),
        x1: Math.max(...item.poly.map((point) => point[0])),
        y0: Math.min(...item.poly.map((point) => point[1])),
        y1: Math.max(...item.poly.map((point) => point[1])),
      }));
      return {
        title: titleFromFragments(fragments, title.width),
        footer: hints,
      };
    },
    async dispose() {
      fail(new Error('Scanner closed.'));
    },
  };
}
