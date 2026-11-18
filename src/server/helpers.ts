import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { watchSessions } from '../db/schema.ts';
import type { AuthenticatedRequest } from './middleware.ts';

export function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch((err) => {
      console.error('[api] unhandled route error:', err);
      if (!res.headersSent) {
        const safeMessage =
          err instanceof Error && err.message && !/select|insert|update|delete|postgres|sql/i.test(err.message)
            ? err.message
            : 'Database request failed. Please try again.';
        res.status(500).json({ error: safeMessage });
      }
    });
  };
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

export { sendPasswordResetEmail } from './email.ts';

export async function isWatchSessionActive(sessionId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ isRevoked: watchSessions.isRevoked, expiresAt: watchSessions.expiresAt })
      .from(watchSessions)
      .where(eq(watchSessions.id, sessionId))
      .limit(1);
    const row = rows[0];
    if (!row || row.isRevoked) return false;
    return Date.parse(row.expiresAt) > Date.now();
  } catch (error) {
    console.error('Database query failed in isWatchSessionActive:', error);
    return false;
  }
}
