import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth, getUser } from '../lib/auth.js'

const COMPLETE_THRESHOLD = 0.85
const MIN_PLAY_SECONDS = 30

// ─── Active session tracking (in-memory) ──────────────────────────────────────
export interface ActiveSession {
  userId: number
  userName: string
  mediaFileId: number
  position: number
  duration: number
  mode: string          // "direct" | "transcode"
  quality: string       // "original" | "720p" etc.
  lastSeen: number      // Date.now()
}

const activeSessions = new Map<string, ActiveSession>()  // key: `${userId}_${mediaFileId}`

const SESSION_TIMEOUT_MS = 30_000  // 30s without heartbeat = stopped

export function getActiveSessions(): ActiveSession[] {
  const now = Date.now()
  const alive: ActiveSession[] = []
  for (const [key, s] of activeSessions) {
    if (now - s.lastSeen > SESSION_TIMEOUT_MS) {
      activeSessions.delete(key)
    } else {
      alive.push(s)
    }
  }
  return alive
}

export const playbackRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/playback/:mediaFileId
  app.get<{ Params: { mediaFileId: string } }>(
    '/:mediaFileId',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const user = getUser(req)
      const pos = await db.playbackPosition.findUnique({
        where: { userId_mediaFileId: { userId: user.id, mediaFileId: Number(req.params.mediaFileId) } },
      })
      return reply.send(pos ?? { position: 0, duration: 0 })
    }
  )

  // PUT /api/playback/:mediaFileId — heartbeat every 5s during playback
  app.put<{
    Params: { mediaFileId: string }
    Body: { position: number; duration: number; mode?: string; quality?: string }
  }>(
    '/:mediaFileId',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const user = getUser(req)
      const { position, duration, mode = 'direct', quality = 'original' } = req.body
      const mediaFileId = Number(req.params.mediaFileId)

      const prev = await db.playbackPosition.findUnique({
        where: { userId_mediaFileId: { userId: user.id, mediaFileId } },
      })

      const pos = await db.playbackPosition.upsert({
        where: { userId_mediaFileId: { userId: user.id, mediaFileId } },
        create: { userId: user.id, mediaFileId, position, duration },
        update: { position, duration },
      })

      // Update active session
      const sessionKey = `${user.id}_${mediaFileId}`
      activeSessions.set(sessionKey, {
        userId: user.id,
        userName: user.name,
        mediaFileId,
        position,
        duration,
        mode,
        quality,
        lastSeen: Date.now(),
      })

      // Record watch history when meaningful playback occurs
      if (duration > 0 && position >= MIN_PLAY_SECONDS) {
        const completed = position / duration >= COMPLETE_THRESHOLD
        const prevPosition = prev?.position ?? 0
        const prevCompleted = prev && duration > 0 && prevPosition / duration >= COMPLETE_THRESHOLD
        // Record on new completion, or if this is the first meaningful heartbeat
        if (completed && !prevCompleted) {
          await db.watchHistory.create({
            data: { userId: user.id, mediaFileId, durationSec: position, completed: true, mode },
          })
        } else if (!completed && prevPosition < MIN_PLAY_SECONDS) {
          // First heartbeat past the minimum — create initial history entry to show it started
          await db.watchHistory.create({
            data: { userId: user.id, mediaFileId, durationSec: position, completed: false, mode },
          })
        } else if (!completed && prev) {
          // Update last history entry's duration (most recent non-completed entry for this user+media)
          const lastEntry = await db.watchHistory.findFirst({
            where: { userId: user.id, mediaFileId, completed: false },
            orderBy: { watchedAt: 'desc' },
          })
          if (lastEntry) {
            await db.watchHistory.update({
              where: { id: lastEntry.id },
              data: { durationSec: position, mode },
            })
          }
        }
      }

      return reply.send(pos)
    }
  )
}
