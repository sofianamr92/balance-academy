import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { ensureSeededHlsAssets } from './src/server/videoAssets.ts';
import { createApiRouter } from './src/server/routes.ts';

async function startServer() {
  // Synthesize private HLS video assets via FFmpeg (no DB startup probes)
  await ensureSeededHlsAssets();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Mount API routes (Cloud SQL pool connects lazily on demand per request)
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BALANCE ACADEMY server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
