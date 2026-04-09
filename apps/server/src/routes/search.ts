import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../lib/auth.js'
import { searchTmdbMovies, searchTmdbShows } from '../services/tmdb.js'

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { q: string } }>('/movies', { preHandler: [requireAuth] }, async (req, reply) => {
    const q = req.query.q?.trim()
    if (!q) return reply.code(400).send({ error: 'q is required' })
    const results = await searchTmdbMovies(q)
    return reply.send(results)
  })

  app.get<{ Querystring: { q: string } }>('/shows', { preHandler: [requireAuth] }, async (req, reply) => {
    const q = req.query.q?.trim()
    if (!q) return reply.code(400).send({ error: 'q is required' })
    const results = await searchTmdbShows(q)
    return reply.send(results)
  })
}
