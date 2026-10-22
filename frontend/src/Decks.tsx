import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type CardDetail,
  type CardPage,
  type Deck,
  type DeckDetail,
  type Location,
  type Validation,
  operationId,
  send,
  useAction,
  useResource,
} from './api';
import { Destination, Notice, SectionSelect } from './components';

export default function Decks() {
  const resource = useResource<Deck[]>('/decks');
  const action = useAction();
  return (
    <>
      <p className="eyebrow">FROM IDEA TO TABLETOP</p>
      <h1>Your decks</h1>
      <p className="muted">Plan freely. Built decks hold physical copies from your collection.</p>
      <form
        className="panel inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fields = new FormData(form);
          action.run(async () => {
            await send('/decks', Object.fromEntries(fields));
            form.reset();
          }, 'Deck created');
        }}
      >
        <label>
          Deck name
          <input name="name" required maxLength={160} placeholder="A new deck…" />
        </label>
        <label>
          Format
          <select name="format">
            <option value="commander">Commander</option>
            <option value="casual">Casual</option>
          </select>
        </label>
        <label>
          State
          <select name="state">
            <option value="planned">Planned</option>
            <option value="built">Built — add owned copies directly</option>
          </select>
        </label>
        <button className="primary" disabled={action.pending}>
          Create deck
        </button>
      </form>
      <Notice {...action} error={resource.error || action.error} />
      <div className="storage-grid">
        {resource.data?.map((deck) => (
          <Link className="panel deck-tile" to={`/decks/${deck.id}`} key={deck.id}>
            <span className={`state-badge ${deck.state}`}>
              {deck.state === 'built' ? '● Built · copies allocated' : '◇ Planned · no stock reserved'}
            </span>
            <h2>{deck.name}</h2>
            <p className="muted">
              {deck.quantity} cards · {deck.format}
            </p>
            <span className="accent">Open deck →</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function DeckWorkspace() {
  const { id } = useParams();
  const resource = useResource<DeckDetail>(`/decks/${id}`);
  const validation = useResource<Validation>(`/decks/${id}/validation`);
  const locations = useResource<Location[]>('/locations');
  const action = useAction();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const candidates = useResource<CardPage>(
    query.length > 1 ? `/cards?scope=catalogue&q=${encodeURIComponent(query)}&limit=10` : null,
  );
  const candidate = useResource<CardDetail>(selected ? `/cards/${selected}` : null);
  const [quantity, setQuantity] = useState(1);
  const [section, setSection] = useState('mainboard');
  const [preference, setPreference] = useState('');
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState('location:00000000-0000-4000-8000-000000000002');
  const [key, setKey] = useState(operationId);
  const [pendingEntries, setPendingEntries] = useState<DeckDetail>();
  const deck = resource.data;
  // A successful PUT starts a background reload. Keep entry edits locked until
  // that reload replaces the object used to construct the submitted list.
  const entriesBusy =
    action.pending ||
    resource.loading ||
    !!resource.error ||
    (pendingEntries !== undefined && pendingEntries === deck);
  async function saveEntries(
    next: { card_id: string; quantity: number; section: string; preferred_printing_id: string | null }[],
  ) {
    if (entriesBusy) return;
    setPendingEntries(deck);
    try {
      await send(`/decks/${id}/entries`, { entries: next }, 'PUT');
    } catch (error) {
      setPendingEntries(undefined);
      throw error;
    }
  }
  if (!deck)
    return (
      <>
        <Notice error={resource.error} />
        <p role="status">Loading deck…</p>
      </>
    );
  const entries = deck.entries.map((e) => ({
    card_id: e.card_id,
    quantity: e.quantity,
    section: e.section,
    preferred_printing_id: e.preferred_printing_id,
  }));
  function selectedQuantity(entry: DeckDetail['entries'][number]) {
    return (deck?.sources || [])
      .filter((s) => s.card_id === entry.card_id)
      .reduce((n, s) => n + (selections[`${entry.section}:${s.id}`] || 0), 0);
  }
  const complete = deck.entries.every((e) => selectedQuantity(e) === e.quantity);
  return (
    <>
      <Link className="back" to="/decks">
        ← All decks
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {deck.state.toUpperCase()} / {deck.format.toUpperCase()}
          </p>
          <h1>{deck.name}</h1>
          <p className="muted">
            {deck.quantity} cards ·{' '}
            {deck.state === 'built' ? 'Physical copies allocated' : 'No physical copies reserved'}
          </p>
        </div>
      </div>
      <Notice {...action} error={resource.error || action.error} />
      {resource.error && <button onClick={resource.reload}>Retry deck refresh</button>}
      {validation.data?.validated && (
        <details className="panel validation">
          <summary>
            Commander construction ·{' '}
            {validation.data.findings.length
              ? `${validation.data.findings.length} findings`
              : 'No construction issues found'}
          </summary>
          <p className="muted small">
            Warnings do not block inventory actions. Rules: {validation.data.rules_date}. Catalogue:{' '}
            {validation.data.catalogue_updated_at
              ? new Date(validation.data.catalogue_updated_at).toLocaleString()
              : 'No successful sync recorded'}
            .
          </p>
          {validation.data.color_choices?.map((choice) => (
            <label key={choice.card_id}>
              Colour for {choice.name}
              <select
                value={choice.color || ''}
                disabled={entriesBusy}
                onChange={(event) =>
                  action.run(() => {
                    const choices = Object.fromEntries(
                      (validation.data?.color_choices || [])
                        .map((item) => [
                          item.card_id,
                          item.card_id === choice.card_id ? event.target.value : item.color,
                        ])
                        .filter(([, color]) => color),
                    );
                    return send(`/decks/${id}/commander-colours`, { choices }, 'PUT');
                  }, 'Commander colour saved')
                }
              >
                <option value="">Choose a colour</option>
                <option value="W">White</option>
                <option value="U">Blue</option>
                <option value="B">Black</option>
                <option value="R">Red</option>
                <option value="G">Green</option>
              </select>
            </label>
          ))}
          {validation.data.findings.map((f, index) => (
            <p className="notice error" key={index}>
              {f.message}
            </p>
          ))}
        </details>
      )}
      {deck.state === 'planned' && (
        <section className="panel form-stack plan-editor">
          <h2>Add a card to this plan</h2>
          <label>
            Find a card
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected('');
                setPreference('');
              }}
              placeholder="Search the complete catalogue…"
            />
          </label>
          <Notice error={candidates.error} />
          {query.length > 1 && !selected && (
            <div className="candidate-list">
              {candidates.data?.items.map((card) => (
                <button
                  key={card.id}
                  onClick={() => {
                    setSelected(card.id);
                    setPreference('');
                  }}
                >
                  {card.name}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (entriesBusy) return;
                action.run(async () => {
                  const existing = entries.find((e) => e.card_id === selected && e.section === section);
                  const next = existing
                    ? entries.map((e) =>
                        e === existing
                          ? {
                              ...e,
                              quantity: e.quantity + quantity,
                              preferred_printing_id: preference || e.preferred_printing_id,
                            }
                          : e,
                      )
                    : [
                        ...entries,
                        { card_id: selected, quantity, section, preferred_printing_id: preference || null },
                      ];
                  await saveEntries(next);
                  setSelected('');
                  setQuery('');
                  setSelections({});
                  setKey(operationId());
                }, 'Card added to plan');
              }}
            >
              <strong>{candidate.data?.name || 'Selected card'}</strong>
              <div className="form-row">
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </label>
                <SectionSelect value={section} onChange={setSection} />
              </div>
              <label>
                Preferred printing
                <select value={preference} onChange={(e) => setPreference(e.target.value)}>
                  <option value="">Any printing</option>
                  {candidate.data?.printings.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.data.set_name || p.data.set} · #{p.data.collector_number} · {p.data.lang}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={entriesBusy}>
                Add to plan
              </button>
            </form>
          )}
        </section>
      )}
      <div className="deck-entries">
        {deck.entries.map((entry) => (
          <article className="panel" key={`${entry.section}:${entry.card_id}`}>
            <div className="toolbar">
              <div>
                <h2>
                  <Link to={`/cards/${entry.card_id}`}>
                    {entry.quantity} × {entry.name}
                  </Link>
                </h2>
                <span className="muted small">
                  {entry.section}
                  {entry.preferred_printing_id ? ' · preferred printing selected' : ''}
                </span>
              </div>
              {deck.state === 'planned' && (
                <button
                  disabled={entriesBusy}
                  onClick={() =>
                    action.run(async () => {
                      await saveEntries(
                        entries.filter((e) => e.card_id !== entry.card_id || e.section !== entry.section),
                      );
                      setSelections({});
                      setKey(operationId());
                    }, 'Entry removed')
                  }
                >
                  Remove entry
                </button>
              )}
            </div>
            {deck.state === 'planned' && (
              <>
                <p className="muted small">
                  {deck.shortages[entry.card_id]
                    ? `${deck.shortages[entry.card_id]} copies short across this plan`
                    : 'Enough copies currently available'}{' '}
                  · Selected {selectedQuantity(entry)} / {entry.quantity}
                </p>
                {deck.sources
                  .filter((s) => s.card_id === entry.card_id)
                  .map((source) => (
                    <div className="allocation-row" key={source.id}>
                      <span>
                        {source.data.set_name || source.data.set?.toUpperCase()} #
                        {source.data.collector_number} · {source.data.lang} · {source.finish}
                        <small>
                          {locations.data?.find((l) => l.id === source.location_id)?.name} · {source.quantity}{' '}
                          available
                        </small>
                      </span>
                      <label>
                        Use copies
                        <input
                          type="number"
                          min="0"
                          max={source.quantity}
                          value={selections[`${entry.section}:${source.id}`] || 0}
                          onChange={(e) => {
                            setSelections({
                              ...selections,
                              [`${entry.section}:${source.id}`]: Number(e.target.value),
                            });
                            setKey(operationId());
                          }}
                        />
                      </label>
                    </div>
                  ))}
              </>
            )}
          </article>
        ))}
      </div>
      {deck.state === 'planned' ? (
        <section className="panel form-stack">
          <h2>Build this deck</h2>
          <p className="muted">
            Select the actual copies for every entry above. Your entire plan is allocated together; shortages
            leave it unchanged.
          </p>
          <button
            className="primary"
            disabled={entriesBusy || !complete}
            onClick={() =>
              action.run(async () => {
                const chosen = Object.entries(selections)
                  .filter(([, count]) => count > 0)
                  .map(([value, count]) => {
                    const [section, source_id] = value.split(':');
                    return { section, source_id, quantity: count };
                  });
                await send(`/decks/${id}/build`, { operation_id: key, selections: chosen });
                setSelections({});
                setKey(operationId());
              }, 'Deck built; all copies allocated')
            }
          >
            Confirm all copies and build
          </button>
        </section>
      ) : (
        <form
          className="panel form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            action.run(async () => {
              await send(`/decks/${id}/disassemble`, {
                operation_id: key,
                location_id: destination.split(':')[1],
              });
              setKey(operationId());
            }, 'Deck returned to storage and kept as a plan');
          }}
        >
          <h2>Return this deck to storage</h2>
          <p className="muted">
            All owned copies return to the selected location. The card list remains as a planned deck.
          </p>
          <Destination
            locations={locations.data || []}
            decks={[]}
            storageOnly
            value={destination}
            onChange={(v) => {
              setDestination(v);
              setKey(operationId());
            }}
          />
          <button disabled={entriesBusy}>Confirm disassembly</button>
          <p className="small muted">
            To add, remove or move individual cards, open a card above and use its printing quantities.
          </p>
        </form>
      )}
    </>
  );
}
