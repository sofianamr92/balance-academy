import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { eq, and } from 'drizzle-orm';
import { db, pool } from '../db/index.ts';
import {
  auditLogs,
  contactMessages,
  courseReviews,
  enrollments,
  notifications,
  profiles,
  purchases,
  securityLogs,
} from '../db/schema.ts';
import { ensureSeededHlsAssets } from './videoAssets.ts';
import { createApiRouter } from './routes.ts';

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

test.before(async () => {
  await ensureSeededHlsAssets();
  // Clean up any prior test purchases/enrollments for crs-fullstack-architecture on usr-student-001
  await db
    .delete(enrollments)
    .where(and(eq(enrollments.studentId, 'usr-student-001'), eq(enrollments.courseId, 'crs-fullstack-architecture')));
  await db
    .delete(purchases)
    .where(and(eq(purchases.studentId, 'usr-student-001'), eq(purchases.courseId, 'crs-fullstack-architecture')));

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', createApiRouter());

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

test.after(async () => {
  server?.close();
  await pool.end();
});

async function loginAs(email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie, 'Session cookie must be issued');
  return cookie.split(';')[0];
}

test('RBAC: student and content_manager cannot access super_admin payment verification or reports', async () => {
  const studentCookie = await loginAs('student@balance.academy', 'BalanceStudent!2026');
  const managerCookie = await loginAs('content@balance.academy', 'BalanceEditor!2026');

  const stuAdminRes = await fetch(`${baseUrl}/api/admin/purchases`, {
    headers: { Cookie: studentCookie },
  });
  assert.equal(stuAdminRes.status, 403);

  const mgrReportsRes = await fetch(`${baseUrl}/api/admin/reports`, {
    headers: { Cookie: managerCookie },
  });
  assert.equal(mgrReportsRes.status, 403);

  // Content manager CAN list courses
  const mgrCoursesRes = await fetch(`${baseUrl}/api/admin/courses`, {
    headers: { Cookie: managerCookie },
  });
  assert.equal(mgrCoursesRes.status, 200);
});

test('Video Security: unauthenticated or un-enrolled student cannot authorize paid lesson or fetch raw HLS segments', async () => {
  const unauthAuthRes = await fetch(`${baseUrl}/api/video/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId: 'les-dm-2' }),
  });
  assert.equal(unauthAuthRes.status, 401);

  const studentCookie = await loginAs('student@balance.academy', 'BalanceStudent!2026');
  const unenrolledRes = await fetch(`${baseUrl}/api/video/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ lessonId: 'les-dm-2' }),
  });
  assert.equal(unenrolledRes.status, 403);

  // Direct playlist/segment access without signed token must be rejected
  const rawSegRes = await fetch(`${baseUrl}/api/video/hls/asset-dm-02/seg_000.ts`);
  assert.equal(rawSegRes.status, 403);

  // Enrolled student CAN authorize paid lesson in Video Editing and fetch signed playlist + segment
  const enrolledRes = await fetch(`${baseUrl}/api/video/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ lessonId: 'les-ve-2' }),
  });
  assert.equal(enrolledRes.status, 200);
  const authBody = (await enrolledRes.json()) as { playlistUrl: string; watermark: { maskedEmail: string } };
  assert.ok(authBody.playlistUrl.includes('token='));
  assert.equal(authBody.watermark.maskedEmail, 'st***@balance.academy');

  const playlistRes = await fetch(`${baseUrl}${authBody.playlistUrl}`);
  assert.equal(playlistRes.status, 200);
  const playlistText = await playlistRes.text();
  assert.ok(playlistText.includes('/api/video/hls/asset-ve-02/seg_000.ts?token='));
});

test('Purchase workflow: pending purchase -> proof submission -> duplicate block -> super_admin approval -> lifetime enrollment', async () => {
  const studentCookie = await loginAs('student@balance.academy', 'BalanceStudent!2026');
  const adminCookie = await loginAs('admin@balance.academy', 'BalanceAdmin!2026');

  // 1. Create pending purchase for Programming course (crs-fullstack-architecture)
  const createRes = await fetch(`${baseUrl}/api/student/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ courseId: 'crs-fullstack-architecture', paymentMethod: 'instapay' }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { purchase: { id: string; status: string } };
  assert.equal(created.purchase.status, 'pending');

  // 2. Duplicate purchase must be blocked
  const dupRes = await fetch(`${baseUrl}/api/student/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ courseId: 'crs-fullstack-architecture', paymentMethod: 'instapay' }),
  });
  assert.equal(dupRes.status, 409);

  // 3. Submit payment proof (does NOT activate enrollment yet)
  const proofRes = await fetch(`${baseUrl}/api/student/purchases/${created.purchase.id}/proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({
      senderName: 'Omar Test',
      senderPhone: '01112223344',
      transactionRef: 'TEST-REF-9911',
      notes: 'Integration test transfer',
    }),
  });
  assert.equal(proofRes.status, 200);

  // Verify student still cannot access lesson before admin approval
  const preApproveVideo = await fetch(`${baseUrl}/api/video/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ lessonId: 'les-pr-2' }),
  });
  assert.equal(preApproveVideo.status, 403);

  // 4. Super Admin approves payment -> grants lifetime enrollment (expires_at = NULL)
  const approveRes = await fetch(`${baseUrl}/api/admin/purchases/${created.purchase.id}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ decision: 'approve', reviewNote: 'Verified in test' }),
  });
  assert.equal(approveRes.status, 200);

  // 5. Student now has playback authorization
  const postApproveVideo = await fetch(`${baseUrl}/api/video/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ lessonId: 'les-pr-2' }),
  });
  assert.equal(postApproveVideo.status, 200);

  // Clean up test rows so Cloud SQL demo state remains clean
  await db
    .delete(enrollments)
    .where(and(eq(enrollments.studentId, 'usr-student-001'), eq(enrollments.courseId, 'crs-fullstack-architecture')));
  await db
    .delete(purchases)
    .where(eq(purchases.id, created.purchase.id));
});

test('Password Recovery: forgot-password -> reset-password -> single-use enforcement -> login -> change-password', async () => {
  const testEmail = `recovery-${Date.now()}@balance.academy`;
  const initialPassword = 'InitialPassword!2026';
  const resetPassword = 'ResetPassword!2026';
  const changedPassword = 'ChangedPassword!2026';

  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Recovery Test User',
      email: testEmail,
      password: initialPassword,
      preferredLanguage: 'ar',
    }),
  });
  assert.equal(regRes.status, 201);
  const regData = (await regRes.json()) as { user: { id: string } };
  const testUserId = regData.user.id;

  try {
    // 1. Request recovery token
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    assert.equal(forgotRes.status, 200);
    const forgotBody = (await forgotRes.json()) as {
      ok: boolean;
      deliveryMode: string;
      resetToken?: string;
    };
    assert.equal(forgotBody.ok, true);
    assert.equal(forgotBody.deliveryMode, 'in_app_preview');
    assert.ok(forgotBody.resetToken && forgotBody.resetToken.length >= 20);

    // 2. Reject invalid reset token
    const badResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token-value-12345', newPassword: resetPassword }),
    });
    assert.equal(badResetRes.status, 400);

    // 3. Complete password reset with issued token
    const goodResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: forgotBody.resetToken, newPassword: resetPassword }),
    });
    assert.equal(goodResetRes.status, 200);

    // 4. Token must be single-use
    const reuseRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: forgotBody.resetToken, newPassword: changedPassword }),
    });
    assert.equal(reuseRes.status, 400);

    // 5. Old password fails, new password succeeds
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: initialPassword }),
    });
    assert.equal(oldLoginRes.status, 401);

    const newCookie = await loginAs(testEmail, resetPassword);

    // 6. Authenticated password change rejects wrong currentPassword and accepts right one
    const wrongChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: newCookie },
      body: JSON.stringify({ currentPassword: 'WrongPassword!1', newPassword: changedPassword }),
    });
    assert.equal(wrongChangeRes.status, 400);

    const goodChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: newCookie },
      body: JSON.stringify({ currentPassword: resetPassword, newPassword: changedPassword }),
    });
    assert.equal(goodChangeRes.status, 200);

    // Final password works
    await loginAs(testEmail, changedPassword);
  } finally {
    await db.delete(notifications).where(eq(notifications.userId, testUserId));
    await db.delete(securityLogs).where(eq(securityLogs.userId, testUserId));
    await db.delete(profiles).where(eq(profiles.id, testUserId));
  }
});

test('Health, Contact Messages, User Role Promotion & Review Moderation API', async () => {
  // 1. Health endpoint
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthRes.status, 200);
  const healthBody = (await healthRes.json()) as { ok: boolean };
  assert.equal(healthBody.ok, true);

  const studentCookie = await loginAs('student@balance.academy', 'BalanceStudent!2026');
  const managerCookie = await loginAs('content@balance.academy', 'BalanceEditor!2026');
  const adminCookie = await loginAs('admin@balance.academy', 'BalanceAdmin!2026');

  // 2. Contact form + Super Admin contact-messages RBAC
  const contactEmail = `contact-${Date.now()}@balance.academy`;
  const contactRes = await fetch(`${baseUrl}/api/public/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Contact Tester',
      email: contactEmail,
      subject: 'Corporate Training Inquiry',
      message: 'We would like team training details for Video Editing.',
    }),
  });
  assert.equal(contactRes.status, 201);

  const mgrMessagesRes = await fetch(`${baseUrl}/api/admin/contact-messages`, {
    headers: { Cookie: managerCookie },
  });
  assert.equal(mgrMessagesRes.status, 403);

  const adminMessagesRes = await fetch(`${baseUrl}/api/admin/contact-messages`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminMessagesRes.status, 200);
  const adminMessagesBody = (await adminMessagesRes.json()) as {
    messages: Array<{ id: string; email: string }>;
  };
  const foundMessage = adminMessagesBody.messages.find((m) => m.email === contactEmail);
  assert.ok(foundMessage);

  // 3. Register real user -> Super Admin promotes role -> cannot self-demote
  const roleTestEmail = `role-test-${Date.now()}@balance.academy`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Role Test User',
      email: roleTestEmail,
      phone: '01012345678',
      password: 'RoleTestPassword!2026',
      preferredLanguage: 'ar',
    }),
  });
  assert.equal(regRes.status, 201);
  const regBody = (await regRes.json()) as { user: { id: string; role: string } };
  assert.equal(regBody.user.role, 'student');

  // 4. Enrolled student submits course review -> admin moderates -> public home shows published review
  let createdReviewId = '';
  try {
    const promoteRes = await fetch(`${baseUrl}/api/admin/users/${regBody.user.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ role: 'content_manager' }),
    });
    assert.equal(promoteRes.status, 200);

    const adminMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminMeRes.status, 200);
    const adminMe = (await adminMeRes.json()) as { user: { id: string } };

    const selfDemoteRes = await fetch(`${baseUrl}/api/admin/users/${adminMe.user.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ role: 'student' }),
    });
    assert.equal(selfDemoteRes.status, 400);

    const overviewRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(overviewRes.status, 200);
    const overviewBody = (await overviewRes.json()) as {
      overview: { totalUsersCount: number; recentRegistrations: Array<{ id: string }> };
    };
    assert.ok(overviewBody.overview.totalUsersCount >= 4);
    assert.ok(overviewBody.overview.recentRegistrations.length > 0);

    const dashRes = await fetch(`${baseUrl}/api/student/dashboard`, {
      headers: { Cookie: studentCookie },
    });
    assert.equal(dashRes.status, 200);
    const dashBody = (await dashRes.json()) as { enrollments: Array<{ id: string }> };
    assert.ok(dashBody.enrollments.length > 0, 'Demo student must have at least one active enrollment');
    const enrolledCourseId = dashBody.enrollments[0].id;

    const reviewRes = await fetch(`${baseUrl}/api/student/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
      body: JSON.stringify({
        courseId: enrolledCourseId,
        rating: 5,
        comment: 'Clear practical editing workflow and great audio pacing breakdown.',
      }),
    });
    assert.equal(reviewRes.status, 201);

    const adminReviewsRes = await fetch(`${baseUrl}/api/admin/reviews`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminReviewsRes.status, 200);
    const adminReviewsBody = (await adminReviewsRes.json()) as {
      reviews: Array<{ id: string; studentEmail: string; isPublished: boolean }>;
    };
    const foundReview = adminReviewsBody.reviews.find((r) => r.studentEmail === 'student@balance.academy');
    assert.ok(foundReview);
    createdReviewId = foundReview.id;

    const publishReviewRes = await fetch(`${baseUrl}/api/admin/reviews/${createdReviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ isPublished: true }),
    });
    assert.equal(publishReviewRes.status, 200);

    const homeRes = await fetch(`${baseUrl}/api/public/home`);
    assert.equal(homeRes.status, 200);
    const homeBody = (await homeRes.json()) as { reviews: Array<{ id: string }> };
    assert.ok(homeBody.reviews.some((r) => r.id === createdReviewId));
  } finally {
    if (createdReviewId) {
      await db.delete(courseReviews).where(eq(courseReviews.id, createdReviewId));
    }
    await db.delete(contactMessages).where(eq(contactMessages.email, contactEmail));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, regBody.user.id));
    await db.delete(notifications).where(eq(notifications.userId, regBody.user.id));
    await db.delete(securityLogs).where(eq(securityLogs.userId, regBody.user.id));
    await db.delete(profiles).where(eq(profiles.id, regBody.user.id));
  }
});

test('Email Verification: register issues token -> bad token rejected -> valid token verifies -> single-use -> resend alreadyVerified', async () => {
  const verifyEmail = `verify-${Date.now()}@balance.academy`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Verify Flow Student',
      email: verifyEmail,
      password: 'VerifyFlow!2026',
      preferredLanguage: 'ar',
    }),
  });
  assert.equal(regRes.status, 201);
  const regCookieHeader = regRes.headers.get('set-cookie');
  assert.ok(regCookieHeader);
  const studentCookie = regCookieHeader.split(';')[0];

  const regBody = (await regRes.json()) as {
    user: { id: string; emailVerified: boolean };
    emailDeliveryMode: string;
    verificationToken?: string;
  };
  assert.equal(regBody.user.emailVerified, false);

  const testUserId = regBody.user.id;
  try {
    // Request a fresh verification token via resend-verification
    const resendRes = await fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Cookie: studentCookie },
    });
    assert.equal(resendRes.status, 200);
    const resendBody = (await resendRes.json()) as {
      ok: boolean;
      alreadyVerified: boolean;
      verificationToken?: string;
    };
    assert.equal(resendBody.ok, true);
    assert.equal(resendBody.alreadyVerified, false);
    const tokenToUse = resendBody.verificationToken || regBody.verificationToken;
    assert.ok(tokenToUse && tokenToUse.length >= 20);

    // Invalid token must fail
    const badVerify = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-verification-token-12345' }),
    });
    assert.equal(badVerify.status, 400);

    // Valid token verifies the account
    const goodVerify = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
      body: JSON.stringify({ token: tokenToUse }),
    });
    assert.equal(goodVerify.status, 200);
    const goodBody = (await goodVerify.json()) as { ok: boolean; emailVerified: boolean };
    assert.equal(goodBody.emailVerified, true);

    // Single-use: reusing the token fails
    const reuseVerify = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenToUse }),
    });
    assert.equal(reuseVerify.status, 400);

    // Resend reports alreadyVerified
    const afterVerifyResend = await fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Cookie: studentCookie },
    });
    assert.equal(afterVerifyResend.status, 200);
    const afterResendBody = (await afterVerifyResend.json()) as { alreadyVerified: boolean };
    assert.equal(afterResendBody.alreadyVerified, true);

    // Admin settings exposes emailService status without leaking secrets
    const adminCookie = await loginAs('admin@balance.academy', 'BalanceAdmin!2026');
    const settingsRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(settingsRes.status, 200);
    const settingsBody = (await settingsRes.json()) as {
      emailService: { provider: string; configured: boolean; fromAddress: string };
    };
    assert.equal(settingsBody.emailService.provider, 'resend');
    assert.equal(typeof settingsBody.emailService.configured, 'boolean');
    assert.ok(settingsBody.emailService.fromAddress.includes('@'));
  } finally {
    await db.delete(notifications).where(eq(notifications.userId, testUserId));
    await db.delete(securityLogs).where(eq(securityLogs.userId, testUserId));
    await db.delete(profiles).where(eq(profiles.id, testUserId));
  }
});


