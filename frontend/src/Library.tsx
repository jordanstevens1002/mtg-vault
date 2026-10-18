import { Link, useSearchParams } from 'react-router-dom';
import { type CardPage, useResource } from './api';
import { CardImage, Notice } from './components';

export default function Library() {
  const [params, setParams] = useSearchParams();
  const resource = useResource<CardPage>(`/cards?${params}`);
  const catalogue = params.get('scope') === 'catalogue';
  function change(key: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'offset') next.delete('offset');
      return next;
    });
  }
  const filter = (key: string, label: string, placeholder: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        value={params.get(key) || ''}
        placeholder={placeholder}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE COLLECTION</p>
          <h1>{catalogue ? 'Explore the catalogue' : 'Your library'}</h1>
          <p className="muted">Every printing. Every copy. A place for each.</p>
        </div>
        <Link className="button primary" to="/scan">
          ＋ Scan a card
        </Link>
      </div>
      <div className="toolbar">
        <div className="segmented" aria-label="Search scope">
          <button className={!catalogue ? 'selected' : ''} onClick={() => change('scope', '')}>
            Owned library
          </button>
          <button className={catalogue ? 'selected' : ''} onClick={() => change('scope', 'catalogue')}>
            All cards
          </button>
        </div>
        <span className="muted">{resource.data?.total ?? '—'} unique cards</span>
      </div>
      <section className="filter-panel" aria-label="Card filters">
        <label className="search">
          Search cards
          <input
            aria-label="Search cards"
            value={params.get('q') || ''}
            placeholder="Search by card name…"
            onChange={(e) => change('q', e.target.value)}
          />
        </label>
        <label>
          Colour identity
          <div className="colours">
            {['W', 'U', 'B', 'R', 'G'].map((colour, i) => (
              <button
                key={colour}
                className={`colour c${colour} ${params.get('colors')?.includes(colour) ? 'active' : ''}`}
                aria-label={['White', 'Blue', 'Black', 'Red', 'Green'][i]}
                aria-pressed={params.get('colors')?.includes(colour) || false}
                onClick={() => {
                  const set = new Set(params.get('colors') || '');
                  if (set.has(colour)) set.delete(colour);
                  else set.add(colour);
                  const next = new URLSearchParams(params);
                  next.set('colors', [...set].join(''));
                  next.delete('offset');
                  setParams(next);
                }}
              >
                {colour}
              </button>
            ))}
            <button
              aria-pressed={params.has('colors') && !params.get('colors')}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('colors', '');
                next.delete('offset');
                setParams(next);
              }}
            >
              C
            </button>
          </div>
        </label>
        <label>
          Colour match
          <select value={params.get('color_mode') || 'within'} onChange={(e) => change('color_mode', e.target.value)}>
            <option value="within">Within selected colours</option>
            <option value="contains">Contains selected colours</option>
            <option value="exact">Exactly selected colours</option>
          </select>
        </label>
        {filter('mana_min', 'Mana value from', 'Any', 'number')}
        {filter('mana_max', 'Mana value to', 'Any', 'number')}
        {filter('mana_cost', 'Printed mana cost', '{2}{W}{W}')}
        {filter('card_type', 'Card type', 'Creature')}
        {filter('subtype', 'Subtype', 'Human')}
        <label>
          Sort by
          <select value={params.get('sort') || 'name'} onChange={(e) => change('sort', e.target.value)}>
            {[
              ['name', 'Name'],
              ['mana', 'Mana value'],
              ['color', 'Colour identity'],
              ['type', 'Card type'],
              ['owned', 'Most owned'],
              ['available', 'Most available'],
            ].map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button className="text-button" onClick={() => setParams(catalogue ? { scope: 'catalogue' } : {})}>
          Clear filters
        </button>
      </section>
      <Notice error={resource.error} />
      {resource.loading && (
        <p className="muted" role="status">
          Loading cards…
        </p>
      )}
      {resource.data && resource.data.items.length === 0 && !resource.loading && (
        <div className="empty">
          <span>◇</span>
          <h2>{catalogue ? 'No matching cards' : 'Room for your collection'}</h2>
          <p>
            {catalogue
              ? 'Try fewer filters. The catalogue appears after the first synchronisation.'
              : 'Scan your first card, import a collection, or find a printing in All cards.'}
          </p>
          <Link to="/scan" className="button">
            Add your first card
          </Link>
        </div>
      )}
      <div className="card-grid">
        {resource.data?.items.map((card) => (
          <Link to={`/cards/${card.id}`} state={{ back: `/?${params}` }} className="card-tile" key={card.id}>
            <div className="art-wrap">
              <CardImage printingId={card.cover_id} name={card.name} />
              <div className="ownership">
                <div>
                  <strong>{card.in_decks} in decks</strong>
                  <span>{card.owned} owned</span>
                </div>
                <progress
                  aria-label={`${card.name}: ${card.in_decks} in decks out of ${card.owned} owned`}
                  value={card.in_decks}
                  max={card.owned || 1}
                />
              </div>
            </div>
            <h2>{card.name}</h2>
            <p>{card.data.type_line}</p>
            <span className="availability">{card.available} available in storage</span>
          </Link>
        ))}
      </div>
      {(resource.data?.total ?? 0) > 48 && (
        <div className="pagination">
          <button
            disabled={!Number(params.get('offset'))}
            onClick={() => change('offset', String(Math.max(0, Number(params.get('offset') || 0) - 48)))}
          >
            Previous
          </button>
          <span>
            {Number(params.get('offset') || 0) + 1}–
            {Math.min(Number(params.get('offset') || 0) + 48, resource.data?.total || 0)}
          </span>
          <button
            disabled={Number(params.get('offset') || 0) + 48 >= (resource.data?.total || 0)}
            onClick={() => change('offset', String(Number(params.get('offset') || 0) + 48))}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
