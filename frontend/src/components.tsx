import { useState } from 'react';
import type { Deck, Location, Placement } from './api';

export function Notice({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
    </>
  );
}

export function CardImage({ printingId, name, face = 0 }: { printingId?: string | null; name: string; face?: number }) {
  const [broken, setBroken] = useState('');
  const source = `/api/v1/images/${printingId}/${face}`;
  return (
    <div className="card-art">
      {printingId && broken !== source ? (
        <img src={source} alt={name} loading="lazy" onError={() => setBroken(source)} />
      ) : (
        <div className="art-placeholder">
          <span>◇</span>
          <strong>{name}</strong>
          <small>Image unavailable</small>
        </div>
      )}
    </div>
  );
}

export function Destination({
  locations,
  decks,
  value,
  onChange,
  storageOnly = false,
}: {
  locations: Location[];
  decks: Deck[];
  value: string;
  onChange: (value: string) => void;
  storageOnly?: boolean;
}) {
  return (
    <label>
      Destination
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Choose a destination</option>
        <optgroup label="Storage">
          {locations.map((l) => (
            <option key={l.id} value={`location:${l.id}`}>
              {l.name}
            </option>
          ))}
        </optgroup>
        {!storageOnly && (
          <optgroup label="Built decks">
            {decks
              .filter((d) => d.state === 'built')
              .map((d) => (
                <option key={d.id} value={`deck:${d.id}`}>
                  {d.name}
                </option>
              ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

export function placement(value: string, section = 'mainboard'): Placement {
  const [kind, id] = value.split(':');
  return kind === 'deck'
    ? { deck_id: id, section: section as Placement['section'] }
    : { location_id: id, section: 'mainboard' };
}

export function SectionSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label>
      Section
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="mainboard">Mainboard</option>
        <option value="commander">Commander</option>
        <option value="sideboard">Sideboard</option>
      </select>
    </label>
  );
}
