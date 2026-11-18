# BALANCE ACADEMY — Architecture & Security Overview

## 1. System Architecture
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 with Arabic-first RTL (`dir="rtl"`) and full English LTR (`dir="ltr"`) switching.
- **Backend API**: Express server (`server.ts` + `src/server/routes.ts`) enforcing Zod input validation, HttpOnly HMAC-signed session cookies, rate limiting, and role-based access control (`super_admin`, `content_manager`, `student`).
- **Database**:
  - Local runtime: Normalized 16-table SQLite database (`node:sqlite`, `storage/balance_academy.db`) with strict foreign keys and transactional payment verification.
  - Production target: Supabase PostgreSQL migrations (`supabase/migrations/001_initial_schema.sql`, `002_rls_policies.sql`) with Row Level Security enabled across all tables.
- **Protected Video Pipeline**:
  - Original MP4 files reside outside public web roots; FFmpeg (`scripts/transcode-hls.sh` & `src/server/videoAssets.ts`) produces segmented `.m3u8` + `.ts` HLS assets.
  - Production Cloudflare R2 + Worker contract (`cloudflare/video-worker.ts`) and local Express `/api/video/hls/*` verify short-lived (90s) HMAC-SHA256 playback tokens bound to `{ uid, lid, aid, sid }` on **both playlists and every `.ts` segment**.
  - Active `watch_sessions` enforce concurrent playback caps and admin session revocation.
  - `ProtectedVideoPlayer` renders a moving personal watermark (`Display Name · Masked Email · Student Code`).

> **Important Limitation**: While segmented HLS delivery, short-lived token binding, session limits, and dynamic watermarking substantially deter casual link sharing and automated scraping, no browser-based player without hardware-backed commercial DRM (Widevine/FairPlay) can completely prevent OS-level screen recording.
