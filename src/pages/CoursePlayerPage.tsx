import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Lock,
  PlayCircle,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch } from '../lib/authToken';
import { formatDurationCompact } from '../lib/domain/rules';
import type { CourseModule, LessonItem } from '../types';
import { ProtectedVideoPlayer } from '../components/player/ProtectedVideoPlayer';
import { Button, ProgressBar, StatusText } from '../components/ui/DesignSystem';

interface LearnCourseData {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  enrolled: boolean;
  progressPercent: number;
  modules: CourseModule[];
}

export function CoursePlayerPage({
  slug,
  lessonId,
  navigate,
}: {
  slug: string;
  lessonId?: string;
  navigate: (path: string) => void;
}) {
  const { t, locale, dir, user, pushToast } = useApp();
  const [course, setCourse] = useState<LearnCourseData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLearnData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/student/learn/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setCourse(data.course);
      } else {
        setCourse(null);
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadLearnData();
  }, [loadLearnData]);

  const allLessons: LessonItem[] = course ? course.modules.flatMap((m) => m.lessons) : [];
  const activeLesson =
    (lessonId ? allLessons.find((l) => l.id === lessonId) : undefined) || allLessons[0];
  const activeIndex = activeLesson ? allLessons.findIndex((l) => l.id === activeLesson.id) : -1;
  const prevLesson = activeIndex > 0 ? allLessons[activeIndex - 1] : null;
  const nextLesson =
    activeIndex >= 0 && activeIndex < allLessons.length - 1 ? allLessons[activeIndex + 1] : null;

  const sendProgressUpdate = useCallback(
    async (
      targetLessonId: string,
      lastPositionSeconds: number,
      watchedSeconds: number,
      explicitMarkComplete = false,
    ) => {
      if (!user) return;
      const res = await apiFetch('/api/student/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: targetLessonId,
          lastPositionSeconds,
          watchedSeconds,
          explicitMarkComplete,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { completed: boolean };
        if (explicitMarkComplete && !data.completed) {
          pushToast(
            'info',
            locale === 'ar'
              ? 'يرجى مشاهدة جزء فعلي من الدرس قبل تحديده كمكتمل.'
              : 'Watch the lesson before marking it as completed.',
          );
          return;
        }
        setCourse((prev) => {
          if (!prev) return prev;
          const updatedModules = prev.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === targetLessonId
                ? {
                    ...l,
                    completed: data.completed,
                    lastPositionSeconds,
                    watchedSeconds: Math.max(l.watchedSeconds ?? 0, watchedSeconds),
                  }
                : l,
            ),
          }));
          const flat = updatedModules.flatMap((m) => m.lessons);
          const done = flat.filter((l) => l.completed).length;
          return {
            ...prev,
            modules: updatedModules,
            progressPercent: flat.length > 0 ? Math.round((done / flat.length) * 100) : 0,
          };
        });
      }
    },
    [user, locale, pushToast],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="h-96 rounded-xl border border-[#E2E8F0] bg-white animate-pulse" />
      </div>
    );
  }

  if (!course || !activeLesson) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[#172554]">
          {locale === 'ar' ? 'المحتوى غير متاح' : 'Course content unavailable'}
        </h1>
        <Button className="mt-4" variant="secondary" onClick={() => navigate('/courses')}>
          {t.catalog.title}
        </Button>
      </div>
    );
  }

  const BackArrow = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const courseTitle = locale === 'ar' ? course.titleAr : course.titleEn;
  const lessonTitle = locale === 'ar' ? activeLesson.titleAr : activeLesson.titleEn;
  const lessonDesc = locale === 'ar' ? activeLesson.descriptionAr : activeLesson.descriptionEn;
  const isStaff = user?.role === 'super_admin' || user?.role === 'content_manager';
  const canAccessLesson = course.enrolled || activeLesson.isFreePreview || isStaff;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top Learning Header */}
      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(user ? '/student' : `/courses/${course.slug}`)}
            >
              <BackArrow className="h-3.5 w-3.5" />
              <span>{user ? t.player.backToDashboard : t.player.backToCourse}</span>
            </Button>
            <h1 className="text-sm sm:text-base font-bold text-[#172554] truncate">
              {courseTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-56">
            <div className="flex-1">
              <ProgressBar percent={course.progressPercent} />
            </div>
            <span className="text-xs font-semibold text-[#172554] tabular-nums">
              {course.progressPercent}%
            </span>
          </div>
        </div>
      </header>

      {/* Player + Curriculum Split */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Player Column */}
          <div className="lg:col-span-8 space-y-5">
            {canAccessLesson ? (
              <ProtectedVideoPlayer
                lessonId={activeLesson.id}
                lessonTitle={lessonTitle}
                initialPositionSeconds={activeLesson.lastPositionSeconds ?? 0}
                durationSeconds={activeLesson.durationSeconds}
                onProgressTick={(pos, watched) =>
                  void sendProgressUpdate(activeLesson.id, pos, watched, false)
                }
              />
            ) : (
              <div className="aspect-video w-full rounded-xl border border-[#E2E8F0] bg-[#172554] flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
                <Lock className="h-10 w-10 text-[#60A5FA]" />
                <h2 className="text-lg font-bold">{t.player.lockedTitle}</h2>
                <p className="max-w-md text-sm text-white/80">{t.player.lockedBody}</p>
                <Button variant="primary" onClick={() => navigate(`/courses/${course.slug}`)}>
                  {t.course.buyNow}
                </Button>
              </div>
            )}

            {/* Lesson Metadata & Actions */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-[#172554]">{lessonTitle}</h2>
                  <p className="text-xs text-[#64748B] tabular-nums">
                    {formatDurationCompact(activeLesson.durationSeconds, locale)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeLesson.completed ? (
                    <StatusText
                      tone="success"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      label={t.player.completed}
                    />
                  ) : (
                    user &&
                    canAccessLesson && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void sendProgressUpdate(
                            activeLesson.id,
                            activeLesson.lastPositionSeconds ?? 0,
                            Math.max(activeLesson.watchedSeconds ?? 0, 15),
                            true,
                          )
                        }
                      >
                        {t.player.markComplete}
                      </Button>
                    )
                  )}
                </div>
              </div>

              {lessonDesc && (
                <p className="text-sm text-[#64748B] leading-relaxed border-t border-[#E2E8F0] pt-4">
                  {lessonDesc}
                </p>
              )}

              {activeLesson.attachmentName && canAccessLesson && (
                <div className="border-t border-[#E2E8F0] pt-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">{t.player.attachments}</p>
                    <p className="text-xs text-[#64748B]">{activeLesson.attachmentName}</p>
                  </div>
                  <a
                    href={activeLesson.attachmentUrl || `/api/student/attachments/${activeLesson.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#172554] hover:border-[#3B82F6]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{t.player.downloadAttachment}</span>
                  </a>
                </div>
              )}

              <div className="border-t border-[#E2E8F0] pt-4 flex items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!prevLesson}
                  onClick={() => prevLesson && navigate(`/learn/${course.slug}/${prevLesson.id}`)}
                >
                  {t.player.prevLesson}
                </Button>
                <Button
                  size="sm"
                  variant="navy"
                  disabled={!nextLesson}
                  onClick={() => nextLesson && navigate(`/learn/${course.slug}/${nextLesson.id}`)}
                >
                  {t.player.nextLesson}
                </Button>
              </div>
            </div>
          </div>

          {/* Curriculum Sidebar */}
          <aside className="lg:col-span-4">
            <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="border-b border-[#E2E8F0] px-5 py-4">
                <h2 className="text-sm font-bold text-[#172554]">{t.player.curriculum}</h2>
              </div>
              <div className="divide-y divide-[#E2E8F0] max-h-[75vh] overflow-y-auto">
                {course.modules.map((mod) => (
                  <div key={mod.id} className="p-4 space-y-2">
                    <p className="text-xs font-bold text-[#64748B]">
                      {locale === 'ar' ? mod.titleAr : mod.titleEn}
                    </p>
                    <div className="space-y-1">
                      {mod.lessons.map((l) => {
                        const isCurrent = l.id === activeLesson.id;
                        const unlocked = course.enrolled || l.isFreePreview || isStaff;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => navigate(`/learn/${course.slug}/${l.id}`)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-xs transition-colors cursor-pointer ${
                              isCurrent
                                ? 'bg-[#3B82F6]/10 text-[#172554] font-semibold'
                                : 'text-[#111827] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              {l.completed ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A] shrink-0" />
                              ) : unlocked ? (
                                <PlayCircle className="h-3.5 w-3.5 text-[#3B82F6] shrink-0" />
                              ) : (
                                <Lock className="h-3.5 w-3.5 text-[#64748B] shrink-0" />
                              )}
                              <span className="truncate">
                                {locale === 'ar' ? l.titleAr : l.titleEn}
                              </span>
                            </span>
                            <span className="text-[11px] text-[#64748B] tabular-nums shrink-0">
                              {formatDurationCompact(l.durationSeconds, locale)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
