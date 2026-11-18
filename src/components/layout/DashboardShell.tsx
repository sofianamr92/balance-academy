import React, { useState } from 'react';
import { Globe, LogOut, Menu, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badgeCount?: number;
}

export function DashboardShell({
  title,
  breadcrumb,
  items,
  activeId,
  onSelect,
  navigate,
  children,
}: {
  title: string;
  breadcrumb: string;
  items: SidebarNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  navigate: (path: string) => void;
  children: React.ReactNode;
}) {
  const { user, logout, toggleLocale, t } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#172554] text-white">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap"
        >
          {t.brandName}
        </a>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-xs text-white/60 truncate">{title}</p>
        {user && (
          <p className="mt-0.5 text-sm font-medium text-white truncate">{user.fullName}</p>
        )}
      </div>

      <nav aria-label="Dashboard Navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                setSidebarOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                isActive
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs tabular-nums">
                  {item.badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3 space-y-1">
        <a
          href="/courses"
          onClick={(e) => {
            e.preventDefault();
            navigate('/courses');
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white"
        >
          {t.nav.courses}
        </a>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>{t.nav.logout}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-[#080B12]/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar navigation"
              className="rounded-lg p-2 text-[#172554] hover:bg-[#F1F5F9] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <p className="text-sm font-semibold text-[#172554] truncate">{breadcrumb}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleLocale}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#111827] hover:bg-[#F8FAFC] cursor-pointer whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5 text-[#3B82F6]" />
              <span>{t.nav.switchLang}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
