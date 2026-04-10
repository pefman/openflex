import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import fs from 'fs'
import path from 'path'
import { log } from '../lib/logger.js'
import { PATHS } from '../lib/dataDirs.js'

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string)
}

export type HlsQuality = 'original' | '1080p' | '720p' | '480p'

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

function qualityOutputOptions(quality: HlsQuality): string[] {
  const videoBase = [
    '-codec:v libx264',
    '-preset fast',
    '-pix_fmt yuv420p',    // browser MSE requires 8-bit 4:2:0
    '-profile:v high',
    '-level:v 4.1',
  ]
  const audioBase = [
    '-codec:a aac',
    '-b:a 128k',
    '-ac 2',               // stereo — avoids 5.1 passthrough issues
  ]
  const hlsBase = [
    '-hls_time 6',
    '-hls_list_size 0',
    '-hls_flags independent_segments',
    '-f hls',
  ]
  switch (quality) {
    case '1080p': return [...videoBase, '-crf 22', '-vf scale=-2:1080', ...audioBase, ...hlsBase]
    case '720p':  return [...videoBase, '-crf 23', '-vf scale=-2:720',  ...audioBase, ...hlsBase]
    case '480p':  return [...videoBase, '-crf 24', '-vf scale=-2:480',  ...audioBase, ...hlsBase]
    default:      return [...videoBase, '-crf 22', ...audioBase, ...hlsBase]
  }
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
 * Poll getTranscodeJob(key) or watch for the first .ts segment file to appear.
 */
export function startHlsTranscodeAsync(
  inputPath: string,
  outputDir: string,
  quality: HlsQuality,
  key: string,
): void {
  const existing = jobs.get(key)
  if (existing && !existing.done) return  // actively running
  // If done (success or error) but outputDir was cleared, restart
  if (existing?.done && !fs.existsSync(path.join(outputDir, 'seg000.ts'))) {
    jobs.delete(key)
  } else if (existing) {
    return  // done and segments exist
  }

  const job: TranscodeJob = { done: false }
  jobs.set(key, job)
  fs.mkdirSync(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, 'index.m3u8')
  const segmentPattern = path.join(outputDir, 'seg%03d.ts')

  const opts = qualityOutputOptions(quality)
  opts.push('-hls_segment_filename', segmentPattern)

  const cmd = ffmpeg(inputPath)
    .outputOptions(opts)
    .output(outputPath)
    .on('start', (c) => { job.cmd = cmd; log('info', 'hls', `[${key}] started: ${c.slice(0, 120)}`) })
    .on('error', (err, _stdout, stderr) => {
      const detail = stderr ? stderr.slice(-300).trim() : err.message
      log('error', 'hls', `[${key}] error: ${detail}`)
      jobs.set(key, { done: true, error: detail })
    })
    .on('end', () => {
      log('info', 'hls', `[${key}] complete`)
      jobs.set(key, { done: true })
    })
  cmd.run()
}

