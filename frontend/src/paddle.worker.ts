import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule from '@techstark/opencv-js';

let ocr: Awaited<ReturnType<typeof PaddleOCR.create>>;
self.onmessage = async (event: MessageEvent<{ id: number; images?: ImageData[] }>) => {
  const { id, images } = event.data;
  try {
    if (!ocr) {
      ocr = await PaddleOCR.create({
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textRecognitionModelName: 'PP-OCRv5_mobile_rec',
        textDetectionModelAsset: { url: '/ocr/paddle/det.tar' },
        textRecognitionModelAsset: { url: '/ocr/paddle/rec.tar' },
        ortOptions: { backend: 'wasm', wasmPaths: '/ocr/paddle/runtime/', numThreads: 1, proxy: false },
      });
    }
    // The SDK's ImageData adapter uses document.createElement. Use its supported
    // cv.Mat input directly so inference stays entirely inside this worker.
    const cv = cvModule instanceof Promise ? await cvModule : cvModule;
    const mats = images?.map((image) => cv.matFromImageData(image));
    let result = null;
    try { result = mats ? await ocr.predict(mats) : null; }
    finally { mats?.forEach((mat) => mat.delete()); }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
