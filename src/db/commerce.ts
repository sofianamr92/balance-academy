import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  notifications,
  paymentSubmissions,
  platformSettings,
  purchases,
} from './schema.ts';
import { newId } from './users.ts';
import { calculateCourseProgressPercent, isEnrollmentValid } from '../lib/domain/rules.ts';

export async function listStudentPurchases(studentId: string) {
  try {
    return await db
      .select({
        id: purchases.id,
        studentId: purchases.studentId,
        courseId: purchases.courseId,
        courseTitleAr: courses.titleAr,
        courseTitleEn: courses.titleEn,
        courseSlug: courses.slug,
        amountEgp: purchases.amountEgp,
        currency: purchases.currency,
        status: purchases.status,
        paymentMethod: purchases.paymentMethod,
        referenceCode: purchases.referenceCode,
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
      .innerJoin(courses, eq(courses.id, purchases.courseId))
      .leftJoin(paymentSubmissions, eq(paymentSubmissions.purchaseId, purchases.id))
      .where(eq(purchases.studentId, studentId))
      .orderBy(desc(purchases.createdAt));
  } catch (error) {
    console.error('Database query failed in listStudentPurchases:', error);
    throw new Error('Failed to load purchases.', { cause: error });
  }
}

export async function getPublicPaymentInstructions() {
  try {
    const rows = await db
      .select({ key: platformSettings.key, value: platformSettings.value })
      .from(platformSettings)
      .where(
        inArray(platformSettings.key, [
          'vodafone_cash_number',
          'instapay_handle',
          'bank_account_iban',
          'support_email',
        ]),
      );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  } catch (error) {
    console.error('Database query failed in getPublicPaymentInstructions:', error);
    throw new Error('Failed to load payment instructions.', { cause: error });
  }
}

export async function getStudentDashboardData(userId: string) {
  try {
    const [enrRows, allCourseLessons, userProgress, progressRecentRows, purchasesList, notifRows, paymentInstructions] =
      await Promise.all([
        db
          .select({
            enrollmentId: enrollments.id,
            status: enrollments.status,
            expiresAt: enrollments.expiresAt,
            enrolledAt: enrollments.createdAt,
            id: courses.id,
            slug: courses.slug,
            titleAr: courses.titleAr,
            titleEn: courses.titleEn,
            subtitleAr: courses.subtitleAr,
            subtitleEn: courses.subtitleEn,
            instructorName: courses.instructorName,
            thumbnailUrl: courses.thumbnailUrl,
            level: courses.level,
            isDemoData: courses.isDemoData,
            categoryNameAr: categories.nameAr,
            categoryNameEn: categories.nameEn,
          })
          .from(enrollments)
          .innerJoin(courses, eq(courses.id, enrollments.courseId))
          .innerJoin(categories, eq(categories.id, courses.categoryId))
          .where(and(eq(enrollments.studentId, userId), eq(enrollments.status, 'active')))
          .orderBy(desc(enrollments.createdAt)),
        db.select({ courseId: lessons.courseId }).from(lessons),
        db
          .select({ courseId: lessonProgress.courseId, completed: lessonProgress.completed })
          .from(lessonProgress)
          .where(eq(lessonProgress.studentId, userId)),
        db
          .select({
            lessonId: lessonProgress.lessonId,
            courseId: lessonProgress.courseId,
            lastPositionSeconds: lessonProgress.lastPositionSeconds,
            watchedSeconds: lessonProgress.watchedSeconds,
            completed: lessonProgress.completed,
            updatedAt: lessonProgress.updatedAt,
            lessonTitleAr: lessons.titleAr,
            lessonTitleEn: lessons.titleEn,
            durationSeconds: lessons.durationSeconds,
            courseSlug: courses.slug,
            courseTitleAr: courses.titleAr,
            courseTitleEn: courses.titleEn,
          })
          .from(lessonProgress)
          .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
          .innerJoin(courses, eq(courses.id, lessonProgress.courseId))
          .innerJoin(
            enrollments,
            and(
              eq(enrollments.courseId, courses.id),
              eq(enrollments.studentId, lessonProgress.studentId),
              eq(enrollments.status, 'active'),
            ),
          )
          .where(eq(lessonProgress.studentId, userId))
          .orderBy(desc(lessonProgress.updatedAt))
          .limit(5),
        listStudentPurchases(userId),
        db
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
          .where(eq(notifications.userId, userId))
          .orderBy(desc(notifications.createdAt))
          .limit(20),
        getPublicPaymentInstructions(),
      ]);

    const lessonCountByCourse = new Map<string, number>();
    for (const l of allCourseLessons) {
      lessonCountByCourse.set(l.courseId, (lessonCountByCourse.get(l.courseId) ?? 0) + 1);
    }
    const completedByCourse = new Map<string, number>();
    for (const p of userProgress) {
      if (p.completed) {
        completedByCourse.set(p.courseId, (completedByCourse.get(p.courseId) ?? 0) + 1);
      }
    }

    const activeEnrollments = enrRows
      .filter((e) =>
        isEnrollmentValid({
          status: e.status as 'active' | 'revoked',
          expiresAt: e.expiresAt ?? null,
        }),
      )
      .map((e) => {
        const totalLessons = lessonCountByCourse.get(e.id) ?? 0;
        const completedLessons = completedByCourse.get(e.id) ?? 0;
        return {
          ...e,
          totalLessons,
          completedLessons,
          progressPercent: calculateCourseProgressPercent(totalLessons, completedLessons),
        };
      });

    const totalCompletedLessons = activeEnrollments.reduce((sum, e) => sum + e.completedLessons, 0);
    const totalLessonsAcrossCourses = activeEnrollments.reduce((sum, e) => sum + e.totalLessons, 0);

    return {
      enrollments: activeEnrollments,
      recentLessons: progressRecentRows,
      purchases: purchasesList,
      notifications: notifRows,
      paymentInstructions,
      stats: {
        enrolledCoursesCount: activeEnrollments.length,
        completedLessonsCount: totalCompletedLessons,
        totalLessonsCount: totalLessonsAcrossCourses,
        pendingPurchasesCount: purchasesList.filter(
          (p) => p.status === 'pending' || p.status === 'proof_submitted',
        ).length,
      },
    };
  } catch (error) {
    console.error('Database query failed in getStudentDashboardData:', error);
    throw new Error('Failed to load student dashboard.', { cause: error });
  }
}

export async function grantLifetimeEnrollment(params: {
  studentId: string;
  courseId: string;
  grantedBy: string;
  purchaseId?: string | null;
}) {
  try {
    const now = new Date().toISOString();
    const existing = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, params.studentId), eq(enrollments.courseId, params.courseId)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(enrollments)
        .set({
          status: 'active',
          purchaseId: params.purchaseId ?? null,
          grantedBy: params.grantedBy,
          expiresAt: null,
          revokedAt: null,
          revokeReason: null,
          updatedAt: now,
        })
        .where(eq(enrollments.id, existing[0].id));
      return existing[0].id;
    }

    const id = newId('enr');
    await db.insert(enrollments).values({
      id,
      studentId: params.studentId,
      courseId: params.courseId,
      purchaseId: params.purchaseId ?? null,
      grantedBy: params.grantedBy,
      status: 'active',
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } catch (error) {
    console.error('Database query failed in grantLifetimeEnrollment:', error);
    throw new Error('Failed to grant enrollment.', { cause: error });
  }
}
