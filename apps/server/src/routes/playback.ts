import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth, getUser } from '../lib/auth.js'

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

  // PUT /api/playback/:mediaFileId
  app.put<{ Params: { mediaFileId: string }; Body: { position: number; duration: number } }>(
    '/:mediaFileId',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const user = getUser(req)
      const { position, duration } = req.body
      const pos = await db.playbackPosition.upsert({
        where: { userId_mediaFileId: { userId: user.id, mediaFileId: Number(req.params.mediaFileId) } },
        create: { userId: user.id, mediaFileId: Number(req.params.mediaFileId), position, duration },
        update: { position, duration },
      })
      return reply.send(pos)
    }
  )
}
