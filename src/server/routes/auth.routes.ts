import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { profiles, roles } from '../../db/schema.ts';
import { getOrCreateFirebaseUser, newId } from '../../db/users.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '../../lib/validation/schemas.ts';
import type { RoleName } from '../../types/index.ts';
import { resolveAppBaseUrl, sendPasswordResetEmail, sendVerificationEmail } from '../email.ts';
import { asyncHandler, hashResetToken } from '../helpers.ts';
import {
  authRateLimiter,
  clearAuthCookie,
  createNotification,
  getClientIp,
  logSecurityEvent,
  requireAuth,
  setAuthCookie,
  type AuthenticatedRequest,
  type AuthUser,
} from '../middleware.ts';

export function createAuthRouter(): express.Router {
  const router = express.Router();

  router.get('/me', (req: AuthenticatedRequest, res) => {
    if (!req.authUser) {
      res.json({ user: null });
      return;
    }
    res.json({ user: req.authUser });
  });

  router.post(
    '/firebase',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!authRateLimiter.consume(`fb:${ip}`).allowed) {
        res.status(429).json({ error: 'Too many authentication attempts' });
        return;
      }

      const authHeader = req.headers.authorization;
      const bodyToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
      const rawToken =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length).trim()
          : bodyToken;

      if (!rawToken) {
        res.status(401).json({ error: 'Missing Firebase ID token' });
        return;
      }

      let decoded;
      try {
        decoded = await adminAuth.verifyIdToken(rawToken);
      } catch {
        await logSecurityEvent({
          eventType: 'auth.firebase_invalid_token',
          severity: 'warning',
          ipAddress: ip,
          details: 'Rejected invalid Firebase ID token',
        });
        res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
        return;
      }

      if (!decoded.email) {
        res.status(400).json({ error: 'Firebase account must have a verified email address' });
        return;
      }

      const profile = await getOrCreateFirebaseUser({
        uid: decoded.uid,
        email: decoded.email,
        fullName: typeof decoded.name === 'string' ? decoded.name : undefined,
        emailVerified: Boolean(decoded.email_verified),
      });

      if (!profile.isActive) {
        res.status(403).json({ error: 'Account is suspended. Please contact support.' });
        return;
      }

      await logSecurityEvent({
        userId: profile.id,
        eventType: 'auth.firebase_login_success',
        severity: 'info',
        ipAddress: ip,
        details: `Firebase user signed in with role ${profile.role}`,
      });

      setAuthCookie(res, profile);
      res.json({ user: profile });
    }),
  );

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!authRateLimiter.consume(`reg:${ip}`).allowed) {
        res.status(429).json({ error: 'Too many requests, please wait a minute' });
        return;
      }
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid registration input', issues: parsed.error.flatten() });
        return;
      }

      const emailNorm = parsed.data.email.toLowerCase();
      const existing = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, emailNorm))
        .limit(1);

      if (existing[0]) {
        res.status(409).json({ error: 'An account with this email already exists' });
        return;
      }

      const studentRoles = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'student'))
        .limit(1);

      if (!studentRoles[0]) {
        res.status(500).json({ error: 'Student role missing' });
        return;
      }

      const now = new Date().toISOString();
      const userId = newId('usr');
      const passwordHash = bcrypt.hashSync(parsed.data.password, 10);
      const rawVerifyToken = crypto.randomBytes(24).toString('hex');
      const verifyTokenHash = hashResetToken(rawVerifyToken);
      const verifyExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

      await db.insert(profiles).values({
        id: userId,
        uid: null,
        email: emailNorm,
        passwordHash,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone || null,
        roleId: studentRoles[0].id,
        preferredLanguage: parsed.data.preferredLanguage,
        isActive: true,
        emailVerified: false,
        verificationToken: verifyTokenHash,
        verificationTokenExpiresAt: verifyExpiresAt,
        createdAt: now,
        updatedAt: now,
      });

      const user: AuthUser = {
        id: userId,
        email: emailNorm,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone || null,
        role: 'student',
        preferredLanguage: parsed.data.preferredLanguage,
        isActive: true,
        emailVerified: false,
        createdAt: now,
      };

      const verifyUrl = `${resolveAppBaseUrl(req)}/verify-email?token=${rawVerifyToken}`;
      const emailSent = await sendVerificationEmail({
        to: emailNorm,
        fullName: parsed.data.fullName,
        verifyUrl,
        rawToken: rawVerifyToken,
        preferredLanguage: parsed.data.preferredLanguage,
      });

      await createNotification({
        userId,
        eventType: 'welcome',
        titleAr: 'مرحباً بك في BALANCE ACADEMY',
        titleEn: 'Welcome to BALANCE ACADEMY',
        bodyAr: 'تم إنشاء حسابك بنجاح. يرجى تأكيد بريدك الإلكتروني لاستقبال تنبيهات الدورات والمدفوعات.',
        bodyEn: 'Your student account is ready. Please verify your email address for full course & payment notifications.',
      });

      await logSecurityEvent({
        userId,
        eventType: 'auth.register_success',
        severity: 'info',
        ipAddress: ip,
        details: emailSent
          ? `New student registered & verification email sent: ${emailNorm}`
          : `New student registered (verification preview mode): ${emailNorm}`,
      });

      setAuthCookie(res, user);
      res.status(201).json({
        user,
        emailDeliveryMode: emailSent ? 'email_sent' : 'in_app_preview',
        ...(!emailSent ? { verificationToken: rawVerifyToken, verificationUrl: verifyUrl } : {}),
      });
    }),
  );

  router.post(
    '/verify-email',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!authRateLimiter.consume(`verify-email:${ip}`).allowed) {
        res.status(429).json({ error: 'Too many verification attempts, please wait a minute' });
        return;
      }

      const parsed = verifyEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid verification token format' });
        return;
      }

      const tokenHash = hashResetToken(parsed.data.token);
      const rows = await db
        .select({
          id: profiles.id,
          email: profiles.email,
          fullName: profiles.fullName,
          phone: profiles.phone,
          roleName: roles.name,
          preferredLanguage: profiles.preferredLanguage,
          isActive: profiles.isActive,
          verificationTokenExpiresAt: profiles.verificationTokenExpiresAt,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .innerJoin(roles, eq(roles.id, profiles.roleId))
        .where(eq(profiles.verificationToken, tokenHash))
        .limit(1);

      const row = rows[0];
      if (
        !row ||
        !row.isActive ||
        !row.verificationTokenExpiresAt ||
        Date.parse(row.verificationTokenExpiresAt) < Date.now()
      ) {
        res.status(400).json({ error: 'Verification token is invalid or expired' });
        return;
      }

      const now = new Date().toISOString();
      await db
        .update(profiles)
        .set({
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(profiles.id, row.id));

      await createNotification({
        userId: row.id,
        eventType: 'email_verified',
        titleAr: 'تم تأكيد البريد الإلكتروني',
        titleEn: 'Email Address Verified',
        bodyAr: 'تم تأكيد بريدك الإلكتروني بنجاح وستصلك جميع تنبيهات الحساب والمدفوعات.',
        bodyEn: 'Your email address is verified and ready to receive account & payment updates.',
      });

      await logSecurityEvent({
        userId: row.id,
        eventType: 'auth.email_verified',
        severity: 'info',
        ipAddress: ip,
        details: `Verified email address ${row.email}`,
      });

      const verifiedUser: AuthUser = {
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        phone: row.phone,
        role: row.roleName as RoleName,
        preferredLanguage: row.preferredLanguage === 'en' ? 'en' : 'ar',
        isActive: true,
        emailVerified: true,
        createdAt: row.createdAt,
      };

      if (req.authUser?.id === row.id) {
        setAuthCookie(res, verifiedUser);
      }

      res.json({ ok: true, emailVerified: true });
    }),
  );

  router.post(
    '/resend-verification',
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.authUser!.id;
      const ip = getClientIp(req);
      if (!authRateLimiter.consume(`resend-verify:${userId}`).allowed) {
        res.status(429).json({ error: 'Too many requests, please wait a minute' });
        return;
      }

      const rows = await db
        .select({
          id: profiles.id,
          email: profiles.email,
          fullName: profiles.fullName,
          preferredLanguage: profiles.preferredLanguage,
          emailVerified: profiles.emailVerified,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      const target = rows[0];
      if (!target) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      if (target.emailVerified) {
        res.json({ ok: true, alreadyVerified: true });
        return;
      }

      const rawVerifyToken = crypto.randomBytes(24).toString('hex');
      const verifyTokenHash = hashResetToken(rawVerifyToken);
      const verifyExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

      await db
        .update(profiles)
        .set({
          verificationToken: verifyTokenHash,
          verificationTokenExpiresAt: verifyExpiresAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(profiles.id, userId));

      const verifyUrl = `${resolveAppBaseUrl(req)}/verify-email?token=${rawVerifyToken}`;
      const emailSent = await sendVerificationEmail({
        to: target.email,
        fullName: target.fullName,
        verifyUrl,
        rawToken: rawVerifyToken,
        preferredLanguage: target.preferredLanguage === 'en' ? 'en' : 'ar',
      });

      await logSecurityEvent({
        userId,
        eventType: 'auth.verification_resent',
        severity: 'info',
        ipAddress: ip,
        details: emailSent ? 'Verification email dispatched' : 'Verification link generated (preview mode)',
      });

      res.json({
        ok: true,
        alreadyVerified: false,
        deliveryMode: emailSent ? 'email_sent' : 'in_app_preview',
        ...(!emailSent ? { verificationToken: rawVerifyToken, verificationUrl: verifyUrl } : {}),
      });
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!authRateLimiter.consume(`login:${ip}`).allowed) {
        res.status(429).json({ error: 'Too many login attempts' });
        return;
      }
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid credentials format' });
        return;
      }

      const emailNorm = parsed.data.email.toLowerCase();
      const rows = await db
        .select({
          id: profiles.id,
          email: profiles.email,
          passwordHash: profiles.passwordHash,
          fullName: profiles.fullName,
          phone: profiles.phone,
          roleName: roles.name,
          preferredLanguage: profiles.preferredLanguage,
          isActive: profiles.isActive,
          emailVerified: profiles.emailVerified,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .innerJoin(roles, eq(roles.id, profiles.roleId))
        .where(eq(profiles.email, emailNorm))
        .limit(1);

      const row = rows[0];

      if (!row || !bcrypt.compareSync(parsed.data.password, row.passwordHash)) {
        await logSecurityEvent({
          userId: row?.id ?? null,
          eventType: 'auth.login_failed',
          severity: 'warning',
          ipAddress: ip,
          details: `Failed login attempt for ${emailNorm}`,
        });
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      if (!row.isActive) {
        res.status(403).json({ error: 'Account is suspended. Please contact support.' });
        return;
      }

      const user: AuthUser = {
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        phone: row.phone,
        role: row.roleName as RoleName,
        preferredLanguage: row.preferredLanguage === 'en' ? 'en' : 'ar',
        isActive: true,
        emailVerified: row.emailVerified,
        createdAt: row.createdAt,
      };

      await logSecurityEvent({
        userId: user.id,
        eventType: 'auth.login_success',
        severity: 'info',
        ipAddress: ip,
        details: `User logged in with role ${user.role}`,
      });

      setAuthCookie(res, user);
      res.json({ user });
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      if (req.authUser) {
        await logSecurityEvent({
          userId: req.authUser.id,
          eventType: 'auth.logout',
          severity: 'info',
          ipAddress: getClientIp(req),
          details: 'User logged out',
        });
      }
      clearAuthCookie(res);
      res.json({ ok: true });
    }),
  );

  router.post(
    '/forgot-password',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!authRateLimiter.consume(`forgot:${ip}`).allowed) {
        res.status(429).json({ error: 'Too many recovery requests, please wait a minute' });
        return;
      }

      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Valid email is required' });
        return;
      }

      const emailNorm = parsed.data.email.toLowerCase();
      const userRows = await db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          preferredLanguage: profiles.preferredLanguage,
          isActive: profiles.isActive,
        })
        .from(profiles)
        .where(eq(profiles.email, emailNorm))
        .limit(1);

      let previewResetToken: string | undefined;
      let previewResetUrl: string | undefined;
      let deliveryMode: 'email_sent' | 'in_app_preview' = 'email_sent';

      const targetUser = userRows[0];
      if (targetUser && targetUser.isActive) {
        const rawToken = crypto.randomBytes(24).toString('hex');
        const tokenHash = hashResetToken(rawToken);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

        await db
          .update(profiles)
          .set({
            resetToken: tokenHash,
            resetTokenExpiresAt: expiresAt,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(profiles.id, targetUser.id));

        const resetUrl = `${resolveAppBaseUrl(req)}/forgot-password?token=${rawToken}`;

        const emailSent = await sendPasswordResetEmail({
          to: emailNorm,
          fullName: targetUser.fullName,
          resetUrl,
          rawToken,
          preferredLanguage: targetUser.preferredLanguage === 'en' ? 'en' : 'ar',
        });

        await createNotification({
          userId: targetUser.id,
          eventType: 'password_reset_requested',
          titleAr: 'طلب استعادة كلمة المرور',
          titleEn: 'Password Recovery Requested',
          bodyAr: 'تم إصدار رمز استعادة كلمة المرور صالح لمدة 30 دقيقة.',
          bodyEn: 'A password recovery token valid for 30 minutes has been issued for your account.',
        });

        await logSecurityEvent({
          userId: targetUser.id,
          eventType: 'auth.password_reset_requested',
          severity: 'info',
          ipAddress: ip,
          details: emailSent
            ? 'Password recovery email dispatched'
            : 'Password recovery token generated (in-app preview)',
        });

        if (!emailSent) {
          deliveryMode = 'in_app_preview';
          previewResetToken = rawToken;
          previewResetUrl = resetUrl;
        }
      }

      res.json({
        ok: true,
        deliveryMode,
        message: 'If an account matches this email, recovery instructions have been issued.',
        ...(previewResetToken ? { resetToken: previewResetToken, resetUrl: previewResetUrl } : {}),
      });
    }),
  );

  router.post(
    '/reset-password',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!authRateLimiter.consume(`reset:${ip}`).allowed) {
        res.status(429).json({ error: 'Too many reset attempts, please wait a minute' });
        return;
      }

      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid reset token or password too short (min 8 chars)' });
        return;
      }

      const tokenHash = hashResetToken(parsed.data.token);
      const rows = await db
        .select({
          id: profiles.id,
          isActive: profiles.isActive,
          resetTokenExpiresAt: profiles.resetTokenExpiresAt,
        })
        .from(profiles)
        .where(eq(profiles.resetToken, tokenHash))
        .limit(1);

      const row = rows[0];
      if (!row || !row.isActive || !row.resetTokenExpiresAt || Date.parse(row.resetTokenExpiresAt) < Date.now()) {
        res.status(400).json({ error: 'Reset token is invalid or expired' });
        return;
      }

      const passwordHash = bcrypt.hashSync(parsed.data.newPassword, 10);
      await db
        .update(profiles)
        .set({
          passwordHash,
          resetToken: null,
          resetTokenExpiresAt: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(profiles.id, row.id));

      await createNotification({
        userId: row.id,
        eventType: 'password_reset_completed',
        titleAr: 'تم تحديث كلمة المرور',
        titleEn: 'Password Updated',
        bodyAr: 'تمت إعادة تعيين كلمة المرور لحسابك بنجاح.',
        bodyEn: 'Your account password was successfully reset.',
      });

      await logSecurityEvent({
        userId: row.id,
        eventType: 'auth.password_reset_completed',
        severity: 'info',
        ipAddress: ip,
        details: 'Password successfully reset',
      });

      res.json({ ok: true });
    }),
  );

  router.post(
    '/change-password',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Current password and valid new password (min 8 chars) are required' });
        return;
      }

      const userId = req.authUser!.id;
      const rows = await db
        .select({
          id: profiles.id,
          passwordHash: profiles.passwordHash,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      const row = rows[0];
      if (!row || !bcrypt.compareSync(parsed.data.currentPassword, row.passwordHash)) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }

      const newHash = bcrypt.hashSync(parsed.data.newPassword, 10);
      await db
        .update(profiles)
        .set({
          passwordHash: newHash,
          resetToken: null,
          resetTokenExpiresAt: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(profiles.id, userId));

      await createNotification({
        userId,
        eventType: 'password_changed',
        titleAr: 'تم تغيير كلمة المرور',
        titleEn: 'Password Changed',
        bodyAr: 'تم تغيير كلمة المرور الخاصة بحسابك من لوحة الإعدادات.',
        bodyEn: 'Your account password was changed from account settings.',
      });

      await logSecurityEvent({
        userId,
        eventType: 'auth.password_changed',
        severity: 'info',
        ipAddress: getClientIp(req),
        details: 'Authenticated user updated password',
      });

      res.json({ ok: true });
    }),
  );

  router.patch(
    '/profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid profile fields' });
        return;
      }

      const now = new Date().toISOString();
      await db
        .update(profiles)
        .set({
          fullName: parsed.data.fullName,
          phone: parsed.data.phone || null,
          preferredLanguage: parsed.data.preferredLanguage,
          updatedAt: now,
        })
        .where(eq(profiles.id, req.authUser!.id));

      const updated: AuthUser = {
        ...req.authUser!,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone || null,
        preferredLanguage: parsed.data.preferredLanguage,
      };
      res.json({ user: updated });
    }),
  );

  return router;
}
