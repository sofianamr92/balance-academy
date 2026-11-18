import React, { useState } from 'react';
import { Globe, Menu, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Button } from '../ui/DesignSystem';

export function PublicNavbar({
  currentPath,
  navigate,
}: {
  currentPath: string;
  navigate: (path: string) => void;
}) {
  const { t, user, toggleLocale } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { path: '/', label: t.nav.home },
    { path: '/courses', label: t.nav.courses },
    { path: '/about', label: t.nav.about },
    { path: '/contact', label: t.nav.contact },
  ];

  const primaryDestination = user
    ? user.role === 'student'
      ? '/student'
      : '/admin'
    : '/login';

  const primaryLabel = user
    ? user.role === 'student'
      ? t.nav.dashboard
      : t.nav.adminPanel
    : t.nav.login;

  const go = (path: string) => {
    setMobileOpen(false);
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go('/');
          }}
          className="text-lg font-bold tracking-tight text-[#172554] whitespace-nowrap shrink-0"
        >
          {t.brandName}
        </a>

        {/* Zone 2: 4 concise single-line nav links */}
        <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-7">
          {navItems.map((item) => {
            const active =
              item.path === '/'
                ? currentPath === '/'
                : currentPath.startsWith(item.path);
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.path);
                }}
                className={`text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'text-[#3B82F6] underline underline-offset-8 decoration-2'
                    : 'text-[#64748B] hover:text-[#111827]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Language Switcher + 1 Primary Action */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleLocale}
            aria-label={`Switch language to ${t.nav.switchLang}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#111827] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{t.nav.switchLang}</span>
          </button>
          <Button
            variant="navy"
            size="sm"
            onClick={() => go(primaryDestination)}
          >
            {primaryLabel}
          </Button>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={toggleLocale}
            aria-label={`Switch language to ${t.nav.switchLang}`}
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]"
          >
            {t.nav.switchLang}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            className="rounded-lg p-2 text-[#172554] hover:bg-[#F1F5F9]"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#E2E8F0] bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.path);
                }}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                  currentPath === item.path
                    ? 'bg-[#3B82F6]/10 text-[#172554]'
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#111827]'
                }`}
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2 border-t border-[#E2E8F0]">
              <Button variant="navy" className="w-full" onClick={() => go(primaryDestination)}>
                {primaryLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter({ navigate }: { navigate: (path: string) => void }) {
  const { t, locale, toggleLocale } = useApp();

  return (
    <footer className="border-t border-[#E2E8F0] bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2 space-y-3">
            <p className="text-base font-bold text-[#172554]">{t.brandName}</p>
            <p className="text-sm text-[#64748B] max-w-md leading-relaxed">
              {t.home.introBody}
            </p>
            <p className="text-xs text-[#64748B]">{t.brandAgency}</p>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-[#111827]">{t.nav.courses}</p>
            <ul className="space-y-2 text-sm text-[#64748B]">
              <li>
                <a
                  href="/courses"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/courses');
                  }}
                  className="hover:text-[#172554]"
                >
                  {t.catalog.title}
                </a>
              </li>
              <li>
                <a
                  href="/about"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/about');
                  }}
                  className="hover:text-[#172554]"
                >
                  {t.nav.about}
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/contact');
                  }}
                  className="hover:text-[#172554]"
                >
                  {t.nav.contact}
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-[#111827]">
              {locale === 'ar' ? 'القانونية واللغة' : 'Legal & Language'}
            </p>
            <ul className="space-y-2 text-sm text-[#64748B]">
              <li>
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/terms');
                  }}
                  className="hover:text-[#172554]"
                >
                  {t.footer.terms}
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/privacy');
                  }}
                  className="hover:text-[#172554]"
                >
                  {t.footer.privacy}
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={toggleLocale}
                  className="text-sm text-[#3B82F6] hover:underline cursor-pointer"
                >
                  {t.nav.switchLang}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-[#E2E8F0] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <p>{t.footer.rights}</p>
          <p>Egypt · MENA · Global Access</p>
        </div>
      </div>
    </footer>
  );
}
