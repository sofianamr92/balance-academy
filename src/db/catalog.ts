import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  courseModules,
  courseReviews,
  courses,
  lessonProgress,
  lessons,
  profiles,
} from './schema.ts';

export async function loadCourseModules(courseId: string, includeProgress: boolean, studentId?: string) {
  try {
    const [mods, lessonsList] = await Promise.all([
      db
        .select({
          id: courseModules.id,
          courseId: courseModules.courseId,
          titleAr: courseModules.titleAr,
          titleEn: courseModules.titleEn,
          sortOrder: courseModules.sortOrder,
        })
        .from(courseModules)
        .where(eq(courseModules.courseId, courseId))
        .orderBy(asc(courseModules.sortOrder)),
      db
        .select({
          id: lessons.id,
          moduleId: lessons.moduleId,
          courseId: lessons.courseId,
          titleAr: lessons.titleAr,
          titleEn: lessons.titleEn,
          descriptionAr: lessons.descriptionAr,
          descriptionEn: lessons.descriptionEn,
          sortOrder: lessons.sortOrder,
          durationSeconds: lessons.durationSeconds,
          isFreePreview: lessons.isFreePreview,
          videoAssetId: lessons.videoAssetId,
          attachmentName: lessons.attachmentName,
          attachmentUrl: lessons.attachmentUrl,
        })
        .from(lessons)
        .where(eq(lessons.courseId, courseId))
        .orderBy(asc(lessons.sortOrder)),
    ]);

    const progressMap = new Map<string, { completed: boolean; lastPositionSeconds: number; watchedSeconds: number }>();
    if (includeProgress && studentId) {
      const rows = await db
        .select({
          lessonId: lessonProgress.lessonId,
          completed: lessonProgress.completed,
          lastPositionSeconds: lessonProgress.lastPositionSeconds,
          watchedSeconds: lessonProgress.watchedSeconds,
        })
        .from(lessonProgress)
        .where(and(eq(lessonProgress.studentId, studentId), eq(lessonProgress.courseId, courseId)));
      for (const r of rows) {
        progressMap.set(r.lessonId, {
          completed: r.completed,
          lastPositionSeconds: r.lastPositionSeconds,
          watchedSeconds: r.watchedSeconds,
        });
      }
    }

    return mods.map((mod) => ({
      ...mod,
      lessons: lessonsList
        .filter((l) => l.moduleId === mod.id)
        .map((l) => {
          const prog = progressMap.get(l.id);
          return {
            ...l,
            durationSeconds: Number(l.durationSeconds || 0),
            completed: prog?.completed ?? false,
            lastPositionSeconds: prog?.lastPositionSeconds ?? 0,
            watchedSeconds: prog?.watchedSeconds ?? 0,
          };
        }),
    }));
  } catch (error) {
    console.error('Database query failed in loadCourseModules:', error);
    throw new Error('Failed to load course modules.', { cause: error });
  }
}

export async function getPublicHomeData() {
  try {
    const [allCats, publishedCourses, allLessons, reviewRows] = await Promise.all([
      db.select().from(categories).orderBy(asc(categories.sortOrder)),
      db
        .select({
          id: courses.id,
          slug: courses.slug,
          categoryId: courses.categoryId,
          categorySlug: categories.slug,
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
        .where(and(eq(courses.isPublished, true), eq(courses.isArchived, false)))
        .orderBy(desc(courses.isFeatured), desc(courses.createdAt)),
      db
        .select({
          courseId: lessons.courseId,
          durationSeconds: lessons.durationSeconds,
        })
        .from(lessons),
      db
        .select({
          id: courseReviews.id,
          rating: courseReviews.rating,
          comment: courseReviews.comment,
          createdAt: courseReviews.createdAt,
          studentName: profiles.fullName,
          courseTitleAr: courses.titleAr,
          courseTitleEn: courses.titleEn,
        })
        .from(courseReviews)
        .innerJoin(profiles, eq(profiles.id, courseReviews.studentId))
        .innerJoin(courses, eq(courses.id, courseReviews.courseId))
        .where(eq(courseReviews.isPublished, true))
        .orderBy(desc(courseReviews.createdAt))
        .limit(6),
    ]);

    const courseCountByCat = new Map<string, number>();
    for (const crs of publishedCourses) {
      courseCountByCat.set(crs.categoryId, (courseCountByCat.get(crs.categoryId) ?? 0) + 1);
    }

    const lessonStatsByCourse = new Map<string, { duration: number; count: number }>();
    for (const l of allLessons) {
      const cur = lessonStatsByCourse.get(l.courseId) ?? { duration: 0, count: 0 };
      cur.duration += l.durationSeconds;
      cur.count += 1;
      lessonStatsByCourse.set(l.courseId, cur);
    }

    return {
      categories: allCats.map((c) => ({
        id: c.id,
        slug: c.slug,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        descriptionAr: c.descriptionAr,
        descriptionEn: c.descriptionEn,
        sortOrder: c.sortOrder,
        courseCount: courseCountByCat.get(c.id) ?? 0,
      })),
      featuredCourses: publishedCourses.slice(0, 6).map((crs) => {
        const stats = lessonStatsByCourse.get(crs.id) ?? { duration: 0, count: 0 };
        return {
          ...crs,
          totalDurationSeconds: stats.duration,
          lessonsCount: stats.count,
        };
      }),
      reviews: reviewRows,
    };
  } catch (error) {
    console.error('Database query failed in getPublicHomeData:', error);
    throw new Error('Failed to load homepage data.', { cause: error });
  }
}

export async function getPublicCategoriesData() {
  try {
    const [allCats, publishedCourses] = await Promise.all([
      db.select().from(categories).orderBy(asc(categories.sortOrder)),
      db
        .select({ id: courses.id, categoryId: courses.categoryId })
        .from(courses)
        .where(and(eq(courses.isPublished, true), eq(courses.isArchived, false))),
    ]);

    const counts = new Map<string, number>();
    for (const crs of publishedCourses) {
      counts.set(crs.categoryId, (counts.get(crs.categoryId) ?? 0) + 1);
    }

    return allCats.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      descriptionAr: c.descriptionAr,
      descriptionEn: c.descriptionEn,
      sortOrder: c.sortOrder,
      courseCount: counts.get(c.id) ?? 0,
    }));
  } catch (error) {
    console.error('Database query failed in getPublicCategoriesData:', error);
    throw new Error('Failed to load categories.', { cause: error });
  }
}

export async function searchPublicCourses(params: { categorySlug?: string; level?: string; q?: string }) {
  try {
    const filters = [eq(courses.isPublished, true), eq(courses.isArchived, false)];
    if (params.categorySlug && params.categorySlug !== 'all') {
      filters.push(eq(categories.slug, params.categorySlug));
    }
    if (params.level && params.level !== 'all') {
      filters.push(eq(courses.level, params.level));
    }
    if (params.q) {
      const pattern = `%${params.q}%`;
      const searchCond = or(
        ilike(courses.titleAr, pattern),
        ilike(courses.titleEn, pattern),
        ilike(courses.subtitleAr, pattern),
        ilike(courses.subtitleEn, pattern),
      );
      if (searchCond) filters.push(searchCond);
    }

    const [rows, allLessons] = await Promise.all([
      db
        .select({
          id: courses.id,
          slug: courses.slug,
          categoryId: courses.categoryId,
          categorySlug: categories.slug,
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
        .where(and(...filters))
        .orderBy(desc(courses.isFeatured), desc(courses.createdAt)),
      db
        .select({
          courseId: lessons.courseId,
          durationSeconds: lessons.durationSeconds,
        })
        .from(lessons),
    ]);

    const statsMap = new Map<string, { duration: number; count: number }>();
    for (const l of allLessons) {
      const cur = statsMap.get(l.courseId) ?? { duration: 0, count: 0 };
      cur.duration += l.durationSeconds;
      cur.count += 1;
      statsMap.set(l.courseId, cur);
    }

    return rows.map((row) => {
      const st = statsMap.get(row.id) ?? { duration: 0, count: 0 };
      return {
        ...row,
        totalDurationSeconds: st.duration,
        lessonsCount: st.count,
      };
    });
  } catch (error) {
    console.error('Database query failed in searchPublicCourses:', error);
    throw new Error('Failed to load courses catalog.', { cause: error });
  }
}

export async function getPublishedCourseBySlug(slug: string) {
  try {
    const rows = await db
      .select({
        id: courses.id,
        slug: courses.slug,
        categoryId: courses.categoryId,
        categorySlug: categories.slug,
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
      .where(and(eq(courses.slug, slug), eq(courses.isPublished, true), eq(courses.isArchived, false)))
      .limit(1);

    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getPublishedCourseBySlug:', error);
    throw new Error('Failed to load course details.', { cause: error });
  }
}
