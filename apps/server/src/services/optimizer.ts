import ffmpeg from 'fluent-ffmpeg'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { db } from '../db/client.js'
import { log } from '../lib/logger.js'
import { getHwEncoder } from './hls.js'
import { probeFile } from './ffprobe.js'

const _require = createRequire(import.meta.url)
let _ffmpegStaticBin = ''
try { _ffmpegStaticBin = (_require('ffmpeg-static') as unknown as string) ?? '' } catch {}

// Reuse the same binary resolution chain as hls.ts
const cwdBin = path.join(process.cwd(), 'bin', 'ffmpeg')
const ffmpegBin: string =
  process.env.FFMPEG_PATH ||
  (fs.existsSync(cwdBin) ? cwdBin : '') ||
  _ffmpegStaticBin ||
  'ffmpeg'
if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin)

// ─── Types ────────────────────────────────────────────────────────────────────

interface OptimizationProfile {
  videoMode: string      // copy_always | copy_compatible | reencode
  videoCodec: string     // h264 | hevc
  videoCrf: number
  videoPreset: string
  audioMode: string      // copy | reencode
  audioChannels: number
  audioBitrate: number
  useHwEncoder: boolean
}

// ─── Queue ────────────────────────────────────────────────────────────────────

let isRunning = false
// Track the active ffmpeg command so we can kill it on cancellation
let activeCmd: ReturnType<typeof ffmpeg> | null = null
let activeJobId: number | null = null

export function processOptimizationQueue(): void {
  if (isRunning) return
  setImmediate(_processNext)
}

async function _processNext(): Promise<void> {
  if (isRunning) return
  const job = await db.optimizationJob.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    include: { mediaFile: true, profile: true },
  })
  if (!job) return

  isRunning = true
  activeJobId = job.id

  await db.optimizationJob.update({
    where: { id: job.id },
    data: { status: 'running', startedAt: new Date(), progress: 0 },
  })

  try {
    await runOptimizationJob(job)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log('error', 'optimizer', `[job:${job.id}] failed: ${msg}`)
    await db.optimizationJob.update({
      where: { id: job.id },
      data: { status: 'failed', completedAt: new Date(), error: msg },
    })
  } finally {
    isRunning = false
    activeJobId = null
    activeCmd = null
    processOptimizationQueue() // pick up next job
  }
}

export async function cancelOptimizationJob(jobId: number): Promise<void> {
  // Kill in-flight ffmpeg process
  if (activeJobId === jobId && activeCmd) {
    try { activeCmd.kill('SIGKILL') } catch { /* already dead */ }
    activeCmd = null
  }
  await db.optimizationJob.update({
    where: { id: jobId },
    data: { status: 'cancelled', completedAt: new Date() },
  }).catch(() => {})
}

export async function queueOptimizationJob(mediaFileId: number, profileId: number): Promise<void> {
  // Don't re-queue if already queued/running for same file+profile
  const existing = await db.optimizationJob.findFirst({
    where: { mediaFileId, profileId, status: { in: ['queued', 'running'] } },
  })
  if (existing) return

  await db.optimizationJob.create({ data: { mediaFileId, profileId } })
  processOptimizationQueue()
}

// ─── Job execution ────────────────────────────────────────────────────────────

async function runOptimizationJob(job: {
  id: number
  mediaFile: { id: number; path: string; codec: string | null }
  profile: OptimizationProfile
}): Promise<void> {
  const { mediaFile, profile } = job
  const inputPath = mediaFile.path

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`)
  }

  const ext = path.extname(inputPath) // e.g. '.mkv' — must be preserved for ffmpeg muxer detection
  const tmpPath = inputPath.slice(0, -ext.length) + '.optimizing' + ext
  // Clean up any leftover temp from a previous crashed run
  try { fs.unlinkSync(tmpPath) } catch { /* not present */ }

  const originalSize = fs.statSync(inputPath).size

  log('info', 'optimizer', `[job:${job.id}] starting — ${path.basename(inputPath)}`)

  const hw = profile.useHwEncoder ? getHwEncoder() : 'software'

  // ── Video options ──────────────────────────────────────────────────────────
  const videoOpts = buildVideoOpts(profile, hw, mediaFile.codec)

  // ── Audio options ─────────────────────────────────────────────────────────
  const audioOpts = buildAudioOpts(profile)

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .outputOptions([
        '-map 0:v:0',
        '-map 0:a:0?',
        ...videoOpts,
        ...audioOpts,
        '-movflags +faststart',
        '-y',
      ])
      .output(tmpPath)
      .on('start', (cmdLine) => {
        activeCmd = cmd
        log('info', 'optimizer', `[job:${job.id}] ffmpeg: ${cmdLine.slice(0, 200)}`)
      })
      .on('progress', (progress) => {
        const pct = Math.min(99, Math.round((progress.percent ?? 0) * 10) / 10)
        db.optimizationJob.update({ where: { id: job.id }, data: { progress: pct } }).catch(() => {})
      })
      .on('error', (err, _stdout, stderr) => {
        // Check if this was a deliberate kill (cancel)
        db.optimizationJob.findUnique({ where: { id: job.id } }).then((j) => {
          if (j?.status === 'cancelled') return resolve()
          const detail = stderr ? stderr.slice(-400).trim() : err.message
          reject(new Error(detail))
        }).catch(() => reject(err))
      })
      .on('end', () => resolve())

    cmd.run()
  })

  // If job was cancelled mid-flight, clean up temp and return
  const currentJob = await db.optimizationJob.findUnique({ where: { id: job.id } })
  if (currentJob?.status === 'cancelled') {
    try { fs.unlinkSync(tmpPath) } catch { /* ok */ }
    return
  }

  // Atomic replace: rename temp over original
  fs.renameSync(tmpPath, inputPath)
  const optimizedSize = fs.statSync(inputPath).size

  // Probe the new file for updated metadata
  let probeData: Awaited<ReturnType<typeof probeFile>> | null = null
  try {
    probeData = await probeFile(inputPath)
  } catch { /* non-fatal */ }

  await db.mediaFile.update({
    where: { id: mediaFile.id },
    data: {
      size: BigInt(optimizedSize),
      ...(probeData ? {
        codec: probeData.codec ?? undefined,
        resolution: probeData.resolution ?? undefined,
        container: probeData.container ?? undefined,
        duration: probeData.duration ?? undefined,
        audioCodec: probeData.audioCodec ?? undefined,
        audioChannels: probeData.audioChannels ?? undefined,
        videoBitrate: probeData.videoBitrate ?? undefined,
        audioBitrate: probeData.audioBitrate ?? undefined,
      } : {}),
    },
  })

  await db.optimizationJob.update({
    where: { id: job.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      progress: 100,
      originalSize: BigInt(originalSize),
      optimizedSize: BigInt(optimizedSize),
    },
  })

  const savedMB = ((originalSize - optimizedSize) / 1024 / 1024).toFixed(1)
  log('info', 'optimizer', `[job:${job.id}] done — saved ${savedMB} MB (${originalSize} → ${optimizedSize} bytes)`)
}

// ─── Option builders ──────────────────────────────────────────────────────────

function buildVideoOpts(
  profile: OptimizationProfile,
  hw: string,
  sourceCodec: string | null,
): string[] {
  if (profile.videoMode === 'copy_always') {
    return ['-codec:v copy']
  }

  if (profile.videoMode === 'copy_compatible') {
    const targetCodec = profile.videoCodec === 'hevc' ? 'hevc' : 'h264'
    const sourceIsTarget = sourceCodec != null && (
      (targetCodec === 'h264' && /h264|avc/i.test(sourceCodec)) ||
      (targetCodec === 'hevc' && /hevc|h265/i.test(sourceCodec))
    )
    if (sourceIsTarget) return ['-codec:v copy']
    // Falls through to reencode
  }

  // reencode (or copy_compatible where source doesn't match target)
  return buildHwVideoOpts(profile, hw)
}

function buildHwVideoOpts(profile: OptimizationProfile, hw: string): string[] {
  const isHevc = profile.videoCodec === 'hevc'

  if (hw === 'nvenc') {
    const encoder = isHevc ? 'hevc_nvenc' : 'h264_nvenc'
    return [
      `-codec:v ${encoder}`,
      '-preset p4',
      '-rc vbr',
      `-cq ${profile.videoCrf}`,
      '-profile:v high',
      '-pix_fmt yuv420p',
      '-bf 0',
      '-forced-idr 1',
    ]
  }

  if (hw === 'qsv') {
    const encoder = isHevc ? 'hevc_qsv' : 'h264_qsv'
    return [
      `-codec:v ${encoder}`,
      `-preset ${profile.videoPreset}`,
      `-global_quality ${profile.videoCrf}`,
      '-profile:v high',
      '-pix_fmt yuv420p',
    ]
  }

  if (hw === 'vaapi') {
    const encoder = isHevc ? 'hevc_vaapi' : 'h264_vaapi'
    return [
      `-codec:v ${encoder}`,
      `-qp ${profile.videoCrf}`,
      '-vf format=nv12,hwupload',
    ]
  }

  // Software fallback
  const encoder = isHevc ? 'libx265' : 'libx264'
  return [
    `-codec:v ${encoder}`,
    `-preset ${profile.videoPreset}`,
    `-crf ${profile.videoCrf}`,
    '-pix_fmt yuv420p',
    '-profile:v high',
  ]
}

function buildAudioOpts(profile: OptimizationProfile): string[] {
  if (profile.audioMode === 'copy') return ['-codec:a copy']
  return [
    '-codec:a aac',
    `-b:a ${profile.audioBitrate}k`,
    `-ac ${profile.audioChannels}`,
  ]
}

// ─── Profile seeding ──────────────────────────────────────────────────────────

export async function seedOptimizationProfiles(): Promise<void> {
  const count = await db.optimizationProfile.count()
  if (count > 0) return

  await db.optimizationProfile.createMany({
    data: [
      {
        name: 'Audio Fix',
        videoMode: 'copy_always',
        videoCodec: 'h264',
        videoCrf: 23,
        videoPreset: 'fast',
        audioMode: 'reencode',
        audioChannels: 2,
        audioBitrate: 192,
        useHwEncoder: false,
        applyToNew: false,
      },
      {
        name: 'Universal',
        videoMode: 'copy_compatible',
        videoCodec: 'h264',
        videoCrf: 23,
        videoPreset: 'fast',
        audioMode: 'reencode',
        audioChannels: 2,
        audioBitrate: 128,
        useHwEncoder: true,
        applyToNew: false,
      },
      {
        name: 'Storage Saver',
        videoMode: 'reencode',
        videoCodec: 'hevc',
        videoCrf: 28,
        videoPreset: 'fast',
        audioMode: 'reencode',
        audioChannels: 2,
        audioBitrate: 128,
        useHwEncoder: true,
        applyToNew: false,
      },
      {
        name: 'Stereo Downmix',
        videoMode: 'copy_always',
        videoCodec: 'h264',
        videoCrf: 23,
        videoPreset: 'fast',
        audioMode: 'reencode',
        audioChannels: 2,
        audioBitrate: 192,
        useHwEncoder: false,
        applyToNew: false,
      },
      {
        name: 'Mobile / Tablet',
        videoMode: 'reencode',
        videoCodec: 'h264',
        videoCrf: 26,
        videoPreset: 'fast',
        audioMode: 'reencode',
        audioChannels: 2,
        audioBitrate: 128,
        useHwEncoder: true,
        applyToNew: false,
      },
      {
        name: 'HEVC Archival',
        videoMode: 'reencode',
        videoCodec: 'hevc',
        videoCrf: 20,
        videoPreset: 'slow',
        audioMode: 'copy',
        audioChannels: 6,
        audioBitrate: 192,
        useHwEncoder: false,
        applyToNew: false,
      },
      {
        name: 'Streaming',
        videoMode: 'copy_compatible',
        videoCodec: 'h264',
        videoCrf: 23,
        videoPreset: 'fast',
        audioMode: 'reencode',
        audioChannels: 2,
        audioBitrate: 192,
        useHwEncoder: true,
        applyToNew: false,
      },
      {
        name: 'Bandwidth Saver',
        videoMode: 'reencode',
        videoCodec: 'hevc',
        videoCrf: 28,
        videoPreset: 'fast',
        audioMode: 'reencode',
        audioChannels: 2,
        audioBitrate: 96,
        useHwEncoder: true,
        applyToNew: false,
      },
    ],
  })

  log('info', 'optimizer', 'Seeded 8 built-in optimization profiles')
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
// Scans for media files belonging to shows/movies that have an optimization
// profile assigned but no queued/running/completed job yet, and queues them.

export async function runOptimizationScheduler(): Promise<void> {
  log('info', 'optimizer', 'Scheduler: scanning for unoptimized files…')
  let queued = 0

  // Movies with a profile set
  const movies = await db.movie.findMany({
    where: { optimizationProfileId: { not: null } },
    include: { mediaFiles: true },
  })
  for (const movie of movies) {
    for (const file of movie.mediaFiles) {
      const already = await db.optimizationJob.findFirst({
        where: { mediaFileId: file.id, status: { in: ['queued', 'running', 'completed'] } },
      })
      if (!already) {
        await queueOptimizationJob(file.id, movie.optimizationProfileId!)
        queued++
      }
    }
  }

  // Shows with a profile set — drill down to episode media files
  const shows = await db.show.findMany({
    where: { optimizationProfileId: { not: null } },
    include: {
      seasons: {
        include: {
          episodes: {
            include: { mediaFiles: true },
          },
        },
      },
    },
  })
  for (const show of shows) {
    for (const season of show.seasons) {
      for (const episode of season.episodes) {
        for (const file of episode.mediaFiles) {
          const already = await db.optimizationJob.findFirst({
            where: { mediaFileId: file.id, status: { in: ['queued', 'running', 'completed'] } },
          })
          if (!already) {
            await queueOptimizationJob(file.id, show.optimizationProfileId!)
            queued++
          }
        }
      }
    }
  }

  if (queued > 0) log('info', 'optimizer', `Scheduler: queued ${queued} file(s)`)
}

let _schedulerTimer: ReturnType<typeof setTimeout> | null = null
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

export function startOptimizationScheduler(): void {
  if (_schedulerTimer) return
  const tick = async () => {
    try { await runOptimizationScheduler() } catch (e) { log('error', 'optimizer', `Scheduler error: ${e}`) }
    _schedulerTimer = setTimeout(tick, SCHEDULER_INTERVAL_MS)
  }
  // First run after 5 minutes to avoid hammering on startup
  _schedulerTimer = setTimeout(tick, 5 * 60 * 1000)
  log('info', 'optimizer', `Scheduler started — interval ${SCHEDULER_INTERVAL_MS / 60_000}min`)
}
