import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStudentWatermarkCode,
  maskEmailForWatermark,
  signSessionToken,
  signVideoToken,
  SlidingWindowRateLimiter,
  verifySessionToken,
  verifyVideoToken,
} from './tokens';
import {
  calculateCourseProgressPercent,
  canCreatePurchase,
  canTransitionPurchaseStatus,
  evaluateLessonCompletion,
  isEnrollmentValid,
} from '../domain/rules';

const SECRET = 'unit-test-hmac-secret-key-2026';

test('session token signs, verifies, and rejects tampering or expiry', () => {
  const now = 1_700_000_000_000;
  const token = signSessionToken({ sub: 'user-1', role: 'student', jti: 'sess-1' }, SECRET, 3600, now);

  const valid = verifySessionToken(token, SECRET, now + 1000);
  assert.ok(valid);
  assert.equal(valid.sub, 'user-1');
  assert.equal(valid.role, 'student');

  const tampered = token.slice(0, -3) + 'xxx';
  assert.equal(verifySessionToken(tampered, SECRET, now + 1000), null);

  assert.equal(verifySessionToken(token, SECRET, now + 3601 * 1000), null);
});

test('video playback token binds to assetId, lessonId, and short TTL', () => {
  const now = 1_700_000_000_000;
  const token = signVideoToken(
    { uid: 'stu-1', lid: 'les-1', aid: 'asset-1', sid: 'ws-1' },
    SECRET,
    90,
    now,
  );

  const ok = verifyVideoToken(token, SECRET, { assetId: 'asset-1', lessonId: 'les-1' }, now + 30_000);
  assert.ok(ok);
  assert.equal(ok.sid, 'ws-1');

  // Wrong asset binding rejected (prevents reusing token for another video)
  assert.equal(verifyVideoToken(token, SECRET, { assetId: 'asset-2' }, now + 30_000), null);
  // Expired after 90s rejected
  assert.equal(verifyVideoToken(token, SECRET, { assetId: 'asset-1' }, now + 91_000), null);
});

test('watermark formatting masks student email and derives deterministic student code', () => {
  assert.equal(maskEmailForWatermark('omar.hassan@balance.academy'), 'om***@balance.academy');
  assert.equal(maskEmailForWatermark('a@test.com'), 'a***@test.com');
  assert.equal(formatStudentWatermarkCode('9f8a12b3-4412-4090-aa11-889900112233'), 'BA-9F8A12B3');
});

test('lifetime enrollment remains valid when expiresAt is null and rejects revoked', () => {
  assert.equal(isEnrollmentValid({ status: 'active', expiresAt: null }), true);
  assert.equal(isEnrollmentValid({ status: 'revoked', expiresAt: null }), false);
  assert.equal(isEnrollmentValid(null), false);
});

test('duplicate purchase prevention blocks pending or active enrollments', () => {
  assert.deepEqual(
    canCreatePurchase({ hasActiveEnrollment: true, existingStatuses: [] }),
    { allowed: false, reason: 'already_enrolled' },
  );
  assert.deepEqual(
    canCreatePurchase({ hasActiveEnrollment: false, existingStatuses: ['proof_submitted'] }),
    { allowed: false, reason: 'pending_purchase_exists' },
  );
  assert.deepEqual(
    canCreatePurchase({ hasActiveEnrollment: false, existingStatuses: ['rejected'] }),
    { allowed: true },
  );
});

test('purchase state machine enforces explicit manual verification flow', () => {
  assert.equal(canTransitionPurchaseStatus('pending', 'submit_proof'), true);
  assert.equal(canTransitionPurchaseStatus('proof_submitted', 'submit_proof'), false);
  assert.equal(canTransitionPurchaseStatus('proof_submitted', 'approve'), true);
  assert.equal(canTransitionPurchaseStatus('approved', 'reject'), false);
});

test('lesson completion does not trigger simply on opening player at 0 seconds', () => {
  assert.equal(
    evaluateLessonCompletion({
      alreadyCompleted: false,
      watchedSeconds: 0,
      durationSeconds: 300,
    }),
    false,
  );
  assert.equal(
    evaluateLessonCompletion({
      alreadyCompleted: false,
      watchedSeconds: 0,
      durationSeconds: 300,
      explicitMarkComplete: true,
    }),
    false,
  );
  assert.equal(
    evaluateLessonCompletion({
      alreadyCompleted: false,
      watchedSeconds: 260,
      durationSeconds: 300,
    }),
    true,
  );
  assert.equal(calculateCourseProgressPercent(8, 2), 25);
});

test('sliding window rate limiter blocks burst traffic above threshold', () => {
  const limiter = new SlidingWindowRateLimiter(3, 1000);
  assert.equal(limiter.consume('ip:1', 100).allowed, true);
  assert.equal(limiter.consume('ip:1', 200).allowed, true);
  assert.equal(limiter.consume('ip:1', 300).allowed, true);
  assert.equal(limiter.consume('ip:1', 400).allowed, false);
  assert.equal(limiter.consume('ip:1', 1200).allowed, true);
});
