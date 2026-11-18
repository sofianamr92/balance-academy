/**
 * BALANCE ACADEMY — Cloudflare Worker for Protected HLS Video Delivery
 *
 * Deployed in front of a PRIVATE Cloudflare R2 bucket (`PRIVATE_VIDEO_BUCKET`).
 * Never exposes public bucket URLs or permanent signed URLs.
 * Validates short-lived HMAC-SHA256 tokens on BOTH `.m3u8` playlists and `.ts` segments.
 */

export interface Env {
  PRIVATE_VIDEO_BUCKET: R2Bucket;
  CLOUDFLARE_WORKER_SIGNING_SECRET: string;
  ALLOWED_ORIGIN: string;
}

interface TokenPayload {
  uid: string;
  lid: string;
  aid: string;
  sid: string;
  exp: number;
}

async function verifyToken(token: string, secret: string, expectedAssetId: string): Promise<TokenPayload | null> {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const padded = sig.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (sig.length % 4)) % 4);
  const sigBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(encoded));
  if (!ok) return null;

  const payloadB64 = encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (encoded.length % 4)) % 4);
  const payload = JSON.parse(atob(payloadB64)) as TokenPayload;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
  if (payload.aid !== expectedAssetId) return null;
  return payload;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const match = url.pathname.match(/^\/hls\/([a-zA-Z0-9_-]+)\/(playlist\.m3u8|seg_\d{3}\.ts)$/);

    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    const [, assetId, fileName] = match;
    const payload = await verifyToken(token, env.CLOUDFLARE_WORKER_SIGNING_SECRET, assetId);
    if (!payload) {
      return new Response('Unauthorized or expired playback token', { status: 403 });
    }

    const objectKey = `hls/${assetId}/${fileName}`;
    const object = await env.PRIVATE_VIDEO_BUCKET.get(objectKey);
    if (!object) {
      return new Response('Video object missing', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Cache-Control', 'no-store, private');
    headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);

    if (fileName.endsWith('.m3u8')) {
      const playlistText = await object.text();
      const rewritten = playlistText
        .split('\n')
        .map((line) => (line.trim().endsWith('.ts') ? `/hls/${assetId}/${line.trim()}?token=${encodeURIComponent(token)}` : line))
        .join('\n');
      headers.set('Content-Type', 'application/vnd.apple.mpegurl');
      return new Response(rewritten, { status: 200, headers });
    }

    headers.set('Content-Type', 'video/mp2t');
    return new Response(object.body, { status: 200, headers });
  },
};
