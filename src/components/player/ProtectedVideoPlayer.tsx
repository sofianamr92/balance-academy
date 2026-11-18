import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Lock, ShieldCheck } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/authToken';
import type { VideoAuthorizationPayload } from '../../types';

const WATERMARK_POSITIONS = [
  'top-5 start-5',
  'top-5 end-5',
  'bottom-14 start-6',
  'bottom-14 end-6',
  'top-1/3 start-8',
];

export function ProtectedVideoPlayer({
  lessonId,
  lessonTitle,
  initialPositionSeconds,
  durationSeconds,
  onProgressTick,
}: {
  lessonId: string;
  lessonTitle: string;
  initialPositionSeconds: number;
  durationSeconds: number;
  onProgressTick: (positionSeconds: number, watchedSeconds: number) => void;
}) {
  const { t, locale } = useApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const watchedRef = useRef<number>(0);

  const [authData, setAuthData] = useState<VideoAuthorizationPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wmIdx, setWmIdx] = useState(0);
  const [levels, setLevels] = useState<Array<{ index: number; height: number }>>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);

  // Move watermark periodically without interfering with lesson playback
  useEffect(() => {
    const timer = setInterval(() => {
      setWmIdx((prev) => (prev + 1) % WATERMARK_POSITIONS.length);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Authorize lesson stream & attach HLS.js
  useEffect(() => {
    let active = true;
    watchedRef.current = 0;
    setLoading(true);
    setErrorMsg(null);

    async function initStream() {
      try {
        const res = await apiFetch('/api/video/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId }),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          if (active) {
            setErrorMsg(errBody.error || t.player.lockedTitle);
            setAuthData(null);
            setLoading(false);
          }
          return;
        }

        const payload = (await res.json()) as VideoAuthorizationPayload;
        if (!active) return;
        setAuthData(payload);
        setLoading(false);

        const video = videoRef.current;
        if (!video) return;

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            xhrSetup: (xhr) => {
              xhr.withCredentials = true;
            },
          });
          hlsRef.current = hls;
          hls.loadSource(payload.playlistUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLevels(
              hls.levels.map((lvl, index) => ({
                index,
                height: lvl.height || 720,
              })),
            );
            if (initialPositionSeconds > 1 && initialPositionSeconds < durationSeconds - 2) {
              video.currentTime = Math.min(initialPositionSeconds, video.duration || initialPositionSeconds);
            }
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && active) {
              if (data.response?.code === 403 || data.response?.code === 401) {
                setErrorMsg(
                  locale === 'ar'
                    ? 'انتهت صلاحية تصريح التشغيل أو تم إيقاف الجلسة.'
                    : 'Playback token expired or watch session was revoked.',
                );
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = payload.playlistUrl;
        }
      } catch {
        if (active) {
          setErrorMsg(locale === 'ar' ? 'تعذر تحميل البث المحمي.' : 'Unable to load protected stream.');
          setLoading(false);
        }
      }
    }

    void initStream();

    return () => {
      active = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [lessonId, initialPositionSeconds, durationSeconds, locale, t.player.lockedTitle]);

  // Track genuine watch time while playing
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !authData) return;

    let lastTick = Date.now();
    const interval = setInterval(() => {
      if (!video.paused && !video.ended) {
        const now = Date.now();
        const delta = Math.max(1, Math.round((now - lastTick) / 1000));
        lastTick = now;
        watchedRef.current += delta;
        onProgressTick(Math.floor(video.currentTime), watchedRef.current);
      } else {
        lastTick = Date.now();
      }
    }, 3000);

    const handlePauseOrEnd = () => {
      onProgressTick(Math.floor(video.currentTime), watchedRef.current);
    };

    video.addEventListener('pause', handlePauseOrEnd);
    video.addEventListener('ended', handlePauseOrEnd);
    return () => {
      clearInterval(interval);
      video.removeEventListener('pause', handlePauseOrEnd);
      video.removeEventListener('ended', handlePauseOrEnd);
    };
  }, [authData, onProgressTick]);

  const handleQualityChange = (idx: number) => {
    setCurrentLevel(idx);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = idx;
    }
  };

  if (errorMsg) {
    return (
      <div className="aspect-video w-full rounded-xl border border-[#E2E8F0] bg-[#172554] flex flex-col items-center justify-center p-6 text-center text-white">
        <Lock className="h-10 w-10 text-[#60A5FA]" />
        <h3 className="mt-3 text-lg font-semibold">{t.player.lockedTitle}</h3>
        <p className="mt-1.5 max-w-md text-sm text-white/80">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#1E293B] bg-[#080B12] select-none"
        onContextMenu={(e) => e.preventDefault()}
        data-testid="protected-hls-player"
      >
        <video
          ref={videoRef}
          controls
          controlsList="nodownload noplaybackrate"
          playsInline
          aria-label={lessonTitle}
          className="h-full w-full object-contain"
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080B12]/80 text-sm text-white/85">
            {locale === 'ar' ? 'جاري التحقق من التصريح وتجهيز البث...' : 'Verifying playback authorization...'}
          </div>
        )}

        {/* Dynamic Moving Watermark */}
        {authData && (
          <div
            dir="ltr"
            data-testid="dynamic-watermark"
            className={`pointer-events-none absolute ${WATERMARK_POSITIONS[wmIdx]} transition-all duration-700 rounded bg-[#080B12]/60 px-2.5 py-1 text-[11px] font-mono-num text-white/80 backdrop-blur-[2px] flex items-center gap-1.5`}
          >
            <span>{authData.watermark.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>{authData.watermark.maskedEmail}</span>
            <span aria-hidden="true">·</span>
            <span>{authData.watermark.studentCode}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs text-[#64748B]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#16A34A] shrink-0" />
          <span>{t.player.protectedNotice}</span>
        </div>

        {levels.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="hls-quality-select" className="text-[#111827] font-medium">
              {locale === 'ar' ? 'الجودة:' : 'Quality:'}
            </label>
            <select
              id="hls-quality-select"
              value={currentLevel}
              onChange={(e) => handleQualityChange(Number(e.target.value))}
              className="rounded border border-[#E2E8F0] bg-white px-2 py-1 text-xs text-[#111827]"
            >
              <option value={-1}>Auto</option>
              {levels.map((lvl) => (
                <option key={lvl.index} value={lvl.index}>
                  {lvl.height}p
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
