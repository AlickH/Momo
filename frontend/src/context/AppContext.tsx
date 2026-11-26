import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { usePolling } from '../hooks/usePolling';
import { useToast } from './ToastContext';
import { hostApp } from '../lib/host';
import type { Me, Mode, Status, Traffic } from '../types';

type Theme = 'dark' | 'light';
export type ThemeMode = 'auto' | 'dark' | 'light';

interface AppContextValue {
  me: Me | null;
  status: Status | null;
  statusError: Error | null;
  traffic: Traffic | null;
  ready: boolean;
  denied: boolean;
  bootError: Error | null;
  retryBoot: () => Promise<unknown>;
  refreshStatus: () => Promise<Status | null>;
  refreshTraffic: () => Promise<Traffic | null>;
  setMode: (mode: Mode) => Promise<void>;
  modePending: Mode | null;
  theme: Theme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function initialThemeMode(): ThemeMode {
  const stored = localStorage.getItem('momo-theme-mode');
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  return 'auto';
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode);
  const [hostTheme, setHostTheme] = useState<Theme | null>(null);
  const [systemPreference, setSystemPreference] = useState<Theme>(systemTheme);
  const [modePending, setModePending] = useState<Mode | null>(null);
  const theme: Theme = themeMode === 'auto' ? (hostTheme ?? systemPreference) : themeMode;

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemPreference(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const app = hostApp();
    if (!app) return;
    let active = true;
    try {
      const title = app.setTitle?.('Momo');
      if (title && typeof title.catch === 'function') title.catch(() => {});
    } catch {
      // Host SDK is optional outside fnOS.
    }
    try {
      const configPromise = app.getPlatformConfig?.();
      if (configPromise && typeof configPromise.then === 'function') {
        configPromise
          .then((config) => {
            if (active && (config.theme === 'dark' || config.theme === 'light')) setHostTheme(config.theme);
          })
          .catch(() => {});
      }
    } catch {
      // Host SDK is optional outside fnOS.
    }
    const onHostTheme = (value: unknown) => {
      if (value === 'dark' || value === 'light') setHostTheme(value);
    };
    try {
      void app.$on?.('os/theme', onHostTheme);
    } catch {
      // Event subscription is best effort.
    }
    return () => {
      active = false;
      try {
        void app.$off?.('os/theme', onHostTheme);
      } catch {
        // Event unsubscribe is best effort.
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('momo-theme-mode', themeMode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0b0b' : '#f2f2f2');
  }, [theme, themeMode]);

  const mePoll = usePolling<{ user: Me }>(() => api.get('me'), 0);
  const me = mePoll.data?.user ?? null;
  const denied = mePoll.error instanceof ApiError && mePoll.error.status === 403;
  const meReady = Boolean(me) || denied;

  const statusPoll = usePolling<Status>(() => api.get('status'), 5000, { enabled: meReady });
  const [traffic, setTraffic] = useState<Traffic | null>(null);

  useEffect(() => {
    if (!meReady) {
      setTraffic(null);
      return;
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let fallback: AbortController | null = null;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const startFallback = async () => {
      if (stopped || fallback) return;
      fallback = new AbortController();
      while (!stopped) {
        try {
          await api.stream<Traffic>('traffic/stream', setTraffic, fallback.signal);
        } catch {
          if (stopped || fallback.signal.aborted) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };

    const connect = async () => {
      try {
        const { token } = await api.get<{ token: string }>('traffic/ws-token');
        if (stopped) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}${import.meta.env.BASE_URL}api/traffic/ws?token=${token}`);
        let received = false;
        watchdog = setTimeout(() => {
          if (!received) {
            socket?.close();
            void startFallback();
          }
        }, 5000);
        socket.onmessage = (event) => {
          received = true;
          if (watchdog) clearTimeout(watchdog);
          setTraffic(JSON.parse(event.data) as Traffic);
        };
        socket.onclose = () => {
          if (watchdog) clearTimeout(watchdog);
          if (!stopped && !fallback) retry = setTimeout(connect, 1000);
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (!stopped && !fallback) retry = setTimeout(connect, 1000);
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (watchdog) clearTimeout(watchdog);
      socket?.close();
      fallback?.abort();
    };
  }, [meReady]);

  const refreshStatus = useCallback(async () => statusPoll.refresh(), [statusPoll]);
  const refreshTraffic = useCallback(async () => {
    const snapshot = await api.get<Traffic>('traffic');
    setTraffic(snapshot);
    return snapshot;
  }, []);

  const setMode = useCallback(async (mode: Mode) => {
    if (modePending) return;
    setModePending(mode);
    try {
      await api.post('core/mode', { mode });
      await Promise.all([statusPoll.refresh(), refreshTraffic()]);
      toast('模式已切换', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '切换模式失败', 'error');
      throw error;
    } finally {
      setModePending(null);
    }
  }, [modePending, statusPoll, refreshTraffic, toast]);

  const toggleTheme = useCallback(() => {
    setThemeMode(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  const bootError = mePoll.error && !denied ? mePoll.error : null;
  const retryBoot = useCallback(async () => {
    await mePoll.refresh();
    if (mePoll.data) await statusPoll.refresh();
  }, [mePoll, statusPoll]);

  const value = useMemo<AppContextValue>(() => ({
    me,
    status: statusPoll.data,
    statusError: statusPoll.error,
    traffic,
    ready: meReady && Boolean(statusPoll.data),
    denied,
    bootError,
    retryBoot,
    refreshStatus,
    refreshTraffic,
    setMode,
    modePending,
    theme,
    themeMode,
    setThemeMode,
    toggleTheme,
  }), [
    me, statusPoll.data, statusPoll.error, traffic, meReady, denied, bootError, retryBoot,
    refreshStatus, refreshTraffic, setMode, modePending, theme, themeMode, setThemeMode, toggleTheme,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
