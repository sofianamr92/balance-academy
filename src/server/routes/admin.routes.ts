import express from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  getAdminLogsData,
  getAdminOverviewData,
  getAdminReportsData,
  listAdminReviews,
  listContactMessages,
} from '../../db/analytics.ts';
import { grantLifetimeEnrollment } from '../../db/commerce.ts';
import { db } from '../../db/index.ts';
import {
  categories,
  courseModules,
  courseReviews,
  courses,
  enrollments,
  lessons,
  paymentSubmissions,
  platformSettings,
  profiles,
  purchases,
  videoAssets,
  watchSessions,
} from '../../db/schema.ts';
import {
  listUsersWithEnrollmentCounts,
  newId,
  updateUserRole,
  updateUserStatus,
} from '../../db/users.ts';
import { canTransitionPurchaseStatus } from '../../lib/domain/rules.ts';
import {
  categoryUpsertSchema,
  courseUpsertSchema,
  lessonUpsertSchema,
  moderateReviewSchema,
  moduleUpsertSchema,
  updateUserRoleSchema,
  verifyPaymentSchema,
} from '../../lib/validation/schemas.ts';
import {
  getEmailFromAddress,
  isEmailDeliveryConfigured,
  resolveAppBaseUrl,
  sendPaymentStatusEmail,
} from '../email.ts';
import { asyncHandler } from '../helpers.ts';
import {
  createNotification,
  getClientIp,
  logAuditEvent,
  logSecurityEvent,
  requireRole,
} from '../middleware.ts';
import { generateHlsStreamForAsset } from '../videoAssets.ts';

export function createAdminRouter(): express.Router {
  const router = express.Router();
  const staffOnly = requireRole(['super_admin', 'content_manager']);
  const superAdminOnly = requireRole(['super_admin']);

  router.get(
    '/overview',
    staffOnly,
    asyncHandler(async (req, res) => {
      const overview = await getAdminOverviewData(req.authUser!.role === 'super_admin');
      res.json({ overview });
    }),
  );

  router.get(
    '/courses',
    staffOnly,
    asyncHandler(async (_req, res) => {
      const [courseRows, allModules, allLessons] = await Promise.all([
        db
          .select({
            id: courses.id,
            slug: courses.slug,
            categoryId: courses.categoryId,
            categoryNameAr: categories.nameAr,
            categoryNameEn: categories.nameEn,
            titleAr: courses.titleAr,
            titleEn: courses.titleEn,
            subtitleAr: courses.subtitleAr,
            subtitleEn: courses.subtitleEn,
            descriptionAr: courses.descriptionAr,
            descriptionEn: courses.descriptionEn,
            instructorName: courses.instructorName,
            priceEgp: courses.priceEgp,
            level: courses.level,
            thumbnailUrl: courses.thumbnailUrl,
            isPublished: courses.isPublished,
            isArchived: courses.isArchived,
            isFeatured: courses.isFeatured,
            isDemoData: courses.isDemoData,
            createdAt: courses.createdAt,
          })
          .from(courses)
          .innerJoin(categories, eq(categories.id, courses.categoryId))
          .orderBy(desc(courses.createdAt)),
        db.select().from(courseModules).orderBy(asc(courseModules.sortOrder)),
        db.select().from(lessons).orderBy(asc(lessons.sortOrder)),
      ]);

      res.json({
        courses: courseRows.map((c) => {
          const mods = allModules
            .filter((m) => m.courseId === c.id)
            .map((m) => ({
              id: m.id,
              courseId: m.courseId,
              titleAr: m.titleAr,
              titleEn: m.titleEn,
              sortOrder: m.sortOrder,
              lessons: allLessons
                .filter((l) => l.moduleId === m.id)
                .map((l) => ({
                  id: l.id,
                  moduleId: l.moduleId,
                  courseId: l.courseId,
                  titleAr: l.titleAr,
                  titleEn: l.titleEn,
                  descriptionAr: l.descriptionAr,
                  descriptionEn: l.descriptionEn,
                  sortOrder: l.sortOrder,
                  durationSeconds: l.durationSeconds,
                  isFreePreview: l.isFreePreview,
                  videoAssetId: l.videoAssetId,
                  attachmentName: l.attachmentName,
                  attachmentUrl: l.attachmentUrl,
                })),
            }));
          const lessonsCount = allLessons.filter((l) => l.courseId === c.id).length;
          return {
            ...c,
            lessonsCount,
            modulesCount: mods.length,
            modules: mods,
          };
        }),
      });
    }),
  );

  router.post(
    '/courses',
    staffOnly,
    asyncHandler(async (req, res) => {
      const parsed = courseUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid course fields', issues: parsed.error.flatten() });
        return;
      }

      const slugExists = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.slug, parsed.data.slug))
        .limit(1);
      if (slugExists[0]) {
        res.status(409).json({ error: 'Course slug already exists' });
        return;
      }

      const id = newId('crs');
      const now = new Date().toISOString();
      await db.insert(courses).values({
        id,
        slug: parsed.data.slug,
        categoryId: parsed.data.categoryId,
        titleAr: parsed.data.titleAr,
        titleEn: parsed.data.titleEn,
        subtitleAr: parsed.data.subtitleAr,
        subtitleEn: parsed.data.subtitleEn,
        descriptionAr: parsed.data.descriptionAr,
        descriptionEn: parsed.data.descriptionEn,
        instructorName: parsed.data.instructorName,
        priceEgp: parsed.data.priceEgp,
        level: parsed.data.level,
        thumbnailUrl: parsed.data.thumbnailUrl,
        isPublished: parsed.data.isPublished,
        isArchived: false,
        isFeatured: parsed.data.isFeatured,
        isDemoData: false,
        createdBy: req.authUser!.id,
        createdAt: now,
        updatedAt: now,
      });

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: 'course.created',
        entityType: 'course',
        entityId: id,
        metadata: { slug: parsed.data.slug },
      });

      res.status(201).json({ id });
    }),
  );

  router.patch(
    '/courses/:id',
    staffOnly,
    asyncHandler(async (req, res) => {
      const courseId = String(req.params.id || '');
      const existingRows = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      if (!existingRows[0]) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      const partial = courseUpsertSchema.partial().safeParse(req.body);
      if (!partial.success) {
        res.status(400).json({ error: 'Invalid course update fields' });
        return;
      }

      const d = partial.data;
      const updateSet: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (d.slug !== undefined) updateSet.slug = d.slug;
      if (d.categoryId !== undefined) updateSet.categoryId = d.categoryId;
      if (d.titleAr !== undefined) updateSet.titleAr = d.titleAr;
      if (d.titleEn !== undefined) updateSet.titleEn = d.titleEn;
      if (d.subtitleAr !== undefined) updateSet.subtitleAr = d.subtitleAr;
      if (d.subtitleEn !== undefined) updateSet.subtitleEn = d.subtitleEn;
      if (d.descriptionAr !== undefined) updateSet.descriptionAr = d.descriptionAr;
      if (d.descriptionEn !== undefined) updateSet.descriptionEn = d.descriptionEn;
      if (d.instructorName !== undefined) updateSet.instructorName = d.instructorName;
      if (d.priceEgp !== undefined) updateSet.priceEgp = d.priceEgp;
      if (d.level !== undefined) updateSet.level = d.level;
      if (d.thumbnailUrl !== undefined) updateSet.thumbnailUrl = d.thumbnailUrl;
      if (typeof d.isPublished === 'boolean') updateSet.isPublished = d.isPublished;
      if (typeof d.isFeatured === 'boolean') updateSet.isFeatured = d.isFeatured;
      if (typeof req.body?.isArchived === 'boolean') updateSet.isArchived = req.body.isArchived;

      await db.update(courses).set(updateSet).where(eq(courses.id, courseId));

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: 'course.updated',
        entityType: 'course',
        entityId: courseId,
        metadata: d as Record<string, unknown>,
      });

      res.json({ ok: true });
    }),
  );

  router.delete(
    '/courses/:id',
    staffOnly,
    asyncHandler(async (req, res) => {
      const courseId = String(req.params.id || '');
      const enrRows = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.courseId, courseId));

      if (enrRows.length > 0) {
        await db
          .update(courses)
          .set({ isArchived: true, isPublished: false, updatedAt: new Date().toISOString() })
          .where(eq(courses.id, courseId));
      } else {
        await db.delete(courses).where(eq(courses.id, courseId));
      }

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: enrRows.length > 0 ? 'course.archived' : 'course.deleted',
        entityType: 'course',
        entityId: courseId,
      });
      res.json({ ok: true, archived: enrRows.length > 0 });
    }),
  );

  router.post(
    '/modules',
    staffOnly,
    asyncHandler(async (req, res) => {
      const parsed = moduleUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid module data' });
        return;
      }
      const id = newId('mod');
      const now = new Date().toISOString();
      await db.insert(courseModules).values({
        id,
        courseId: parsed.data.courseId,
        titleAr: parsed.data.titleAr,
        titleEn: parsed.data.titleEn,
        sortOrder: parsed.data.sortOrder,
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json({ id });
    }),
  );

  router.delete(
    '/modules/:id',
    staffOnly,
    asyncHandler(async (req, res) => {
      await db.delete(courseModules).where(eq(courseModules.id, String(req.params.id || '')));
      res.json({ ok: true });
    }),
  );

  router.post(
    '/lessons',
    staffOnly,
    asyncHandler(async (req, res) => {
      const parsed = lessonUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid lesson fields' });
        return;
      }
      const id = newId('les');
      const now = new Date().toISOString();
      const attName = parsed.data.attachmentName || null;
      const attUrl = attName ? `/api/student/attachments/${id}` : null;

      await db.insert(lessons).values({
        id,
        moduleId: parsed.data.moduleId,
        courseId: parsed.data.courseId,
        titleAr: parsed.data.titleAr,
        titleEn: parsed.data.titleEn,
        descriptionAr: parsed.data.descriptionAr,
        descriptionEn: parsed.data.descriptionEn,
        sortOrder: parsed.data.sortOrder,
        durationSeconds: parsed.data.durationSeconds,
        isFreePreview: parsed.data.isFreePreview,
        videoAssetId: parsed.data.videoAssetId || 'asset-ve-01',
        attachmentName: attName,
        attachmentUrl: attUrl,
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json({ id });
    }),
  );

  router.patch(
    '/lessons/:id',
    staffOnly,
    asyncHandler(async (req, res) => {
      const partial = lessonUpsertSchema.partial().safeParse(req.body);
      if (!partial.success) {
        res.status(400).json({ error: 'Invalid lesson update' });
        return;
      }
      const d = partial.data;
      const updateSet: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (d.titleAr !== undefined) updateSet.titleAr = d.titleAr;
      if (d.titleEn !== undefined) updateSet.titleEn = d.titleEn;
      if (d.descriptionAr !== undefined) updateSet.descriptionAr = d.descriptionAr;
      if (d.descriptionEn !== undefined) updateSet.descriptionEn = d.descriptionEn;
      if (d.sortOrder !== undefined) updateSet.sortOrder = d.sortOrder;
      if (d.durationSeconds !== undefined) updateSet.durationSeconds = d.durationSeconds;
      if (typeof d.isFreePreview === 'boolean') updateSet.isFreePreview = d.isFreePreview;
      if (d.videoAssetId !== undefined) updateSet.videoAssetId = d.videoAssetId;

      await db.update(lessons).set(updateSet).where(eq(lessons.id, String(req.params.id || '')));
      res.json({ ok: true });
    }),
  );

  router.delete(
    '/lessons/:id',
    staffOnly,
    asyncHandler(async (req, res) => {
      await db.delete(lessons).where(eq(lessons.id, String(req.params.id || '')));
      res.json({ ok: true });
    }),
  );

  router.post(
    '/lessons/reorder',
    staffOnly,
    asyncHandler(async (req, res) => {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        for (const item of items) {
          if (typeof item?.id === 'string' && typeof item?.sortOrder === 'number') {
            await tx
              .update(lessons)
              .set({ sortOrder: item.sortOrder, updatedAt: now })
              .where(eq(lessons.id, item.id));
          }
        }
      });
      res.json({ ok: true });
    }),
  );

  router.get(
    '/categories',
    staffOnly,
    asyncHandler(async (_req, res) => {
      const [allCats, allCourses] = await Promise.all([
        db.select().from(categories).orderBy(asc(categories.sortOrder)),
        db.select({ categoryId: courses.categoryId }).from(courses),
      ]);

      const counts = new Map<string, number>();
      for (const crs of allCourses) {
        counts.set(crs.categoryId, (counts.get(crs.categoryId) ?? 0) + 1);
      }

      res.json({
        categories: allCats.map((c) => ({
          id: c.id,
          slug: c.slug,
          nameAr: c.nameAr,
          nameEn: c.nameEn,
          descriptionAr: c.descriptionAr,
          descriptionEn: c.descriptionEn,
          sortOrder: c.sortOrder,
          courseCount: counts.get(c.id) ?? 0,
        })),
      });
    }),
  );

  router.post(
    '/categories',
    staffOnly,
    asyncHandler(async (req, res) => {
      const parsed = categoryUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid category data' });
        return;
      }
      const id = newId('cat');
      const now = new Date().toISOString();
      await db.insert(categories).values({
        id,
        slug: parsed.data.slug,
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn,
        descriptionAr: parsed.data.descriptionAr,
        descriptionEn: parsed.data.descriptionEn,
        sortOrder: parsed.data.sortOrder,
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json({ id });
    }),
  );

  router.get(
    '/video-assets',
    staffOnly,
    asyncHandler(async (_req, res) => {
      const [assets, allLessons] = await Promise.all([
        db.select().from(videoAssets).orderBy(desc(videoAssets.createdAt)),
        db.select({ videoAssetId: lessons.videoAssetId }).from(lessons),
      ]);

      const linkedCounts = new Map<string, number>();
      for (const l of allLessons) {
        if (l.videoAssetId) {
          linkedCounts.set(l.videoAssetId, (linkedCounts.get(l.videoAssetId) ?? 0) + 1);
        }
      }

      res.json({
        assets: assets.map((va) => ({
          id: va.id,
          title: va.title,
          r2ObjectKey: va.r2ObjectKey,
          hlsDirectory: va.hlsDirectory,
          durationSeconds: va.durationSeconds,
          status: va.status,
          createdAt: va.createdAt,
          linkedLessonsCount: linkedCounts.get(va.id) ?? 0,
        })),
      });
    }),
  );

  router.post(
    '/video-assets',
    staffOnly,
    asyncHandler(async (req, res) => {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      if (title.length < 2) {
        res.status(400).json({ error: 'Video asset title is required' });
        return;
      }
      const id = newId('asset');
      const now = new Date().toISOString();
      await generateHlsStreamForAsset(id);
      await db.insert(videoAssets).values({
        id,
        title,
        r2ObjectKey: `private/uploads/${id}.mp4`,
        hlsDirectory: id,
        durationSeconds: 12,
        status: 'ready',
        createdBy: req.authUser!.id,
        createdAt: now,
        updatedAt: now,
      });

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: 'video_asset.created',
        entityType: 'video_asset',
        entityId: id,
        metadata: { title },
      });

      res.status(201).json({ id });
    }),
  );

  // =========================================================================
  // SUPER ADMIN MANAGEMENT ROUTES
  // =========================================================================

  router.get(
    '/students',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const users = await listUsersWithEnrollmentCounts();
      res.json({ users });
    }),
  );

  router.patch(
    '/users/:id/status',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const targetId = String(req.params.id || '');
      const isActive = Boolean(req.body?.isActive);
      if (targetId === req.authUser!.id && !isActive) {
        res.status(400).json({ error: 'Cannot deactivate your own Super Admin account' });
        return;
      }
      const updated = await updateUserStatus(targetId, isActive);
      if (!updated) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: isActive ? 'user.activated' : 'user.suspended',
        entityType: 'profile',
        entityId: targetId,
      });
      res.json({ ok: true });
    }),
  );

  router.patch(
    '/users/:id/role',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const targetId = String(req.params.id || '');
      const parsed = updateUserRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Valid role is required (student, content_manager, super_admin)' });
        return;
      }

      if (targetId === req.authUser!.id && parsed.data.role !== 'super_admin') {
        res.status(400).json({ error: 'Cannot demote your own active Super Admin account' });
        return;
      }

      const ok = await updateUserRole(targetId, parsed.data.role);
      if (!ok) {
        res.status(404).json({ error: 'User or role not found' });
        return;
      }

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: 'user.role_updated',
        entityType: 'profile',
        entityId: targetId,
        metadata: { role: parsed.data.role },
      });

      await logSecurityEvent({
        userId: targetId,
        eventType: 'authz.role_changed',
        severity: 'warning',
        ipAddress: getClientIp(req),
        details: `Admin ${req.authUser!.email} changed role to ${parsed.data.role}`,
      });

      res.json({ ok: true, role: parsed.data.role });
    }),
  );

  router.get(
    '/purchases',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select({
          id: purchases.id,
          studentId: purchases.studentId,
          studentName: profiles.fullName,
          studentEmail: profiles.email,
          courseId: purchases.courseId,
          courseTitleAr: courses.titleAr,
          courseTitleEn: courses.titleEn,
          courseSlug: courses.slug,
          amountEgp: purchases.amountEgp,
          currency: purchases.currency,
          status: purchases.status,
          paymentMethod: purchases.paymentMethod,
          referenceCode: purchases.referenceCode,
          reviewedBy: purchases.reviewedBy,
          reviewNote: purchases.reviewNote,
          reviewedAt: purchases.reviewedAt,
          createdAt: purchases.createdAt,
          proofSenderName: paymentSubmissions.senderName,
          proofSenderPhone: paymentSubmissions.senderPhone,
          proofTransactionRef: paymentSubmissions.transactionRef,
          proofNotes: paymentSubmissions.notes,
          proofSubmittedAt: paymentSubmissions.createdAt,
        })
        .from(purchases)
        .innerJoin(profiles, eq(profiles.id, purchases.studentId))
        .innerJoin(courses, eq(courses.id, purchases.courseId))
        .leftJoin(paymentSubmissions, eq(paymentSubmissions.purchaseId, purchases.id))
        .orderBy(desc(purchases.createdAt));

      const priority: Record<string, number> = { proof_submitted: 0, pending: 1 };
      rows.sort((a, b) => (priority[a.status] ?? 2) - (priority[b.status] ?? 2));
      res.json({ purchases: rows });
    }),
  );

  router.post(
    '/purchases/:id/verify',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const parsed = verifyPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid verification decision' });
        return;
      }

      const purchaseId = String(req.params.id || '');
      const rows = await db
        .select({
          id: purchases.id,
          studentId: purchases.studentId,
          studentEmail: profiles.email,
          studentName: profiles.fullName,
          studentLang: profiles.preferredLanguage,
          courseId: purchases.courseId,
          courseSlug: courses.slug,
          status: purchases.status,
          amountEgp: purchases.amountEgp,
          referenceCode: purchases.referenceCode,
          titleAr: courses.titleAr,
          titleEn: courses.titleEn,
        })
        .from(purchases)
        .innerJoin(courses, eq(courses.id, purchases.courseId))
        .innerJoin(profiles, eq(profiles.id, purchases.studentId))
        .where(eq(purchases.id, purchaseId))
        .limit(1);

      const purchase = rows[0];
      if (!purchase) {
        res.status(404).json({ error: 'Purchase not found' });
        return;
      }

      if (!canTransitionPurchaseStatus(purchase.status as never, parsed.data.decision)) {
        res.status(409).json({ error: 'Purchase has already been processed' });
        return;
      }

      const now = new Date().toISOString();
      const adminId = req.authUser!.id;
      const newStatus = parsed.data.decision === 'approve' ? 'approved' : 'rejected';

      await db.transaction(async (tx) => {
        await tx
          .update(purchases)
          .set({
            status: newStatus,
            reviewedBy: adminId,
            reviewNote: parsed.data.reviewNote || null,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(eq(purchases.id, purchase.id));

        if (parsed.data.decision === 'approve') {
          const existingEnr = await tx
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(
              and(
                eq(enrollments.studentId, purchase.studentId),
                eq(enrollments.courseId, purchase.courseId),
              ),
            )
            .limit(1);

          if (existingEnr[0]) {
            await tx
              .update(enrollments)
              .set({
                status: 'active',
                purchaseId: purchase.id,
                grantedBy: adminId,
                expiresAt: null,
                revokedAt: null,
                revokeReason: null,
                updatedAt: now,
              })
              .where(eq(enrollments.id, existingEnr[0].id));
          } else {
            await tx.insert(enrollments).values({
              id: newId('enr'),
              studentId: purchase.studentId,
              courseId: purchase.courseId,
              purchaseId: purchase.id,
              grantedBy: adminId,
              status: 'active',
              expiresAt: null,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      });

      if (parsed.data.decision === 'approve') {
        await createNotification({
          userId: purchase.studentId,
          eventType: 'payment_approved',
          titleAr: 'تم تأكيد الدفع وتفعيل الدورة مدى الحياة',
          titleEn: 'Payment Approved & Lifetime Access Granted',
          bodyAr: `تم اعتماد طلبك (${purchase.referenceCode}) لدورة ${purchase.titleAr}. يمكنك بدء التعلم الآن.`,
          bodyEn: `Your payment (${purchase.referenceCode}) for ${purchase.titleEn} was approved. Lifetime access is active.`,
        });
      } else {
        await createNotification({
          userId: purchase.studentId,
          eventType: 'payment_rejected',
          titleAr: 'لم يتم اعتماد إثبات الدفع',
          titleEn: 'Payment Verification Declined',
          bodyAr: `تم رفض طلب الدفع (${purchase.referenceCode}). السبب: ${parsed.data.reviewNote || 'يرجى مراجعة بيانات التحويل'}`,
          bodyEn: `Your payment (${purchase.referenceCode}) was declined. Note: ${parsed.data.reviewNote || 'Please verify transfer details.'}`,
        });
      }

      const appBase = resolveAppBaseUrl(req);
      const emailSent = await sendPaymentStatusEmail({
        to: purchase.studentEmail,
        fullName: purchase.studentName,
        decision: parsed.data.decision,
        courseTitleAr: purchase.titleAr,
        courseTitleEn: purchase.titleEn,
        referenceCode: purchase.referenceCode,
        amountEgp: purchase.amountEgp,
        reviewNote: parsed.data.reviewNote || undefined,
        actionUrl:
          parsed.data.decision === 'approve'
            ? `${appBase}/learn/${purchase.courseSlug}`
            : `${appBase}/student`,
        preferredLanguage: purchase.studentLang === 'en' ? 'en' : 'ar',
      });

      await logAuditEvent({
        actorId: adminId,
        action: parsed.data.decision === 'approve' ? 'payment.approved' : 'payment.rejected',
        entityType: 'purchase',
        entityId: purchase.id,
        metadata: {
          referenceCode: purchase.referenceCode,
          amountEgp: purchase.amountEgp,
          reviewNote: parsed.data.reviewNote,
          emailSent,
        },
      });

      res.json({ ok: true, status: newStatus, emailSent });
    }),
  );

  router.get(
    '/enrollments',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select({
          id: enrollments.id,
          studentId: enrollments.studentId,
          studentName: profiles.fullName,
          studentEmail: profiles.email,
          courseId: enrollments.courseId,
          courseTitleAr: courses.titleAr,
          courseTitleEn: courses.titleEn,
          courseSlug: courses.slug,
          purchaseId: enrollments.purchaseId,
          grantedBy: enrollments.grantedBy,
          status: enrollments.status,
          expiresAt: enrollments.expiresAt,
          revokedAt: enrollments.revokedAt,
          revokeReason: enrollments.revokeReason,
          createdAt: enrollments.createdAt,
        })
        .from(enrollments)
        .innerJoin(profiles, eq(profiles.id, enrollments.studentId))
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .orderBy(desc(enrollments.createdAt));

      res.json({ enrollments: rows });
    }),
  );

  router.post(
    '/enrollments/grant',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId : '';
      const courseId = typeof req.body?.courseId === 'string' ? req.body.courseId : '';
      if (!studentId || !courseId) {
        res.status(400).json({ error: 'studentId and courseId are required' });
        return;
      }

      await grantLifetimeEnrollment({
        studentId,
        courseId,
        grantedBy: req.authUser!.id,
      });

      await createNotification({
        userId: studentId,
        eventType: 'course_access_granted',
        titleAr: 'تم منحك صلاحية الوصول لدورة جديدة',
        titleEn: 'New Course Access Granted',
        bodyAr: 'قامت الإدارة بتفعيل وصولك الدائم إلى دورة جديدة في حسابك.',
        bodyEn: 'An administrator has granted your account lifetime access to a course.',
      });

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: 'enrollment.granted_manual',
        entityType: 'enrollment',
        entityId: `${studentId}:${courseId}`,
      });

      res.status(201).json({ ok: true });
    }),
  );

  router.post(
    '/enrollments/:id/revoke',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const enrId = String(req.params.id || '');
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'Administrative revocation';
      const now = new Date().toISOString();
      await db
        .update(enrollments)
        .set({
          status: 'revoked',
          revokedAt: now,
          revokeReason: reason,
          updatedAt: now,
        })
        .where(eq(enrollments.id, enrId));

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: 'enrollment.revoked',
        entityType: 'enrollment',
        entityId: enrId,
        metadata: { reason },
      });

      res.json({ ok: true });
    }),
  );

  router.get(
    '/sessions',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select({
          id: watchSessions.id,
          studentId: watchSessions.studentId,
          studentName: profiles.fullName,
          studentEmail: profiles.email,
          lessonId: watchSessions.lessonId,
          lessonTitleAr: lessons.titleAr,
          lessonTitleEn: lessons.titleEn,
          ipAddress: watchSessions.ipAddress,
          userAgent: watchSessions.userAgent,
          isRevoked: watchSessions.isRevoked,
          lastSeenAt: watchSessions.lastSeenAt,
          expiresAt: watchSessions.expiresAt,
          createdAt: watchSessions.createdAt,
        })
        .from(watchSessions)
        .innerJoin(profiles, eq(profiles.id, watchSessions.studentId))
        .innerJoin(lessons, eq(lessons.id, watchSessions.lessonId))
        .orderBy(desc(watchSessions.createdAt))
        .limit(40);

      res.json({ sessions: rows });
    }),
  );

  router.post(
    '/sessions/:id/revoke',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const sessionId = String(req.params.id || '');
      await db
        .update(watchSessions)
        .set({ isRevoked: true, revokedBy: req.authUser!.id })
        .where(eq(watchSessions.id, sessionId));

      await logSecurityEvent({
        userId: req.authUser!.id,
        eventType: 'video.session_revoked_by_admin',
        severity: 'warning',
        ipAddress: getClientIp(req),
        details: `Admin revoked watch session ${sessionId}`,
      });
      res.json({ ok: true });
    }),
  );

  router.get(
    '/security-logs',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const logs = await getAdminLogsData();
      res.json(logs);
    }),
  );

  router.get(
    '/contact-messages',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const messages = await listContactMessages();
      res.json({ messages });
    }),
  );

  router.get(
    '/reviews',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const reviews = await listAdminReviews();
      res.json({ reviews });
    }),
  );

  router.patch(
    '/reviews/:id',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const reviewId = String(req.params.id || '');
      const parsed = moderateReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'isPublished boolean is required' });
        return;
      }

      const updated = await db
        .update(courseReviews)
        .set({ isPublished: parsed.data.isPublished })
        .where(eq(courseReviews.id, reviewId))
        .returning({ id: courseReviews.id });

      if (!updated[0]) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      await logAuditEvent({
        actorId: req.authUser!.id,
        action: parsed.data.isPublished ? 'review.published' : 'review.hidden',
        entityType: 'course_review',
        entityId: reviewId,
      });

      res.json({ ok: true });
    }),
  );

  router.get(
    '/reports',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : '2000-01-01T00:00:00.000Z';
      const to = typeof req.query.to === 'string' && req.query.to ? `${req.query.to}T23:59:59.999Z` : '2099-12-31T23:59:59.999Z';
      const reports = await getAdminReportsData(from, to);
      res.json({ reports });
    }),
  );

  router.get(
    '/settings',
    superAdminOnly,
    asyncHandler(async (_req, res) => {
      const rows = await db.select().from(platformSettings);
      const settings: Record<string, string> = {};
      for (const r of rows) settings[r.key] = r.value;
      res.json({
        settings,
        emailService: {
          provider: 'resend',
          configured: isEmailDeliveryConfigured(),
          fromAddress: getEmailFromAddress(),
        },
      });
    }),
  );

  router.patch(
    '/settings',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const body = req.body?.settings;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid settings object' });
        return;
      }
      const now = new Date().toISOString();
      const allowedKeys = [
        'vodafone_cash_number',
        'instapay_handle',
        'bank_account_iban',
        'support_email',
        'max_concurrent_watch_sessions',
      ];
      for (const key of allowedKeys) {
        if (typeof body[key] === 'string') {
          const val = body[key].trim();
          await db
            .insert(platformSettings)
            .values({ key, value: val, updatedAt: now })
            .onConflictDoUpdate({
              target: platformSettings.key,
              set: { value: val, updatedAt: now },
            });
        }
      }
      await logAuditEvent({
        actorId: req.authUser!.id,
        action: 'settings.updated',
        entityType: 'platform_settings',
        entityId: 'global',
      });
      res.json({ ok: true });
    }),
  );

  return router;
}
