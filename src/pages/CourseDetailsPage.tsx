import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Lock, PlayCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch } from '../lib/authToken';
import { formatCurrencyEgp, formatDurationCompact } from '../lib/domain/rules';
import type { CourseDetail, PurchaseRecord } from '../types';
import { Button, InputField, Modal, StatusText } from '../components/ui/DesignSystem';

export function CourseDetailsPage({
  slug,
  navigate,
}: {
  slug: string;
  navigate: (path: string) => void;
}) {
  const { t, locale, user, pushToast } = useApp();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [openPurchase, setOpenPurchase] = useState<PurchaseRecord | null>(null);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'vodafone_cash' | 'instapay' | 'bank_transfer'>('vodafone_cash');
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/public/courses/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setCourse(data.course);
        setOpenPurchase(data.openPurchase || null);
        setInstructions(data.paymentInstructions || {});
      } else {
        setCourse(null);
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  useEffect(() => {
    if (user && !senderName) {
      setSenderName(user.fullName);
      setSenderPhone(user.phone || '');
    }
  }, [user, senderName]);

  const handleCreatePurchase = async () => {
    if (!course) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/student/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course.id, paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Could not create purchase');
        return;
      }
      setOpenPurchase(data.purchase);
      pushToast(
        'success',
        locale === 'ar'
          ? `تم إنشاء طلب الشراء (${data.purchase.referenceCode}). أرسل إثبات التحويل الآن.`
          : `Purchase request created (${data.purchase.referenceCode}). Submit proof below.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openPurchase) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/student/purchases/${openPurchase.id}/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName,
          senderPhone,
          transactionRef,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Failed to submit proof');
        return;
      }
      pushToast('success', t.course.proofSubmittedNotice);
      setPurchaseModalOpen(false);
      await loadCourse();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || reviewComment.trim().length < 5) return;
    setSubmittingReview(true);
    try {
      const res = await apiFetch('/api/student/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          rating: reviewRating,
          comment: reviewComment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Could not submit review');
        return;
      }
      setReviewComment('');
      pushToast(
        'success',
        locale === 'ar'
          ? 'تم استلام تقييمك وسيظهر بعد مراجعته من الإدارة.'
          : 'Your review has been submitted for admin review.',
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="h-72 rounded-xl border border-[#E2E8F0] bg-white animate-pulse" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[#172554]">
          {locale === 'ar' ? 'الدورة غير موجودة' : 'Course not found'}
        </h1>
        <Button className="mt-4" variant="secondary" onClick={() => navigate('/courses')}>
          {t.catalog.title}
        </Button>
      </div>
    );
  }

  const title = locale === 'ar' ? course.titleAr : course.titleEn;
  const subtitle = locale === 'ar' ? course.subtitleAr : course.subtitleEn;
  const description = locale === 'ar' ? course.descriptionAr : course.descriptionEn;
  const categoryName = locale === 'ar' ? course.categoryNameAr : course.categoryNameEn;
  const firstLesson = course.modules[0]?.lessons[0];
  const freePreviewLesson = course.modules.flatMap((m) => m.lessons).find((l) => l.isFreePreview);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Course Details & Curriculum */}
        <div className="lg:col-span-8 space-y-8">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
              <span className="font-semibold text-[#3B82F6]">{categoryName}</span>
              <span aria-hidden="true">·</span>
              <span>{t.catalog.levels[course.level]}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {course.lessonsCount} {t.catalog.lessonsLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {formatDurationCompact(course.totalDurationSeconds, locale)}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-[#172554]">{title}</h1>
            <p className="text-base text-[#64748B] leading-relaxed">{subtitle}</p>
            <p className="text-sm text-[#111827] leading-relaxed pt-2 border-t border-[#E2E8F0]">
              {description}
            </p>
            <p className="text-xs text-[#64748B]">
              {locale === 'ar' ? 'المحاضر:' : 'Instructor:'}{' '}
              <span className="font-medium text-[#111827]">{course.instructorName}</span>
            </p>
          </div>

          {/* Curriculum */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="border-b border-[#E2E8F0] px-6 py-4">
              <h2 className="text-lg font-bold text-[#172554]">{t.course.curriculumTitle}</h2>
            </div>
            <div className="divide-y divide-[#E2E8F0]">
              {course.modules.map((mod) => (
                <div key={mod.id} className="p-5 sm:p-6 space-y-3">
                  <h3 className="text-sm font-bold text-[#172554]">
                    {locale === 'ar' ? mod.titleAr : mod.titleEn}
                  </h3>
                  <ul className="space-y-2">
                    {mod.lessons.map((lesson) => {
                      const canWatch = course.enrolled || lesson.isFreePreview;
                      return (
                        <li
                          key={lesson.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {canWatch ? (
                              <PlayCircle className="h-4 w-4 text-[#3B82F6] shrink-0" />
                            ) : (
                              <Lock className="h-4 w-4 text-[#64748B] shrink-0" />
                            )}
                            <span className="text-sm font-medium text-[#111827] truncate">
                              {locale === 'ar' ? lesson.titleAr : lesson.titleEn}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[#64748B] tabular-nums">
                              {formatDurationCompact(lesson.durationSeconds, locale)}
                            </span>
                            {lesson.isFreePreview && !course.enrolled && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => navigate(`/learn/${course.slug}/${lesson.id}`)}
                              >
                                {t.course.watchPreview}
                              </Button>
                            )}
                            {course.enrolled && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(`/learn/${course.slug}/${lesson.id}`)}
                              >
                                {t.course.startLearning}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {course.enrolled && (
            <form
              onSubmit={(e) => void handleSubmitReview(e)}
              className="rounded-xl border border-[#E2E8F0] bg-white p-6 space-y-4"
            >
              <div className="space-y-1">
                <h2 className="text-base font-bold text-[#172554]">
                  {locale === 'ar' ? 'أضف تقييمك للدورة' : 'Share Your Course Review'}
                </h2>
                <p className="text-xs text-[#64748B]">
                  {locale === 'ar'
                    ? 'يساعد تقييمك الطلاب الآخرين، ويُعرض في الصفحة الرئيسية بعد اعتماده من الإدارة.'
                    : 'Your verified feedback helps other students once approved by an administrator.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold tabular-nums cursor-pointer ${
                      reviewRating === star
                        ? 'border-[#3B82F6] bg-[#EFF6FF] text-[#1D4ED8]'
                        : 'border-[#E2E8F0] bg-white text-[#64748B]'
                    }`}
                  >
                    {star} ★
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                required
                minLength={5}
                placeholder={
                  locale === 'ar'
                    ? 'اكتب رأيك في محتوى الدورة والتطبيق العملي...'
                    : 'Write your thoughts on the course curriculum and practical exercises...'
                }
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#111827] focus:border-[#3B82F6] focus:outline-none"
              />
              <Button type="submit" size="sm" variant="navy" disabled={submittingReview}>
                {locale === 'ar' ? 'إرسال التقييم' : 'Submit Review'}
              </Button>
            </form>
          )}
        </div>

        {/* Sticky Purchase / Access Card */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="aspect-[4/3] w-full bg-[#172554]/5">
              <img
                src={course.thumbnailUrl}
                alt={title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-2xl font-bold text-[#172554] tabular-nums">
                  {formatCurrencyEgp(course.priceEgp, locale)}
                </p>
                <span className="text-xs text-[#64748B]">{t.catalog.lifetimeLabel}</span>
              </div>

              {course.enrolled ? (
                <div className="space-y-3">
                  <StatusText
                    tone="success"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    label={t.catalog.enrolledLabel}
                  />
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() =>
                      navigate(
                        firstLesson ? `/learn/${course.slug}/${firstLesson.id}` : `/learn/${course.slug}`,
                      )
                    }
                  >
                    {t.course.startLearning}
                  </Button>
                </div>
              ) : openPurchase ? (
                <div className="space-y-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <p className="text-xs font-semibold text-[#172554]">{t.course.paymentPendingTitle}</p>
                  <p className="text-xs text-[#64748B] font-mono-num">
                    {t.course.paymentPendingDesc} {openPurchase.referenceCode}
                  </p>
                  <StatusText
                    tone="warning"
                    label={t.status[openPurchase.status]}
                  />
                  {openPurchase.status === 'pending' && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={() => setPurchaseModalOpen(true)}
                    >
                      {t.course.submitProofBtn}
                    </Button>
                  )}
                  {openPurchase.status === 'proof_submitted' && (
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      {t.course.proofSubmittedNotice}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {user ? (
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={() => setPurchaseModalOpen(true)}
                    >
                      {t.course.buyNow}
                    </Button>
                  ) : (
                    <Button
                      variant="navy"
                      className="w-full"
                      onClick={() => navigate('/login')}
                    >
                      {t.course.loginToBuy}
                    </Button>
                  )}

                  {freePreviewLesson && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => navigate(`/learn/${course.slug}/${freePreviewLesson.id}`)}
                    >
                      {t.course.watchPreview}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Purchase & Proof Verification Modal */}
      <Modal
        open={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        title={openPurchase ? t.course.submitProofBtn : t.course.buyNow}
      >
        {!openPurchase ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm space-y-1">
              <p className="font-semibold text-[#172554]">{title}</p>
              <p className="text-[#64748B] tabular-nums">
                {formatCurrencyEgp(course.priceEgp, locale)} · {t.catalog.lifetimeLabel}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#111827]">
                {t.course.chooseMethod}
              </label>
              <div className="grid grid-cols-1 gap-2">
                {(['vodafone_cash', 'instapay', 'bank_transfer'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-lg border px-4 py-3 text-start text-sm font-medium transition-colors cursor-pointer ${
                      paymentMethod === method
                        ? 'border-[#3B82F6] bg-[#3B82F6]/8 text-[#172554]'
                        : 'border-[#E2E8F0] bg-white text-[#111827] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    {t.course.methods[method]}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 text-xs text-[#64748B] space-y-1.5">
              <p className="font-semibold text-[#111827]">{t.course.instructionsTitle}</p>
              {paymentMethod === 'vodafone_cash' && (
                <p className="font-mono-num">
                  Vodafone Cash: {instructions.vodafone_cash_number || '0100-987-6543'}
                </p>
              )}
              {paymentMethod === 'instapay' && (
                <p className="font-mono-num">
                  InstaPay: {instructions.instapay_handle || 'balance.academy@instapay'}
                </p>
              )}
              {paymentMethod === 'bank_transfer' && (
                <p className="font-mono-num">
                  IBAN: {instructions.bank_account_iban || 'EG38 0019 0005 0000 0000 1234 5678 9'}
                </p>
              )}
            </div>

            <Button
              variant="primary"
              className="w-full"
              disabled={submitting}
              onClick={() => void handleCreatePurchase()}
            >
              {t.course.buyNow}
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmitProof(e)} className="space-y-4">
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-xs space-y-1">
              <p className="font-semibold text-[#172554]">
                {t.course.paymentPendingDesc}{' '}
                <span className="font-mono-num">{openPurchase.referenceCode}</span>
              </p>
              <p className="text-[#64748B]">
                {t.course.methods[openPurchase.paymentMethod as keyof typeof t.course.methods]} ·{' '}
                {formatCurrencyEgp(openPurchase.amountEgp, locale)}
              </p>
            </div>

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
              placeholder="e.g. INSTA-849201"
              required
            />
            <InputField
              label={t.course.notes}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {t.course.confirmSubmitProof}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
