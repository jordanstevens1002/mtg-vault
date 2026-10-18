import { useState } from 'react';
import { type Deck, operationId, send, useAction, useResource } from './api';
import type { components } from './generated/api';
import { Notice } from './components';

type Preview = components['schemas']['ImportPreview'];

export default function Portability() {
  const [kind, setKind] = useState('collection');
  const [content, setContent] = useState('');
  const [deckName, setDeckName] = useState('Imported deck');
  const [format, setFormat] = useState('commander');
  const [preview, setPreview] = useState<Preview>();
  const [key, setKey] = useState(operationId);
  const decks = useResource<Deck[]>('/decks');
  const [exportDeck, setExportDeck] = useState('');
  const action = useAction();
  function invalidate() {
    setPreview(undefined);
    setKey(operationId());
  }
  const body = { kind, content, deck_name: deckName, deck_format: format };
  return (
    <>
      <p className="eyebrow">YOUR COLLECTION, PORTABLE</p>
      <h1>Import & export</h1>
      <p className="muted">
        Review every import before it changes your collection. Native formats keep printing identities explicit.
      </p>
      <div className="scan-layout">
        <section className="panel form-stack">
          <h2>Import</h2>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async () => {
                setPreview(await send<Preview>('/imports/preview', body));
                setKey(operationId());
              }, 'Preview ready — no changes made');
            }}
          >
            <label>
              Format
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  invalidate();
                }}
              >
                <option value="collection">MTG Vault collection CSV v1</option>
                <option value="decklist">Native text decklist</option>
              </select>
            </label>
            {kind === 'decklist' && (
              <div className="form-row">
                <label>
                  New planned deck name
                  <input
                    required
                    value={deckName}
                    onChange={(e) => {
                      setDeckName(e.target.value);
                      invalidate();
                    }}
                    maxLength={160}
                  />
                </label>
                <label>
                  Format
                  <select
                    value={format}
                    onChange={(e) => {
                      setFormat(e.target.value);
                      invalidate();
                    }}
                  >
                    <option value="commander">Commander</option>
                    <option value="casual">Casual</option>
                  </select>
                </label>
              </div>
            )}
            <label>
              Choose a local file
              <input
                type="file"
                accept=".csv,.txt,text/plain,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  action.run(async () => {
                    if (file.size > 2000000) throw new Error('File exceeds 2 MB. Split it into smaller imports.');
                    setContent(await file.text());
                    invalidate();
                  }, 'File loaded; preview it before confirming');
                }}
              />
            </label>
            <label>
              Or paste content
              <textarea
                rows={10}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  invalidate();
                }}
                required
                maxLength={2000000}
                placeholder={
                  kind === 'collection'
                    ? 'version,printing_id,finish,quantity,location,deck,deck_id,deck_format,section'
                    : '[mainboard]\n3 Plains\n[commander]\n1 Your commander'
                }
              />
            </label>
            <p className="small muted">
              Collection imports add copies; they do not replace your existing counts. Decklist imports create a plan
              and reserve no cards. Maximum 10,000 rows and 2 MB per import.
            </p>
            <button disabled={action.pending || !content}>Preview import</button>
          </form>
        </section>
        <section className="panel form-stack">
          <h2>Export</h2>
          <p className="muted small">
            Collection CSV includes each physical printing, finish, storage location and built-deck section. Use
            database backups to preserve all plans, preferences and history.
          </p>
          <a className="button" href="/api/v1/exports/collection">
            Download collection CSV
          </a>
          <label>
            Decklist
            <select value={exportDeck} onChange={(e) => setExportDeck(e.target.value)}>
              <option value="">Choose a deck</option>
              {decks.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.state}
                </option>
              ))}
            </select>
          </label>
          {exportDeck && (
            <a className="button" href={`/api/v1/exports/decks/${exportDeck}`}>
              Download native decklist
            </a>
          )}
          <p className="small muted">
            Native text uses [commander], [mainboard] and [sideboard] headings, followed by quantity and English card
            name. Append | printing-UUID to specify a preferred printing.
          </p>
        </section>
      </div>
      <Notice {...action} error={action.error || decks.error} />
      {preview && (
        <section className="panel import-preview">
          <h2>Review import</h2>
          <p>
            <strong>{preview.quantity} cards</strong> · {preview.rows.length} resolved rows · {preview.errors.length}{' '}
            errors
          </p>
          <p className="notice">
            {kind === 'collection'
              ? `This adds ${preview.quantity} physical copies to ${preview.owned_before} currently owned.`
              : `This creates “${deckName}” as a planned deck with no stock allocation.`}
          </p>
          {preview.errors.slice(0, 100).map((error, index) => (
            <p className="notice error" key={index}>
              Line {error.line}: {error.error}
            </p>
          ))}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Quantity</th>
                  <th>Printing / finish</th>
                  <th>Placement / section</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((row, index) => (
                  <tr key={index}>
                    <td>{String(row.name)}</td>
                    <td>{Number(row.quantity)}</td>
                    <td>
                      {String(row.printing_id || row.preferred_printing_id || 'Any printing')}{' '}
                      {String(row.finish || '')} {String(row.language || '')}
                    </td>
                    <td>{String(row.location || row.deck || row.section)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 100 && (
            <p className="small muted">
              Showing the first 100 resolved rows; confirmation includes all {preview.rows.length}.
            </p>
          )}
          <button
            className="primary"
            disabled={action.pending || preview.errors.length > 0}
            onClick={() =>
              action.run(async () => {
                await send('/imports/confirm', { ...body, preview_hash: preview.preview_hash, operation_id: key });
                setPreview(undefined);
                setContent('');
                setKey(operationId());
              }, 'Import committed successfully')
            }
          >
            Confirm {kind === 'collection' ? 'adding these physical copies' : 'creating this planned deck'}
          </button>
        </section>
      )}
    </>
  );
}
