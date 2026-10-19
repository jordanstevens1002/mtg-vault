# Local scanning

Choose **Text recognition** on the Scan page to compare Tesseract English with
PaddleOCR's PP-OCRv5 mobile detector and recogniser. The choice stays in this
browser. Both run locally and require manual printing/finish/quantity confirmation;
neither uploads camera frames or promises a certain match.

The title uses a narrow crop, gentle grayscale contrast and word/line coordinates
to exclude the separated mana-cost group on the right. Tesseract uses single-line
segmentation for the name and sparse text for footer hints. Digits within real card
names are preserved. Keep the card upright in the guide; use even lighting and
manual correction when glare, perspective or unusual frames defeat recognition.
The guide and crop use the same card rectangle for landscape and portrait camera
streams; active previews do not add a minimum-height offset around the video.

Printing recognition first enlarges the bottom-left footer, where modern cards
show their set code and collector number. If either hint is missing, it tries the
wider footer. It recognises rarity-before-number and number-before-rarity layouts,
older `number/total` text, padded numbers, suffixes and digit-leading set codes.
Copyright text is ignored; contradictory readings remain unresolved. Footer failure
does not discard a readable card name.

After you choose the matching card, the scanner ranks its printings using those
hints. A single English printing matching both set and collector number is selected
as a suggestion, with its image shown for checking. Partial, missing or ambiguous
hints leave the choice manual. You can change or clear a suggestion; nothing is
saved until you confirm printing, finish, quantity and destination. Older cards
without printed set/collector metadata and unclear captures still need manual choice.

PaddleOCR is an alternative to try, not a measured accuracy guarantee. Its initial
load is larger: approximately 21 MB of model archives plus ONNX runtime and worker
assets. Inference uses a worker with single-threaded WASM, including on devices
without WebGPU. Real Android/iPhone/webcam comparisons remain part of #8.

`npm run dev` and production builds prepare all OCR files locally. The build fetches
the official PaddleOCR model archives, verifies pinned SHA-256 hashes and serves
them from `/ocr/paddle/`. A browser needs no external model CDN. Build failures
caused by unavailable or changed archives are explicit; no remote fallback is used.
Camera/model failure leaves manual search available; a failed model load can be
retried without refreshing the page.

OpenCV requires generated JavaScript evaluation. The gateway permits it only for
the dedicated `paddle.worker-*.js` response; the page retains its stricter policy.
The worker can load assets only from this deployment and cannot start child workers.

Sources: [Tesseract image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
and [official PaddleOCR browser SDK](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js/packages/core).
PaddleOCR model weights are Apache-2.0; their licence is served at
`/ocr/paddle/LICENSE` and retained under `frontend/vendor/paddle/`.
