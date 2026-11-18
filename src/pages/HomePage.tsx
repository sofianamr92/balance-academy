import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, FolderKanban } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type { Category, CourseSummary } from '../types';
import { CourseCard } from '../components/courses/CourseCard';
import { Button } from '../components/ui/DesignSystem';

interface ReviewItem {
  id: string;
  rating: number;
  comment: string;
  studentName: string;
  courseTitleAr: string;
  courseTitleEn: string;
}

export function HomePage({ navigate }: { navigate: (path: string) => void }) {
  const { t, locale, dir } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredCourses, setFeaturedCourses] = useState<CourseSummary[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public/home')
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories || []);
        setFeaturedCourses(data.featuredCourses || []);
        setReviews(data.reviews || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const ArrowIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <div className="bg-[#F8FAFC]">
      {/* 1. Hero Section */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
              <p className="text-xs font-semibold text-[#3B82F6]">{t.hero.kicker}</p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#172554] leading-[1.25]">
                {t.hero.title}
              </h1>
              <p className="text-base text-[#64748B] leading-relaxed max-w-xl">
                {t.hero.subtitle}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button variant="primary" size="lg" onClick={() => navigate('/courses')}>
                  <span>{t.hero.primaryCta}</span>
                  <ArrowIcon className="h-4 w-4" />
                </Button>
                <Button variant="secondary" size="lg" onClick={() => navigate('/register')}>
                  {t.hero.secondaryCta}
                </Button>
              </div>

              <p className="text-xs text-[#64748B] pt-2">{t.hero.demoNotice}</p>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#172554]">
                <img
                  src="/src/assets/images/hero_academy_workspace_1794993398173.jpg"
                  alt="BALANCE ACADEMY Studio Workspace"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Academy Introduction */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-xl font-bold text-[#172554]">{t.home.introTitle}</h2>
            <p className="text-sm text-[#64748B] leading-relaxed">{t.home.introBody}</p>
          </div>
          <Button variant="navy" onClick={() => navigate('/about')}>
            {t.nav.about}
          </Button>
        </div>
      </section>

      {/* 3. Featured Courses */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#172554]">{t.home.featuredTitle}</h2>
            <p className="mt-1 text-sm text-[#64748B]">{t.home.featuredSubtitle}</p>
          </div>
          <Button variant="ghost" onClick={() => navigate('/courses')}>
            <span>{t.hero.primaryCta}</span>
            <ArrowIcon className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-80 rounded-xl border border-[#E2E8F0] bg-white animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featuredCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onSelect={(slug) => navigate(`/courses/${slug}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4. Educational Categories */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#172554]">{t.home.categoriesTitle}</h2>
          <p className="mt-1 text-sm text-[#64748B]">{t.home.categoriesSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => navigate(`/categories/${cat.slug}`)}
              className="text-start rounded-xl border border-[#E2E8F0] bg-white p-6 transition-colors hover:border-[#3B82F6] cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <FolderKanban className="h-5 w-5 text-[#3B82F6]" />
                <span className="text-xs font-medium text-[#64748B] tabular-nums">
                  {cat.courseCount ?? 0} {locale === 'ar' ? 'دورة' : 'courses'}
                </span>
              </div>
              <h3 className="mt-4 text-base font-bold text-[#172554]">
                {locale === 'ar' ? cat.nameAr : cat.nameEn}
              </h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                {locale === 'ar' ? cat.descriptionAr : cat.descriptionEn}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* 5. Why Balance Academy */}
      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#172554] mb-8">{t.home.whyTitle}</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {t.home.whyItems.map((item) => (
              <div key={item.title} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6">
                <h3 className="text-base font-bold text-[#172554]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Learning Process */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-[#172554] mb-8">{t.home.processTitle}</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.home.processSteps.map((s) => (
            <div key={s.step} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <span className="font-mono-num text-sm font-bold text-[#3B82F6]">{s.step}</span>
              <h3 className="mt-2 text-base font-semibold text-[#111827]">{s.title}</h3>
              <p className="mt-1.5 text-sm text-[#64748B] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. Real Testimonials (only rendered with real DB rows) */}
      {reviews.length > 0 && (
        <section className="border-t border-[#E2E8F0] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[#172554] mb-6">{t.home.reviewsTitle}</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {reviews.map((rev) => (
                <div key={rev.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <p className="text-sm text-[#111827] leading-relaxed">{rev.comment}</p>
                  <p className="mt-4 text-xs font-semibold text-[#172554]">{rev.studentName}</p>
                  <p className="text-xs text-[#64748B]">
                    {locale === 'ar' ? rev.courseTitleAr : rev.courseTitleEn}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 8. FAQ */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-[#172554] mb-6">{t.home.faqTitle}</h2>
        <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white">
          {t.home.faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={faq.q} className="p-5">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 text-start font-semibold text-sm text-[#111827] cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-[#64748B] transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && <p className="mt-3 text-sm text-[#64748B] leading-relaxed">{faq.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* 9. Final CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-xl bg-[#172554] px-6 py-10 sm:px-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-white">
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold">{t.home.finalCtaTitle}</h2>
            <p className="text-sm text-white/80">{t.home.finalCtaBody}</p>
          </div>
          <Button variant="primary" size="lg" onClick={() => navigate('/courses')}>
            {t.home.finalCtaButton}
          </Button>
        </div>
      </section>
    </div>
  );
}
