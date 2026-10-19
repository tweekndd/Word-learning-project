import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { runMigrations } from '@/db/migrations';
import { settingsRepo } from '@/db/repositories';
import type { Settings } from '@/types/domain';
import { createDefaultSettings } from '@/db/defaults';
import { reconcileOnStartup } from '@/services/scheduler/reconcile';

interface AppContextValue {
  ready: boolean;
  fatalError: string | null;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  reloadSettings: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', dark);
  root.dataset.theme = dark ? 'dark' : 'light';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => createDefaultSettings());
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        await runMigrations();
        const loaded = await settingsRepo.get();
        setSettings(loaded);
        await reconcileOnStartup(Date.now());
        setReady(true);
      } catch (err) {
        setFatalError(
          err instanceof Error
            ? `本地数据库初始化失败：${err.message}。你的数据未被清除。`
            : '本地数据库初始化失败。你的数据未被清除。',
        );
      }
    })();
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    document.documentElement.style.setProperty('--wp-font-scale', String(settings.fontScale));
  }, [settings.theme, settings.fontScale]);

  useEffect(() => {
    if (settings.theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.theme]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await settingsRepo.update(patch);
    setSettings(next);
  }, []);

  const reloadSettings = useCallback(async () => {
    setSettings(await settingsRepo.get());
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ ready, fatalError, settings, updateSettings, reloadSettings }),
    [ready, fatalError, settings, updateSettings, reloadSettings],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用');
  return ctx;
}
