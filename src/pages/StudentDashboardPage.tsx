import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  CreditCard,
  LayoutDashboard,
  MailCheck,
  Play,
  Settings,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch } from '../lib/authToken';
import { formatCurrencyEgp, formatDurationCompact } from '../lib/domain/rules';
import type { NotificationItem, PurchaseRecord } from '../types';
import { DashboardShell, type SidebarNavItem } from '../components/layout/DashboardShell';
import {
  Button,
  EmptyState,
  InputField,
  Modal,
  ProgressBar,
  StatCard,
  StatusText,
} from '../components/ui/DesignSystem';

interface EnrolledCourseItem {
  enrollmentId: string;
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  instructorName: string;
  thumbnailUrl: string;
  categoryNameAr: string;
  categoryNameEn: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  expiresAt: string | null;
}

interface RecentLessonItem {
  lessonId: string;
  courseId: string;
  courseSlug: string;
  courseTitleAr: string;
  courseTitleEn: string;
  lessonTitleAr: string;
  lessonTitleEn: string;
  lastPositionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: string;
}

export function StudentDashboardPage({ navigate }: { navigate: (path: string) => void }) {
  const { t, locale, user, authLoading, setLocale, refreshUser, pushToast } = useApp();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const [enrollments, setEnrollments] = useState<EnrolledCourseItem[]>([]);
  const [recentLessons, setRecentLessons] = useState<RecentLessonItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [stats, setStats] = useState({
    enrolledCoursesCount: 0,
    completedLessonsCount: 0,
    totalLessonsCount: 0,
    pendingPurchasesCount: 0,
  });

  // Proof submission modal for pending purchases
  const [proofTarget, setProofTarget] = useState<PurchaseRecord | null>(null);
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');

  // Profile form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'ar' | 'en'>(locale);

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Email verification banner state
  const [sendingVerify, setSendingVerify] = useState(false);
  const [verifyPreview, setVerifyPreview] = useState<{ token: string; url?: string } | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/student/dashboard');
      if (!res.ok) return;
      const data = await res.json();
      setEnrollments(data.enrollments || []);
      setRecentLessons(data.recentLessons || []);
      setPurchases(data.purchases || []);
      setNotifications(data.notifications || []);
      if (data.stats) setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone || '');
      setPreferredLanguage(user.preferredLanguage);
      setSenderName(user.fullName);
      setSenderPhone(user.phone || '');
      void loadDashboard();
    }
  }, [user, loadDashboard]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-[#E2E8F0]" />
        <div className="h-40 animate-pulse rounded-xl bg-[#E2E8F0]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <EmptyState
          title={t.auth.loginTitle}
          description={locale === 'ar' ? 'يرجى تسجيل الدخول للوصول إلى لوحة الطالب.' : 'Please sign in to access your student dashboard.'}
          action={<Button onClick={() => navigate('/login')}>{t.nav.login}</Button>}
        />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const sidebarItems: SidebarNavItem[] = [
    { id: 'overview', label: t.student.tabs.overview, icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'courses', label: t.student.tabs.courses, icon: <BookOpen className="h-4 w-4" /> },
    { id: 'purchases', label: t.student.tabs.purchases, icon: <CreditCard className="h-4 w-4" /> },
    {
      id: 'notifications',
      label: t.student.tabs.notifications,
      icon: <Bell className="h-4 w-4" />,
      badgeCount: unreadCount,
    },
    { id: 'settings', label: t.student.tabs.settings, icon: <Settings className="h-4 w-4" /> },
  ];

  const handleMarkRead = async (id: string) => {
    await apiFetch(`/api/student/notifications/${id}/read`, {
      method: 'PATCH',
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, phone, preferredLanguage }),
    });
    if (res.ok) {
      setLocale(preferredLanguage);
      await refreshUser();
      pushToast('success', locale === 'ar' ? 'تم حفظ الإعدادات' : 'Profile settings saved');
    } else {
      pushToast('error', 'Failed to update profile');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      pushToast('error', t.auth.passwordMismatch);
      return;
    }
    setUpdatingPassword(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Failed to change password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      pushToast('success', t.auth.passwordChangedSuccess);
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleResendVerification = async () => {
    setSendingVerify(true);
    try {
      const res = await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Could not send verification email');
        return;
      }
      if (data.alreadyVerified) {
        await refreshUser();
        pushToast('success', t.auth.emailVerifiedSuccess);
        return;
      }
      if (data.verificationToken) {
        setVerifyPreview({ token: data.verificationToken, url: data.verificationUrl });
        pushToast('info', t.auth.verifyEmailPreviewNotice);
      } else {
        setVerifyPreview(null);
        pushToast('success', t.auth.verifyEmailSentNotice);
      }
    } finally {
      setSendingVerify(false);
    }
  };

  const handleProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofTarget) return;
    const res = await apiFetch(`/api/student/purchases/${proofTarget.id}/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderName, senderPhone, transactionRef, notes }),
    });
    const data = await res.json();
    if (!res.ok) {
      pushToast('error', data.error || 'Submission failed');
      return;
    }
    pushToast('success', t.course.proofSubmittedNotice);
    setProofTarget(null);
    setTransactionRef('');
    setNotes('');
    await loadDashboard();
  };

  const renderStatusTone = (status: PurchaseRecord['status']) => {
    if (status === 'approved') return 'success';
    if (status === 'rejected' || status === 'cancelled') return 'danger';
    return 'warning';
  };

  return (
    <DashboardShell
      title={t.student.title}
      breadcrumb={`${t.student.title} / ${sidebarItems.find((i) => i.id === activeTab)?.label ?? ''}`}
      items={sidebarItems}
      activeId={activeTab}
      onSelect={setActiveTab}
      navigate={navigate}
    >
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-28 rounded-xl border border-[#E2E8F0] bg-white animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {!user.emailVerified && (
            <div className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <MailCheck className="h-5 w-5 text-[#B45309] shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm font-medium text-[#92400E]">
                    {t.auth.emailUnverifiedBanner}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={sendingVerify}
                    onClick={() => void handleResendVerification()}
                  >
                    {t.auth.resendVerifyBtn}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate('/verify-email')}
                  >
                    {t.auth.verifyNowBtn}
                  </Button>
                </div>
              </div>
              {verifyPreview && (
                <div className="rounded-lg border border-[#FDE68A] bg-white p-3 text-xs space-y-1.5">
                  <p className="text-[#92400E] font-medium">{t.auth.verifyEmailPreviewNotice}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono-num bg-[#F8FAFC] border border-[#E2E8F0] rounded px-2 py-1 text-[#172554] break-all select-all">
                      {verifyPreview.token}
                    </code>
                    <Button
                      size="sm"
                      variant="navy"
                      onClick={() => {
                        window.history.pushState({}, '', `/verify-email?token=${encodeURIComponent(verifyPreview.token)}`);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                    >
                      {t.auth.verifyNowBtn}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-[#172554]">
                    {t.student.welcome} {user.fullName}
                  </h1>
                  <p className="mt-1 text-sm text-[#64748B]">
                    {locale === 'ar'
                      ? 'تابع تقدمك في دوراتك المفعّلة أو استعرض المسارات الجديدة.'
                      : 'Resume your active courses or inspect pending payment verifications.'}
                  </p>
                </div>
                <Button variant="primary" onClick={() => navigate('/courses')}>
                  {t.student.browseCatalog}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label={t.student.stats.enrolled} value={stats.enrolledCoursesCount} />
                <StatCard
                  label={t.student.stats.completedLessons}
                  value={`${stats.completedLessonsCount} / ${stats.totalLessonsCount}`}
                />
                <StatCard label={t.student.stats.pendingOrders} value={stats.pendingPurchasesCount} />
              </div>

              {/* Continue Learning */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-[#172554]">{t.student.continueLearning}</h2>
                {enrollments.length === 0 ? (
                  <EmptyState
                    title={t.student.noCoursesTitle}
                    description={t.student.noCoursesBody}
                    action={
                      <Button variant="primary" onClick={() => navigate('/courses')}>
                        {t.student.browseCatalog}
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {enrollments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[#3B82F6]">
                              {locale === 'ar' ? c.categoryNameAr : c.categoryNameEn}
                            </p>
                            <h3 className="mt-1 text-base font-bold text-[#111827] truncate">
                              {locale === 'ar' ? c.titleAr : c.titleEn}
                            </h3>
                          </div>
                          <StatusText tone="success" label={t.student.lifetimeBadge} />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-[#64748B]">
                            <span className="tabular-nums">
                              {c.completedLessons} / {c.totalLessons} {t.catalog.lessonsLabel}
                            </span>
                            <span className="font-semibold text-[#172554] tabular-nums">
                              {c.progressPercent}%
                            </span>
                          </div>
                          <ProgressBar percent={c.progressPercent} />
                        </div>

                        <Button
                          variant="navy"
                          size="sm"
                          onClick={() => navigate(`/learn/${c.slug}`)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>{t.student.openCourse}</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recently Accessed Lessons */}
              {recentLessons.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold text-[#172554]">{t.student.recentLessons}</h2>
                  <div className="rounded-xl border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0]">
                    {recentLessons.map((item) => (
                      <div
                        key={item.lessonId}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#111827]">
                            {locale === 'ar' ? item.lessonTitleAr : item.lessonTitleEn}
                          </p>
                          <p className="text-xs text-[#64748B]">
                            {locale === 'ar' ? item.courseTitleAr : item.courseTitleEn} ·{' '}
                            <span className="tabular-nums">
                              {formatDurationCompact(item.durationSeconds, locale)}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {item.completed && (
                            <StatusText
                              tone="success"
                              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                              label={t.player.completed}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(`/learn/${item.courseSlug}/${item.lessonId}`)}
                          >
                            {t.student.resumeLesson}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* MY COURSES */}
          {activeTab === 'courses' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-[#172554]">{t.student.tabs.courses}</h1>
              {enrollments.length === 0 ? (
                <EmptyState
                  title={t.student.noCoursesTitle}
                  description={t.student.noCoursesBody}
                  action={
                    <Button variant="primary" onClick={() => navigate('/courses')}>
                      {t.student.browseCatalog}
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {enrollments.map((c) => (
                    <div key={c.id} className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
                      <img
                        src={c.thumbnailUrl}
                        alt={locale === 'ar' ? c.titleAr : c.titleEn}
                        referrerPolicy="no-referrer"
                        className="aspect-[16/9] w-full object-cover"
                      />
                      <div className="p-5 space-y-4">
                        <div>
                          <p className="text-xs text-[#3B82F6]">
                            {locale === 'ar' ? c.categoryNameAr : c.categoryNameEn}
                          </p>
                          <h3 className="mt-1 text-base font-bold text-[#111827]">
                            {locale === 'ar' ? c.titleAr : c.titleEn}
                          </h3>
                        </div>
                        <ProgressBar percent={c.progressPercent} />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#64748B] tabular-nums">
                            {c.progressPercent}% · {t.student.lifetimeBadge}
                          </span>
                          <Button size="sm" variant="primary" onClick={() => navigate(`/learn/${c.slug}`)}>
                            {t.student.openCourse}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PURCHASES */}
          {activeTab === 'purchases' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-[#172554]">{t.student.tabs.purchases}</h1>
              {purchases.length === 0 ? (
                <EmptyState
                  title={locale === 'ar' ? 'لا توجد طلبات شراء بعد' : 'No purchase records yet'}
                  description={t.student.noCoursesBody}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
                  <table className="w-full text-start text-sm">
                    <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                      <tr>
                        <th className="px-4 py-3 text-start">{locale === 'ar' ? 'المرجع' : 'Reference'}</th>
                        <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الدورة' : 'Course'}</th>
                        <th className="px-4 py-3 text-start">{locale === 'ar' ? 'المبلغ' : 'Amount'}</th>
                        <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                        <th className="px-4 py-3 text-start">{locale === 'ar' ? 'إجراء' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {purchases.map((p) => (
                        <tr key={p.id} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 font-mono-num text-xs text-[#172554]">
                            {p.referenceCode}
                          </td>
                          <td className="px-4 py-3 font-medium text-[#111827]">
                            {locale === 'ar' ? p.courseTitleAr : p.courseTitleEn}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-[#111827]">
                            {formatCurrencyEgp(p.amountEgp, locale)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusText tone={renderStatusTone(p.status)} label={t.status[p.status]} />
                            {p.reviewNote && (
                              <p className="mt-1 text-xs text-[#64748B]">{p.reviewNote}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {p.status === 'pending' && (
                              <Button size="sm" variant="primary" onClick={() => setProofTarget(p)}>
                                {t.course.submitProofBtn}
                              </Button>
                            )}
                            {p.status === 'approved' && p.courseSlug && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => navigate(`/learn/${p.courseSlug}`)}
                              >
                                {t.student.openCourse}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-[#172554]">{t.student.tabs.notifications}</h1>
              <div className="rounded-xl border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0]">
                {notifications.length === 0 ? (
                  <p className="p-6 text-sm text-[#64748B]">
                    {locale === 'ar' ? 'لا توجد إشعارات حالياً.' : 'No notifications yet.'}
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-5 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[#111827]">
                          {locale === 'ar' ? n.titleAr : n.titleEn}
                        </p>
                        <p className="text-xs text-[#64748B]">
                          {locale === 'ar' ? n.bodyAr : n.bodyEn}
                        </p>
                      </div>
                      {!n.isRead && (
                        <Button size="sm" variant="ghost" onClick={() => void handleMarkRead(n.id)}>
                          {locale === 'ar' ? 'تمت القراءة' : 'Mark read'}
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ACCOUNT SETTINGS */}
          {activeTab === 'settings' && (
            <div className="max-w-xl space-y-6">
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 space-y-5">
                <h1 className="text-xl font-bold text-[#172554]">{t.student.tabs.settings}</h1>
                <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-4">
                  <InputField
                    label={t.auth.fullName}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                  <InputField
                    label={t.auth.phone}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <div className="space-y-1.5">
                    <label htmlFor="pref-lang" className="block text-sm font-medium text-[#111827]">
                      {locale === 'ar' ? 'اللغة المفضلة' : 'Preferred Language'}
                    </label>
                    <select
                      id="pref-lang"
                      value={preferredLanguage}
                      onChange={(e) => setPreferredLanguage(e.target.value as 'ar' | 'en')}
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm"
                    >
                      <option value="ar">العربية (RTL)</option>
                      <option value="en">English (LTR)</option>
                    </select>
                  </div>
                  <Button type="submit" variant="navy">
                    {t.student.saveSettings}
                  </Button>
                </form>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 space-y-5">
                <h2 className="text-lg font-bold text-[#172554]">{t.auth.changePasswordTitle}</h2>
                <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-4">
                  <InputField
                    label={t.auth.currentPassword}
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <InputField
                    label={t.auth.newPassword}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <InputField
                    label={t.auth.confirmPassword}
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <Button type="submit" variant="primary" disabled={updatingPassword}>
                    {t.auth.updatePasswordBtn}
                  </Button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submit Payment Proof Modal */}
      <Modal
        open={Boolean(proofTarget)}
        onClose={() => setProofTarget(null)}
        title={t.course.submitProofBtn}
      >
        {proofTarget && (
          <form onSubmit={(e) => void handleProofSubmit(e)} className="space-y-4">
            <p className="text-xs font-mono-num text-[#64748B]">
              {proofTarget.referenceCode} · {formatCurrencyEgp(proofTarget.amountEgp, locale)}
            </p>
            <InputField
              label={t.course.senderName}
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              required
            />
            <InputField
              label={t.course.senderPhone}
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              required
            />
            <InputField
              label={t.course.transactionRef}
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              required
            />
            <InputField
              label={t.course.notes}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="submit" variant="primary" className="w-full">
              {t.course.confirmSubmitProof}
            </Button>
          </form>
        )}
      </Modal>
    </DashboardShell>
  );
}
