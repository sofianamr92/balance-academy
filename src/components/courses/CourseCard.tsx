import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatCurrencyEgp, formatDurationCompact } from '../../lib/domain/rules';
import type { CourseSummary } from '../../types';
import { Button } from '../ui/DesignSystem';

export function CourseCard({
  course,
  onSelect,
}: {
  course: CourseSummary;
  onSelect: (slug: string) => void;
}) {
  const { locale, t } = useApp();
  const [imgFailed, setImgFailed] = useState(false);

  const title = locale === 'ar' ? course.titleAr : course.titleEn;
  const subtitle = locale === 'ar' ? course.subtitleAr : course.subtitleEn;
  const categoryName = locale === 'ar' ? course.categoryNameAr : course.categoryNameEn;
  const levelLabel = t.catalog.levels[course.level];
  const durationLabel = formatDurationCompact(course.totalDurationSeconds || 900, locale);

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white transition-colors hover:border-[#CBD5E1]">
      <div className="aspect-[4/3] w-full overflow-hidden bg-[#172554]/5">
        {!imgFailed && course.thumbnailUrl ? (
          <img
            src={course.thumbnailUrl}
            alt={title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#172554] to-[#1E3A8A] p-4 text-white">
            <BookOpen className="h-8 w-8 text-white/80" />
            <span className="mt-2 text-xs font-medium text-white/85 text-center line-clamp-2">
              {title}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Clean unboxed metadata row — no static pill sandwiches */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748B]">
          <span className="font-medium text-[#3B82F6]">{categoryName}</span>
          <span aria-hidden="true">·</span>
          <span>{levelLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {course.lessonsCount} {t.catalog.lessonsLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{durationLabel}</span>
        </div>

        <h3 className="mt-2.5 text-base font-semibold text-[#111827] leading-snug line-clamp-2">
          {title}
        </h3>
        <p className="mt-1.5 text-sm text-[#64748B] line-clamp-2 flex-1">{subtitle}</p>

        <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[#172554] tabular-nums">
              {formatCurrencyEgp(course.priceEgp, locale)}
            </p>
            <p className="text-xs text-[#64748B]">{t.catalog.lifetimeLabel}</p>
          </div>

          <Button variant="secondary" size="sm" onClick={() => onSelect(course.slug)}>
            {t.catalog.viewDetails}
          </Button>
        </div>
      </div>
    </article>
  );
}
