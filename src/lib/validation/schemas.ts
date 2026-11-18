import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(7).max(30).optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  preferredLanguage: z.enum(['ar', 'en']).default('ar'),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(10).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  preferredLanguage: z.enum(['ar', 'en']),
});

export const createPurchaseSchema = z.object({
  courseId: z.string().min(1),
  paymentMethod: z.enum(['vodafone_cash', 'instapay', 'bank_transfer']),
});

export const submitPaymentProofSchema = z.object({
  senderName: z.string().trim().min(2).max(120),
  senderPhone: z.string().trim().min(6).max(30),
  transactionRef: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(500).optional().default(''),
});

export const verifyPaymentSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reviewNote: z.string().trim().max(500).optional().default(''),
});

export const progressUpdateSchema = z.object({
  lessonId: z.string().min(1),
  lastPositionSeconds: z.number().min(0).max(86400),
  watchedSeconds: z.number().min(0).max(86400),
  explicitMarkComplete: z.boolean().optional(),
});

export const courseUpsertSchema = z.object({
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/),
  categoryId: z.string().min(1),
  titleAr: z.string().trim().min(2).max(180),
  titleEn: z.string().trim().min(2).max(180),
  subtitleAr: z.string().trim().min(2).max(240),
  subtitleEn: z.string().trim().min(2).max(240),
  descriptionAr: z.string().trim().min(10).max(4000),
  descriptionEn: z.string().trim().min(10).max(4000),
  instructorName: z.string().trim().min(2).max(120),
  priceEgp: z.number().min(0).max(500000),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  thumbnailUrl: z.string().trim().min(1).max(500),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
});

export const moduleUpsertSchema = z.object({
  courseId: z.string().min(1),
  titleAr: z.string().trim().min(2).max(180),
  titleEn: z.string().trim().min(2).max(180),
  sortOrder: z.number().int().min(1).max(1000).default(1),
});

export const lessonUpsertSchema = z.object({
  moduleId: z.string().min(1),
  courseId: z.string().min(1),
  titleAr: z.string().trim().min(2).max(180),
  titleEn: z.string().trim().min(2).max(180),
  descriptionAr: z.string().trim().max(2000).default(''),
  descriptionEn: z.string().trim().max(2000).default(''),
  sortOrder: z.number().int().min(1).max(1000).default(1),
  durationSeconds: z.number().int().min(10).max(36000).default(300),
  isFreePreview: z.boolean().default(false),
  videoAssetId: z.string().nullable().optional(),
  attachmentName: z.string().trim().max(180).nullable().optional(),
});

export const categoryUpsertSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  descriptionAr: z.string().trim().min(4).max(400),
  descriptionEn: z.string().trim().min(4).max(400),
  sortOrder: z.number().int().min(1).max(100).default(1),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(2000),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['student', 'content_manager', 'super_admin']),
});

export const createReviewSchema = z.object({
  courseId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5).max(1000),
});

export const moderateReviewSchema = z.object({
  isPublished: z.boolean(),
});
