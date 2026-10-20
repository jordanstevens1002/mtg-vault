import { readPrintingText, titleFromFragments } from './ocr';

export type OCREngine = 'tesseract' | 'paddle';
export interface LocalOCR {
  read(
    title: HTMLCanvasElement,
    footer: HTMLCanvasElement,
    fallback?: HTMLCanvasElement,
  ): Promise<{ title: string; footer: string }>;
  dispose(): Promise<void>;
}

export async function createLocalOCR(
  engine: OCREngine,
  progress: (message: string) => void,
): Promise<LocalOCR> {
  if (engine === 'paddle') {
    progress('Loading PaddleOCR mobile models…');
    const { createPaddleOCR } = await import('./paddle');
    return createPaddleOCR(progress);
  }
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: '/ocr/lang',
    workerBlobURL: false,
    logger: (event) => progress(`${event.status} ${Math.round(event.progress * 100)}%`),
  });
  return {
    async read(title, footer, fallback) {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      const name = await worker.recognize(title, {}, { blocks: true });
      const words =
        name.data.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
        ) || [];
      const fragments = words.map((word) => ({
        text: word.text,
        ...word.bbox,
      }));
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const hints = await readPrintingText(
        async (image) => (await worker.recognize(image)).data.text,
        footer,
        fallback,
      );
      return {
        title: titleFromFragments(fragments, title.width),
        footer: hints,
      };
    },
    async dispose() {
      await worker.terminate();
    },
  };
}

// Share preparation across navigation and React StrictMode mounts.
let preparedPaddle: Promise<LocalOCR> | undefined;
export function warmPaddleOCR(): Promise<LocalOCR> {
  if (!preparedPaddle) {
    preparedPaddle = createLocalOCR('paddle', () => undefined)
      .then((ocr) => ({
        async read(...images) {
          try {
            return await ocr.read(...images);
          } catch (error) {
            preparedPaddle = undefined;
            await ocr.dispose();
            throw error;
          }
        },
        async dispose() {
          preparedPaddle = undefined;
          await ocr.dispose();
        },
      }))
      .catch((error) => {
        preparedPaddle = undefined;
        throw error;
      });
  }
  return preparedPaddle;
}
