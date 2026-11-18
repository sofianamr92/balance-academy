import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { auditLogs, notifications, securityLogs } from '../db/schema.ts';
import { getOrCreateFirebaseUser, getUserById, newId } from '../db/users.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import {
  SlidingWindowRateLimiter,
  signSessionToken,
  verifySessionToken,
} from '../lib/security/tokens.ts';
import type { RoleName } from '../types/index.ts';

export const SESSION_COOKIE_NAME = 'ba_session';

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'balance-academy-dev-session-secret-2026-change-in-prod';
}

export function getVideoTokenSecret(): string {
  return process.env.VIDEO_TOKEN_SECRET || 'balance-academy-dev-video-secret-2026-change-in-prod';
}

export interface AuthUser {
  id: string;
  uid?: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  role: RoleName;
  preferredLanguage: 'ar' | 'en';
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  sessionId?: string;
}

export const authRateLimiter = new SlidingWindowRateLimiter(30, 60_000);
export const videoSegmentRateLimiter = new SlidingWindowRateLimiter(180, 60_000);

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || '127.0.0.1';
}

export async function logSecurityEvent(params: {
  userId?: string | null;
  eventType: string;
  severity?: 'info' | 'warning' | 'critical';
  ipAddress: string;
  details: string;
}): Promise<void> {
  try {
    await db.insert(securityLogs).values({
      id: newId('sec'),
      userId: params.userId ?? null,
      eventType: params.eventType,
      severity: params.severity ?? 'info',
      ipAddress: params.ipAddress,
      details: params.details,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[security_log] write failed:', err);
  }
}

export async function logAuditEvent(params: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: newId('aud'),
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: JSON.stringify(params.metadata ?? {}),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[audit_log] write failed:', err);
  }
}

export async function createNotification(params: {
  userId: string;
  eventType: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      id: newId('not'),
      userId: params.userId,
      eventType: params.eventType,
      titleAr: params.titleAr,
      titleEn: params.titleEn,
      bodyAr: params.bodyAr,
      bodyEn: params.bodyEn,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notification] write failed:', err);
  }
}

export function setAuthCookie(res: Response, user: AuthUser): void {
  const token = signSessionToken(
    { sub: user.id, role: user.role, jti: newId('sid') },
    getSessionSecret(),
    60 * 60 * 24 * 7,
  );
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export async function attachOptionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // 1. Check Bearer Firebase ID token first
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.slice('Bearer '.length).trim();
      if (idToken) {
        try {
          const decoded = await adminAuth.verifyIdToken(idToken);
          if (decoded.email) {
            const profile = await getOrCreateFirebaseUser({
              uid: decoded.uid,
              email: decoded.email,
              fullName: typeof decoded.name === 'string' ? decoded.name : undefined,
              emailVerified: Boolean(decoded.email_verified),
            });
            if (profile.isActive) {
              req.authUser = profile;
              req.sessionId = decoded.uid;
            }
            next();
            return;
          }
        } catch {
          // Invalid or expired Firebase token -> fall through to cookie or unauthenticated
        }
      }
    }

    // 2. Fallback to HttpOnly session cookie (used by email/password & HLS segment player)
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || !token) {
      next();
      return;
    }
    const payload = verifySessionToken(token, getSessionSecret());
    if (!payload) {
      next();
      return;
    }

    const row = await getUserById(payload.sub);
    if (row && row.isActive) {
      req.authUser = row;
      req.sessionId = payload.jti;
    }
    next();
  } catch (err) {
    console.error('[attachOptionalAuth] error:', err);
    next();
  }
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function requireRole(allowedRoles: RoleName[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      void logSecurityEvent({
        userId: req.authUser.id,
        eventType: 'authz.forbidden_admin_attempt',
        severity: 'warning',
        ipAddress: getClientIp(req),
        details: `Role ${req.authUser.role} attempted access to ${req.method} ${req.originalUrl}`,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
