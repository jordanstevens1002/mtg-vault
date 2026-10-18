import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';

await mkdir('public/ocr/core', { recursive: true });
await mkdir('public/ocr/lang', { recursive: true });
await cp('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
await cp('node_modules/tesseract.js-core', 'public/ocr/core', {
  recursive: true,
});
await cp(
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'public/ocr/lang/eng.traineddata.gz',
);

await mkdir('public/ocr/paddle/runtime', { recursive: true });
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  await cp(`node_modules/onnxruntime-web/dist/${name}`, `public/ocr/paddle/runtime/${name}`);
}
await cp('vendor/paddle/LICENSE', 'public/ocr/paddle/LICENSE');
const models = [
  ['det', '781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30'],
  ['rec', 'f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c'],
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
await Promise.all(
  models.map(async ([kind, checksum]) => {
    const path = `public/ocr/paddle/${kind}.tar`;
    const existing = await readFile(path).catch(() => null);
    if (existing && digest(existing) === checksum) return;
    const url = `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_${kind}_onnx_infer.tar`;
    const response = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`PaddleOCR ${kind} model download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== checksum) throw new Error(`PaddleOCR ${kind} model checksum mismatch`);
    await writeFile(`${path}.tmp`, bytes);
    await rename(`${path}.tmp`, path);
  }),
);
