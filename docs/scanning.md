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

### Preparation and automatic selection

PaddleOCR loads and runs a small synthetic warmup when the application opens.
This shared worker survives page navigation; it never opens the camera. Preparation
failures leave browsing available and capture retries preparation.

An exact recognised English title (including a card face name) selects the card
when the complete search result has one exact full-name match. Full names take
priority over matching face names: Mountain selects Mountain even when
Mountain // Mountain and Mountain Bandit are also found. Face-name matching is
a fallback when there is no exact full-name match. Partial, ambiguous or truncated
results remain manual. Unique English set and collector hints select the printing.
Use **Change card** or the printing selector to correct either choice. Saving still
requires confirmation of the physical copies; recognition alone changes no stock.

### Choosing a phone lens

After starting the camera and granting permission, use **Camera** to select a
specific lens. Rear-facing selection alone can choose an ultrawide (0.5×) lens
on multi-camera phones. Try the standard rear camera (often labelled 1×), and
hold the card far enough away for its title to become sharp before capture.
The explicit camera choice is remembered in this browser for this site.

Switching releases the old stream before opening the new lens. A missing saved
camera falls back to automatic rear selection; denied permission still requires
user action. Camera labels and available physical lenses depend on what the
browser exposes; the app does not infer a universal 1× lens from device order.
Camera access still starts only through the scanner controls.
