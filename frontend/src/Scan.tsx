import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type CardDetail, type CardPage, useAction, useResource } from './api';
import { CardImage, Notice } from './components';
import { StockForm } from './CardDetail';
import { parseOCR } from './ocr';
import { createLocalOCR, type LocalOCR, type OCREngine } from './localOCR';

export default function Scan() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const workers = useRef<Partial<Record<OCREngine, Promise<LocalOCR>>>>({});
  const [engine, setEngine] = useState<OCREngine>(() =>
    localStorage.getItem('vault:ocr-engine') === 'paddle' ? 'paddle' : 'tesseract',
  );
  const mounted = useRef(true);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const candidates = useResource<CardPage>(
    searched ? `/cards?scope=catalogue&q=${encodeURIComponent(searched)}&limit=12` : null,
  );
  const [selected, setSelected] = useState('');
  const detail = useResource<CardDetail>(selected ? `/cards/${selected}` : null);
  const [hints, setHints] = useState<{ set?: string; collector?: string }>({});
  const [printingId, setPrintingId] = useState('');
  const [progress, setProgress] = useState('');
  const action = useAction();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      Object.values(workers.current).forEach((worker) =>
        worker?.then((w) => w.dispose()).catch(() => undefined),
      );
      workers.current = {};
    };
  }, []);
  function stop() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
    if (video.current) video.current.srcObject = null;
  }
  async function start() {
    setCameraError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera access requires device-trusted HTTPS or localhost. You can use manual search below.',
      );
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setCamera(true);
    } catch (error) {
      stop();
      setCameraError(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow access in your browser settings, retry, or use manual search.'
          : 'Camera unavailable. Close other camera apps, retry, or use manual search.',
      );
    }
  }
  async function capture() {
    const cameraVideo = video.current;
    if (!cameraVideo?.videoWidth) throw new Error('Wait for a clear camera image before capturing.');
    const source = document.createElement('canvas');
    source.width = cameraVideo.videoWidth;
    source.height = cameraVideo.videoHeight;
    const snapshot = source.getContext('2d');
    if (!snapshot) throw new Error('Frame capture unavailable; use manual search.');
    snapshot.drawImage(cameraVideo, 0, 0);
    if (!workers.current[engine]) {
      workers.current[engine] = createLocalOCR(engine, (message) => {
        if (mounted.current) setProgress(message);
      }).catch((error) => {
        delete workers.current[engine];
        throw error;
      });
    }
    const ocr = await workers.current[engine]!;
    const width = Math.min(source.width * 0.9, (source.height * 0.88 * 488) / 680);
    const height = (width * 680) / 488;
    const x = (source.width - width) / 2,
      y = (source.height - height) / 2;
    function crop(top: number, size: number) {
      const canvas = document.createElement('canvas');
      canvas.width = 1300;
      canvas.height = Math.round((1300 * height * size) / width);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot capture a camera frame. Use manual search.');
      context.drawImage(
        source!,
        x,
        y + height * top,
        width,
        height * size,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      // Gentle contrast preserves antialiased name strokes on coloured frames.
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
        const value = Math.max(0, Math.min(255, (gray - 128) * 1.4 + 128));
        image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      }
      context.putImageData(image, 0, 0);
      return canvas;
    }
    const text = await ocr.read(crop(0.035, 0.085), crop(0.88, 0.12)).catch((error) => {
      delete workers.current[engine];
      void ocr.dispose();
      throw error;
    });
    if (!mounted.current) return;
    const result = parseOCR(text.title, text.footer);
    setHints(result);
    setQuery(result.name);
    setSearched(result.name);
    setSelected('');
    setPrintingId('');
    if (!result.name)
      throw new Error(
        'No readable name found. Improve lighting, align the title inside the frame, or enter the name below.',
      );
    stop();
    setProgress('');
  }
  const printing = detail.data?.printings.find((p) => p.id === printingId);
  return (
    <>
      <p className="eyebrow">ONE CARD AT A TIME</p>
      <h1>Scan into your collection</h1>
      <p className="muted">
        Keep a card inside the guide. Recognition suggests a match; you confirm the physical printing.
      </p>
      <div className="scan-layout">
        <section className="panel form-stack">
          <label>
            Text recognition
            <select
              value={engine}
              disabled={action.pending}
              onChange={(event) => {
                const next = event.target.value as OCREngine;
                setEngine(next);
                localStorage.setItem('vault:ocr-engine', next);
              }}
            >
              <option value="tesseract">Tesseract · English</option>
              <option value="paddle">PaddleOCR · alternative mobile model</option>
            </select>
          </label>
          <p className="small muted">
            Try the alternative if names are unclear. Both run on your device; PaddleOCR takes longer to load
            the first time.
          </p>
          <div className="camera-frame">
            <video ref={video} muted playsInline aria-label="Card camera preview" />
            {camera && <div className="scan-guide" />}
            {!camera && (
              <span className="camera-idle">
                ◈<small>Your camera starts only when you choose</small>
              </span>
            )}
          </div>
          <div className="form-row">
            <button onClick={camera ? stop : () => action.run(start, '')} disabled={action.pending}>
              {camera ? 'Stop camera' : 'Start camera'}
            </button>
            <button
              className="primary"
              disabled={!camera || action.pending}
              onClick={() => action.run(capture, 'Choose the matching card below')}
            >
              Capture and recognise
            </button>
          </div>
          <Notice error={cameraError || action.error} success={action.success} />
          {action.pending && (
            <p className="muted" role="status">
              {progress || 'Preparing recognition…'}
            </p>
          )}
          <p className="small muted">
            English recognition runs in your browser. Camera frames are not uploaded. Set and collector hints
            can be wrong; foil treatment requires your confirmation.
          </p>
        </section>
        <section className="panel form-stack">
          <h2>Find or correct a match</h2>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              setSelected('');
              setPrintingId('');
              setSearched(query.trim());
            }}
          >
            <label>
              Card name
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
                placeholder="Enter a card name…"
              />
            </label>
            <button>Search catalogue</button>
          </form>
          <Notice error={candidates.error || detail.error} />
          {searched && !selected && (
            <div className="candidate-list">
              {candidates.data?.items.map((card) => (
                <button
                  key={card.id}
                  onClick={() => {
                    setSelected(card.id);
                    setPrintingId('');
                  }}
                >
                  {card.name}
                </button>
              ))}
              {candidates.data?.items.length === 0 && (
                <p>No match found. Try part of the name or check that the catalogue has synchronised.</p>
              )}
            </div>
          )}
          {detail.data?.id === selected && (
            <>
              <strong>{detail.data.name}</strong>
              <p className="small muted">
                Recognition hints: set {hints.set || 'unknown'} · collector {hints.collector || 'unknown'}.
                Select the actual printing below.
              </p>
              <label>
                Confirm printing
                <select value={printingId} onChange={(e) => setPrintingId(e.target.value)} required>
                  <option value="">Choose the printing you own</option>
                  {[...detail.data.printings]
                    .sort(
                      (a, b) =>
                        Number(
                          b.data.set === hints.set &&
                            (!hints.collector || b.data.collector_number === hints.collector),
                        ) -
                        Number(
                          a.data.set === hints.set &&
                            (!hints.collector || a.data.collector_number === hints.collector),
                        ),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.data.set_name || p.data.set} · #{p.data.collector_number} · {p.data.lang}
                      </option>
                    ))}
                </select>
              </label>
              {printing && (
                <div className="scan-confirmation">
                  <CardImage printingId={printing.id} name={detail.data.name} />
                  <StockForm
                    key={printing.id}
                    printings={[printing]}
                    initialPrinting={printing.id}
                    onSaved={() => {
                      setSelected('');
                      setPrintingId('');
                      setSearched('');
                      setQuery('');
                    }}
                  />
                </div>
              )}
              <Link to={`/cards/${selected}`}>View owned printings →</Link>
            </>
          )}
        </section>
      </div>
    </>
  );
}
