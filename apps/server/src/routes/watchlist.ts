import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'

export const watchlistRoutes: FastifyPluginAsync = async (app) => {
  // Get full watchlist for authenticated user
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as { id: number }).id
    const items = await db.watchlist.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
      include: {
        movie: { select: { id: true, title: true, year: true, posterPath: true, status: true } },
        show: { select: { id: true, title: true, posterPath: true, status: true } },
      },
    })
    return reply.send(items)
  })

  // Add movie to watchlist
  app.post<{ Params: { id: string } }>(
    '/movie/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const movieId = parseInt(req.params.id)
      const item = await db.watchlist.upsert({
        where: { userId_movieId: { userId, movieId } },
        update: {},
        create: { userId, movieId },
      })
      return reply.code(201).send(item)
    }
  )

  // Remove movie from watchlist
  app.delete<{ Params: { id: string } }>(
    '/movie/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const movieId = parseInt(req.params.id)
      await db.watchlist.deleteMany({ where: { userId, movieId } })
      return reply.send({ success: true })
    }
  )

  // Add show to watchlist
  app.post<{ Params: { id: string } }>(
    '/show/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const showId = parseInt(req.params.id)
      const item = await db.watchlist.upsert({
        where: { userId_showId: { userId, showId } },
        update: {},
        create: { userId, showId },
      })
      return reply.code(201).send(item)
    }
  )

  // Remove show from watchlist
  app.delete<{ Params: { id: string } }>(
    '/show/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const showId = parseInt(req.params.id)
      await db.watchlist.deleteMany({ where: { userId, showId } })
      return reply.send({ success: true })
    }
  )
}
