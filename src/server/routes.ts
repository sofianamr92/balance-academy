import express from 'express';
import { attachOptionalAuth, type AuthenticatedRequest } from './middleware.ts';
import { createAuthRouter } from './routes/auth.routes.ts';
import { createPublicRouter } from './routes/public.routes.ts';
import { createStudentRouter } from './routes/student.routes.ts';
import { createVideoRouter } from './routes/video.routes.ts';
import { createAdminRouter } from './routes/admin.routes.ts';

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    void attachOptionalAuth(req as AuthenticatedRequest, res, next);
  });

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'balance-academy-api',
      timestamp: new Date().toISOString(),
    });
  });

  router.use('/auth', createAuthRouter());
  router.use('/public', createPublicRouter());
  router.use('/student', createStudentRouter());
  router.use('/video', createVideoRouter());
  router.use('/admin', createAdminRouter());

  return router;
}
