import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type CardDetail, type CardPage, request, useAction, useResource } from './api';
import { CardImage, Notice } from './components';
import { requestCamera } from './camera';
import { StockForm } from './CardDetail';
import { cardFrame, exactTitleMatch, parseOCR, printingMatches } from './ocr';
import { warmPaddleOCR } from './localOCR';

export default function Scan() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [camera, setCamera] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 1280, height: 960 });
  const guide = cardFrame(frameSize.width, frameSize.height);
  const [cameraError, setCameraError] = useState('');
  const [cameraNotice, setCameraNotice] = useState('');
  const [cameraId, setCameraId] = useState(() => localStorage.getItem('vault:camera') || '');
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const candidates = useResource<CardPage>(
    searched ? `/cards?scope=catalogue&q=${encodeURIComponent(searched)}&limit=12` : null,
  );
  const [selected, setSelected] = useState('');
  const detail = useResource<CardDetail>(selected ? `/cards/${selected}` : null);
  const [hints, setHints] = useState<{ set?: string; collector?: string }>({});
  const [printingId, setPrintingId] = useState('');
  const [printingTouched, setPrintingTouched] = useState(false);
  const [progress, setProgress] = useState('');
  const action = useAction();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  function stop() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
    if (video.current) video.current.srcObject = null;
  }
  async function start(deviceId = cameraId) {
    setCameraError('');
    setCameraNotice('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera access requires device-trusted HTTPS or localhost. You can use manual search below.',
      );
      return;
    }
    try {
      // Mobile browsers may not release a lens while another stream is active.
      stop();
      const { media, reset } = await requestCamera(deviceId);
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      if (reset) {
        localStorage.removeItem('vault:camera');
        setCameraId('');
        setCameraNotice(
          'Saved camera unavailable. Using the automatic rear camera; choose another lens below.',
        );
      }
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setCamera(true);
      // Labels and additional cameras usually become available only after permission.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices?.();
        if (mounted.current)
          setCameras((devices || []).filter((device) => device.kind === 'videoinput' && device.deviceId));
      } catch {
        if (mounted.current)
          setCameraNotice('Camera list unavailable. You can still capture or retry the camera.');
      }
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
    setProgress('Preparing PaddleOCR…');
    const ocr = await warmPaddleOCR();
    if (!mounted.current) return;
    setProgress('Reading the name and printing hints…');
    const { width, height, x, y } = cardFrame(source.width, source.height);
    function crop(top: number, size: number, left = 0, fraction = 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 1300;
      canvas.height = Math.round((1300 * height * size) / (width * fraction));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot capture a camera frame. Use manual search.');
      context.drawImage(
        source!,
        x + width * left,
        y + height * top,
        width * fraction,
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
    const text = await ocr.read(crop(0.035, 0.085), crop(0.895, 0.105, 0.02, 0.56), crop(0.87, 0.13));
    if (!mounted.current) return;
    const result = parseOCR(text.title, text.footer);
    setHints(result);
    setQuery(result.name);
    setSearched(result.name);
    setSelected('');
    setPrintingId('');
    setPrintingTouched(false);
    if (!result.name)
      throw new Error(
        'No readable name found. Improve lighting, align the title inside the frame, or enter the name below.',
      );
    stop();
    setProgress('Finding the recognised card…');
    // Use this response directly, rather than stale results from a previous scan.
    const page = await request<CardPage>(
      `/cards?scope=catalogue&q=${encodeURIComponent(result.name)}&limit=100`,
    );
    if (!mounted.current) return;
    // A truncated list cannot establish uniqueness.
    if (page.total <= page.items.length) setSelected(exactTitleMatch(page.items, result.name));
    setProgress('');
  }
  const matches = printingMatches(detail.data?.id === selected ? detail.data.printings : [], hints);
  const chosenPrinting = printingTouched ? printingId : matches.suggested;
  const printing = detail.data?.printings.find((p) => p.id === chosenPrinting);
  return (
    <>
      <p className="eyebrow">ONE CARD AT A TIME</p>
      <h1>Scan into your collection</h1>
      <p className="muted">
        Keep a card inside the guide. Recognition suggests a match; you confirm the physical printing.
      </p>
      <div className="scan-layout">
        <section className="panel form-stack">
          <p className="small muted">
            PaddleOCR runs on your device and prepares in the background when the app opens. The first load
            can take longer; manual search is always available.
          </p>
          {(cameras.length > 0 || cameraId) && (
            <>
              <label>
                Camera
                <select
                  value={cameraId}
                  disabled={action.pending}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCameraId(next);
                    if (next) localStorage.setItem('vault:camera', next);
                    else localStorage.removeItem('vault:camera');
                    if (camera) void action.run(() => start(next), '');
                  }}
                >
                  <option value="">Automatic rear camera</option>
                  {cameraId && !cameras.some((device) => device.deviceId === cameraId) && (
                    <option value={cameraId}>Saved camera</option>
                  )}
                  {cameras.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small muted">
                Choose the standard rear lens (often 1×) if the ultrawide lens cannot focus. Your choice is
                remembered in this browser.
              </p>
            </>
          )}
          {cameraNotice && (
            <p role="status" className="small muted">
              {cameraNotice}
            </p>
          )}
          <div className={`camera-frame ${camera ? 'capturing' : ''}`}>
            <video
              ref={video}
              muted
              playsInline
              aria-label="Card camera preview"
              onLoadedMetadata={(event) => {
                setFrameSize({
                  width: event.currentTarget.videoWidth,
                  height: event.currentTarget.videoHeight,
                });
              }}
            />
            {camera && (
              <div
                className="scan-guide"
                style={{
                  width: `${(100 * guide.width) / frameSize.width}%`,
                  height: `${(100 * guide.height) / frameSize.height}%`,
                }}
              />
            )}
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
              onClick={() => action.run(capture, 'Review the recognised card and printing below')}
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
              setPrintingTouched(false);
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
                    setPrintingTouched(false);
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
              <button
                onClick={() => {
                  setSelected('');
                  setPrintingId('');
                  setPrintingTouched(false);
                }}
              >
                Change card
              </button>
              <p className="small muted">
                Recognition hints: set {hints.set || 'unknown'} · collector {hints.collector || 'unknown'}.
                {matches.suggested
                  ? ' Suggested printing found; check its image and details before saving.'
                  : matches.ambiguous
                    ? ' Multiple printings match these hints; choose the one you own.'
                    : hints.set || hints.collector
                      ? ' No unique printing match; check or choose the printing below.'
                      : ' The footer was unreadable or missing; choose the printing manually.'}
              </p>
              <label>
                Confirm printing
                <select
                  value={chosenPrinting}
                  onChange={(e) => {
                    setPrintingId(e.target.value);
                    setPrintingTouched(true);
                  }}
                  required
                >
                  <option value="">Choose the printing you own</option>
                  {matches.printings.map((p) => (
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
                      setHints({});
                      setPrintingTouched(false);
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
