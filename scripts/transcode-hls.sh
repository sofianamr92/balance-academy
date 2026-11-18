#!/usr/bin/env bash
# ==============================================================================
# BALANCE ACADEMY — FFmpeg Multi-Rendition HLS Transcoding Pipeline
# Usage: ./scripts/transcode-hls.sh <input_video.mp4> <output_dir>
# ==============================================================================
set -euo pipefail

INPUT_FILE="${1:?Input MP4 path required}"
OUTPUT_DIR="${2:?Output HLS directory required}"

mkdir -p "$OUTPUT_DIR"

ffmpeg -y -i "$INPUT_FILE" \
  -preset veryfast -g 48 -sc_threshold 0 \
  -map 0:v:0 -map 0:a:0 \
  -s:v:0 1280x720 -c:v:0 libx264 -b:v:0 2800k \
  -c:a aac -b:a 128k \
  -hls_time 4 \
  -hls_playlist_type vod \
  -hls_segment_filename "${OUTPUT_DIR}/seg_%03d.ts" \
  "${OUTPUT_DIR}/playlist.m3u8"

echo "HLS segments and playlist generated in ${OUTPUT_DIR}"
