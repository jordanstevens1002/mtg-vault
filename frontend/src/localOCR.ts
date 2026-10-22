export interface LocalOCR {
  read(
    title: HTMLCanvasElement,
    footer: HTMLCanvasElement,
    fallback?: HTMLCanvasElement,
  ): Promise<{ title: string; footer: string }>;
  dispose(): Promise<void>;
}

// Share preparation across navigation and React StrictMode mounts.
let preparedPaddle: Promise<LocalOCR> | undefined;
export function warmPaddleOCR(): Promise<LocalOCR> {
  if (!preparedPaddle) {
    preparedPaddle = import('./paddle')
      .then(({ createPaddleOCR }) => createPaddleOCR(() => undefined))
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
