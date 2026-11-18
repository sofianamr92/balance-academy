# BALANCE ACADEMY — Deployment & External Credentials Guide

## Required Environment Variables (see `.env.example`)
1. `SESSION_SECRET` / `VIDEO_TOKEN_SECRET`: 32+ byte random secrets used to sign HttpOnly session cookies and 90-second HLS playback tokens.
2. **Supabase PostgreSQL** (when deploying to managed Postgres):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
   - Run `supabase/migrations/001_initial_schema.sql`, `002_rls_policies.sql`, and `supabase/seed.sql`.
3. **Cloudflare R2 + Video Worker**:
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PRIVATE_BUCKET_NAME`
   - Deploy `cloudflare/video-worker.ts` bound to your private R2 bucket and configure `CLOUDFLARE_WORKER_SIGNING_SECRET`.
4. **Email Provider** (optional future extension): `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`.

## Build & Run Commands
- Install dependencies: `npm install`
- Unit & security tests: `npx --yes tsx --test src/lib/security/core.test.ts src/server/api.test.ts`
- Production build: `npm run build`
- Start server: `npm start`
