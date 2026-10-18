import { useCallback, useEffect, useState } from 'react';
import type { components } from './generated/api';

export type CardData = components['schemas']['CardData'];
export type CardSummary = components['schemas']['CardSummary'];
export type CardPage = components['schemas']['CardPage'];
export type CardFilters = components['schemas']['CardFilters'];
export type CardDetail = components['schemas']['CardDetail'];
export type Printing = components['schemas']['PrintingView'];
export type Balance = components['schemas']['BalanceView'];
export type Location = components['schemas']['LocationView'];
export type Deck = components['schemas']['DeckSummary'];
export type DeckDetail = components['schemas']['DeckDetail'];
export type Validation = components['schemas']['ValidationView'];
export type Movement = components['schemas']['Movement'];
export type Placement = components['schemas']['Placement'];

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail));
  }
  if (options.method && options.method !== 'GET') window.dispatchEvent(new Event('vault:changed'));
  return response.json();
}

export const send = <T>(path: string, body: unknown, method = 'POST') =>
  request<T>(path, { method, body: JSON.stringify(body) });

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    window.addEventListener('vault:changed', reload);
    return () => window.removeEventListener('vault:changed', reload);
  }, [reload]);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e.message));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, error, loading, reload };
}

export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function run(action: () => Promise<unknown>, message = 'Saved') {
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, success, run };
}

export const operationId = () => crypto.randomUUID();
