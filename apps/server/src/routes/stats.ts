import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { getActiveSessions } from './playback.js'

export const statsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/stats — overview stats for the dashboard
  app.get('/', { preHandler: [requireAuth] }, async (_req, reply) => {
    const [
      totalMovies,
      totalShows,
      totalEpisodes,
      totalMediaFiles,
      totalWatched,
      recentHistory,
      topMovies,
      topShows,
    ] = await Promise.all([
      db.movie.count(),
      db.show.count(),
      db.episode.count({ where: { status: 'downloaded' } }),
      db.mediaFile.count(),
      db.watchHistory.count({ where: { completed: true } }),

      // Last 20 watch events with media info
      db.watchHistory.findMany({
        orderBy: { watchedAt: 'desc' },
        take: 20,
        include: {
          user: { select: { id: true, name: true } },
          mediaFile: {
            include: {
              movie: { select: { id: true, title: true, year: true, posterPath: true } },
              episode: {
                include: {
                  show: { select: { id: true, title: true, posterPath: true } },
                  season: { select: { seasonNumber: true } },
                },
              },
            },
          },
        },
      }),

      // Top 5 most-watched movies (by completed plays)
      db.watchHistory.groupBy({
        by: ['mediaFileId'],
        where: { completed: true, mediaFile: { movieId: { not: null } } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),

      // Top 5 most-watched shows (by completed episode plays)
      db.watchHistory.groupBy({
        by: ['mediaFileId'],
        where: { completed: true, mediaFile: { episodeId: { not: null } } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ])

    // Hydrate top movies
    const topMoviesHydrated = await Promise.all(
      topMovies.map(async (g) => {
        const mf = await db.mediaFile.findUnique({
          where: { id: g.mediaFileId },
          include: { movie: { select: { id: true, title: true, year: true, posterPath: true } } },
        })
        return { movie: mf?.movie ?? null, playCount: g._count.id }
      })
    ).then((r) => r.filter((x) => x.movie !== null))

    // Hydrate top shows — group by showId
    const showCounts = new Map<number, { showId: number; playCount: number }>()
    for (const g of topShows) {
      const mf = await db.mediaFile.findUnique({
        where: { id: g.mediaFileId },
        include: { episode: { select: { showId: true } } },
      })
      const showId = mf?.episode?.showId
      if (!showId) continue
      const existing = showCounts.get(showId)
      showCounts.set(showId, { showId, playCount: (existing?.playCount ?? 0) + g._count.id })
    }
    const topShowsHydrated = await Promise.all(
      [...showCounts.values()]
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 5)
        .map(async ({ showId, playCount }) => {
          const show = await db.show.findUnique({
            where: { id: showId },
            select: { id: true, title: true, posterPath: true },
          })
          return { show, playCount }
        })
    ).then((r) => r.filter((x) => x.show !== null))

    // Play counts per day for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentPlays = await db.watchHistory.findMany({
      where: { watchedAt: { gte: thirtyDaysAgo } },
      select: { watchedAt: true },
    })
    const dailyCounts: Record<string, number> = {}
    for (const p of recentPlays) {
      const day = p.watchedAt.toISOString().slice(0, 10)
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1
    }
    const playsByDay = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Hydrate active sessions with media info
    const rawSessions = getActiveSessions()
    const nowPlaying = await Promise.all(
      rawSessions.map(async (s) => {
        const mf = await db.mediaFile.findUnique({
          where: { id: s.mediaFileId },
          include: {
            movie: { select: { id: true, title: true, year: true, posterPath: true } },
            episode: {
              include: {
                show: { select: { id: true, title: true, posterPath: true } },
                season: { select: { seasonNumber: true } },
              },
            },
          },
        })
        return { ...s, mediaFile: mf ?? null }
      })
    )

    return reply.send({
      library: { movies: totalMovies, shows: totalShows, episodes: totalEpisodes, mediaFiles: totalMediaFiles },
      totalPlays: totalWatched,
      nowPlaying,
      recentHistory,
      topMovies: topMoviesHydrated,
      topShows: topShowsHydrated,
      playsByDay,
    })
  })
}
