import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'

export const ratingRoutes: FastifyPluginAsync = async (app) => {
  // Get all ratings for the authenticated user
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as { id: number }).id
    const ratings = await db.userRating.findMany({ where: { userId } })
    const movies: Record<number, number> = {}
    const shows: Record<number, number> = {}
    for (const r of ratings) {
      if (r.movieId) movies[r.movieId] = r.rating
      if (r.showId) shows[r.showId] = r.rating
    }
    return reply.send({ movies, shows })
  })

  // Rate or delete a movie rating (rating 0 = delete)
  app.put<{ Params: { id: string }; Body: { rating: number } }>(
    '/movie/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const movieId = parseInt(req.params.id)
      const { rating } = req.body

      if (rating === 0) {
        await db.userRating.deleteMany({ where: { userId, movieId } })
        return reply.send({ deleted: true })
      }

      if (rating < 1 || rating > 5) return reply.code(400).send({ error: 'rating must be 1-5 (or 0 to delete)' })

      const result = await db.userRating.upsert({
        where: { userId_movieId: { userId, movieId } },
        update: { rating },
        create: { userId, movieId, rating },
      })
      return reply.send(result)
    }
  )

  // Rate or delete a show rating (rating 0 = delete)
  app.put<{ Params: { id: string }; Body: { rating: number } }>(
    '/show/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const userId = (req.user as { id: number }).id
      const showId = parseInt(req.params.id)
      const { rating } = req.body

      if (rating === 0) {
        await db.userRating.deleteMany({ where: { userId, showId } })
        return reply.send({ deleted: true })
      }

      if (rating < 1 || rating > 5) return reply.code(400).send({ error: 'rating must be 1-5 (or 0 to delete)' })

      const result = await db.userRating.upsert({
        where: { userId_showId: { userId, showId } },
        update: { rating },
        create: { userId, showId, rating },
      })
      return reply.send(result)
    }
  )
}
