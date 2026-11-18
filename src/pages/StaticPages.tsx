import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Button, InputField } from '../components/ui/DesignSystem';

export function AboutPage({ navigate }: { navigate: (path: string) => void }) {
  const { locale, t } = useApp();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 space-y-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6 space-y-4">
          <p className="text-xs font-semibold text-[#3B82F6]">{t.brandAgency}</p>
          <h1 className="text-3xl font-bold text-[#172554]">
            {locale === 'ar'
              ? 'عن BALANCE ACADEMY'
              : 'About BALANCE ACADEMY'}
          </h1>
          <p className="text-sm text-[#64748B] leading-relaxed">
            {locale === 'ar'
              ? 'أكاديمية BALANCE ACADEMY هي الذراع التعليمي التابع لوكالة BALANCE Agency، وتهدف إلى نقل الخبرات العملية الحقيقية في صناعة الفيديو، التسويق الرقمي، وهندسة البرمجيات إلى المتعلمين في مصر والعالم العربي عبر مسارات منظمة واضحة.'
              : 'BALANCE ACADEMY is the dedicated educational arm of BALANCE Agency, built to deliver practical workflows in video production, digital marketing, and software engineering across Egypt and international markets.'}
          </p>
          <div className="pt-2">
            <Button variant="primary" onClick={() => navigate('/courses')}>
              {t.hero.primaryCta}
            </Button>
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <img
              src="/src/assets/images/about_balance_studio_1794993399965.jpg"
              alt="BALANCE Agency Studio"
              referrerPolicy="no-referrer"
              className="aspect-[16/9] w-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContactPage() {
  const { locale, pushToast } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) {
        const d = await res.json();
        pushToast('error', d.error || 'Failed to send message');
        return;
      }
      pushToast(
        'success',
        locale === 'ar'
          ? 'تم استلام رسالتك بنجاح وسيتواصل معك فريق الدعم.'
          : 'Your message has been received by the BALANCE ACADEMY team.',
      );
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#172554]">
            {locale === 'ar' ? 'تواصل مع BALANCE ACADEMY' : 'Contact BALANCE ACADEMY'}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {locale === 'ar'
              ? 'للاستفسارات التعليمية، متابعة المدفوعات، أو الدعم الفني.'
              : 'Reach out for curriculum inquiries, payment follow-up, or technical support.'}
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <InputField
            label={locale === 'ar' ? 'الاسم الكامل' : 'Full Name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <InputField
            label={locale === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <InputField
            label={locale === 'ar' ? 'الموضوع' : 'Subject'}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <div className="space-y-1.5">
            <label htmlFor="contact-message" className="block text-sm font-medium text-[#111827]">
              {locale === 'ar' ? 'الرسالة' : 'Message'}
            </label>
            <textarea
              id="contact-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#111827] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
            />
          </div>
          <Button type="submit" variant="primary" disabled={sending}>
            {locale === 'ar' ? 'إرسال الرسالة' : 'Send Message'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function LegalPage({ type }: { type: 'terms' | 'privacy' }) {
  const { locale } = useApp();
  const isTerms = type === 'terms';

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <article className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8 space-y-4">
        <h1 className="text-2xl font-bold text-[#172554]">
          {isTerms
            ? locale === 'ar'
              ? 'الشروط والأحكام'
              : 'Terms and Conditions'
            : locale === 'ar'
            ? 'سياسة الخصوصية'
            : 'Privacy Policy'}
        </h1>
        <p className="text-sm text-[#64748B] leading-relaxed">
          {isTerms
            ? locale === 'ar'
              ? 'يمنح الاشتراك المؤكد في دورات BALANCE ACADEMY وصولاً شخصياً مدى الحياة للمشترك نفسه فقط. يُحظر مشاركة بيانات الحساب أو إعادة توزيع أو تسجيل المحتوى المرئي المحمي، وتخضع الجلسات المتزامنة للمراقبة الأمنية.'
              : 'Confirmed enrollment in BALANCE ACADEMY grants single-user lifetime access to purchased curriculum materials. Account sharing, unauthorized redistribution, and stream extraction are prohibited and monitored via watch session policies.'
            : locale === 'ar'
            ? 'تلتزم BALANCE Agency بحماية بيانات الطلاب الشخصية وسجلات التقدم والمدفوعات. تُستخدم بيانات الهوية فقط لإدارة الوصول التعليمي، تأكيد التحويلات المالية، وتطبيق العلامة المائية الأمنية لحماية المحتوى.'
            : 'BALANCE Agency safeguards student profile details, progress metrics, and payment submission records. Identity fields are used strictly for enrollment administration, payment verification, and security watermarking.'}
        </p>
      </article>
    </div>
  );
}
