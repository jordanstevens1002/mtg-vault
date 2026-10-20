import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  type Balance,
  type CardDetail as Detail,
  type Deck,
  type Location,
  type Movement,
  type Printing,
  operationId,
  send,
  useAction,
  useResource,
} from './api';
import { CardImage, Destination, Notice, SectionSelect, placement } from './components';

export function StockForm({
  printings,
  initialPrinting,
  onSaved,
}: {
  printings: Printing[];
  initialPrinting?: string;
  onSaved?: () => void;
}) {
  const [selected, setSelected] = useState(initialPrinting || printings[0]?.id || '');
  const printing = printings.find((p) => p.id === selected) || printings[0];
  const [finish, setFinish] = useState('nonfoil');
  const [quantity, setQuantity] = useState(1);
  const [destination, setDestination] = useState(
    () => localStorage.getItem('vault-destination') || 'location:00000000-0000-4000-8000-000000000002',
  );
  const [section, setSection] = useState('mainboard');
  const locations = useResource<Location[]>('/locations');
  const decks = useResource<Deck[]>('/decks');
  const action = useAction();
  const finishes = printing?.data.finishes || ['nonfoil'];
  const actualFinish = finishes.includes(finish) ? finish : finishes[0];
  // Keep the same ID for a retry after an ambiguous network failure.
  const [key, setKey] = useState(operationId);
  return (
    <form
      className="panel form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => {
          const body: Movement = {
            operation_id: key,
            kind: 'receipt',
            printing_id: printing.id,
            quantity,
            finish: actualFinish as Movement['finish'],
            destination: placement(destination, section),
          };
          await send('/inventory/movements', body);
          localStorage.setItem('vault-destination', destination);
          setKey(operationId());
          onSaved?.();
        }, 'Copies added to your collection');
      }}
    >
      <h2>Add owned copies</h2>
      <label>
        Printing
        <select
          value={printing?.id}
          onChange={(e) => {
            setSelected(e.target.value);
            setKey(operationId());
          }}
        >
          {printings.map((p) => (
            <option key={p.id} value={p.id}>
              {p.data.set_name || p.data.set?.toUpperCase()} · #{p.data.collector_number} ·{' '}
              {p.data.lang?.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Finish
          <select
            value={actualFinish}
            onChange={(e) => {
              setFinish(e.target.value);
              setKey(operationId());
            }}
          >
            {finishes.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            min="1"
            max="1000000"
            required
            value={quantity}
            onChange={(e) => {
              setQuantity(Number(e.target.value));
              setKey(operationId());
            }}
          />
        </label>
      </div>
      <Destination
        locations={locations.data || []}
        decks={decks.data || []}
        value={destination}
        onChange={(v) => {
          setDestination(v);
          setKey(operationId());
        }}
      />
      {destination.startsWith('deck:') && (
        <SectionSelect
          value={section}
          onChange={(v) => {
            setSection(v);
            setKey(operationId());
          }}
        />
      )}
      <p className="muted small">
        Confirm the physical printing, language and finish before adding. Adding to a built deck also
        increases your owned quantity.
      </p>
      <button className="primary" disabled={action.pending || !printing || !destination}>
        Confirm and add copies
      </button>
      <Notice {...action} error={action.error || locations.error || decks.error} />
    </form>
  );
}

function BalanceActions({
  balance,
  locations,
  decks,
}: {
  balance: Balance;
  locations: Location[];
  decks: Deck[];
}) {
  const [mode, setMode] = useState('transfer');
  const [quantity, setQuantity] = useState(1);
  const [destination, setDestination] = useState('location:00000000-0000-4000-8000-000000000002');
  const [section, setSection] = useState('mainboard');
  const action = useAction();
  const [key, setKey] = useState(operationId);
  return (
    <details className="balance-actions">
      <summary>Move or remove copies</summary>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          action.run(
            async () => {
              await send('/inventory/movements', {
                operation_id: key,
                kind: mode,
                source_id: balance.id,
                quantity,
                ...(mode === 'transfer' ? { destination: placement(destination, section) } : {}),
              });
              setKey(operationId());
            },
            mode === 'transfer' ? 'Copies moved' : 'Copies removed from ownership',
          );
        }}
      >
        <label>
          Action
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setKey(operationId());
            }}
          >
            <option value="transfer">Move existing copies</option>
            <option value="remove">Remove from ownership</option>
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            min="1"
            max={balance.quantity}
            required
            value={quantity}
            onChange={(e) => {
              setQuantity(Number(e.target.value));
              setKey(operationId());
            }}
          />
        </label>
        {mode === 'transfer' ? (
          <>
            <Destination
              locations={locations}
              decks={decks}
              value={destination}
              onChange={(v) => {
                setDestination(v);
                setKey(operationId());
              }}
            />
            {destination.startsWith('deck:') && (
              <SectionSelect
                value={section}
                onChange={(v) => {
                  setSection(v);
                  setKey(operationId());
                }}
              />
            )}
          </>
        ) : (
          <p className="notice error">
            This reduces the number of copies you own. To remove a card from a deck while keeping it, choose
            Move existing copies.
          </p>
        )}
        <button disabled={action.pending}>{mode === 'transfer' ? 'Move copies' : 'Confirm removal'}</button>
        <Notice {...action} />
      </form>
    </details>
  );
}

export default function CardDetail() {
  const { id } = useParams();
  const navigation = useLocation();
  const resource = useResource<Detail>(`/cards/${id}`);
  const locations = useResource<Location[]>('/locations');
  const decks = useResource<Deck[]>('/decks');
  const [showAll, setShowAll] = useState(false);
  const [face, setFace] = useState(0);
  const [language, setLanguage] = useState('en');
  const action = useAction();
  const data = resource.data;
  if (!data)
    return (
      <>
        <Notice error={resource.error} />
        <p role="status">Loading card…</p>
      </>
    );
  const owned = data.balances.reduce((n, b) => n + b.quantity, 0);
  const allocated = data.balances.filter((b) => b.deck_id).reduce((n, b) => n + b.quantity, 0);
  const printings = data.printings.filter(
    (p) => showAll || data.balances.some((b) => b.printing_id === p.id),
  );
  return (
    <>
      <Link className="back" to={navigation.state?.back || '/'}>
        ← Back to library
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CARD / OWNED PRINTINGS</p>
          <h1>{data.name}</h1>
          <p className="muted">
            {data.data.type_line} · {data.data.mana_cost || 'No printed mana cost'}
          </p>
        </div>
        <div className="count-chip">
          <strong>
            {allocated} / {owned}
          </strong>
          <span>in decks / owned</span>
        </div>
      </div>
      <div className="detail-layout">
        <section>
          <div className="toolbar">
            <h2>Printings</h2>
            <button onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show owned only' : 'Browse catalogue printings'}
            </button>
            {(data.data.card_faces?.length || 0) > 1 && (
              <button onClick={() => setFace(face ? 0 : 1)}>Flip image</button>
            )}
          </div>
          <Notice {...action} error={resource.error || action.error} />
          {printings.length === 0 && (
            <p className="empty">No owned printings yet. Choose a catalogue printing to add copies.</p>
          )}
          <div className="printing-grid">
            {printings.map((printing) => {
              const balances = data.balances.filter((b) => b.printing_id === printing.id);
              const total = balances.reduce((n, b) => n + b.quantity, 0);
              const used = balances.filter((b) => b.deck_id).reduce((n, b) => n + b.quantity, 0);
              return (
                <article className="panel printing" key={printing.id}>
                  <CardImage printingId={printing.id} name={data.name} face={face} />
                  <h3>{printing.data.set_name || printing.data.set?.toUpperCase()}</h3>
                  <p className="muted">
                    #{printing.data.collector_number} · {printing.data.lang?.toUpperCase()}
                  </p>
                  <strong>
                    {used} in decks / {total} owned
                  </strong>
                  <progress
                    value={used}
                    max={total || 1}
                    aria-label={`${used} in decks out of ${total} owned`}
                  />
                  <button
                    className="text-button"
                    disabled={action.pending}
                    onClick={() =>
                      action.run(
                        () => send(`/cards/${id}/cover`, { printing_id: printing.id }, 'PUT'),
                        'Library cover updated',
                      )
                    }
                  >
                    Use as library cover
                  </button>
                  {balances.map((balance) => (
                    <div className="balance" key={balance.id}>
                      <p>
                        <strong>
                          {balance.quantity} × {balance.finish}
                        </strong>
                        <span>
                          {balance.location_id
                            ? locations.data?.find((l) => l.id === balance.location_id)?.name || 'Storage'
                            : decks.data?.find((d) => d.id === balance.deck_id)?.name || 'Deck'}
                          {balance.deck_id && ` · ${balance.section}`}
                        </span>
                      </p>
                      <BalanceActions
                        balance={balance}
                        locations={locations.data || []}
                        decks={decks.data || []}
                      />
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
        <aside>
          <StockForm printings={data.printings} />
          <form
            className="panel form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              action.run(
                () => send(`/cards/${id}/printings/fetch?language=${language}`, {}),
                'Additional language printings fetched',
              );
            }}
          >
            <h3>Other language printings</h3>
            <label>
              Language code
              <input
                value={language}
                pattern="[a-z]{2,3}"
                required
                onChange={(e) => setLanguage(e.target.value)}
              />
            </label>
            <button disabled={action.pending}>Fetch printings</button>
          </form>
        </aside>
      </div>
    </>
  );
}
