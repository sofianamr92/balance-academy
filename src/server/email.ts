import type { Request } from 'express';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.EMAIL_PROVIDER_API_KEY?.trim());
}

export function getEmailFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS?.trim() || 'BALANCE ACADEMY <noreply@balance.academy>';
}

export function resolveAppBaseUrl(req?: Request): string {
  const configuredBase = process.env.APP_URL?.trim();
  if (configuredBase && configuredBase !== 'MY_APP_URL') {
    return configuredBase.replace(/\/$/, '');
  }
  if (req) {
    return `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
  }
  return 'http://localhost:3000';
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  if (!apiKey) {
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getEmailFromAddress(),
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[email] Resend API returned ${res.status}:`, text.slice(0, 240));
    }
    return res.ok;
  } catch (err) {
    console.error('[email] failed to dispatch transactional email:', err);
    return false;
  }
}

function wrapEmailLayout(dir: 'rtl' | 'ltr', bodyHtml: string): string {
  return `<div dir="${dir}" style="background:#f8fafc;padding:28px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#172554;padding:18px 24px;">
      <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.4px;">BALANCE ACADEMY</span>
    </div>
    <div style="padding:24px;">
      ${bodyHtml}
    </div>
    <div style="border-top:1px solid #e2e8f0;padding:14px 24px;background:#f8fafc;font-size:12px;color:#64748b;">
      BALANCE Agency — Practical Digital Education
    </div>
  </div>
</div>`;
}

export async function sendVerificationEmail(params: {
  to: string;
  fullName: string;
  verifyUrl: string;
  rawToken: string;
  preferredLanguage: 'ar' | 'en';
}): Promise<boolean> {
  const isAr = params.preferredLanguage === 'ar';
  const safeName = escapeHtml(params.fullName);
  const safeUrl = escapeHtml(params.verifyUrl);
  const safeToken = escapeHtml(params.rawToken);

  const subject = isAr
    ? 'تأكيد البريد الإلكتروني — BALANCE ACADEMY'
    : 'Verify Your Email Address — BALANCE ACADEMY';

  const bodyHtml = isAr
    ? `<h2 style="margin:0 0 12px;color:#172554;font-size:18px;">مرحباً ${safeName}</h2>
       <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155;">شكراً لتسجيلك في منصة BALANCE ACADEMY. يرجى تأكيد بريدك الإلكتروني لتفعيل التنبيهات البريدية الكاملة لحسابك وطلبات الدورات.</p>
       <p style="margin:22px 0;">
         <a href="${safeUrl}" style="background:#2563EB;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">تأكيد البريد الإلكتروني</a>
       </p>
       <p style="margin:0;font-size:12px;color:#64748b;">أو استخدم رمز التأكيد التالي (صالح لمدة 24 ساعة): <code style="background:#f1f5f9;padding:3px 6px;border-radius:4px;color:#1e3a8a;">${safeToken}</code></p>`
    : `<h2 style="margin:0 0 12px;color:#172554;font-size:18px;">Welcome, ${safeName}</h2>
       <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155;">Thank you for registering on BALANCE ACADEMY. Please verify your email address to enable full account and enrollment notifications.</p>
       <p style="margin:22px 0;">
         <a href="${safeUrl}" style="background:#2563EB;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Verify Email Address</a>
       </p>
       <p style="margin:0;font-size:12px;color:#64748b;">Or enter this verification code (valid for 24 hours): <code style="background:#f1f5f9;padding:3px 6px;border-radius:4px;color:#1e3a8a;">${safeToken}</code></p>`;

  return sendViaResend({
    to: params.to,
    subject,
    html: wrapEmailLayout(isAr ? 'rtl' : 'ltr', bodyHtml),
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  fullName: string;
  resetUrl: string;
  rawToken: string;
  preferredLanguage: 'ar' | 'en';
}): Promise<boolean> {
  const isAr = params.preferredLanguage === 'ar';
  const safeName = escapeHtml(params.fullName);
  const safeUrl = escapeHtml(params.resetUrl);
  const safeToken = escapeHtml(params.rawToken);

  const subject = isAr
    ? 'استعادة كلمة المرور — BALANCE ACADEMY'
    : 'Password Recovery — BALANCE ACADEMY';

  const bodyHtml = isAr
    ? `<h2 style="margin:0 0 12px;color:#172554;font-size:18px;">مرحباً ${safeName}</h2>
       <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155;">تلقّينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في BALANCE ACADEMY.</p>
       <p style="margin:22px 0;">
         <a href="${safeUrl}" style="background:#2563EB;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">تعيين كلمة مرور جديدة</a>
       </p>
       <p style="margin:0;font-size:12px;color:#64748b;">أو استخدم رمز الاستعادة (صالح لمدة 30 دقيقة): <code style="background:#f1f5f9;padding:3px 6px;border-radius:4px;color:#1e3a8a;">${safeToken}</code></p>`
    : `<h2 style="margin:0 0 12px;color:#172554;font-size:18px;">Hello ${safeName}</h2>
       <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155;">We received a request to reset your BALANCE ACADEMY password.</p>
       <p style="margin:22px 0;">
         <a href="${safeUrl}" style="background:#2563EB;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset Password</a>
       </p>
       <p style="margin:0;font-size:12px;color:#64748b;">Or enter this recovery token (valid for 30 minutes): <code style="background:#f1f5f9;padding:3px 6px;border-radius:4px;color:#1e3a8a;">${safeToken}</code></p>`;

  return sendViaResend({
    to: params.to,
    subject,
    html: wrapEmailLayout(isAr ? 'rtl' : 'ltr', bodyHtml),
  });
}

export async function sendPaymentStatusEmail(params: {
  to: string;
  fullName: string;
  decision: 'approve' | 'reject';
  courseTitleAr: string;
  courseTitleEn: string;
  referenceCode: string;
  amountEgp: number;
  reviewNote?: string;
  actionUrl: string;
  preferredLanguage: 'ar' | 'en';
}): Promise<boolean> {
  const isAr = params.preferredLanguage === 'ar';
  const isApproved = params.decision === 'approve';
  const safeName = escapeHtml(params.fullName);
  const safeCourse = escapeHtml(isAr ? params.courseTitleAr : params.courseTitleEn);
  const safeRef = escapeHtml(params.referenceCode);
  const safeNote = params.reviewNote ? escapeHtml(params.reviewNote) : '';
  const safeUrl = escapeHtml(params.actionUrl);

  const subject = isAr
    ? isApproved
      ? `تم تأكيد الدفع وتفعيل الدورة (${params.referenceCode}) — BALANCE ACADEMY`
      : `تحديث حول طلب الدفع (${params.referenceCode}) — BALANCE ACADEMY`
    : isApproved
      ? `Payment Approved & Course Activated (${params.referenceCode}) — BALANCE ACADEMY`
      : `Payment Review Update (${params.referenceCode}) — BALANCE ACADEMY`;

  const bodyHtml = isAr
    ? `<h2 style="margin:0 0 12px;color:#172554;font-size:18px;">مرحباً ${safeName}</h2>
       <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#334155;">
         ${
           isApproved
             ? `تمت مراجعة واعتماد التحويل المالي لطلبك رقم <strong>${safeRef}</strong> بقيمة <strong>${params.amountEgp} ج.م</strong> لدورة <strong>${safeCourse}</strong>، وتم تفعيل الوصول الدائم (مدى الحياة) في حسابك.`
             : `نحيطك علماً بأن طلب الدفع رقم <strong>${safeRef}</strong> لدورة <strong>${safeCourse}</strong> لم يتم اعتماده بعد المراجعة المالية.`
         }
       </p>
       ${safeNote ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;color:#334155;"><strong>ملاحظة الإدارة:</strong> ${safeNote}</div>` : ''}
       <p style="margin:20px 0 0;">
         <a href="${safeUrl}" style="background:${isApproved ? '#2563EB' : '#172554'};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
           ${isApproved ? 'الانتقال إلى الدورة الآن' : 'الانتقال إلى لوحة الطالب'}
         </a>
       </p>`
    : `<h2 style="margin:0 0 12px;color:#172554;font-size:18px;">Hello ${safeName}</h2>
       <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#334155;">
         ${
           isApproved
             ? `Your payment request <strong>${safeRef}</strong> (${params.amountEgp} EGP) for <strong>${safeCourse}</strong> has been verified and approved. Lifetime access is now active in your account.`
             : `Your payment request <strong>${safeRef}</strong> for <strong>${safeCourse}</strong> could not be approved following financial review.`
         }
       </p>
       ${safeNote ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;color:#334155;"><strong>Reviewer Note:</strong> ${safeNote}</div>` : ''}
       <p style="margin:20px 0 0;">
         <a href="${safeUrl}" style="background:${isApproved ? '#2563EB' : '#172554'};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
           ${isApproved ? 'Open Your Course' : 'Open Student Dashboard'}
         </a>
       </p>`;

  return sendViaResend({
    to: params.to,
    subject,
    html: wrapEmailLayout(isAr ? 'rtl' : 'ltr', bodyHtml),
  });
}
