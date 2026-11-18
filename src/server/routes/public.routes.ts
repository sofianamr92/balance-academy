import express from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  getPublicCategoriesData,
  getPublicHomeData,
  getPublishedCourseBySlug,
  loadCourseModules,
  searchPublicCourses,
} from '../../db/catalog.ts';
import { getPublicPaymentInstructions } from '../../db/commerce.ts';
import { db } from '../../db/index.ts';
import { contactMessages, enrollments, purchases } from '../../db/schema.ts';
import { newId } from '../../db/users.ts';
import { isEnrollmentValid } from '../../lib/domain/rules.ts';
import { contactSchema } from '../../lib/validation/schemas.ts';
import { asyncHandler } from '../helpers.ts';

export function createPublicRouter(): express.Router {
  const router = express.Router();

  router.get(
    '/home',
    asyncHandler(async (_req, res) => {
      const data = await getPublicHomeData();
      res.json(data);
    }),
  );

  router.get(
    '/categories',
    asyncHandler(async (_req, res) => {
      const cats = await getPublicCategoriesData();
      res.json({ categories: cats });
    }),
  );

  router.get(
    '/courses',
    asyncHandler(async (req, res) => {
      const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const level = typeof req.query.level === 'string' ? req.query.level.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const list = await searchPublicCourses({ categorySlug, level, q });
      res.json({ courses: list });
    }),
  );

  router.get(
    '/courses/:slug',
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug || '');
      const row = await getPublishedCourseBySlug(slug);
      if (!row) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      const modules = await loadCourseModules(row.id, false);
      const totalDurationSeconds = modules.reduce(
        (acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + Number(l.durationSeconds || 0), 0),
        0,
      );
      const lessonsCount = modules.reduce((acc, m) => acc + m.lessons.length, 0);

      let enrolled = false;
      let openPurchase: Record<string, unknown> | null = null;
      if (req.authUser) {
        const enrRows = await db
          .select({ status: enrollments.status, expiresAt: enrollments.expiresAt })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, req.authUser.id), eq(enrollments.courseId, row.id)))
          .limit(1);
        const enr = enrRows[0];
        enrolled = isEnrollmentValid(
          enr
            ? { status: enr.status as 'active' | 'revoked', expiresAt: enr.expiresAt }
            : undefined,
        );

        const purRows = await db
          .select({
            id: purchases.id,
            status: purchases.status,
            paymentMethod: purchases.paymentMethod,
            referenceCode: purchases.referenceCode,
            amountEgp: purchases.amountEgp,
            createdAt: purchases.createdAt,
          })
          .from(purchases)
          .where(
            and(
              eq(purchases.studentId, req.authUser.id),
              eq(purchases.courseId, row.id),
              inArray(purchases.status, ['pending', 'proof_submitted']),
            ),
          )
          .orderBy(desc(purchases.createdAt))
          .limit(1);

        if (purRows[0]) openPurchase = purRows[0];
      }

      const paymentSettings = await getPublicPaymentInstructions();

      res.json({
        course: {
          ...row,
          totalDurationSeconds,
          lessonsCount,
          enrolled,
          modules,
        },
        openPurchase,
        paymentInstructions: paymentSettings,
      });
    }),
  );

  router.post(
    '/contact',
    asyncHandler(async (req, res) => {
      const parsed = contactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please complete all contact fields accurately' });
        return;
      }
      await db.insert(contactMessages).values({
        id: newId('msg'),
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json({ ok: true });
    }),
  );

  return router;
}
