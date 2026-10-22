import { useEffect, useRef } from 'react';

export const manaNames: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colourless',
  X: 'Variable X',
  S: 'Snow',
};

export function ManaSymbol({ symbol }: { symbol: string }) {
  return manaNames[symbol] ? (
    <img className="mana-symbol" src={`/vendor/mana/${symbol}.svg`} alt="" aria-hidden="true" />
  ) : (
    <span className="generic-mana" aria-hidden="true">
      {symbol}
    </span>
  );
}

export default function ManaCostBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const dropdown = useRef<HTMLDetailsElement>(null);
  function alignPanel() {
    if (!dropdown.current?.open) return;
    const panel = dropdown.current.querySelector<HTMLElement>('.mana-dropdown-panel');
    if (!panel) return;
    panel.style.left = '0px';
    panel.style.left = `${Math.min(0, window.innerWidth - 16 - panel.getBoundingClientRect().right)}px`;
  }
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !dropdown.current?.contains(event.target) && dropdown.current)
        dropdown.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && dropdown.current?.open) {
        dropdown.current.open = false;
        dropdown.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', alignPanel);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', alignPanel);
    };
  }, []);
  const tokens = [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const genericToken = tokens.find((token) => /^\d+$/.test(token));
  const generic = genericToken === undefined ? null : Number(genericToken);
  const symbols = tokens.filter((token) => !/^\d+$/.test(token));
  function update(amount: number | null, pips: string[]) {
    const number = amount === null || (amount === 0 && pips.length) ? '' : `{${amount}}`;
    onChange(number + pips.map((symbol) => `{${symbol}}`).join(''));
  }
  return (
    <fieldset className="mana-builder">
      <legend>Mana cost</legend>
      <details
        className="mana-dropdown"
        ref={dropdown}
        onToggle={alignPanel}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget))
            event.currentTarget.open = false;
        }}
      >
        <summary aria-label={`Mana cost options${value ? `: ${value}` : ''}`}>
          <span className="mana-summary" aria-hidden="true">
            {tokens.length
              ? tokens.map((symbol, index) => <ManaSymbol key={index} symbol={symbol} />)
              : 'Any mana cost'}
          </span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="mana-dropdown-panel">
          <div className="mana-palette">
            <button type="button" aria-label="Match zero mana cost" onClick={() => onChange('{0}')}>
              <ManaSymbol symbol="0" />
            </button>
            {Object.entries(manaNames).map(([symbol, name]) => (
              <button
                type="button"
                key={symbol}
                aria-label={`Add ${name} mana`}
                onClick={() => update(generic, [...symbols, symbol])}
              >
                <ManaSymbol symbol={symbol} />
                <span className="pip-count">{symbols.filter((pip) => pip === symbol).length || ''}</span>
              </button>
            ))}
          </div>
          <label className="generic-control">
            Generic mana <output>{generic ?? 0}</output>
            <input
              aria-label="Generic mana"
              type="range"
              min="0"
              max={Math.max(20, generic || 0)}
              step="1"
              value={generic ?? 0}
              onChange={(event) => update(Number(event.target.value), symbols)}
            />
          </label>
          <div className="selected-mana" aria-label="Selected mana cost">
            {generic !== null && (
              <button
                type="button"
                aria-label={`Remove ${generic} generic mana`}
                onClick={() => update(null, symbols)}
              >
                <ManaSymbol symbol={String(generic)} />
              </button>
            )}
            {symbols.map((symbol, index) => (
              <button
                type="button"
                key={`${symbol}-${index}`}
                aria-label={`Remove ${manaNames[symbol] || symbol} mana pip ${index + 1}`}
                onClick={() =>
                  update(
                    generic,
                    symbols.filter((_, i) => i !== index),
                  )
                }
              >
                <ManaSymbol symbol={symbol} />
              </button>
            ))}
            {!value && <span className="muted">Any mana cost</span>}
            <button type="button" className="text-button" disabled={!value} onClick={() => onChange('')}>
              Clear mana cost
            </button>
          </div>
          <span className="small muted">Match these pips exactly. Click a selected pip to remove it.</span>
        </div>
      </details>
    </fieldset>
  );
}
