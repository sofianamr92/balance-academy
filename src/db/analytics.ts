import { and, desc, eq, gt, gte, lte } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  contactMessages,
  courseReviews,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  profiles,
  purchases,
  roles,
  securityLogs,
  watchSessions,
} from './schema.ts';

export async function getAdminOverviewData(isSuperAdmin: boolean) {
  try {
    const [allUserRows, courseRows, lessonRows, recentRegistrations] = await Promise.all([
      db
        .select({
          id: profiles.id,
          roleName: roles.name,
        })
        .from(profiles)
        .innerJoin(roles, eq(roles.id, profiles.roleId)),
      db
        .select({ id: courses.id, isPublished: courses.isPublished })
        .from(courses)
        .where(eq(courses.isArchived, false)),
      db.select({ id: lessons.id }).from(lessons),
      db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
          role: roles.name,
          isActive: profiles.isActive,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .innerJoin(roles, eq(roles.id, profiles.roleId))
        .orderBy(desc(profiles.createdAt))
        .limit(8),
    ]);

    const studentsCount = allUserRows.filter((u) => u.roleName === 'student').length;
    const overview: Record<string, unknown> = {
      studentsCount,
      totalUsersCount: allUserRows.length,
      publishedCoursesCount: courseRows.filter((c) => c.isPublished).length,
      totalCoursesCount: courseRows.length,
      totalLessonsCount: lessonRows.length,
    };

    if (isSuperAdmin) {
      const nowIso = new Date().toISOString();
      const [allPurchases, activeEnrRows, activeSessionRows, contactRows, reviewRows] = await Promise.all([
        db.select({ status: purchases.status, amountEgp: purchases.amountEgp }).from(purchases),
        db.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.status, 'active')),
        db
          .select({ id: watchSessions.id })
          .from(watchSessions)
          .where(and(eq(watchSessions.isRevoked, false), gt(watchSessions.expiresAt, nowIso))),
        db.select({ id: contactMessages.id }).from(contactMessages),
        db.select({ id: courseReviews.id }).from(courseReviews),
      ]);

      const pendingPaymentsCount = allPurchases.filter(
        (p) => p.status === 'pending' || p.status === 'proof_submitted',
      ).length;
      const confirmedRevenueEgp = allPurchases
        .filter((p) => p.status === 'approved')
        .reduce((sum, p) => sum + Number(p.amountEgp || 0), 0);

      Object.assign(overview, {
        pendingPaymentsCount,
        confirmedRevenueEgp,
        activeEnrollmentsCount: activeEnrRows.length,
        activeWatchSessionsCount: activeSessionRows.length,
        contactMessagesCount: contactRows.length,
        reviewsCount: reviewRows.length,
        recentRegistrations,
      });
    }

    return overview;
  } catch (error) {
    console.error('Database query failed in getAdminOverviewData:', error);
    throw new Error('Failed to load overview metrics.', { cause: error });
  }
}

export async function getAdminReportsData(fromIso: string, toIso: string) {
  try {
    const [studentRows, activeEnrRows, allCourses, rangedPurchases, allLessons, completedProgress] =
      await Promise.all([
        db
          .select({ id: profiles.id })
          .from(profiles)
          .innerJoin(roles, eq(roles.id, profiles.roleId))
          .where(eq(roles.name, 'student')),
        db
          .select({ studentId: enrollments.studentId, courseId: enrollments.courseId })
          .from(enrollments)
          .where(eq(enrollments.status, 'active')),
        db.select().from(courses),
        db
          .select()
          .from(purchases)
          .where(and(gte(purchases.createdAt, fromIso), lte(purchases.createdAt, toIso))),
        db.select({ courseId: lessons.courseId }).from(lessons),
        db
          .select({ courseId: lessonProgress.courseId })
          .from(lessonProgress)
          .where(eq(lessonProgress.completed, true)),
      ]);

    const activeStudentSet = new Set(activeEnrRows.map((e) => e.studentId));
    const publishedCourses = allCourses.filter((c) => c.isPublished && !c.isArchived).length;
    const totalPurchases = rangedPurchases.length;
    const pendingPayments = rangedPurchases.filter(
      (p) => p.status === 'pending' || p.status === 'proof_submitted',
    ).length;
    const confirmedRevenueEgp = rangedPurchases
      .filter((p) => p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.amountEgp || 0), 0);

    const bestSellingCourses = allCourses
      .map((c) => {
        const approved = rangedPurchases.filter((p) => p.courseId === c.id && p.status === 'approved');
        return {
          id: c.id,
          titleAr: c.titleAr,
          titleEn: c.titleEn,
          approvedSales: approved.length,
          revenueEgp: approved.reduce((sum, p) => sum + Number(p.amountEgp || 0), 0),
        };
      })
      .sort((a, b) => b.approvedSales - a.approvedSales || b.revenueEgp - a.revenueEgp);

    const courseCompletions = allCourses
      .filter((c) => !c.isArchived)
      .map((c) => {
        const enrolledCount = activeEnrRows.filter((e) => e.courseId === c.id).length;
        const lessonsCount = allLessons.filter((l) => l.courseId === c.id).length;
        const completedLessonsTotal = completedProgress.filter((p) => p.courseId === c.id).length;
        const denom = enrolledCount * lessonsCount;
        const completionRatePercent = denom > 0 ? Math.round((completedLessonsTotal / denom) * 100) : 0;
        return {
          id: c.id,
          titleAr: c.titleAr,
          titleEn: c.titleEn,
          enrolledCount,
          lessonsCount,
          completedLessonsTotal,
          completionRatePercent,
        };
      });

    return {
      totalStudents: studentRows.length,
      activeStudents: activeStudentSet.size,
      publishedCourses,
      totalPurchases,
      pendingPayments,
      confirmedRevenueEgp,
      bestSellingCourses,
      courseCompletions,
    };
  } catch (error) {
    console.error('Database query failed in getAdminReportsData:', error);
    throw new Error('Failed to load analytics reports.', { cause: error });
  }
}

export async function getAdminLogsData() {
  try {
    const [secRows, audRows] = await Promise.all([
      db
        .select({
          id: securityLogs.id,
          userId: securityLogs.userId,
          userEmail: profiles.email,
          eventType: securityLogs.eventType,
          severity: securityLogs.severity,
          ipAddress: securityLogs.ipAddress,
          details: securityLogs.details,
          createdAt: securityLogs.createdAt,
        })
        .from(securityLogs)
        .leftJoin(profiles, eq(profiles.id, securityLogs.userId))
        .orderBy(desc(securityLogs.createdAt))
        .limit(80),
      db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          actorEmail: profiles.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(profiles, eq(profiles.id, auditLogs.actorId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(80),
    ]);

    return { securityLogs: secRows, auditLogs: audRows };
  } catch (error) {
    console.error('Database query failed in getAdminLogsData:', error);
    throw new Error('Failed to load audit and security logs.', { cause: error });
  }
}

export async function listContactMessages() {
  try {
    return await db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(100);
  } catch (error) {
    console.error('Database query failed in listContactMessages:', error);
    throw new Error('Failed to load contact messages.', { cause: error });
  }
}

export async function listAdminReviews() {
  try {
    return await db
      .select({
        id: courseReviews.id,
        courseId: courseReviews.courseId,
        courseTitleAr: courses.titleAr,
        courseTitleEn: courses.titleEn,
        studentId: courseReviews.studentId,
        studentName: profiles.fullName,
        studentEmail: profiles.email,
        rating: courseReviews.rating,
        comment: courseReviews.comment,
        isPublished: courseReviews.isPublished,
        createdAt: courseReviews.createdAt,
      })
      .from(courseReviews)
      .innerJoin(courses, eq(courses.id, courseReviews.courseId))
      .innerJoin(profiles, eq(profiles.id, courseReviews.studentId))
      .orderBy(desc(courseReviews.createdAt))
      .limit(100);
  } catch (error) {
    console.error('Database query failed in listAdminReviews:', error);
    throw new Error('Failed to load reviews.', { cause: error });
  }
}
