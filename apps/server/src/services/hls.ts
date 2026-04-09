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
}

// Keyed by "{mediaFileId}_{quality}"
const jobs = new Map<string, TranscodeJob>()

function qualityOutputOptions(quality: HlsQuality): string[] {
  const base = [
    '-codec:a aac',
    '-b:a 128k',
    '-hls_time 10',
    '-hls_list_size 0',
    '-f hls',
  ]
  switch (quality) {
    case '1080p': return ['-codec:v libx264', '-preset fast', '-crf 22', '-vf scale=-2:1080', ...base]
    case '720p':  return ['-codec:v libx264', '-preset fast', '-crf 23', '-vf scale=-2:720',  ...base]
    case '480p':  return ['-codec:v libx264', '-preset fast', '-crf 24', '-vf scale=-2:480',  ...base]
    default:      return ['-codec:v libx264', '-preset fast', '-crf 22', '-codec:a aac', '-b:a 128k', '-hls_time 10', '-hls_list_size 0', '-f hls']
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
  if (jobs.has(key)) return  // already running or done

  jobs.set(key, { done: false })
  fs.mkdirSync(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, 'index.m3u8')
  const segmentPattern = path.join(outputDir, 'seg%03d.ts')

  const opts = qualityOutputOptions(quality)
  opts.push('-hls_segment_filename', segmentPattern)

  ffmpeg(inputPath)
    .outputOptions(opts)
    .output(outputPath)
    .on('start', (cmd) => log('info', 'hls', `[${key}] started: ${cmd.slice(0, 120)}`))
    .on('error', (err) => {
      log('error', 'hls', `[${key}] error: ${err.message}`)
      jobs.set(key, { done: true, error: err.message })
    })
    .on('end', () => {
      log('info', 'hls', `[${key}] complete`)
      jobs.set(key, { done: true })
    })
    .run()
}

