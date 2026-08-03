'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loading, error, and retry for a fetch — the three states every list in
 * the admin app was missing.
 *
 * The pattern being replaced was `fetch(...).then(setData)` inside a
 * useEffect with no catch. A failed request left the panel showing its
 * empty state, so "the network blipped" and "there are no notes on this
 * project" were rendered identically and indistinguishably. Someone reads
 * that as data loss and files a bug, or worse, believes it.
 *
 * Also guards the two things hand-rolled fetches routinely get wrong: a
 * response landing after the component unmounted, and a slow first request
 * resolving after a faster second one and overwriting it.
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** Human-readable, safe to render. Null when the last load succeeded. */
  error: string | null;
  /** True while re-fetching with data already on screen. */
  refreshing: boolean;
  reload: () => void;
}

export function useAsyncData<T>(
  url: string,
  options?: { select?: (raw: unknown) => T; enabled?: boolean }
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const requestId = useRef(0);
  const selectRef = useRef(options?.select);
  selectRef.current = options?.select;

  const enabled = options?.enabled ?? true;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    setError(null);
    setRefreshing((prev) => prev || data !== null);

    try {
      const res = await fetch(url);

      // A 401 is not an error to display — the page's own auth handling
      // redirects. Anything else needs saying out loud.
      if (res.status === 401) return;

      const body = await res.json().catch(() => null);

      // Stale response from a superseded request, or we've unmounted.
      if (!mounted.current || id !== requestId.current) return;

      if (!res.ok || body?.success === false) {
        setError(body?.error ?? `Couldn't load this (${res.status}).`);
        return;
      }

      setData(selectRef.current ? selectRef.current(body) : (body as T));
    } catch {
      if (!mounted.current || id !== requestId.current) return;
      setError('Could not reach the server — check your connection.');
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // `data` is deliberately not a dependency: including it would rebuild
    // `run` on every load and re-trigger the effect below forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, refreshing, reload: run };
}

/**
 * Applies an optimistic change, and puts it back if the write fails.
 *
 * Every optimistic update in the admin app was fire-and-forget: the row
 * moved on screen, the request failed, and nothing told anyone — so the
 * board showed a stage the database never agreed to until the next refresh
 * silently undid it. Reverting and surfacing the failure is the difference
 * between a wrong screen and a wrong decision.
 */
export async function withRollback<T>({
  apply,
  revert,
  write,
  onError,
}: {
  apply: () => void;
  revert: () => void;
  write: () => Promise<Response>;
  onError: (message: string) => void;
}): Promise<boolean> {
  apply();
  try {
    const res = await write();
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      revert();
      onError(body?.error ?? "That didn't save — put back as it was.");
      return false;
    }
    return true;
  } catch {
    revert();
    onError('Could not reach the server — the change was put back as it was.');
    return false;
  }
}
