import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  lastUpdated: number | null;
}

export function usePolling<T>(
  loader: () => Promise<T>,
  intervalMs: number,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    lastUpdated: null,
  });
  const mounted = useRef(true);
  const seq = useRef(0);

  const execute = useCallback(async (silent: boolean) => {
    const id = ++seq.current;
    if (!silent) setState((prev) => ({ ...prev, loading: prev.data === null, refreshing: true }));
    try {
      const data = await loaderRef.current();
      if (!mounted.current || id !== seq.current) return data;
      setState((prev) => ({ ...prev, data, error: null, loading: false, refreshing: false, lastUpdated: Date.now() }));
      return data;
    } catch (error) {
      if (!mounted.current || id !== seq.current) return null;
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error : new Error(String(error)),
        loading: false,
        refreshing: false,
      }));
      return null;
    }
  }, []);

  const refresh = useCallback(async () => execute(false), [execute]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return () => {
        mounted.current = false;
      };
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async (first: boolean) => {
      if (stopped) return;
      await execute(!first);
      if (stopped || intervalMs <= 0) return;
      timer = setTimeout(() => tick(false), intervalMs);
    };
    void tick(true);
    return () => {
      stopped = true;
      mounted.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, execute, intervalMs]);

  const mutate = useCallback((updater: T | ((previous: T | null) => T | null)) => {
    setState((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (previous: T | null) => T | null)(prev.data)
        : updater;
      return { ...prev, data: next };
    });
  }, []);

  return { ...state, refresh, mutate };
}
