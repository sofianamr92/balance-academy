import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Film,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch } from '../lib/authToken';
import { formatCurrencyEgp } from '../lib/domain/rules';
import type { Category, CourseDetail, EnrollmentRecord, PurchaseRecord, RoleName, UserProfile } from '../types';
import { DashboardShell, type SidebarNavItem } from '../components/layout/DashboardShell';
import {
  Button,
  EmptyState,
  InputField,
  Modal,
  StatCard,
  StatusText,
} from '../components/ui/DesignSystem';

interface AdminOverview {
  studentsCount: number;
  totalUsersCount?: number;
  publishedCoursesCount: number;
  totalCoursesCount: number;
  totalLessonsCount: number;
  pendingPaymentsCount?: number;
  confirmedRevenueEgp?: number;
  activeEnrollmentsCount?: number;
  activeWatchSessionsCount?: number;
  contactMessagesCount?: number;
  reviewsCount?: number;
  recentRegistrations?: Array<{
    id: string;
    fullName: string;
    email: string;
    role: RoleName;
    isActive: boolean;
    createdAt: string;
  }>;
}

interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

interface AdminReviewRow {
  id: string;
  courseId: string;
  courseTitleAr: string;
  courseTitleEn: string;
  studentName: string;
  studentEmail: string;
  rating: number;
  comment: string;
  isPublished: boolean;
  createdAt: string;
}

interface VideoAssetRow {
  id: string;
  title: string;
  r2ObjectKey: string;
  hlsDirectory: string;
  durationSeconds: number;
  status: string;
  linkedLessonsCount: number;
  createdAt: string;
}

interface WatchSessionRow {
  id: string;
  studentName: string;
  studentEmail: string;
  lessonTitleAr: string;
  lessonTitleEn: string;
  ipAddress: string;
  isRevoked: boolean;
  expiresAt: string;
  createdAt: string;
}

interface SecurityLogRow {
  id: string;
  userEmail: string | null;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  ipAddress: string;
  details: string;
  createdAt: string;
}

interface AuditLogRow {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string;
  createdAt: string;
}

interface ReportsData {
  totalStudents: number;
  activeStudents: number;
  publishedCourses: number;
  totalPurchases: number;
  pendingPayments: number;
  confirmedRevenueEgp: number;
  bestSellingCourses: Array<{
    id: string;
    titleAr: string;
    titleEn: string;
    approvedSales: number;
    revenueEgp: number;
  }>;
  courseCompletions: Array<{
    id: string;
    titleAr: string;
    titleEn: string;
    enrolledCount: number;
    lessonsCount: number;
    completionRatePercent: number;
  }>;
}

export function AdminDashboardPage({ navigate }: { navigate: (path: string) => void }) {
  const { t, locale, user, authLoading, pushToast } = useApp();
  const [section, setSection] = useState('overview');

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [courses, setCourses] = useState<CourseDetail[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assets, setAssets] = useState<VideoAssetRow[]>([]);
  const [students, setStudents] = useState<Array<UserProfile & { activeEnrollmentsCount: number }>>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [sessions, setSessions] = useState<WatchSessionRow[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [emailService, setEmailService] = useState<{
    provider: string;
    configured: boolean;
    fromAddress: string;
  } | null>(null);
  const [contactMessages, setContactMessages] = useState<ContactMessageRow[]>([]);
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | RoleName>('all');

  // Date filter for Reports
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modals
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({
    slug: '',
    categoryId: 'cat-video-editing',
    titleAr: '',
    titleEn: '',
    subtitleAr: '',
    subtitleEn: '',
    descriptionAr: '',
    descriptionEn: '',
    instructorName: 'BALANCE Studio',
    priceEgp: 1500,
    level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    thumbnailUrl: '/src/assets/images/course_video_editing_1794993398055.jpg',
    isPublished: true,
    isFeatured: false,
  });

  const [lessonModalCourse, setLessonModalCourse] = useState<CourseDetail | null>(null);
  const [newLesson, setNewLesson] = useState({
    moduleId: '',
    titleAr: '',
    titleEn: '',
    descriptionAr: '',
    descriptionEn: '',
    durationSeconds: 420,
    isFreePreview: false,
    videoAssetId: 'asset-ve-01',
    attachmentName: '',
  });

  const [newModuleTitleAr, setNewModuleTitleAr] = useState('');
  const [newModuleTitleEn, setNewModuleTitleEn] = useState('');

  const [newCat, setNewCat] = useState({
    slug: '',
    nameAr: '',
    nameEn: '',
    descriptionAr: '',
    descriptionEn: '',
  });

  const [newAssetTitle, setNewAssetTitle] = useState('');

  const [verifyTarget, setVerifyTarget] = useState<PurchaseRecord | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const [grantForm, setGrantForm] = useState({ studentId: '', courseId: '' });

  const isSuperAdmin = user?.role === 'super_admin';
  const isStaff = user?.role === 'super_admin' || user?.role === 'content_manager';

  const loadSectionData = useCallback(async () => {
    if (!isStaff) return;

    const ovRes = await apiFetch('/api/admin/overview', { credentials: 'include' });
    if (ovRes.ok) setOverview((await ovRes.json()).overview);

    const [crsRes, catRes, astRes] = await Promise.all([
      apiFetch('/api/admin/courses', { credentials: 'include' }),
      apiFetch('/api/admin/categories', { credentials: 'include' }),
      apiFetch('/api/admin/video-assets', { credentials: 'include' }),
    ]);
    if (crsRes.ok) setCourses((await crsRes.json()).courses || []);
    if (catRes.ok) setCategories((await catRes.json()).categories || []);
    if (astRes.ok) setAssets((await astRes.json()).assets || []);

    if (isSuperAdmin) {
      const [stuRes, purRes, enrRes, sesRes, logRes, repRes, setRes, msgRes, revRes] = await Promise.all([
        apiFetch('/api/admin/students', { credentials: 'include' }),
        apiFetch('/api/admin/purchases', { credentials: 'include' }),
        apiFetch('/api/admin/enrollments', { credentials: 'include' }),
        apiFetch('/api/admin/sessions', { credentials: 'include' }),
        apiFetch('/api/admin/security-logs', { credentials: 'include' }),
        apiFetch(`/api/admin/reports?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`, {
          credentials: 'include',
        }),
        apiFetch('/api/admin/settings', { credentials: 'include' }),
        apiFetch('/api/admin/contact-messages', { credentials: 'include' }),
        apiFetch('/api/admin/reviews', { credentials: 'include' }),
      ]);
      if (stuRes.ok) setStudents((await stuRes.json()).users || []);
      if (purRes.ok) setPurchases((await purRes.json()).purchases || []);
      if (enrRes.ok) setEnrollments((await enrRes.json()).enrollments || []);
      if (sesRes.ok) setSessions((await sesRes.json()).sessions || []);
      if (logRes.ok) {
        const d = await logRes.json();
        setSecurityLogs(d.securityLogs || []);
        setAuditLogs(d.auditLogs || []);
      }
      if (repRes.ok) setReports((await repRes.json()).reports || null);
      if (setRes.ok) {
        const setBody = await setRes.json();
        setSettings(setBody.settings || {});
        setEmailService(setBody.emailService || null);
      }
      if (msgRes.ok) setContactMessages((await msgRes.json()).messages || []);
      if (revRes.ok) setReviews((await revRes.json()).reviews || []);
    }
  }, [isStaff, isSuperAdmin, dateFrom, dateTo]);

  useEffect(() => {
    void loadSectionData();
  }, [loadSectionData]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 space-y-4">
        <div className="h-10 w-72 animate-pulse rounded-lg bg-[#E2E8F0]" />
        <div className="h-48 animate-pulse rounded-xl bg-[#E2E8F0]" />
      </div>
    );
  }

  if (!user || !isStaff) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          title={locale === 'ar' ? 'صلاحية إدارية مطلوبة' : 'Administrative Access Required'}
          description={
            locale === 'ar'
              ? 'هذه المنطقة مخصصة للمدير العام ومديري المحتوى فقط.'
              : 'This console is restricted to Super Admin and Content Manager accounts.'
          }
          action={<Button onClick={() => navigate('/login')}>{t.nav.login}</Button>}
        />
      </div>
    );
  }

  const pendingVerificationCount = purchases.filter(
    (p) => p.status === 'proof_submitted' || p.status === 'pending',
  ).length;

  const sidebarItems: SidebarNavItem[] = [
    { id: 'overview', label: t.admin.sections.overview, icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'courses', label: t.admin.sections.courses, icon: <BookOpen className="h-4 w-4" /> },
    { id: 'categories', label: t.admin.sections.categories, icon: <FolderKanban className="h-4 w-4" /> },
    { id: 'assets', label: t.admin.sections.assets, icon: <Film className="h-4 w-4" /> },
    ...(isSuperAdmin
      ? [
          {
            id: 'verification',
            label: t.admin.sections.verification,
            icon: <CreditCard className="h-4 w-4" />,
            badgeCount: pendingVerificationCount,
          },
          { id: 'enrollments', label: t.admin.sections.enrollments, icon: <KeyRound className="h-4 w-4" /> },
          { id: 'students', label: t.admin.sections.students, icon: <Users className="h-4 w-4" /> },
          {
            id: 'messages',
            label: t.admin.sections.messages,
            icon: <MessageSquare className="h-4 w-4" />,
            badgeCount: contactMessages.length,
          },
          { id: 'sessions', label: t.admin.sections.sessions, icon: <Activity className="h-4 w-4" /> },
          { id: 'security', label: t.admin.sections.security, icon: <ShieldAlert className="h-4 w-4" /> },
          { id: 'reports', label: t.admin.sections.reports, icon: <BarChart3 className="h-4 w-4" /> },
          { id: 'settings', label: t.admin.sections.settings, icon: <Settings className="h-4 w-4" /> },
        ]
      : []),
  ];

  // Handlers
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(newCourse),
    });
    const data = await res.json();
    if (!res.ok) {
      pushToast('error', data.error || 'Could not create course');
      return;
    }
    pushToast('success', locale === 'ar' ? 'تم إنشاء الدورة بنجاح' : 'Course created');
    setCourseModalOpen(false);
    await loadSectionData();
  };

  const handleTogglePublish = async (course: CourseDetail) => {
    const res = await apiFetch(`/api/admin/courses/${course.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isPublished: !course.isPublished }),
    });
    if (res.ok) {
      pushToast('success', locale === 'ar' ? 'تم تحديث حالة النشر' : 'Publication status updated');
      await loadSectionData();
    }
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonModalCourse) return;
    const res = await apiFetch('/api/admin/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        courseId: lessonModalCourse.id,
        titleAr: newModuleTitleAr,
        titleEn: newModuleTitleEn,
        sortOrder: (lessonModalCourse.modules?.length || 0) + 1,
      }),
    });
    if (res.ok) {
      setNewModuleTitleAr('');
      setNewModuleTitleEn('');
      pushToast('success', locale === 'ar' ? 'تمت إضافة الوحدة' : 'Module added');
      await loadSectionData();
      setLessonModalCourse(null);
    }
  };

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonModalCourse) return;
    const targetModId = newLesson.moduleId || lessonModalCourse.modules?.[0]?.id;
    if (!targetModId) {
      pushToast('error', locale === 'ar' ? 'أنشئ وحدة أولاً' : 'Create a module first');
      return;
    }
    const res = await apiFetch('/api/admin/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ...newLesson,
        moduleId: targetModId,
        courseId: lessonModalCourse.id,
        sortOrder: 10,
      }),
    });
    if (res.ok) {
      pushToast('success', locale === 'ar' ? 'تمت إضافة الدرس' : 'Lesson added');
      setLessonModalCourse(null);
      await loadSectionData();
    }
  };

  const handleVerifyDecision = async (decision: 'approve' | 'reject') => {
    if (!verifyTarget) return;
    const res = await apiFetch(`/api/admin/purchases/${verifyTarget.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ decision, reviewNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      pushToast('error', data.error || 'Verification failed');
      return;
    }
    pushToast(
      'success',
      decision === 'approve'
        ? locale === 'ar'
          ? 'تم اعتماد الدفع وتفعيل الوصول مدى الحياة'
          : 'Payment approved and lifetime enrollment granted'
        : locale === 'ar'
        ? 'تم رفض الطلب'
        : 'Payment rejected',
    );
    setVerifyTarget(null);
    setReviewNote('');
    await loadSectionData();
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...newCat, sortOrder: categories.length + 1 }),
    });
    if (res.ok) {
      setNewCat({ slug: '', nameAr: '', nameEn: '', descriptionAr: '', descriptionEn: '' });
      pushToast('success', locale === 'ar' ? 'تمت إضافة التخصص' : 'Category created');
      await loadSectionData();
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/video-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: newAssetTitle }),
    });
    if (res.ok) {
      setNewAssetTitle('');
      pushToast('success', locale === 'ar' ? 'تم تجهيز أصل الفيديو HLS' : 'Private HLS video asset synthesized');
      await loadSectionData();
    }
  };

  const handleGrantEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/enrollments/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(grantForm),
    });
    if (res.ok) {
      pushToast('success', locale === 'ar' ? 'تم منح الوصول مدى الحياة' : 'Lifetime access granted');
      await loadSectionData();
    }
  };

  const handleRevokeEnrollment = async (id: string) => {
    const res = await apiFetch(`/api/admin/enrollments/${id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason: 'Revoked by administrator' }),
    });
    if (res.ok) {
      pushToast('info', locale === 'ar' ? 'تم إلغاء الاشتراك' : 'Enrollment revoked');
      await loadSectionData();
    }
  };

  const handleRevokeSession = async (id: string) => {
    const res = await apiFetch(`/api/admin/sessions/${id}/revoke`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      pushToast('info', locale === 'ar' ? 'تم إنهاء جلسة المشاهدة' : 'Watch session revoked');
      await loadSectionData();
    }
  };

  const handleToggleUserStatus = async (u: UserProfile) => {
    const res = await apiFetch(`/api/admin/users/${u.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    if (res.ok) {
      pushToast('success', locale === 'ar' ? 'تم تحديث حالة المستخدم' : 'User status updated');
      await loadSectionData();
    } else {
      const data = await res.json().catch(() => ({}));
      pushToast('error', data.error || 'Could not update user status');
    }
  };

  const handleChangeUserRole = async (u: UserProfile, nextRole: RoleName) => {
    if (u.role === nextRole) return;
    const res = await apiFetch(`/api/admin/users/${u.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role: nextRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      pushToast('success', locale === 'ar' ? 'تم تحديث صلاحية المستخدم' : 'User role updated');
      await loadSectionData();
    } else {
      pushToast('error', data.error || 'Could not update role');
    }
  };

  const handleToggleReviewPublish = async (review: AdminReviewRow) => {
    const res = await apiFetch(`/api/admin/reviews/${review.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isPublished: !review.isPublished }),
    });
    if (res.ok) {
      pushToast('success', locale === 'ar' ? 'تم تحديث حالة نشر التقييم' : 'Review visibility updated');
      await loadSectionData();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ settings }),
    });
    if (res.ok) {
      pushToast('success', locale === 'ar' ? 'تم حفظ إعدادات المنصة' : 'Settings updated');
    }
  };

  return (
    <DashboardShell
      title={t.admin.roleLabels[user.role]}
      breadcrumb={`${t.admin.title} / ${sidebarItems.find((i) => i.id === section)?.label ?? ''}`}
      items={sidebarItems}
      activeId={section}
      onSelect={setSection}
      navigate={navigate}
    >
      <div className="space-y-6">
        <p className="text-xs text-[#64748B]">{t.admin.demoBanner}</p>

        {/* OVERVIEW */}
        {section === 'overview' && overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t.admin.sections.students} value={overview.studentsCount} />
              <StatCard
                label={locale === 'ar' ? 'الدورات المنشورة' : 'Published Courses'}
                value={`${overview.publishedCoursesCount} / ${overview.totalCoursesCount}`}
              />
              {isSuperAdmin ? (
                <>
                  <StatCard
                    label={locale === 'ar' ? 'مدفوعات قيد المراجعة' : 'Pending Verification'}
                    value={overview.pendingPaymentsCount ?? 0}
                  />
                  <StatCard
                    label={locale === 'ar' ? 'الإيرادات المؤكدة' : 'Confirmed Revenue'}
                    value={formatCurrencyEgp(overview.confirmedRevenueEgp ?? 0, locale)}
                  />
                </>
              ) : (
                <>
                  <StatCard label={locale === 'ar' ? 'إجمالي الدروس' : 'Total Lessons'} value={overview.totalLessonsCount} />
                  <StatCard label={t.admin.sections.assets} value={assets.length} />
                </>
              )}
            </div>

            {isSuperAdmin && overview.recentRegistrations && overview.recentRegistrations.length > 0 && (
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#172554]">
                    {locale === 'ar' ? 'أحدث المسجلين على المنصة' : 'Recent Platform Registrations'}
                  </h2>
                  <Button size="sm" variant="secondary" onClick={() => setSection('students')}>
                    {locale === 'ar' ? 'إدارة المستخدمين' : 'Manage Users'}
                  </Button>
                </div>
                <div className="divide-y divide-[#E2E8F0]">
                  {overview.recentRegistrations.map((u) => (
                    <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-[#111827]">{u.fullName}</p>
                        <p className="text-xs text-[#64748B] font-mono-num">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="rounded-md bg-[#F1F5F9] px-2 py-1 text-[#172554] font-medium">
                          {t.admin.roleLabels[u.role]}
                        </span>
                        <span className="font-mono-num text-[#64748B]">{u.createdAt.slice(0, 10)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isSuperAdmin && purchases.length > 0 && (
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#172554]">
                    {t.admin.sections.verification}
                  </h2>
                  <Button size="sm" variant="secondary" onClick={() => setSection('verification')}>
                    {locale === 'ar' ? 'عرض الكل' : 'View All'}
                  </Button>
                </div>
                <div className="divide-y divide-[#E2E8F0]">
                  {purchases.slice(0, 3).map((p) => (
                    <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-[#111827]">{p.studentName}</p>
                        <p className="text-xs text-[#64748B] font-mono-num">
                          {p.referenceCode} · {locale === 'ar' ? p.courseTitleAr : p.courseTitleEn}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusText
                          tone={p.status === 'approved' ? 'success' : p.status === 'rejected' ? 'danger' : 'warning'}
                          label={t.status[p.status]}
                        />
                        {(p.status === 'proof_submitted' || p.status === 'pending') && (
                          <Button size="sm" variant="primary" onClick={() => setVerifyTarget(p)}>
                            {locale === 'ar' ? 'مراجعة' : 'Review'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COURSES & MODULES & LESSONS */}
        {section === 'courses' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-[#172554]">{t.admin.sections.courses}</h1>
              <Button variant="primary" onClick={() => setCourseModalOpen(true)}>
                <Plus className="h-4 w-4" />
                <span>{t.admin.createCourse}</span>
              </Button>
            </div>

            <div className="space-y-4">
              {courses.map((c) => (
                <div key={c.id} className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                        <span>{locale === 'ar' ? c.categoryNameAr : c.categoryNameEn}</span>
                        <span>·</span>
                        <span className="font-mono-num">{formatCurrencyEgp(c.priceEgp, locale)}</span>
                        <span>·</span>
                        <span>{c.lessonsCount} {t.catalog.lessonsLabel}</span>
                      </div>
                      <h2 className="mt-1 text-base font-bold text-[#172554]">
                        {locale === 'ar' ? c.titleAr : c.titleEn}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusText
                        tone={c.isPublished ? 'success' : 'neutral'}
                        label={c.isPublished ? (locale === 'ar' ? 'منشورة' : 'Published') : (locale === 'ar' ? 'مسودة' : 'Draft')}
                      />
                      <Button size="sm" variant="secondary" onClick={() => void handleTogglePublish(c)}>
                        {c.isPublished ? t.admin.unpublish : t.admin.publish}
                      </Button>
                      <Button
                        size="sm"
                        variant="navy"
                        onClick={() => {
                          setLessonModalCourse(c);
                          setNewLesson((prev) => ({
                            ...prev,
                            moduleId: c.modules?.[0]?.id || '',
                          }));
                        }}
                      >
                        {locale === 'ar' ? 'إدارة الوحدات والدروس' : 'Modules & Lessons'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CATEGORIES */}
        {section === 'categories' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="border-b border-[#E2E8F0] px-5 py-4">
                <h1 className="text-base font-bold text-[#172554]">{t.admin.sections.categories}</h1>
              </div>
              <div className="divide-y divide-[#E2E8F0]">
                {categories.map((cat) => (
                  <div key={cat.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">
                        {locale === 'ar' ? cat.nameAr : cat.nameEn}
                      </p>
                      <p className="text-xs font-mono-num text-[#64748B]">{cat.slug}</p>
                    </div>
                    <span className="text-xs text-[#64748B] tabular-nums">
                      {cat.courseCount ?? 0} {locale === 'ar' ? 'دورة' : 'courses'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-4">
              <h2 className="text-base font-bold text-[#172554]">
                {locale === 'ar' ? 'إضافة تخصص جديد' : 'Add Category'}
              </h2>
              <form onSubmit={(e) => void handleCreateCategory(e)} className="space-y-3">
                <InputField
                  label="Slug"
                  value={newCat.slug}
                  onChange={(e) => setNewCat((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="motion-design"
                  required
                />
                <InputField
                  label={locale === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}
                  value={newCat.nameAr}
                  onChange={(e) => setNewCat((p) => ({ ...p, nameAr: e.target.value }))}
                  required
                />
                <InputField
                  label={locale === 'ar' ? 'الاسم بالإنجليزية' : 'English Name'}
                  value={newCat.nameEn}
                  onChange={(e) => setNewCat((p) => ({ ...p, nameEn: e.target.value }))}
                  required
                />
                <InputField
                  label={locale === 'ar' ? 'الوصف بالعربية' : 'Arabic Description'}
                  value={newCat.descriptionAr}
                  onChange={(e) => setNewCat((p) => ({ ...p, descriptionAr: e.target.value }))}
                  required
                />
                <InputField
                  label={locale === 'ar' ? 'الوصف بالإنجليزية' : 'English Description'}
                  value={newCat.descriptionEn}
                  onChange={(e) => setNewCat((p) => ({ ...p, descriptionEn: e.target.value }))}
                  required
                />
                <Button type="submit" variant="primary">
                  {locale === 'ar' ? 'حفظ التخصص' : 'Save Category'}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* VIDEO ASSETS */}
        {section === 'assets' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <h1 className="text-base font-bold text-[#172554] mb-3">{t.admin.sections.assets}</h1>
              <form onSubmit={(e) => void handleCreateAsset(e)} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={newAssetTitle}
                  onChange={(e) => setNewAssetTitle(e.target.value)}
                  placeholder={locale === 'ar' ? 'عنوان ملف الفيديو الجديد (ينشئ بث HLS خاص)...' : 'New private video asset title...'}
                  className="flex-1 rounded-lg border border-[#E2E8F0] px-3.5 py-2 text-sm"
                  required
                />
                <Button type="submit" variant="primary">
                  {locale === 'ar' ? 'تجهيز بث HLS محمي' : 'Generate Protected HLS Asset'}
                </Button>
              </form>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
              <table className="w-full text-sm text-start">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3 text-start">ID</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                    <th className="px-4 py-3 text-start">R2 Private Key</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-mono-num text-xs text-[#172554]">{a.id}</td>
                      <td className="px-4 py-3 font-medium text-[#111827]">{a.title}</td>
                      <td className="px-4 py-3 font-mono-num text-xs text-[#64748B]">{a.r2ObjectKey}</td>
                      <td className="px-4 py-3">
                        <StatusText tone="success" icon={<ShieldCheck className="h-3.5 w-3.5" />} label={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAYMENT VERIFICATION & PURCHASES (Super Admin) */}
        {section === 'verification' && isSuperAdmin && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-[#172554]">{t.admin.sections.verification}</h1>
            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
              <table className="w-full text-sm text-start">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'المرجع' : 'Reference'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الدورة' : 'Course'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'بيانات التحويل' : 'Transfer Proof'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'المبلغ' : 'Amount'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'قرار' : 'Decision'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-mono-num text-xs text-[#172554]">{p.referenceCode}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#111827]">{p.studentName}</p>
                        <p className="text-xs text-[#64748B]">{p.studentEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-[#111827]">
                        {locale === 'ar' ? p.courseTitleAr : p.courseTitleEn}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#64748B]">
                        {p.proofTransactionRef ? (
                          <div>
                            <p className="font-mono-num font-semibold text-[#172554]">{p.proofTransactionRef}</p>
                            <p>{p.proofSenderName} · {p.proofSenderPhone}</p>
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {formatCurrencyEgp(p.amountEgp, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText
                          tone={p.status === 'approved' ? 'success' : p.status === 'rejected' ? 'danger' : 'warning'}
                          label={t.status[p.status]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {(p.status === 'proof_submitted' || p.status === 'pending') && (
                          <Button size="sm" variant="primary" onClick={() => setVerifyTarget(p)}>
                            {locale === 'ar' ? 'مراجعة' : 'Review'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ENROLLMENTS (Super Admin) */}
        {section === 'enrollments' && isSuperAdmin && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-4">
              <h1 className="text-base font-bold text-[#172554]">{t.admin.grantAccess}</h1>
              <form onSubmit={(e) => void handleGrantEnrollment(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <select
                  value={grantForm.studentId}
                  onChange={(e) => setGrantForm((p) => ({ ...p, studentId: e.target.value }))}
                  className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                  required
                >
                  <option value="">{locale === 'ar' ? 'اختر طالباً...' : 'Select student...'}</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.email})
                    </option>
                  ))}
                </select>
                <select
                  value={grantForm.courseId}
                  onChange={(e) => setGrantForm((p) => ({ ...p, courseId: e.target.value }))}
                  className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                  required
                >
                  <option value="">{locale === 'ar' ? 'اختر دورة...' : 'Select course...'}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {locale === 'ar' ? c.titleAr : c.titleEn}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="navy">
                  {t.admin.grantAccess}
                </Button>
              </form>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
              <table className="w-full text-sm text-start">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الدورة' : 'Course'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الصلاحية' : 'Access'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {enrollments.map((enr) => (
                    <tr key={enr.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#111827]">{enr.studentName}</p>
                        <p className="text-xs text-[#64748B]">{enr.studentEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{locale === 'ar' ? enr.courseTitleAr : enr.courseTitleEn}</td>
                      <td className="px-4 py-3 text-xs font-mono-num text-[#172554]">
                        {enr.expiresAt === null ? t.student.lifetimeBadge : enr.expiresAt}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText
                          tone={enr.status === 'active' ? 'success' : 'danger'}
                          label={t.status[enr.status]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {enr.status === 'active' && (
                          <Button size="sm" variant="danger" onClick={() => void handleRevokeEnrollment(enr.id)}>
                            {t.admin.revokeAccess}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STUDENTS & USERS */}
        {section === 'students' && isSuperAdmin && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 flex flex-wrap items-center justify-between gap-3">
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={locale === 'ar' ? 'ابحث بالاسم أو البريد أو الهاتف...' : 'Search by name, email, or phone...'}
                className="flex-1 min-w-[220px] rounded-lg border border-[#E2E8F0] px-3.5 py-2 text-sm"
              />
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as 'all' | RoleName)}
                className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              >
                <option value="all">{locale === 'ar' ? 'كل الأدوار' : 'All Roles'}</option>
                <option value="student">{t.admin.roleLabels.student}</option>
                <option value="content_manager">{t.admin.roleLabels.content_manager}</option>
                <option value="super_admin">{t.admin.roleLabels.super_admin}</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
              <table className="w-full text-sm text-start">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3 text-start">{t.auth.fullName}</th>
                    <th className="px-4 py-3 text-start">{t.auth.email}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الهاتف' : 'Phone'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الصلاحية' : 'Role'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الدورات' : 'Enrollments'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'تاريخ التسجيل' : 'Joined'}</th>
                    <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {students
                    .filter((u) => {
                      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
                      const q = userSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        u.fullName.toLowerCase().includes(q) ||
                        u.email.toLowerCase().includes(q) ||
                        (u.phone || '').toLowerCase().includes(q)
                      );
                    })
                    .map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3 font-medium text-[#111827]">{u.fullName}</td>
                        <td className="px-4 py-3 font-mono-num text-xs text-[#64748B]">{u.email}</td>
                        <td className="px-4 py-3 font-mono-num text-xs text-[#64748B]">
                          <span dir="ltr" className="inline-block">{u.phone || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <select
                            aria-label={`Role for ${u.email}`}
                            value={u.role}
                            disabled={u.id === user.id}
                            onChange={(e) => void handleChangeUserRole(u, e.target.value as RoleName)}
                            className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs disabled:opacity-60"
                          >
                            <option value="student">{t.admin.roleLabels.student}</option>
                            <option value="content_manager">{t.admin.roleLabels.content_manager}</option>
                            <option value="super_admin">{t.admin.roleLabels.super_admin}</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-xs">{u.activeEnrollmentsCount}</td>
                        <td className="px-4 py-3 font-mono-num text-xs text-[#64748B]">{u.createdAt.slice(0, 10)}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="secondary" onClick={() => void handleToggleUserStatus(u)}>
                            {u.isActive ? (locale === 'ar' ? 'نشط (إيقاف)' : 'Active (Suspend)') : (locale === 'ar' ? 'موقوف (تفعيل)' : 'Suspended (Activate)')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CONTACT MESSAGES & REVIEWS */}
        {section === 'messages' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="border-b border-[#E2E8F0] px-5 py-4">
                <h1 className="text-base font-bold text-[#172554]">
                  {locale === 'ar' ? 'رسائل تواصل معنا الواردة' : 'Incoming Contact Messages'}
                </h1>
              </div>
              {contactMessages.length === 0 ? (
                <p className="p-6 text-sm text-[#64748B]">
                  {locale === 'ar' ? 'لا توجد رسائل تواصل واردة بعد.' : 'No contact messages received yet.'}
                </p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {contactMessages.map((msg) => (
                    <div key={msg.id} className="p-5 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#172554]">{msg.subject}</p>
                        <span className="font-mono-num text-xs text-[#64748B]">{msg.createdAt.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      <p className="text-xs text-[#475569]">
                        {msg.name} · <span className="font-mono-num">{msg.email}</span>
                      </p>
                      <p className="text-sm text-[#111827] pt-1">{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="border-b border-[#E2E8F0] px-5 py-4">
                <h2 className="text-base font-bold text-[#172554]">
                  {locale === 'ar' ? 'تقييمات الطلاب للدورات' : 'Student Course Reviews'}
                </h2>
              </div>
              {reviews.length === 0 ? (
                <p className="p-6 text-sm text-[#64748B]">
                  {locale === 'ar' ? 'لم يرسل الطلاب تقييمات بعد.' : 'No student reviews submitted yet.'}
                </p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="p-5 flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#172554]">
                          {locale === 'ar' ? rev.courseTitleAr : rev.courseTitleEn} · {rev.rating}/5
                        </p>
                        <p className="text-xs text-[#64748B]">
                          {rev.studentName} ({rev.studentEmail})
                        </p>
                        <p className="text-sm text-[#111827]">{rev.comment}</p>
                      </div>
                      <Button size="sm" variant={rev.isPublished ? 'secondary' : 'primary'} onClick={() => void handleToggleReviewPublish(rev)}>
                        {rev.isPublished ? t.admin.unpublish : t.admin.publish}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* WATCH SESSIONS */}
        {section === 'sessions' && isSuperAdmin && (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm text-start">
              <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#64748B]">
                <tr>
                  <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الدرس' : 'Lesson'}</th>
                  <th className="px-4 py-3 text-start">IP</th>
                  <th className="px-4 py-3 text-start">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-start">{locale === 'ar' ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium text-[#111827]">{s.studentName}</p>
                      <p className="text-[#64748B]">{s.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{locale === 'ar' ? s.lessonTitleAr : s.lessonTitleEn}</td>
                    <td className="px-4 py-3 font-mono-num text-xs text-[#64748B]">{s.ipAddress}</td>
                    <td className="px-4 py-3">
                      <StatusText
                        tone={s.isRevoked ? 'danger' : 'success'}
                        label={s.isRevoked ? t.status.revoked : t.status.active}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {!s.isRevoked && (
                        <Button size="sm" variant="danger" onClick={() => void handleRevokeSession(s.id)}>
                          {t.admin.revokeSession}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SECURITY & AUDIT LOGS */}
        {section === 'security' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#E2E8F0] px-5 py-3">
                <h2 className="text-sm font-bold text-[#172554]">Security Logs</h2>
              </div>
              <table className="w-full text-xs text-start">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]">
                  <tr>
                    <th className="px-4 py-2.5 text-start">Event</th>
                    <th className="px-4 py-2.5 text-start">User</th>
                    <th className="px-4 py-2.5 text-start">IP</th>
                    <th className="px-4 py-2.5 text-start">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {securityLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5 font-mono-num text-[#172554]">{l.eventType}</td>
                      <td className="px-4 py-2.5 text-[#64748B]">{l.userEmail || 'anonymous'}</td>
                      <td className="px-4 py-2.5 font-mono-num text-[#64748B]">{l.ipAddress}</td>
                      <td className="px-4 py-2.5 text-[#111827]">{l.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#E2E8F0] px-5 py-3">
                <h2 className="text-sm font-bold text-[#172554]">Audit Logs</h2>
              </div>
              <table className="w-full text-xs text-start">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]">
                  <tr>
                    <th className="px-4 py-2.5 text-start">Action</th>
                    <th className="px-4 py-2.5 text-start">Actor</th>
                    <th className="px-4 py-2.5 text-start">Entity</th>
                    <th className="px-4 py-2.5 text-start">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {auditLogs.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2.5 font-mono-num text-[#172554]">{a.action}</td>
                      <td className="px-4 py-2.5 text-[#64748B]">{a.actorEmail || 'system'}</td>
                      <td className="px-4 py-2.5 font-mono-num text-[#111827]">
                        {a.entityType}:{a.entityId}
                      </td>
                      <td className="px-4 py-2.5 font-mono-num text-[#64748B]">
                        {a.createdAt.slice(0, 19)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTS & ANALYTICS */}
        {section === 'reports' && isSuperAdmin && reports && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 flex flex-wrap items-end gap-4">
              <InputField
                label={locale === 'ar' ? 'من تاريخ' : 'From Date'}
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <InputField
                label={locale === 'ar' ? 'إلى تاريخ' : 'To Date'}
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              <Button variant="secondary" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                {locale === 'ar' ? 'إعادة ضبط' : 'Reset'}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label={locale === 'ar' ? 'إجمالي الطلاب' : 'Total Students'} value={reports.totalStudents} />
              <StatCard label={locale === 'ar' ? 'طلاب نشطون' : 'Active Students'} value={reports.activeStudents} />
              <StatCard label={locale === 'ar' ? 'دورات منشورة' : 'Published'} value={reports.publishedCourses} />
              <StatCard label={locale === 'ar' ? 'إجمالي الطلبات' : 'Purchases'} value={reports.totalPurchases} />
              <StatCard label={locale === 'ar' ? 'بانتظار التأكيد' : 'Pending'} value={reports.pendingPayments} />
              <StatCard
                label={locale === 'ar' ? 'الإيرادات المؤكدة' : 'Confirmed Revenue'}
                value={formatCurrencyEgp(reports.confirmedRevenueEgp, locale)}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3">
                <h2 className="text-base font-bold text-[#172554]">
                  {locale === 'ar' ? 'أفضل الدورات مبيعاً' : 'Best-Selling Courses'}
                </h2>
                <div className="divide-y divide-[#E2E8F0]">
                  {reports.bestSellingCourses.map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="truncate">{locale === 'ar' ? c.titleAr : c.titleEn}</span>
                      <span className="font-mono-num text-xs text-[#172554] shrink-0">
                        {c.approvedSales} · {formatCurrencyEgp(c.revenueEgp, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3">
                <h2 className="text-base font-bold text-[#172554]">
                  {locale === 'ar' ? 'معدلات الإتمام' : 'Course Completion Rates'}
                </h2>
                <div className="divide-y divide-[#E2E8F0]">
                  {reports.courseCompletions.map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="truncate">{locale === 'ar' ? c.titleAr : c.titleEn}</span>
                      <span className="font-mono-num text-xs font-semibold text-[#3B82F6] shrink-0">
                        {c.completionRatePercent}% ({c.enrolledCount})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {section === 'settings' && isSuperAdmin && (
          <div className="max-w-xl space-y-6">
            {emailService && (
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#172554]">
                    {locale === 'ar' ? 'خدمة إرسال البريد الإلكتروني (Resend)' : 'Transactional Email Service (Resend)'}
                  </h2>
                  <StatusText
                    tone={emailService.configured ? 'success' : 'warning'}
                    label={
                      emailService.configured
                        ? locale === 'ar'
                          ? 'مفعّل لإرسال الإيميلات الحقيقية'
                          : 'Active (Live Delivery)'
                        : locale === 'ar'
                        ? 'بانتظار ضبط EMAIL_PROVIDER_API_KEY'
                        : 'Preview Mode (Key Not Set)'
                    }
                  />
                </div>
                <p className="text-xs text-[#64748B] font-mono-num">
                  From: {emailService.fromAddress}
                </p>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  {emailService.configured
                    ? locale === 'ar'
                      ? 'يتم إرسال رسائل تأكيد البريد الإلكتروني واستعادة كلمة المرور وإشعارات قبول/رفض الدفع تلقائياً.'
                      : 'Email verification, password recovery, and payment verification emails are automatically dispatched.'
                    : locale === 'ar'
                    ? 'قم بإضافة EMAIL_PROVIDER_API_KEY و EMAIL_FROM_ADDRESS في متغيرات بيئة المشروع (Secrets) لتفعيل الإرسال المباشر لصناديق البريد.'
                    : 'Configure EMAIL_PROVIDER_API_KEY and EMAIL_FROM_ADDRESS in project secrets to dispatch live transactional emails.'}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 space-y-4">
              <h1 className="text-xl font-bold text-[#172554]">{t.admin.sections.settings}</h1>
              <form onSubmit={(e) => void handleSaveSettings(e)} className="space-y-4">
                <InputField
                  label="Vodafone Cash Number"
                  value={settings.vodafone_cash_number || ''}
                  onChange={(e) => setSettings((s) => ({ ...s, vodafone_cash_number: e.target.value }))}
                />
                <InputField
                  label="InstaPay Handle"
                  value={settings.instapay_handle || ''}
                  onChange={(e) => setSettings((s) => ({ ...s, instapay_handle: e.target.value }))}
                />
                <InputField
                  label="Bank IBAN"
                  value={settings.bank_account_iban || ''}
                  onChange={(e) => setSettings((s) => ({ ...s, bank_account_iban: e.target.value }))}
                />
                <InputField
                  label="Max Concurrent Watch Sessions"
                  type="number"
                  value={settings.max_concurrent_watch_sessions || '2'}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, max_concurrent_watch_sessions: e.target.value }))
                  }
                />
                <InputField
                  label="Support Email"
                  value={settings.support_email || ''}
                  onChange={(e) => setSettings((s) => ({ ...s, support_email: e.target.value }))}
                />
                <Button type="submit" variant="navy">
                  {t.student.saveSettings}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Create Course Modal */}
      <Modal
        open={courseModalOpen}
        onClose={() => setCourseModalOpen(false)}
        title={t.admin.createCourse}
      >
        <form onSubmit={(e) => void handleCreateCourse(e)} className="space-y-3">
          <InputField
            label="Slug"
            value={newCourse.slug}
            onChange={(e) => setNewCourse((p) => ({ ...p, slug: e.target.value }))}
            placeholder="advanced-premiere-workflow"
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-[#111827]">
              {locale === 'ar' ? 'التخصص' : 'Category'}
            </label>
            <select
              value={newCourse.categoryId}
              onChange={(e) => setNewCourse((p) => ({ ...p, categoryId: e.target.value }))}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {locale === 'ar' ? cat.nameAr : cat.nameEn}
                </option>
              ))}
            </select>
          </div>
          <InputField
            label={locale === 'ar' ? 'العنوان بالعربية' : 'Arabic Title'}
            value={newCourse.titleAr}
            onChange={(e) => setNewCourse((p) => ({ ...p, titleAr: e.target.value }))}
            required
          />
          <InputField
            label={locale === 'ar' ? 'العنوان بالإنجليزية' : 'English Title'}
            value={newCourse.titleEn}
            onChange={(e) => setNewCourse((p) => ({ ...p, titleEn: e.target.value }))}
            required
          />
          <InputField
            label={locale === 'ar' ? 'وصف مختصر بالعربية' : 'Arabic Subtitle'}
            value={newCourse.subtitleAr}
            onChange={(e) => setNewCourse((p) => ({ ...p, subtitleAr: e.target.value }))}
            required
          />
          <InputField
            label={locale === 'ar' ? 'وصف مختصر بالإنجليزية' : 'English Subtitle'}
            value={newCourse.subtitleEn}
            onChange={(e) => setNewCourse((p) => ({ ...p, subtitleEn: e.target.value }))}
            required
          />
          <InputField
            label={locale === 'ar' ? 'الوصف الكامل بالعربية' : 'Arabic Description'}
            value={newCourse.descriptionAr}
            onChange={(e) => setNewCourse((p) => ({ ...p, descriptionAr: e.target.value }))}
            required
          />
          <InputField
            label={locale === 'ar' ? 'الوصف الكامل بالإنجليزية' : 'English Description'}
            value={newCourse.descriptionEn}
            onChange={(e) => setNewCourse((p) => ({ ...p, descriptionEn: e.target.value }))}
            required
          />
          <InputField
            label={locale === 'ar' ? 'السعر (EGP)' : 'Price (EGP)'}
            type="number"
            value={newCourse.priceEgp}
            onChange={(e) => setNewCourse((p) => ({ ...p, priceEgp: Number(e.target.value) }))}
            required
          />
          <Button type="submit" variant="primary" className="w-full">
            {t.admin.createCourse}
          </Button>
        </form>
      </Modal>

      {/* Modules & Lessons Modal */}
      <Modal
        open={Boolean(lessonModalCourse)}
        onClose={() => setLessonModalCourse(null)}
        title={lessonModalCourse ? (locale === 'ar' ? lessonModalCourse.titleAr : lessonModalCourse.titleEn) : ''}
      >
        {lessonModalCourse && (
          <div className="space-y-6">
            {/* Existing Curriculum */}
            <div className="space-y-3 border-b border-[#E2E8F0] pb-4">
              <p className="text-sm font-bold text-[#172554]">
                {locale === 'ar' ? 'الوحدات والدروس الحالية' : 'Current Curriculum'}
              </p>
              {lessonModalCourse.modules?.length === 0 ? (
                <p className="text-xs text-[#64748B]">
                  {locale === 'ar' ? 'لا توجد وحدات بعد.' : 'No modules yet.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {lessonModalCourse.modules?.map((mod) => (
                    <div key={mod.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2">
                      <p className="text-xs font-bold text-[#172554]">
                        {locale === 'ar' ? mod.titleAr : mod.titleEn}
                      </p>
                      <div className="space-y-1.5">
                        {mod.lessons.map((l, idx) => (
                          <div
                            key={l.id}
                            className="flex items-center justify-between gap-2 rounded bg-white px-2.5 py-2 border border-[#E2E8F0] text-xs"
                          >
                            <span className="truncate font-medium text-[#111827]">
                              {locale === 'ar' ? l.titleAr : l.titleEn}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/lessons/${l.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({ isFreePreview: !l.isFreePreview }),
                                  });
                                  await loadSectionData();
                                  setLessonModalCourse(null);
                                }}
                                className="rounded border border-[#E2E8F0] px-2 py-1 text-[11px] hover:bg-[#F8FAFC] cursor-pointer"
                              >
                                {l.isFreePreview ? t.course.freePreview : (locale === 'ar' ? 'مدفوع' : 'Paid')}
                              </button>
                              {idx > 0 && (
                                <button
                                  type="button"
                                  aria-label={`Move ${l.titleEn} up`}
                                  onClick={async () => {
                                    const prev = mod.lessons[idx - 1];
                                    await apiFetch('/api/admin/lessons/reorder', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      credentials: 'include',
                                      body: JSON.stringify({
                                        items: [
                                          { id: l.id, sortOrder: prev.sortOrder },
                                          { id: prev.id, sortOrder: l.sortOrder },
                                        ],
                                      }),
                                    });
                                    await loadSectionData();
                                    setLessonModalCourse(null);
                                  }}
                                  className="rounded border border-[#E2E8F0] px-1.5 py-1 text-[11px] hover:bg-[#F8FAFC] cursor-pointer"
                                >
                                  ↑
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`Delete ${l.titleEn}`}
                                onClick={async () => {
                                  await apiFetch(`/api/admin/lessons/${l.id}`, {
                                    method: 'DELETE',
                                    credentials: 'include',
                                  });
                                  await loadSectionData();
                                  setLessonModalCourse(null);
                                }}
                                className="rounded border border-[#DC2626]/30 px-2 py-1 text-[11px] text-[#DC2626] hover:bg-[#DC2626]/10 cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={(e) => void handleAddModule(e)} className="space-y-3 border-b border-[#E2E8F0] pb-4">
              <p className="text-sm font-bold text-[#172554]">
                {locale === 'ar' ? 'إضافة وحدة جديدة' : 'Add Module'}
              </p>
              <InputField
                label={locale === 'ar' ? 'اسم الوحدة بالعربية' : 'Module Arabic Title'}
                value={newModuleTitleAr}
                onChange={(e) => setNewModuleTitleAr(e.target.value)}
                required
              />
              <InputField
                label={locale === 'ar' ? 'اسم الوحدة بالإنجليزية' : 'Module English Title'}
                value={newModuleTitleEn}
                onChange={(e) => setNewModuleTitleEn(e.target.value)}
                required
              />
              <Button type="submit" size="sm" variant="secondary">
                {locale === 'ar' ? 'إضافة وحدة' : 'Add Module'}
              </Button>
            </form>

            <form onSubmit={(e) => void handleAddLesson(e)} className="space-y-3">
              <p className="text-sm font-bold text-[#172554]">
                {locale === 'ar' ? 'إضافة درس جديد' : 'Add Lesson'}
              </p>
              <select
                value={newLesson.moduleId}
                onChange={(e) => setNewLesson((p) => ({ ...p, moduleId: e.target.value }))}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              >
                {lessonModalCourse.modules?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {locale === 'ar' ? m.titleAr : m.titleEn}
                  </option>
                ))}
              </select>
              <InputField
                label={locale === 'ar' ? 'عنوان الدرس بالعربية' : 'Lesson Arabic Title'}
                value={newLesson.titleAr}
                onChange={(e) => setNewLesson((p) => ({ ...p, titleAr: e.target.value }))}
                required
              />
              <InputField
                label={locale === 'ar' ? 'عنوان الدرس بالإنجليزية' : 'Lesson English Title'}
                value={newLesson.titleEn}
                onChange={(e) => setNewLesson((p) => ({ ...p, titleEn: e.target.value }))}
                required
              />
              <select
                value={newLesson.videoAssetId}
                onChange={(e) => setNewLesson((p) => ({ ...p, videoAssetId: e.target.value }))}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} — {a.title}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-[#111827]">
                <input
                  type="checkbox"
                  checked={newLesson.isFreePreview}
                  onChange={(e) => setNewLesson((p) => ({ ...p, isFreePreview: e.target.checked }))}
                />
                <span>{t.course.freePreview}</span>
              </label>
              <Button type="submit" size="sm" variant="primary">
                {locale === 'ar' ? 'إضافة الدرس' : 'Add Lesson'}
              </Button>
            </form>
          </div>
        )}
      </Modal>

      {/* Verify Payment Modal */}
      <Modal
        open={Boolean(verifyTarget)}
        onClose={() => setVerifyTarget(null)}
        title={t.admin.sections.verification}
      >
        {verifyTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs space-y-1.5">
              <p className="font-mono-num font-bold text-[#172554]">{verifyTarget.referenceCode}</p>
              <p>
                <strong>{locale === 'ar' ? 'الطالب:' : 'Student:'}</strong> {verifyTarget.studentName} (
                {verifyTarget.studentEmail})
              </p>
              <p>
                <strong>{locale === 'ar' ? 'الدورة:' : 'Course:'}</strong>{' '}
                {locale === 'ar' ? verifyTarget.courseTitleAr : verifyTarget.courseTitleEn}
              </p>
              <p>
                <strong>{locale === 'ar' ? 'المبلغ:' : 'Amount:'}</strong>{' '}
                {formatCurrencyEgp(verifyTarget.amountEgp, locale)}
              </p>
              {verifyTarget.proofTransactionRef && (
                <p>
                  <strong>{locale === 'ar' ? 'مرجع التحويل:' : 'Transaction Ref:'}</strong>{' '}
                  <span className="font-mono-num">{verifyTarget.proofTransactionRef}</span> (
                  {verifyTarget.proofSenderName} · {verifyTarget.proofSenderPhone})
                </p>
              )}
            </div>

            <InputField
              label={locale === 'ar' ? 'ملاحظة المراجعة' : 'Review Note'}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => void handleVerifyDecision('approve')}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{t.admin.approve}</span>
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleVerifyDecision('reject')}
              >
                {t.admin.reject}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardShell>
  );
}
