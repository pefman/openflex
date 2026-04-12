import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { importImdbListForUser, normalizeImdbListUrl, syncImdbSubscription } from '../services/imdbLists.js'

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

  app.post<{ Body: { url?: string } }>('/imdb/import', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as { id: number }).id
    const url = req.body?.url?.trim()
    if (!url) return reply.code(400).send({ error: 'url is required' })

    try {
      const summary = await importImdbListForUser({
        userId,
        imdbUrl: url,
        contentTypes: ['movie', 'show'],
      })
      return reply.send(summary)
    } catch (err) {
      return reply.code(400).send({ error: String(err) })
    }
  })

  app.get('/imdb/subscriptions', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as { id: number }).id
    const rows = await db.imdbListSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(rows)
  })

  app.post<{ Body: { url?: string; enabled?: boolean; syncIntervalHours?: number } }>(
    '/imdb/subscriptions',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const url = req.body?.url?.trim()
      if (!url) return reply.code(400).send({ error: 'url is required' })

      let normalized
      try {
        normalized = normalizeImdbListUrl(url)
      } catch (err) {
        return reply.code(400).send({ error: String(err) })
      }

      const interval = Number(req.body?.syncIntervalHours)
      const syncIntervalHours = Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 6

      const subscription = await db.imdbListSubscription.upsert({
        where: {
          userId_source_externalListId: {
            userId,
            source: 'imdb',
            externalListId: normalized.externalListId,
          },
        },
        update: {
          externalUrl: normalized.externalUrl,
          enabled: req.body?.enabled ?? true,
          syncIntervalHours,
          contentTypes: '["movie","show"]',
          importTarget: 'library',
        },
        create: {
          userId,
          source: 'imdb',
          externalListId: normalized.externalListId,
          externalUrl: normalized.externalUrl,
          enabled: req.body?.enabled ?? true,
          syncIntervalHours,
          contentTypes: '["movie","show"]',
          importTarget: 'library',
        },
      })

      let initialSync: unknown = null
      if (subscription.enabled) {
        try {
          const result = await syncImdbSubscription(subscription.id)
          initialSync = result
        } catch (err) {
          initialSync = { error: String(err) }
        }
      }

      return reply.code(201).send({ subscription, initialSync })
    }
  )

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean; syncIntervalHours?: number } }>(
    '/imdb/subscriptions/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const id = Number(req.params.id)
      if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid id' })

      const current = await db.imdbListSubscription.findUnique({ where: { id } })
      if (!current || current.userId !== userId) return reply.code(404).send({ error: 'Not found' })

      const interval = Number(req.body?.syncIntervalHours)
      const data: { enabled?: boolean; syncIntervalHours?: number } = {}
      if (typeof req.body?.enabled === 'boolean') data.enabled = req.body.enabled
      if (Number.isFinite(interval) && interval > 0) data.syncIntervalHours = Math.floor(interval)

      const updated = await db.imdbListSubscription.update({ where: { id }, data })
      return reply.send(updated)
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/imdb/subscriptions/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const id = Number(req.params.id)
      if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid id' })

      const current = await db.imdbListSubscription.findUnique({ where: { id } })
      if (!current || current.userId !== userId) return reply.code(404).send({ error: 'Not found' })

      await db.imdbListSubscription.delete({ where: { id } })
      return reply.send({ success: true })
    }
  )

  app.post<{ Params: { id: string } }>(
    '/imdb/subscriptions/:id/sync',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const id = Number(req.params.id)
      if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid id' })

      const current = await db.imdbListSubscription.findUnique({ where: { id } })
      if (!current || current.userId !== userId) return reply.code(404).send({ error: 'Not found' })

      try {
        const result = await syncImdbSubscription(id)
        return reply.send(result)
      } catch (err) {
        return reply.code(500).send({ error: String(err) })
      }
    }
  )
}
