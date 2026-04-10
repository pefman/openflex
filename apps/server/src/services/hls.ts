import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { log } from '../lib/logger.js'
import { PATHS } from '../lib/dataDirs.js'

// Resolve the best available ffmpeg binary (priority order):
//  1. FFMPEG_PATH env var (set in Docker to /usr/bin/ffmpeg with NVENC)
//  2. bin/ffmpeg relative to cwd (downloaded by scripts/download-ffmpeg.mjs,
//     present in dev when run from workspace root, or bundled into Docker image)
//  3. ffmpeg-static bundled binary (no NVENC — software only)
//  4. bare 'ffmpeg' on PATH
const cwdBin = path.join(process.cwd(), 'bin', 'ffmpeg')
const ffmpegBin: string =
  process.env.FFMPEG_PATH ||
  (fs.existsSync(cwdBin) ? cwdBin : '') ||
  (ffmpegStatic as unknown as string) ||
  'ffmpeg'
if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin)

export type HlsQuality = 'original' | '1080p' | '720p' | '480p'
export type HwEncoder = 'nvenc' | 'qsv' | 'vaapi' | 'software'

// ─── Hardware encoder detection ───────────────────────────────────────────────

let _hwEncoder: HwEncoder | null = null

function probeHardwareEncoder(): HwEncoder {
  try {
    const encoderList = execSync(`"${ffmpegBin}" -encoders 2>&1`, { encoding: 'utf8', timeout: 8_000 })

    // NVIDIA NVENC
    if (/h264_nvenc/.test(encoderList)) {
      try {
        execSync(
          `"${ffmpegBin}" -f lavfi -i nullsrc=s=320x240:d=0.1 -c:v h264_nvenc -f null - 2>&1`,
          { timeout: 8_000 },
        )
        log('info', 'hls', 'Hardware encoder: NVIDIA NVENC (h264_nvenc)')
        return 'nvenc'
      } catch { /* encoder listed but GPU unavailable at runtime */ }
    }

    // Intel Quick Sync Video
    if (/h264_qsv/.test(encoderList)) {
      try {
        execSync(
          `"${ffmpegBin}" -f lavfi -i nullsrc=s=320x240:d=0.1 -c:v h264_qsv -f null - 2>&1`,
          { timeout: 8_000 },
        )
        log('info', 'hls', 'Hardware encoder: Intel QSV (h264_qsv)')
        return 'qsv'
      } catch { /* QSV driver not functional */ }
    }

    // VA-API (Intel/AMD on Linux via /dev/dri)
    if (/h264_vaapi/.test(encoderList) && fs.existsSync('/dev/dri/renderD128')) {
      try {
        execSync(
          `"${ffmpegBin}" -vaapi_device /dev/dri/renderD128 -f lavfi -i nullsrc=s=320x240:d=0.1 ` +
          `-vf format=nv12,hwupload -c:v h264_vaapi -f null - 2>&1`,
          { timeout: 8_000 },
        )
        log('info', 'hls', 'Hardware encoder: VA-API (h264_vaapi)')
        return 'vaapi'
      } catch { /* VA-API device exists but unusable */ }
    }
  } catch (e) {
    log('warn', 'hls', `Hardware encoder probe failed: ${e}`)
  }

  log('info', 'hls', 'Hardware encoder: software (libx264)')
  return 'software'
}

/** Returns the best available encoder, probing once and caching the result. */
export function getHwEncoder(): HwEncoder {
  if (_hwEncoder === null) _hwEncoder = probeHardwareEncoder()
  return _hwEncoder
}

// ─── Transcode option builder ─────────────────────────────────────────────────

interface TranscodeOpts {
  inputOptions: string[]
  outputOptions: string[]
}

// hls_playlist_type event: tells hls.js this is a finite event stream (seekable from start),
// not an infinite live stream — #EXT-X-ENDLIST is appended when transcoding completes.
// force_key_frames: guarantees each 6-second segment starts on an IDR frame so hls.js
// can seek cleanly between segments (required for hardware encoders like NVENC).
const HLS_OPTS = [
  '-hls_playlist_type event',
  '-hls_time 6',
  '-hls_list_size 0',
  '-hls_flags independent_segments',
  '-force_key_frames expr:gte(t,n_forced*6)',
  '-f hls',
]
const AUDIO_OPTS = ['-codec:a aac', '-b:a 128k', '-ac 2']
// Explicitly select only the first video + first audio stream — prevents ffmpeg from
// auto-mapping subtitle tracks (mkv subs) into VTT HLS streams which error on kill
const MAP_OPTS = ['-map 0:v:0', '-map 0:a:0?']

function buildTranscodeOpts(quality: HlsQuality, hw: HwEncoder): TranscodeOpts {
  const scaleH = quality === '1080p' ? 1080 : quality === '720p' ? 720 : quality === '480p' ? 480 : null

  if (hw === 'nvenc') {
    return {
      inputOptions: [],
      outputOptions: [
        ...MAP_OPTS,
        '-codec:v h264_nvenc',
        '-preset p4',
        '-rc vbr',
        '-cq 23',
        '-profile:v high',
        '-pix_fmt yuv420p',
        '-bf 0',           // disable B-frames — they can span segment boundaries and break MSE
        '-forced-idr 1',   // ensure forced keyframes are proper IDR frames (NVENC-specific)
        ...(scaleH ? [`-vf scale=-2:${scaleH}`] : []),
        ...AUDIO_OPTS, ...HLS_OPTS,
      ],
    }
  }

  if (hw === 'qsv') {
    return {
      inputOptions: [],
      outputOptions: [
        ...MAP_OPTS,
        '-codec:v h264_qsv',
        '-preset medium',
        '-global_quality 23',
        '-profile:v high',
        '-pix_fmt yuv420p',
        ...(scaleH ? [`-vf scale=-2:${scaleH}`] : []),
        ...AUDIO_OPTS, ...HLS_OPTS,
      ],
    }
  }

  if (hw === 'vaapi') {
    const vf = scaleH
      ? `format=nv12,hwupload,scale_vaapi=w=-2:h=${scaleH}`
      : 'format=nv12,hwupload'
    return {
      inputOptions: ['-vaapi_device', '/dev/dri/renderD128'],
      outputOptions: [
        ...MAP_OPTS,
        '-codec:v h264_vaapi',
        '-qp 23',
        `-vf ${vf}`,
        ...AUDIO_OPTS, ...HLS_OPTS,
      ],
    }
  }

  // Software fallback (libx264)
  return {
    inputOptions: [],
    outputOptions: [
      ...MAP_OPTS,
      '-codec:v libx264',
      '-preset fast',
      '-crf 23',
      '-pix_fmt yuv420p',
      '-profile:v high',
      '-level:v 4.1',
      ...(scaleH ? [`-vf scale=-2:${scaleH}`] : []),
      ...AUDIO_OPTS, ...HLS_OPTS,
    ],
  }
}

// ─── Job tracking ─────────────────────────────────────────────────────────────

interface TranscodeJob {
  done: boolean
  error?: string
  cmd?: ReturnType<typeof ffmpeg>
}

// Keyed by "{mediaFileId}_{quality}"
const jobs = new Map<string, TranscodeJob>()

export function clearTranscodeJob(key: string): void {
  jobs.delete(key)
}

export function stopHlsTranscode(key: string): void {
  const job = jobs.get(key)
  if (job && !job.done && job.cmd) {
    try { job.cmd.kill('SIGKILL') } catch { /* already dead */ }
    log('info', 'hls', `[${key}] stopped by client`)
  }
  jobs.delete(key)
}

export function getHlsDir(mediaFileId: number, quality: HlsQuality): string {
  const suffix = quality === 'original' ? '' : `_${quality}`
  return path.join(PATHS.hls, `${mediaFileId}${suffix}`)
}

export function getTranscodeJob(key: string): TranscodeJob | undefined {
  return jobs.get(key)
}

/**
 * Start a non-blocking HLS transcode. Returns immediately after ffmpeg spawns.
 * Poll getTranscodeJob(key) or watch for seg000.ts to appear.
 */
export function startHlsTranscodeAsync(
  inputPath: string,
  outputDir: string,
  quality: HlsQuality,
  key: string,
): void {
  const existing = jobs.get(key)
  if (existing && !existing.done) return  // actively running

  // Invalidate cached output if segments are missing or manifest is from a legacy run
  // (legacy = no PLAYLIST-TYPE:EVENT header, meaning old segment sizes/no keyframe forcing)
  if (existing?.done || !existing) {
    const m3u8 = path.join(outputDir, 'index.m3u8')
    const seg0 = path.join(outputDir, 'seg000.ts')
    const isValid = fs.existsSync(seg0) &&
      fs.existsSync(m3u8) &&
      fs.readFileSync(m3u8, 'utf8').includes('PLAYLIST-TYPE:EVENT')
    if (isValid) return  // good cached transcode, serve it
    jobs.delete(key)     // stale or missing — fall through to re-transcode
  }

  const job: TranscodeJob = { done: false }
  jobs.set(key, job)
  // Clear stale segments from any previous partial transcode so the new run starts clean
  if (fs.existsSync(outputDir)) {
    for (const f of fs.readdirSync(outputDir)) {
      try { fs.unlinkSync(path.join(outputDir, f)) } catch { /* ignore */ }
    }
  }
  fs.mkdirSync(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, 'index.m3u8')
  const segmentPattern = path.join(outputDir, 'seg%03d.ts')

  const hw = getHwEncoder()
  const { inputOptions, outputOptions } = buildTranscodeOpts(quality, hw)
  outputOptions.push('-hls_segment_filename', segmentPattern)

  const cmd = ffmpeg(inputPath)
    .inputOptions(inputOptions)
    .outputOptions(outputOptions)
    .output(outputPath)
    .on('start', (c) => { job.cmd = cmd; log('info', 'hls', `[${key}] started (${hw}): ${c.slice(0, 160)}`) })
    .on('error', (err, _stdout, stderr) => {
      const detail = stderr ? stderr.slice(-400).trim() : err.message
      log('error', 'hls', `[${key}] ffmpeg error: ${detail}`)
      jobs.set(key, { done: true, error: detail })
    })
    .on('end', () => {
      log('info', 'hls', `[${key}] complete`)
      jobs.set(key, { done: true })
    })
  cmd.run()
}
