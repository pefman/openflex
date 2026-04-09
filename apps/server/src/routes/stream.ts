import type { FastifyPluginAsync } from 'fastify'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { PATHS } from '../lib/dataDirs.js'
import {
  startHlsTranscodeAsync,
  getHlsDir,
  getTranscodeJob,
  type HlsQuality,
} from '../services/hls.js'
import { extractSubtitles } from '../services/ffprobe.js'

// ─── Stream Tokens (for Chromecast / unauthenticated device playback) ─────────
interface StreamToken { mediaFileId: number; expiresAt: number }
const streamTokens = new Map<string, StreamToken>()

function validateStreamToken(token: string): number | null {
  const entry = streamTokens.get(token)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { streamTokens.delete(token); return null }
  return entry.mediaFileId
}

// Shared auth: Bearer header OR ?streamToken= query param
async function authOrToken(req: any, reply: any, mediaFileId?: number): Promise<boolean> {
  // Standard Bearer auth
  const authHeader = req.headers['authorization'] as string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    try {
      await requireAuth(req, reply)
      return true
    } catch { /* fall through to token check */ }
  }
  // Stream token fallback (for Chromecast / device players)
  const token = (req.query as any).streamToken as string | undefined
  if (token) {
    const id = validateStreamToken(token)
    if (id !== null && (mediaFileId === undefined || id === mediaFileId)) return true
  }
  return false
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MIME_MAP: Record<string, string> = {
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.ts': 'video/mp2t',
}

const VALID_QUALITIES = new Set<HlsQuality>(['original', '1080p', '720p', '480p'])

function parseQuality(q: unknown): HlsQuality {
  return VALID_QUALITIES.has(q as HlsQuality) ? (q as HlsQuality) : 'original'
}

/** Wait until seg000.ts appears in outputDir (max timeoutMs) or HLS job reports done/error. */
function waitForFirstSegment(hlsDir: string, key: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const firstSeg = path.join(hlsDir, 'seg000.ts')
    const deadline = Date.now() + timeoutMs
    const interval = setInterval(() => {
      const job = getTranscodeJob(key)
      if (job?.error) { clearInterval(interval); return reject(new Error(job.error)) }
      if (fs.existsSync(firstSeg)) { clearInterval(interval); return resolve() }
      if (Date.now() > deadline) { clearInterval(interval); return reject(new Error('Transcode timeout')) }
    }, 400)
  })
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export const streamRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/stream/:id/token — issue a short-lived stream token for device playback
  app.post<{ Params: { id: string } }>(
    '/:id/token',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const mediaFileId = Number(req.params.id)
      const file = await db.mediaFile.findUnique({ where: { id: mediaFileId } })
      if (!file) return reply.code(404).send({ error: 'Not found' })

      const token = crypto.randomUUID()
      streamTokens.set(token, { mediaFileId, expiresAt: Date.now() + 4 * 60 * 60 * 1000 })

      const base = `${req.protocol}://${req.hostname}`
      return reply.send({
        token,
        directUrl:  `${base}/api/stream/${mediaFileId}?streamToken=${token}`,
        hlsUrl:     `${base}/api/stream/${mediaFileId}/hls?streamToken=${token}`,
      })
    }
  )

  // GET /api/stream/:id — direct play with Range support
  app.get<{ Params: { id: string }; Querystring: { streamToken?: string } }>(
    '/:id',
    async (req, reply) => {
      const mediaFileId = Number(req.params.id)
      const authed = await authOrToken(req, reply, mediaFileId)
      if (!authed) return reply.code(401).send({ error: 'Unauthorized' })

      const file = await db.mediaFile.findUnique({ where: { id: mediaFileId } })
      if (!file) return reply.code(404).send({ error: 'Not found' })
      if (!fs.existsSync(file.path)) return reply.code(404).send({ error: 'File not found on disk' })

      const stat = fs.statSync(file.path)
      const total = stat.size
      const rangeHeader = req.headers.range
      const ext = path.extname(file.path).toLowerCase()
      const contentType = MIME_MAP[ext] ?? 'video/mp4'

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0])
        const end = parts[1] ? parseInt(parts[1]) : total - 1
        reply.code(206).headers({
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': contentType,
        })
        return reply.send(fs.createReadStream(file.path, { start, end }))
      }

      reply.headers({ 'Content-Length': total, 'Content-Type': contentType, 'Accept-Ranges': 'bytes' })
      return reply.send(fs.createReadStream(file.path))
    }
  )

  // GET /api/stream/:id/hls — start progressive HLS transcode, return m3u8Url once first segment ready
  app.get<{ Params: { id: string }; Querystring: { quality?: string; streamToken?: string } }>(
    '/:id/hls',
    async (req, reply) => {
      const mediaFileId = Number(req.params.id)
      const authed = await authOrToken(req, reply, mediaFileId)
      if (!authed) return reply.code(401).send({ error: 'Unauthorized' })

      const file = await db.mediaFile.findUnique({ where: { id: mediaFileId } })
      if (!file) return reply.code(404).send({ error: 'Not found' })
      if (!fs.existsSync(file.path)) return reply.code(404).send({ error: 'File not found on disk' })

      const quality = parseQuality(req.query.quality)
      const hlsDir = getHlsDir(mediaFileId, quality)
      const m3u8Path = path.join(hlsDir, 'index.m3u8')
      const key = `${mediaFileId}_${quality}`

      // Start transcode if not already running/done
      if (!fs.existsSync(m3u8Path) && !getTranscodeJob(key)) {
        startHlsTranscodeAsync(file.path, hlsDir, quality, key)
      }

      // If not done yet, wait for first segment (progressive play)
      if (!fs.existsSync(path.join(hlsDir, 'seg000.ts'))) {
        try {
          await waitForFirstSegment(hlsDir, key)
        } catch (err) {
          return reply.code(500).send({ error: String(err) })
        }
      }

      const token = (req.query as any).streamToken as string | undefined
      const qs = [`quality=${quality}`, token ? `streamToken=${token}` : ''].filter(Boolean).join('&')
      return reply.send({ m3u8Url: `/api/stream/${mediaFileId}/hls/index.m3u8?${qs}`, quality })
    }
  )

  // GET /api/stream/:id/hls/:segment — serve HLS segments (m3u8 + .ts)
  app.get<{ Params: { id: string; segment: string }; Querystring: { streamToken?: string } }>(
    '/:id/hls/:segment',
    async (req, reply) => {
      const mediaFileId = Number(req.params.id)
      const authed = await authOrToken(req, reply, mediaFileId)
      if (!authed) return reply.code(401).send({ error: 'Unauthorized' })

      // segment may be "index.m3u8", "seg001.ts", or "subs/en_0.vtt" — allow one sub-level
      const safeName = req.params.segment.replace(/\.\./g, '').replace(/^\//, '')
      // Support quality-specific dirs: client sends ?quality= to locate correct dir
      const quality = parseQuality((req.query as any).quality)
      const streamToken = (req.query as any).streamToken as string | undefined
      const hlsDir = getHlsDir(mediaFileId, quality)
      const segmentPath = path.join(hlsDir, safeName)

      if (!segmentPath.startsWith(hlsDir)) return reply.code(400).send({ error: 'Invalid path' })
      if (!fs.existsSync(segmentPath)) return reply.code(404).send({ error: 'Segment not found' })

      // When serving the playlist, rewrite segment lines to absolute URLs so hls.js
      // carries the quality (and optional streamToken) on every segment request.
      if (safeName === 'index.m3u8') {
        const raw = fs.readFileSync(segmentPath, 'utf-8')
        const qs = [`quality=${quality}`, streamToken ? `streamToken=${streamToken}` : ''].filter(Boolean).join('&')
        const base = `/api/stream/${mediaFileId}/hls`
        const rewritten = raw.replace(/^(seg\d+\.ts)$/gm, `${base}/$1?${qs}`)
        reply.header('Content-Type', 'application/vnd.apple.mpegurl')
        return reply.send(rewritten)
      }

      const contentType = safeName.endsWith('.vtt') ? 'text/vtt' : 'video/mp2t'
      reply.header('Content-Type', contentType)
      return reply.send(fs.createReadStream(segmentPath))
    }
  )

  // GET /api/stream/:id/subtitles — extract subtitle tracks as WebVTT
  app.get<{ Params: { id: string } }>(
    '/:id/subtitles',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const file = await db.mediaFile.findUnique({ where: { id: Number(req.params.id) } })
      if (!file) return reply.code(404).send({ error: 'Not found' })

      // subs live under the 'original' hls dir
      const subDir = path.join(getHlsDir(Number(req.params.id), 'original'), 'subs')
      fs.mkdirSync(subDir, { recursive: true })

      const subtitlePaths = await extractSubtitles(file.path, subDir)
      const tracks = subtitlePaths.map((p, i) => ({
        index: i,
        url: `/api/stream/${req.params.id}/hls/subs/${path.basename(p)}`,
        label: path.basename(p, '.vtt').replace(/_\d+$/, ''),
      }))

      return reply.send(tracks)
    }
  )
}
