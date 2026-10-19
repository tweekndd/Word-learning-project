import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  level: NotificationLevel;
  message: string;
  detail?: string;
  createdAt: number;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  notify: (level: NotificationLevel, message: string, detail?: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

let seq = 0;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((list) => list.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (level: NotificationLevel, message: string, detail?: string) => {
      seq += 1;
      const id = `n-${Date.now()}-${seq}`;
      setNotifications((list) => [...list.slice(-4), { id, level, message, detail, createdAt: Date.now() }]);
    },
    [],
  );

  const clear = useCallback(() => setNotifications([]), []);

  const value = useMemo(
    () => ({ notifications, notify, dismiss, clear }),
    [notifications, notify, dismiss, clear],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <NotificationViewport />
    </NotificationsContext.Provider>
  );
}

const levelClass: Record<NotificationLevel, string> = {
  info: 'border-line bg-surface-raised',
  success: 'border-success/40 bg-success/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  error: 'border-danger/50 bg-danger/10',
};

function NotificationViewport() {
  const ctx = useContext(NotificationsContext);
  if (!ctx || ctx.notifications.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[60] flex w-80 max-w-[90vw] flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {ctx.notifications.map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto rounded border p-3 text-sm shadow-lg ${levelClass[n.level]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{n.message}</p>
              {n.detail && <p className="mt-1 text-xs text-content-muted">{n.detail}</p>}
            </div>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => ctx.dismiss(n.id)}
              className="text-content-muted hover:text-content"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications 必须在 NotificationsProvider 内使用');
  return ctx;
}
