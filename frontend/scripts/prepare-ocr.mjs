import { cp, mkdir } from 'node:fs/promises';

await mkdir('public/ocr/core', { recursive: true });
await mkdir('public/ocr/lang', { recursive: true });
await cp('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
await cp('node_modules/tesseract.js-core', 'public/ocr/core', { recursive: true });
await cp('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'public/ocr/lang/eng.traineddata.gz');
