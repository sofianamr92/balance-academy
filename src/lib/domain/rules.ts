import type { PurchaseStatus } from '../../types';

export interface EnrollmentLike {
  status: 'active' | 'revoked';
  expiresAt: string | null;
}

export function isEnrollmentValid(
  enrollment: EnrollmentLike | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!enrollment) return false;
  if (enrollment.status !== 'active') return false;
  // Lifetime access rule: expiresAt === null never expires automatically
  if (enrollment.expiresAt === null) return true;
  const expiryMs = Date.parse(enrollment.expiresAt);
  if (Number.isNaN(expiryMs)) return false;
  return expiryMs > nowMs;
}

export function canCreatePurchase(params: {
  hasActiveEnrollment: boolean;
  existingStatuses: PurchaseStatus[];
}): { allowed: boolean; reason?: 'already_enrolled' | 'pending_purchase_exists' } {
  if (params.hasActiveEnrollment) {
    return { allowed: false, reason: 'already_enrolled' };
  }
  const hasOpen = params.existingStatuses.some(
    (s) => s === 'pending' || s === 'proof_submitted',
  );
  if (hasOpen) {
    return { allowed: false, reason: 'pending_purchase_exists' };
  }
  return { allowed: true };
}

export function canTransitionPurchaseStatus(
  from: PurchaseStatus,
  action: 'submit_proof' | 'approve' | 'reject',
): boolean {
  if (action === 'submit_proof') {
    return from === 'pending';
  }
  if (action === 'approve' || action === 'reject') {
    return from === 'pending' || from === 'proof_submitted';
  }
  return false;
}

export function evaluateLessonCompletion(params: {
  alreadyCompleted: boolean;
  watchedSeconds: number;
  durationSeconds: number;
  explicitMarkComplete?: boolean;
}): boolean {
  if (params.alreadyCompleted) return true;
  const safeDuration = Math.max(1, params.durationSeconds);
  const ratio = params.watchedSeconds / safeDuration;
  // Never mark a lesson completed simply because the player opened at 0s.
  if (params.explicitMarkComplete) {
    return params.watchedSeconds >= Math.min(10, Math.floor(safeDuration * 0.25));
  }
  return ratio >= 0.85;
}

export function calculateCourseProgressPercent(
  totalLessons: number,
  completedLessons: number,
): number {
  if (totalLessons <= 0) return 0;
  const bounded = Math.max(0, Math.min(completedLessons, totalLessons));
  return Math.round((bounded / totalLessons) * 100);
}

export function formatCurrencyEgp(amount: number, locale: 'ar' | 'en'): string {
  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(amount);
  return locale === 'ar' ? `${formatted} ج.م` : `EGP ${formatted}`;
}

export function formatDurationCompact(seconds: number, locale: 'ar' | 'en'): string {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return locale === 'ar' ? `${hrs} س ${remMins} د` : `${hrs}h ${remMins}m`;
  }
  return locale === 'ar' ? `${Math.max(1, mins)} د` : `${Math.max(1, mins)}m`;
}
