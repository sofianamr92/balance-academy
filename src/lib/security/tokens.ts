import crypto from 'node:crypto';

export interface SessionTokenPayload {
  sub: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface VideoPlaybackTokenPayload {
  uid: string;
  lid: string;
  aid: string;
  sid: string;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(input: string): string {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
}

function signHmac(data: string, secret: string): string {
  return base64UrlEncode(crypto.createHmac('sha256', secret).update(data).digest());
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signSessionToken(
  payload: Omit<SessionTokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
  nowMs = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const fullPayload: SessionTokenPayload = {
    ...payload,
    iat,
    exp: iat + ttlSeconds,
  };
  const encoded = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = signHmac(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): SessionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = signHmac(encoded, secret);
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as SessionTokenPayload;
    if (!parsed.sub || !parsed.role || typeof parsed.exp !== 'number') return null;
    if (Math.floor(nowMs / 1000) >= parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signVideoToken(
  payload: Omit<VideoPlaybackTokenPayload, 'exp'>,
  secret: string,
  ttlSeconds = 90,
  nowMs = Date.now(),
): string {
  const fullPayload: VideoPlaybackTokenPayload = {
    ...payload,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const encoded = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = signHmac(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifyVideoToken(
  token: string,
  secret: string,
  expected?: { assetId?: string; lessonId?: string },
  nowMs = Date.now(),
): VideoPlaybackTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = signHmac(encoded, secret);
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as VideoPlaybackTokenPayload;
    if (!parsed.uid || !parsed.lid || !parsed.aid || !parsed.sid || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Math.floor(nowMs / 1000) >= parsed.exp) return null;
    if (expected?.assetId && parsed.aid !== expected.assetId) return null;
    if (expected?.lessonId && parsed.lid !== expected.lessonId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function maskEmailForWatermark(email: string): string {
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  const visiblePrefix = local.slice(0, Math.min(2, local.length));
  return `${visiblePrefix}***@${domain}`;
}

export function formatStudentWatermarkCode(userId: string): string {
  const compact = userId.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `BA-${compact.slice(0, 8)}`;
}

export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, nowMs = Date.now()): { allowed: boolean; remaining: number } {
    const cutoff = nowMs - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0 };
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.maxRequests - recent.length };
  }
}
