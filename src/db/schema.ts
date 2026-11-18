import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  createdAt: text('created_at').notNull(),
});

export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  uid: text('uid').unique(), // Firebase Auth UID when linked via Firebase Authentication
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  roleId: text('role_id')
    .notNull()
    .references(() => roles.id),
  preferredLanguage: text('preferred_language').notNull().default('ar'),
  isActive: boolean('is_active').notNull().default(true),
  emailVerified: boolean('email_verified').notNull().default(true),
  verificationToken: text('verification_token'),
  verificationTokenExpiresAt: text('verification_token_expires_at'),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: text('reset_token_expires_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionAr: text('description_ar').notNull(),
  descriptionEn: text('description_en').notNull(),
  sortOrder: integer('sort_order').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const courses = pgTable(
  'courses',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull(),
    subtitleAr: text('subtitle_ar').notNull(),
    subtitleEn: text('subtitle_en').notNull(),
    descriptionAr: text('description_ar').notNull(),
    descriptionEn: text('description_en').notNull(),
    instructorName: text('instructor_name').notNull(),
    priceEgp: doublePrecision('price_egp').notNull().default(0),
    level: text('level').notNull().default('beginner'),
    thumbnailUrl: text('thumbnail_url').notNull(),
    isPublished: boolean('is_published').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    isFeatured: boolean('is_featured').notNull().default(false),
    isDemoData: boolean('is_demo_data').notNull().default(false),
    createdBy: text('created_by').references(() => profiles.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_courses_category').on(table.categoryId)],
);

export const courseModules = pgTable('course_modules', {
  id: text('id').primaryKey(),
  courseId: text('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en').notNull(),
  sortOrder: integer('sort_order').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const videoAssets = pgTable('video_assets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  r2ObjectKey: text('r2_object_key').notNull(),
  hlsDirectory: text('hls_directory').notNull(),
  durationSeconds: integer('duration_seconds').notNull().default(12),
  status: text('status').notNull().default('ready'),
  createdBy: text('created_by').references(() => profiles.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const lessons = pgTable(
  'lessons',
  {
    id: text('id').primaryKey(),
    moduleId: text('module_id')
      .notNull()
      .references(() => courseModules.id, { onDelete: 'cascade' }),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull(),
    descriptionAr: text('description_ar').notNull().default(''),
    descriptionEn: text('description_en').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(1),
    durationSeconds: integer('duration_seconds').notNull().default(300),
    isFreePreview: boolean('is_free_preview').notNull().default(false),
    videoAssetId: text('video_asset_id').references(() => videoAssets.id),
    attachmentName: text('attachment_name'),
    attachmentUrl: text('attachment_url'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_lessons_course').on(table.courseId)],
);

export const purchases = pgTable(
  'purchases',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => profiles.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    amountEgp: doublePrecision('amount_egp').notNull(),
    currency: text('currency').notNull().default('EGP'),
    status: text('status').notNull().default('pending'),
    paymentMethod: text('payment_method').notNull(),
    referenceCode: text('reference_code').notNull().unique(),
    reviewedBy: text('reviewed_by').references(() => profiles.id),
    reviewNote: text('review_note'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_purchases_student').on(table.studentId)],
);

export const paymentSubmissions = pgTable('payment_submissions', {
  id: text('id').primaryKey(),
  purchaseId: text('purchase_id')
    .notNull()
    .unique()
    .references(() => purchases.id, { onDelete: 'cascade' }),
  studentId: text('student_id')
    .notNull()
    .references(() => profiles.id),
  senderName: text('sender_name').notNull(),
  senderPhone: text('sender_phone').notNull(),
  transactionRef: text('transaction_ref').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const enrollments = pgTable(
  'enrollments',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => profiles.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    purchaseId: text('purchase_id').references(() => purchases.id),
    grantedBy: text('granted_by').references(() => profiles.id),
    status: text('status').notNull().default('active'),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    revokeReason: text('revoke_reason'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_enrollments_student_course').on(table.studentId, table.courseId),
    index('idx_enrollments_student').on(table.studentId),
  ],
);

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => profiles.id),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    lastPositionSeconds: integer('last_position_seconds').notNull().default(0),
    watchedSeconds: integer('watched_seconds').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    completedAt: text('completed_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_progress_student_lesson').on(table.studentId, table.lessonId),
    index('idx_progress_student_course').on(table.studentId, table.courseId),
  ],
);

export const watchSessions = pgTable(
  'watch_sessions',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => profiles.id),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    ipAddress: text('ip_address').notNull(),
    userAgent: text('user_agent').notNull(),
    isRevoked: boolean('is_revoked').notNull().default(false),
    revokedBy: text('revoked_by').references(() => profiles.id),
    lastSeenAt: text('last_seen_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_watch_sessions_student').on(table.studentId, table.isRevoked)],
);

export const securityLogs = pgTable(
  'security_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => profiles.id),
    eventType: text('event_type').notNull(),
    severity: text('severity').notNull().default('info'),
    ipAddress: text('ip_address').notNull(),
    details: text('details').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_security_logs_created').on(table.createdAt)],
);

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => profiles.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id),
    eventType: text('event_type').notNull(),
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull(),
    bodyAr: text('body_ar').notNull(),
    bodyEn: text('body_en').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_notifications_user').on(table.userId, table.isRead)],
);

export const courseReviews = pgTable(
  'course_reviews',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => profiles.id),
    rating: integer('rating').notNull(),
    comment: text('comment').notNull(),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('uq_reviews_course_student').on(table.courseId, table.studentId)],
);

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const contactMessages = pgTable('contact_messages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  createdAt: text('created_at').notNull(),
});

// Drizzle Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  profiles: many(profiles),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  role: one(roles, { fields: [profiles.roleId], references: [roles.id] }),
  purchases: many(purchases),
  enrollments: many(enrollments),
  notifications: many(notifications),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  courses: many(courses),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  category: one(categories, { fields: [courses.categoryId], references: [categories.id] }),
  modules: many(courseModules),
  lessons: many(lessons),
  enrollments: many(enrollments),
}));

export const courseModulesRelations = relations(courseModules, ({ one, many }) => ({
  course: one(courses, { fields: [courseModules.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  module: one(courseModules, { fields: [lessons.moduleId], references: [courseModules.id] }),
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
  videoAsset: one(videoAssets, { fields: [lessons.videoAssetId], references: [videoAssets.id] }),
}));
