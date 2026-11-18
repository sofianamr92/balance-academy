import crypto from 'node:crypto';
import express from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { loadCourseModules } from '../../db/catalog.ts';
import {
  getPublicPaymentInstructions,
  getStudentDashboardData,
  listStudentPurchases,
} from '../../db/commerce.ts';
import { db } from '../../db/index.ts';
import {
  courseReviews,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  notifications,
  paymentSubmissions,
  profiles,
  purchases,
  roles,
} from '../../db/schema.ts';
import { newId } from '../../db/users.ts';
import {
  calculateCourseProgressPercent,
  canCreatePurchase,
  canTransitionPurchaseStatus,
  evaluateLessonCompletion,
  isEnrollmentValid,
} from '../../lib/domain/rules.ts';
import { maskEmailForWatermark } from '../../lib/security/tokens.ts';
import {
  createPurchaseSchema,
  createReviewSchema,
  progressUpdateSchema,
  submitPaymentProofSchema,
} from '../../lib/validation/schemas.ts';
import { asyncHandler } from '../helpers.ts';
import { createNotification, logAuditEvent, requireAuth } from '../middleware.ts';

export function createStudentRouter(): express.Router {
  const router = express.Router();

  router.get(
    '/dashboard',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = await getStudentDashboardData(req.authUser!.id);
      res.json(data);
    }),
  );

  router.get(
    '/purchases',
    requireAuth,
    asyncHandler(async (req, res) => {
      const [purchasesList, paymentInstructions] = await Promise.all([
        listStudentPurchases(req.authUser!.id),
        getPublicPaymentInstructions(),
      ]);
      res.json({
        purchases: purchasesList,
        paymentInstructions,
      });
    }),
  );

  router.post(
    '/purchases',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = createPurchaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid purchase request' });
        return;
      }

      const userId = req.authUser!.id;
      const courseRows = await db
        .select({
          id: courses.id,
          priceEgp: courses.priceEgp,
          isPublished: courses.isPublished,
          isArchived: courses.isArchived,
          titleAr: courses.titleAr,
          titleEn: courses.titleEn,
        })
        .from(courses)
        .where(eq(courses.id, parsed.data.courseId))
        .limit(1);

      const course = courseRows[0];
      if (!course || !course.isPublished || course.isArchived) {
        res.status(404).json({ error: 'Course is not available for purchase' });
        return;
      }

      const [existingEnrRows, existingPurchases] = await Promise.all([
        db
          .select({ status: enrollments.status, expiresAt: enrollments.expiresAt })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, course.id)))
          .limit(1),
        db
          .select({ status: purchases.status })
          .from(purchases)
          .where(and(eq(purchases.studentId, userId), eq(purchases.courseId, course.id))),
      ]);

      const enr = existingEnrRows[0];
      const check = canCreatePurchase({
        hasActiveEnrollment: isEnrollmentValid(
          enr ? { status: enr.status as 'active' | 'revoked', expiresAt: enr.expiresAt } : undefined,
        ),
        existingStatuses: existingPurchases.map((p) => p.status as never),
      });

      if (!check.allowed) {
        res.status(409).json({
          error:
            check.reason === 'already_enrolled'
              ? 'You already have lifetime access to this course'
              : 'An active payment request already exists for this course',
          code: check.reason,
        });
        return;
      }

      const now = new Date().toISOString();
      const purchaseId = newId('pur');
      const referenceCode = `BA-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;

      await db.insert(purchases).values({
        id: purchaseId,
        studentId: userId,
        courseId: course.id,
        amountEgp: course.priceEgp,
        currency: 'EGP',
        status: 'pending',
        paymentMethod: parsed.data.paymentMethod,
        referenceCode,
        createdAt: now,
        updatedAt: now,
      });

      await logAuditEvent({
        actorId: userId,
        action: 'purchase.created',
        entityType: 'purchase',
        entityId: purchaseId,
        metadata: { courseId: course.id, amountEgp: course.priceEgp, method: parsed.data.paymentMethod },
      });

      const paymentInstructions = await getPublicPaymentInstructions();
      res.status(201).json({
        purchase: {
          id: purchaseId,
          studentId: userId,
          courseId: course.id,
          courseTitleAr: course.titleAr,
          courseTitleEn: course.titleEn,
          amountEgp: course.priceEgp,
          currency: 'EGP',
          status: 'pending',
          paymentMethod: parsed.data.paymentMethod,
          referenceCode,
          createdAt: now,
        },
        paymentInstructions,
      });
    }),
  );

  router.post(
    '/purchases/:id/proof',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = submitPaymentProofSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payment proof details' });
        return;
      }

      const purchaseId = String(req.params.id || '');
      const userId = req.authUser!.id;
      const rows = await db
        .select({
          id: purchases.id,
          studentId: purchases.studentId,
          status: purchases.status,
          referenceCode: purchases.referenceCode,
          titleAr: courses.titleAr,
          titleEn: courses.titleEn,
        })
        .from(purchases)
        .innerJoin(courses, eq(courses.id, purchases.courseId))
        .where(eq(purchases.id, purchaseId))
        .limit(1);

      const purchase = rows[0];
      if (!purchase || purchase.studentId !== userId) {
        res.status(404).json({ error: 'Purchase record not found' });
        return;
      }

      if (!canTransitionPurchaseStatus(purchase.status as never, 'submit_proof')) {
        res.status(400).json({ error: 'Payment proof already submitted or finalized' });
        return;
      }

      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx.insert(paymentSubmissions).values({
          id: newId('sub'),
          purchaseId: purchase.id,
          studentId: userId,
          senderName: parsed.data.senderName,
          senderPhone: parsed.data.senderPhone,
          transactionRef: parsed.data.transactionRef,
          notes: parsed.data.notes || '',
          createdAt: now,
        });

        await tx
          .update(purchases)
          .set({ status: 'proof_submitted', updatedAt: now })
          .where(eq(purchases.id, purchase.id));
      });

      const admins = await db
        .select({ id: profiles.id })
        .from(profiles)
        .innerJoin(roles, eq(roles.id, profiles.roleId))
        .where(eq(roles.name, 'super_admin'));

      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          eventType: 'purchase_submitted',
          titleAr: `إثبات دفع جديد (${purchase.referenceCode})`,
          titleEn: `New Payment Proof (${purchase.referenceCode})`,
          bodyAr: `أرسل ${req.authUser!.fullName} مرجع التحويل ${parsed.data.transactionRef} لدورة ${purchase.titleAr}.`,
          bodyEn: `${req.authUser!.fullName} submitted reference ${parsed.data.transactionRef} for ${purchase.titleEn}.`,
        });
      }

      await logAuditEvent({
        actorId: userId,
        action: 'purchase.proof_submitted',
        entityType: 'purchase',
        entityId: purchase.id,
        metadata: { transactionRef: parsed.data.transactionRef },
      });

      res.json({ ok: true, status: 'proof_submitted' });
    }),
  );

  router.get(
    '/learn/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug || '');
      const rows = await db
        .select({
          id: courses.id,
          slug: courses.slug,
          titleAr: courses.titleAr,
          titleEn: courses.titleEn,
          subtitleAr: courses.subtitleAr,
          subtitleEn: courses.subtitleEn,
          instructorName: courses.instructorName,
          isPublished: courses.isPublished,
          isArchived: courses.isArchived,
        })
        .from(courses)
        .where(and(eq(courses.slug, slug), eq(courses.isPublished, true), eq(courses.isArchived, false)))
        .limit(1);

      const course = rows[0];
      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      let enrolled = false;
      if (req.authUser) {
        const enrRows = await db
          .select({ status: enrollments.status, expiresAt: enrollments.expiresAt })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, req.authUser.id), eq(enrollments.courseId, course.id)))
          .limit(1);
        const enr = enrRows[0];
        enrolled = isEnrollmentValid(
          enr
            ? { status: enr.status as 'active' | 'revoked', expiresAt: enr.expiresAt }
            : undefined,
        );
      }

      const modules = await loadCourseModules(course.id, true, req.authUser?.id);
      const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
      const completedLessons = modules.reduce(
        (sum, m) => sum + m.lessons.filter((l) => l.completed).length,
        0,
      );

      res.json({
        course: {
          ...course,
          enrolled,
          progressPercent: calculateCourseProgressPercent(totalLessons, completedLessons),
          modules,
        },
      });
    }),
  );

  router.post(
    '/progress',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = progressUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid progress payload' });
        return;
      }

      const userId = req.authUser!.id;
      const lessonRows = await db
        .select({
          id: lessons.id,
          courseId: lessons.courseId,
          durationSeconds: lessons.durationSeconds,
          isFreePreview: lessons.isFreePreview,
        })
        .from(lessons)
        .innerJoin(courses, eq(courses.id, lessons.courseId))
        .where(and(eq(lessons.id, parsed.data.lessonId), eq(courses.isPublished, true)))
        .limit(1);

      const lesson = lessonRows[0];
      if (!lesson) {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }

      const enrRows = await db
        .select({ status: enrollments.status, expiresAt: enrollments.expiresAt })
        .from(enrollments)
        .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, lesson.courseId)))
        .limit(1);

      const enr = enrRows[0];
      const hasAccess = isEnrollmentValid(
        enr ? { status: enr.status as 'active' | 'revoked', expiresAt: enr.expiresAt } : undefined,
      );

      if (!hasAccess && !lesson.isFreePreview) {
        res.status(403).json({ error: 'Enrollment required to record progress' });
        return;
      }

      const existingRows = await db
        .select({
          id: lessonProgress.id,
          watchedSeconds: lessonProgress.watchedSeconds,
          completed: lessonProgress.completed,
          completedAt: lessonProgress.completedAt,
        })
        .from(lessonProgress)
        .where(and(eq(lessonProgress.studentId, userId), eq(lessonProgress.lessonId, lesson.id)))
        .limit(1);

      const existing = existingRows[0];
      const maxWatched = Math.max(existing?.watchedSeconds ?? 0, Math.floor(parsed.data.watchedSeconds));
      const isNowCompleted = evaluateLessonCompletion({
        alreadyCompleted: Boolean(existing?.completed),
        watchedSeconds: maxWatched,
        durationSeconds: lesson.durationSeconds,
        explicitMarkComplete: parsed.data.explicitMarkComplete,
      });

      const now = new Date().toISOString();
      const completedAt = isNowCompleted ? existing?.completedAt ?? now : null;

      if (existing) {
        await db
          .update(lessonProgress)
          .set({
            lastPositionSeconds: Math.floor(parsed.data.lastPositionSeconds),
            watchedSeconds: maxWatched,
            completed: isNowCompleted,
            completedAt,
            updatedAt: now,
          })
          .where(eq(lessonProgress.id, existing.id));
      } else {
        await db.insert(lessonProgress).values({
          id: newId('prg'),
          studentId: userId,
          lessonId: lesson.id,
          courseId: lesson.courseId,
          lastPositionSeconds: Math.floor(parsed.data.lastPositionSeconds),
          watchedSeconds: maxWatched,
          completed: isNowCompleted,
          completedAt,
          updatedAt: now,
        });
      }

      res.json({
        ok: true,
        completed: isNowCompleted,
        watchedSeconds: maxWatched,
      });
    }),
  );

  router.get(
    '/attachments/:lessonId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const lessonId = String(req.params.lessonId || '');
      const lessonRows = await db
        .select({
          id: lessons.id,
          courseId: lessons.courseId,
          titleAr: lessons.titleAr,
          titleEn: lessons.titleEn,
          isFreePreview: lessons.isFreePreview,
          attachmentName: lessons.attachmentName,
        })
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);

      const lesson = lessonRows[0];
      if (!lesson || !lesson.attachmentName) {
        res.status(404).json({ error: 'Attachment not found' });
        return;
      }

      const enrRows = await db
        .select({ status: enrollments.status, expiresAt: enrollments.expiresAt })
        .from(enrollments)
        .where(and(eq(enrollments.studentId, req.authUser!.id), eq(enrollments.courseId, lesson.courseId)))
        .limit(1);

      const enr = enrRows[0];
      const hasAccess = isEnrollmentValid(
        enr ? { status: enr.status as 'active' | 'revoked', expiresAt: enr.expiresAt } : undefined,
      );

      if (!hasAccess && !lesson.isFreePreview && req.authUser!.role === 'student') {
        res.status(403).json({ error: 'Enrollment required to download this attachment' });
        return;
      }

      const content = [
        `BALANCE ACADEMY — Lesson Study Resource`,
        `Lesson: ${lesson.titleEn} / ${lesson.titleAr}`,
        `Authorized Student: ${req.authUser!.fullName} (${maskEmailForWatermark(req.authUser!.email)})`,
        `Generated: ${new Date().toISOString()}`,
        ``,
        `Checklist & Notes:`,
        `1. Organize project assets using standardized folder naming.`,
        `2. Verify export specifications and color space before client delivery.`,
        `3. Apply lesson exercise inside your workspace before advancing.`,
      ].join('\n');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(lesson.attachmentName)}"`);
      res.send(content);
    }),
  );

  router.get(
    '/notifications',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await db
        .select({
          id: notifications.id,
          userId: notifications.userId,
          eventType: notifications.eventType,
          titleAr: notifications.titleAr,
          titleEn: notifications.titleEn,
          bodyAr: notifications.bodyAr,
          bodyEn: notifications.bodyEn,
          isRead: notifications.isRead,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(eq(notifications.userId, req.authUser!.id))
        .orderBy(desc(notifications.createdAt))
        .limit(30);
      res.json({ notifications: rows });
    }),
  );

  router.patch(
    '/notifications/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const notifId = String(req.params.id || '');
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, notifId), eq(notifications.userId, req.authUser!.id)));
      res.json({ ok: true });
    }),
  );

  router.post(
    '/reviews',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = createReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Valid rating (1-5) and comment are required' });
        return;
      }

      const userId = req.authUser!.id;
      const enrRows = await db
        .select({ status: enrollments.status, expiresAt: enrollments.expiresAt })
        .from(enrollments)
        .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, parsed.data.courseId)))
        .limit(1);

      const enr = enrRows[0];
      if (!isEnrollmentValid(enr ? { status: enr.status as 'active' | 'revoked', expiresAt: enr.expiresAt } : undefined)) {
        res.status(403).json({ error: 'Only enrolled students can submit a review' });
        return;
      }

      const now = new Date().toISOString();
      await db
        .insert(courseReviews)
        .values({
          id: newId('rev'),
          courseId: parsed.data.courseId,
          studentId: userId,
          rating: parsed.data.rating,
          comment: parsed.data.comment,
          isPublished: false,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [courseReviews.courseId, courseReviews.studentId],
          set: {
            rating: parsed.data.rating,
            comment: parsed.data.comment,
            isPublished: false,
          },
        });

      res.status(201).json({ ok: true });
    }),
  );

  return router;
}
