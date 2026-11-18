import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type { Category, CourseSummary } from '../types';
import { CourseCard } from '../components/courses/CourseCard';
import { EmptyState } from '../components/ui/DesignSystem';

export function CatalogPage({
  initialCategory = 'all',
  navigate,
}: {
  initialCategory?: string;
  navigate: (path: string) => void;
}) {
  const { t, locale } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    fetch('/api/public/categories')
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedLevel !== 'all') params.set('level', selectedLevel);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());

    fetch(`/api/public/courses?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setCourses(data.courses || []))
      .finally(() => setLoading(false));
  }, [selectedCategory, selectedLevel, searchQuery]);

  const activeCategoryObj = categories.find((c) => c.slug === selectedCategory);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#172554]">
          {activeCategoryObj
            ? locale === 'ar'
              ? activeCategoryObj.nameAr
              : activeCategoryObj.nameEn
            : t.catalog.title}
        </h1>
        <p className="text-sm text-[#64748B]">
          {activeCategoryObj
            ? locale === 'ar'
              ? activeCategoryObj.descriptionAr
              : activeCategoryObj.descriptionEn
            : t.catalog.subtitle}
        </p>
      </div>

      {/* Filters Toolbar */}
      <div className="mb-8 flex flex-col gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-white text-[#172554] shadow-sm'
                : 'text-[#64748B] hover:text-[#111827]'
            }`}
          >
            {t.catalog.allCategories}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.slug)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === cat.slug
                  ? 'bg-white text-[#172554] shadow-sm'
                  : 'text-[#64748B] hover:text-[#111827]'
              }`}
            >
              {locale === 'ar' ? cat.nameAr : cat.nameEn}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-[#64748B]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.catalog.searchPlaceholder}
              aria-label={t.catalog.searchPlaceholder}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white ps-9 pe-3 py-2 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            aria-label={t.catalog.allLevels}
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#111827] focus:border-[#3B82F6] focus:outline-none"
          >
            <option value="all">{t.catalog.allLevels}</option>
            <option value="beginner">{t.catalog.levels.beginner}</option>
            <option value="intermediate">{t.catalog.levels.intermediate}</option>
            <option value="advanced">{t.catalog.levels.advanced}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-80 rounded-xl border border-[#E2E8F0] bg-white animate-pulse" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState title={t.catalog.emptyTitle} description={t.catalog.emptyBody} />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onSelect={(slug) => navigate(`/courses/${slug}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
