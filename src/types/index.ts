export type RoleName = 'super_admin' | 'content_manager' | 'student';
export type Locale = 'ar' | 'en';
export type PurchaseStatus = 'pending' | 'proof_submitted' | 'approved' | 'rejected' | 'cancelled';
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: RoleName;
  preferredLanguage: Locale;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  sortOrder: number;
  courseCount?: number;
}

export interface LessonItem {
  id: string;
  moduleId: string;
  courseId: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  sortOrder: number;
  durationSeconds: number;
  isFreePreview: boolean;
  videoAssetId: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
  completed?: boolean;
  lastPositionSeconds?: number;
  watchedSeconds?: number;
}

export interface CourseModule {
  id: string;
  courseId: string;
  titleAr: string;
  titleEn: string;
  sortOrder: number;
  lessons: LessonItem[];
}

export interface CourseSummary {
  id: string;
  slug: string;
  categoryId: string;
  categorySlug?: string;
  categoryNameAr?: string;
  categoryNameEn?: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  instructorName: string;
  priceEgp: number;
  level: CourseLevel;
  thumbnailUrl: string;
  isPublished: boolean;
  isArchived: boolean;
  isFeatured: boolean;
  isDemoData: boolean;
  totalDurationSeconds: number;
  lessonsCount: number;
  modulesCount?: number;
  enrolled?: boolean;
  progressPercent?: number;
  createdAt: string;
}

export interface CourseDetail extends CourseSummary {
  modules: CourseModule[];
}

export interface PurchaseRecord {
  id: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  courseId: string;
  courseTitleAr?: string;
  courseTitleEn?: string;
  courseSlug?: string;
  amountEgp: number;
  currency: string;
  status: PurchaseStatus;
  paymentMethod: string;
  referenceCode: string;
  proofSenderName?: string | null;
  proofSenderPhone?: string | null;
  proofTransactionRef?: string | null;
  proofNotes?: string | null;
  proofSubmittedAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface EnrollmentRecord {
  id: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  courseId: string;
  courseTitleAr?: string;
  courseTitleEn?: string;
  courseSlug?: string;
  purchaseId: string | null;
  grantedBy: string | null;
  status: 'active' | 'revoked';
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  eventType: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  isRead: boolean;
  createdAt: string;
}

export interface VideoAuthorizationPayload {
  authorized: boolean;
  playlistUrl: string;
  sessionId: string;
  expiresAt: string;
  watermark: {
    displayName: string;
    maskedEmail: string;
    studentCode: string;
  };
}
