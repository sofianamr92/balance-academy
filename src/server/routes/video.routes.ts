import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { courses, enrollments, lessons, platformSettings, watchSessions } from '../../db/schema.ts';
import { newId } from '../../db/users.ts';
import { isEnrollmentValid } from '../../lib/domain/rules.ts';
import {
  formatStudentWatermarkCode,
  maskEmailForWatermark,
  signVideoToken,
  verifyVideoToken,
} from '../../lib/security/tokens.ts';
import { asyncHandler, isWatchSessionActive } from '../helpers.ts';
import {
  getClientIp,
  getVideoTokenSecret,
  logSecurityEvent,
  videoSegmentRateLimiter,
} from '../middleware.ts';
import { getAssetHlsDir } from '../videoAssets.ts';

export function createVideoRouter(): express.Router {
  const router = express.Router();

  router.post(
    '/authorize',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      const lessonId = typeof req.body?.lessonId === 'string' ? req.body.lessonId : '';
      if (!lessonId) {
        res.status(400).json({ error: 'lessonId is required' });
        return;
      }

      const lessonRows = await db
        .select({
          id: lessons.id,
          courseId: lessons.courseId,
          isFreePreview: lessons.isFreePreview,
          videoAssetId: lessons.videoAssetId,
          isPublished: courses.isPublished,
          isArchived: courses.isArchived,
        })
        .from(lessons)
        .innerJoin(courses, eq(courses.id, lessons.courseId))
        .where(eq(lessons.id, lessonId))
        .limit(1);

      const lesson = lessonRows[0];
      if (!lesson || !lesson.videoAssetId) {
        res.status(404).json({ error: 'Lesson video not found' });
        return;
      }

      const isStaff = req.authUser?.role === 'super_admin' || req.authUser?.role === 'content_manager';
      if (!isStaff && (!lesson.isPublished || lesson.isArchived)) {
        res.status(403).json({ error: 'Course is not published' });
        return;
      }

      if (!lesson.isFreePreview) {
        if (!req.authUser) {
          await logSecurityEvent({
            eventType: 'video.unauthenticated_playback_attempt',
            severity: 'warning',
            ipAddress: ip,
            details: `Unauthenticated request to authorize lesson ${lessonId}`,
          });
          res.status(401).json({ error: 'Authentication required to watch this lesson' });
          return;
        }
        if (!isStaff) {
          const enrRows = await db
            .select({ status: enrollments.status, expiresAt: enrollments.expiresAt })
            .from(enrollments)
            .where(and(eq(enrollments.studentId, req.authUser.id), eq(enrollments.courseId, lesson.courseId)))
            .limit(1);
          const enr = enrRows[0];
          const valid = isEnrollmentValid(
            enr ? { status: enr.status as 'active' | 'revoked', expiresAt: enr.expiresAt } : undefined,
          );
          if (!valid) {
            await logSecurityEvent({
              userId: req.authUser.id,
              eventType: 'video.unauthorized_course_access',
              severity: 'warning',
              ipAddress: ip,
              details: `Student attempted to watch un-enrolled lesson ${lessonId}`,
            });
            res.status(403).json({ error: 'Active course enrollment required' });
            return;
          }
        }
      }

      const viewerId = req.authUser?.id ?? 'guest-preview';
      const sessionId = newId('ws');
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 1000 * 90).toISOString();

      if (req.authUser) {
        const settingRows = await db
          .select({ value: platformSettings.value })
          .from(platformSettings)
          .where(eq(platformSettings.key, 'max_concurrent_watch_sessions'))
          .limit(1);
        const maxSessions = Math.max(1, Number(settingRows[0]?.value || 2));

        const activeSessions = await db
          .select({ id: watchSessions.id })
          .from(watchSessions)
          .where(
            and(
              eq(watchSessions.studentId, req.authUser.id),
              eq(watchSessions.isRevoked, false),
              gt(watchSessions.expiresAt, nowIso),
            ),
          )
          .orderBy(asc(watchSessions.createdAt));

        if (activeSessions.length >= maxSessions) {
          const overflow = activeSessions.slice(0, activeSessions.length - maxSessions + 1);
          const overflowIds = overflow.map((s) => s.id);
          await db
            .update(watchSessions)
            .set({ isRevoked: true })
            .where(inArray(watchSessions.id, overflowIds));

          await logSecurityEvent({
            userId: req.authUser.id,
            eventType: 'video.concurrent_session_rotated',
            severity: 'info',
            ipAddress: ip,
            details: `Rotated ${overflow.length} older watch session(s) for lesson ${lessonId}`,
          });
        }

        await db.insert(watchSessions).values({
          id: sessionId,
          studentId: req.authUser.id,
          lessonId,
          ipAddress: ip,
          userAgent: String(req.headers['user-agent'] || 'browser').slice(0, 180),
          isRevoked: false,
          lastSeenAt: nowIso,
          expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
          createdAt: nowIso,
        });
      }

      const token = signVideoToken(
        {
          uid: viewerId,
          lid: lessonId,
          aid: lesson.videoAssetId,
          sid: sessionId,
        },
        getVideoTokenSecret(),
        90,
      );

      const watermark = req.authUser
        ? {
            displayName: req.authUser.fullName,
            maskedEmail: maskEmailForWatermark(req.authUser.email),
            studentCode: formatStudentWatermarkCode(req.authUser.id),
          }
        : {
            displayName: 'Free Preview Viewer',
            maskedEmail: 'preview@balance.academy',
            studentCode: 'BA-PREVIEW',
          };

      res.json({
        authorized: true,
        playlistUrl: `/api/video/hls/${lesson.videoAssetId}/playlist.m3u8?token=${encodeURIComponent(token)}`,
        sessionId,
        expiresAt,
        watermark,
      });
    }),
  );

  router.get(
    '/hls/:assetId/playlist.m3u8',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!videoSegmentRateLimiter.consume(`hls:${ip}`).allowed) {
        res.status(429).send('Rate limit exceeded');
        return;
      }

      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const assetId = String(req.params.assetId || '');
      const payload = verifyVideoToken(token, getVideoTokenSecret(), { assetId });

      if (!payload) {
        await logSecurityEvent({
          eventType: 'video.invalid_or_expired_playlist_token',
          severity: 'warning',
          ipAddress: ip,
          details: `Rejected HLS playlist request for asset ${assetId}`,
        });
        res.status(403).send('Playback token invalid or expired');
        return;
      }

      if (payload.uid !== 'guest-preview' && !(await isWatchSessionActive(payload.sid))) {
        await logSecurityEvent({
          userId: payload.uid,
          eventType: 'video.revoked_session_blocked',
          severity: 'warning',
          ipAddress: ip,
          details: `Blocked revoked session ${payload.sid} on playlist ${assetId}`,
        });
        res.status(403).send('Watch session has been revoked');
        return;
      }

      const playlistPath = path.join(getAssetHlsDir(assetId), 'playlist.m3u8');
      if (!fs.existsSync(playlistPath)) {
        res.status(404).send('HLS playlist not found');
        return;
      }

      const raw = fs.readFileSync(playlistPath, 'utf8');
      const rewritten = raw
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.endsWith('.ts')) {
            return `/api/video/hls/${assetId}/${trimmed}?token=${encodeURIComponent(token)}`;
          }
          return line;
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(rewritten);
    }),
  );

  router.get(
    '/hls/:assetId/:segment',
    asyncHandler(async (req, res) => {
      const ip = getClientIp(req);
      if (!videoSegmentRateLimiter.consume(`seg:${ip}`).allowed) {
        res.status(429).send('Rate limit exceeded');
        return;
      }

      const assetId = String(req.params.assetId || '');
      const segment = String(req.params.segment || '');
      if (!/^seg_\d{3}\.ts$/.test(segment)) {
        res.status(400).send('Invalid segment name');
        return;
      }

      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const payload = verifyVideoToken(token, getVideoTokenSecret(), { assetId });
      if (!payload) {
        await logSecurityEvent({
          eventType: 'video.invalid_segment_token',
          severity: 'warning',
          ipAddress: ip,
          details: `Blocked unauthorized segment ${assetId}/${segment}`,
        });
        res.status(403).send('Segment token invalid or expired');
        return;
      }

      if (payload.uid !== 'guest-preview' && !(await isWatchSessionActive(payload.sid))) {
        res.status(403).send('Watch session revoked');
        return;
      }

      const segPath = path.join(getAssetHlsDir(assetId), segment);
      if (!fs.existsSync(segPath)) {
        res.status(404).send('Segment not found');
        return;
      }

      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'no-store, private');
      fs.createReadStream(segPath).pipe(res);
    }),
  );

  return router;
}
