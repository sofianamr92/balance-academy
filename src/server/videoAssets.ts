import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const PRIVATE_VIDEO_ROOT = path.resolve(process.cwd(), 'storage', 'videos');

const SEEDED_ASSETS = [
  { id: 'asset-ve-01', color: '#172554', accent: '#3B82F6' },
  { id: 'asset-ve-02', color: '#0F172A', accent: '#3B82F6' },
  { id: 'asset-ve-03', color: '#1E293B', accent: '#60A5FA' },
  { id: 'asset-dm-01', color: '#172554', accent: '#2563EB' },
  { id: 'asset-dm-02', color: '#0F172A', accent: '#3B82F6' },
  { id: 'asset-pr-01', color: '#172554', accent: '#1D4ED8' },
  { id: 'asset-pr-02', color: '#080B12', accent: '#3B82F6' },
];

export function getAssetHlsDir(assetId: string): string {
  const safeId = assetId.replaceAll(/[^a-zA-Z0-9_-]/g, '');
  return path.join(PRIVATE_VIDEO_ROOT, safeId);
}

export async function generateHlsStreamForAsset(
  assetId: string,
  baseColor = '#172554',
  accentColor = '#3B82F6',
): Promise<void> {
  const dir = getAssetHlsDir(assetId);
  const playlistPath = path.join(dir, 'playlist.m3u8');
  if (fs.existsSync(playlistPath)) return;

  fs.mkdirSync(dir, { recursive: true });

  // Synthesize a real 12-second 720p H.264/AAC HLS stream split into 4-second .ts segments
  // with an animated progress bar overlay so the player visibly plays smooth motion.
  const filterGraph = [
    `color=c=${baseColor}:s=1280x720:d=12:r=24[bg]`,
    `color=c=${accentColor}:s=1280x10:d=12:r=24[bar]`,
    `[bg][bar]overlay=x='(t/12)*1280-1280':y=700:shortest=1[v]`,
  ].join(';');

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:sample_rate=44100:duration=12',
      '-filter_complex', filterGraph,
      '-map', '[v]',
      '-map', '0:a',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'stillimage',
      '-pix_fmt', 'yuv420p',
      '-g', '48',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-af', 'volume=0.05',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(dir, 'seg_%03d.ts'),
      playlistPath,
    ]);
  } catch (err) {
    console.error(`[videoAssets] Failed to synthesize HLS for ${assetId}:`, err);
  }
}

export async function ensureSeededHlsAssets(): Promise<void> {
  fs.mkdirSync(PRIVATE_VIDEO_ROOT, { recursive: true });
  for (const asset of SEEDED_ASSETS) {
    await generateHlsStreamForAsset(asset.id, asset.color, asset.accent);
  }
}
