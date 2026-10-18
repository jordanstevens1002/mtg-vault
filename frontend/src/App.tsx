import { NavLink, Route, Routes } from 'react-router-dom';
import { type Location, send, useAction, useResource } from './api';
import { Notice } from './components';
import CardDetail from './CardDetail';
import Library from './Library';

function Storage() {
  const resource = useResource<Location[]>('/locations');
  const action = useAction();
  return (
    <>
      <p className="eyebrow">A PLACE FOR EVERY COPY</p>
      <h1>Bulk storage</h1>
      <p className="muted">Name your boxes and binders. Move cards between them from a card's printing page.</p>
      <form
        className="panel inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = new FormData(form).get('name');
          action.run(async () => {
            await send('/locations', { name });
            form.reset();
          }, 'Storage location added');
        }}
      >
        <label>
          New storage location
          <input name="name" placeholder="Blue binder, Box 02…" required maxLength={160} />
        </label>
        <button className="primary" disabled={action.pending}>
          Add location
        </button>
      </form>
      <Notice {...action} error={resource.error || action.error} />
      <div className="storage-grid">
        {resource.data?.map((location) => (
          <article className="panel" key={location.id}>
            <span className="storage-icon">▤</span>
            <h2>{location.name}</h2>
            <details>
              <summary>Rename location</summary>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get('name');
                  action.run(() => send(`/locations/${location.id}`, { name }, 'PATCH'), 'Location renamed');
                }}
              >
                <label>
                  Name
                  <input name="name" defaultValue={location.name} maxLength={160} required />
                </label>
                <button disabled={action.pending}>Save name</button>
              </form>
            </details>
          </article>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const summary = useResource<{ owned: number; in_decks: number; available: number }>('/summary');
  const sync = useResource<{ printings: number; running: boolean; error: string | null; last_success: string | null }>(
    '/catalogue-sync',
  );
  return (
    <div className="app-shell">
      <header className="site-header">
        <a href="/" className="brand">
          <span className="brand-mark">◈</span>
          <strong>
            MTG<span>VAULT</span>
          </strong>
        </a>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Library
          </NavLink>
          <NavLink to="/storage">Storage</NavLink>
        </nav>
        <span className="local-badge">
          <i />
          Private collection
        </span>
      </header>
      <main>
        <div className="collection-stats" aria-label="Collection totals">
          <div>
            <span>Total owned</span>
            <strong>{summary.data?.owned?.toLocaleString() ?? '—'}</strong>
          </div>
          <div>
            <span>In built decks</span>
            <strong>{summary.data?.in_decks?.toLocaleString() ?? '—'}</strong>
          </div>
          <div>
            <span>Available in bulk</span>
            <strong className="accent">{summary.data?.available?.toLocaleString() ?? '—'}</strong>
          </div>
          <p>
            Your collection,
            <br />
            <em>from bulk to battlefield.</em>
          </p>
        </div>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/cards/:id" element={<CardDetail />} />
          <Route path="/storage" element={<Storage />} />
          <Route
            path="*"
            element={
              <>
                <h1>Find your next card</h1>
                <a href="/?scope=catalogue" className="button">
                  Browse the catalogue
                </a>
              </>
            }
          />
        </Routes>
      </main>
      <footer>
        <span>MTG Vault · Unofficial fan project · Card data & artwork via Scryfall</span>
        <span>
          {sync.data?.running
            ? 'Catalogue synchronising…'
            : sync.data?.last_success
              ? `Catalogue updated ${new Date(sync.data.last_success).toLocaleString()}`
              : 'Waiting for initial catalogue sync'}
          {sync.data?.error && ' · Last refresh failed; cached data retained'}
        </span>
      </footer>
    </div>
  );
}
