import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '@/app/AppProvider';
import type { LayoutMode } from '@/types/domain';

const NAV_ITEMS = [
  { to: '/study', label: '学习', short: '学' },
  { to: '/vocabulary', label: '词库', short: '词' },
  { to: '/review', label: '复习', short: '复' },
  { to: '/difficult', label: '困难词', short: '难' },
  { to: '/stats', label: '统计', short: '统' },
  { to: '/settings', label: '设置', short: '设' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const mode: LayoutMode = settings.layoutMode;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded px-2.5 py-1.5 text-sm ${isActive ? 'bg-accent text-accent-fg' : 'hover:bg-surface-muted'}`;

  if (mode === 'compact') {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-line px-2 py-1">
          <span className="text-sm font-semibold">Word Pocket</span>
          <div className="relative">
            <button
              type="button"
              aria-label="菜单"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded px-2 py-1 hover:bg-surface-muted"
            >
              ☰
            </button>
            {menuOpen && (
              <nav className="absolute right-0 z-40 mt-1 flex w-40 flex-col gap-1 rounded border border-line bg-surface-raised p-2 shadow-lg">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={navClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
        </header>
        <main className="flex-1 p-2">{children}</main>
        <footer className="flex items-center justify-between border-t border-line px-2 py-1 text-[11px] text-content-muted">
          <span>紧凑模式</span>
          <button
            type="button"
            className="underline"
            onClick={() => updateSettings({ layoutMode: 'standard' })}
          >
            切换标准
          </button>
        </footer>
      </div>
    );
  }

  const isManagement = mode === 'management';

  return (
    <div className={`flex min-h-screen ${isManagement ? '' : 'flex-col'}`}>
      <nav
        aria-label="主导航"
        className={
          isManagement
            ? 'flex w-48 shrink-0 flex-col gap-1 border-r border-line p-3'
            : 'flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1'
        }
      >
        <div className={isManagement ? 'mb-3 px-1 text-sm font-semibold' : 'mr-2 shrink-0 text-sm font-semibold'}>
          Word Pocket
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={navClass} end={item.to === '/'}>
            {item.label}
          </NavLink>
        ))}
        {isManagement && (
          <div className="mt-auto flex flex-col gap-1 pt-4 text-xs text-content-muted">
            <span>管理模式</span>
            <button
              type="button"
              className="self-start underline"
              onClick={() => updateSettings({ layoutMode: 'standard' })}
            >
              切换标准
            </button>
          </div>
        )}
      </nav>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}

export function useCurrentPath(): string {
  return useLocation().pathname;
}
