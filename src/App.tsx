import React, { useCallback, useEffect, useState } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { PublicFooter, PublicNavbar } from './components/layout/PublicLayout';
import { ToastContainer } from './components/ui/DesignSystem';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { CourseDetailsPage } from './pages/CourseDetailsPage';
import { AboutPage, ContactPage, LegalPage } from './pages/StaticPages';
import { AuthPages } from './pages/AuthPages';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { CoursePlayerPage } from './pages/CoursePlayerPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

function RouterView() {
  const { toasts, dismissToast } = useApp();
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (nextPath !== window.location.pathname) {
      window.history.pushState({}, '', nextPath);
      setPath(nextPath);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const isDashboardOrPlayer =
    path.startsWith('/student') ||
    path.startsWith('/admin') ||
    path.startsWith('/learn');

  let content: React.ReactNode;

  if (path === '/' || path === '') {
    content = <HomePage navigate={navigate} />;
  } else if (path === '/courses') {
    content = <CatalogPage navigate={navigate} />;
  } else if (path.startsWith('/categories/')) {
    const catSlug = path.replace('/categories/', '').split('/')[0];
    content = <CatalogPage initialCategory={catSlug} navigate={navigate} />;
  } else if (path.startsWith('/courses/')) {
    const courseSlug = path.replace('/courses/', '').split('/')[0];
    content = <CourseDetailsPage slug={courseSlug} navigate={navigate} />;
  } else if (path === '/about') {
    content = <AboutPage navigate={navigate} />;
  } else if (path === '/contact') {
    content = <ContactPage />;
  } else if (path === '/terms') {
    content = <LegalPage type="terms" />;
  } else if (path === '/privacy') {
    content = <LegalPage type="privacy" />;
  } else if (path === '/login') {
    content = <AuthPages mode="login" navigate={navigate} />;
  } else if (path === '/register') {
    content = <AuthPages mode="register" navigate={navigate} />;
  } else if (path === '/forgot-password') {
    content = <AuthPages mode="forgot" navigate={navigate} />;
  } else if (path === '/verify-email') {
    content = <AuthPages mode="verify" navigate={navigate} />;
  } else if (path.startsWith('/student')) {
    content = <StudentDashboardPage navigate={navigate} />;
  } else if (path.startsWith('/admin')) {
    content = <AdminDashboardPage navigate={navigate} />;
  } else if (path.startsWith('/learn/')) {
    const parts = path.replace('/learn/', '').split('/').filter(Boolean);
    content = <CoursePlayerPage slug={parts[0] || ''} lessonId={parts[1]} navigate={navigate} />;
  } else {
    content = <HomePage navigate={navigate} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#111827]">
      {!isDashboardOrPlayer && <PublicNavbar currentPath={path} navigate={navigate} />}
      <div className="flex-1">{content}</div>
      {!isDashboardOrPlayer && <PublicFooter navigate={navigate} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RouterView />
    </AppProvider>
  );
}
