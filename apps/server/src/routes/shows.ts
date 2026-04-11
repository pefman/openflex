import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { getTmdbShow, getTmdbSeason } from '../services/tmdb.js'
import { searchEpisodeOnIndexer } from '../services/indexer.js'
import { scoreRelease, filterEpisodeResults, type ScorerKeywords } from '../services/scorer.js'
import { grabRelease } from '../services/grabber.js'
import type { AddShowRequest, IndexerSearchResult } from '@openflex/shared'

async function loadKeywords(): Promise<ScorerKeywords> {
  const [pref, rej] = await Promise.all([
    db.setting.findUnique({ where: { key: 'PREFERRED_KEYWORDS' } }),
    db.setting.findUnique({ where: { key: 'REJECTED_KEYWORDS' } }),
  ])
  return {
    preferred: pref?.value ? JSON.parse(pref.value) : [],
    rejected: rej?.value ? JSON.parse(rej.value) : [],
  }
}

export const showRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/shows
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const shows = await db.show.findMany({
      include: { seasons: { include: { episodes: { include: { mediaFiles: true } } } } },
      orderBy: { title: 'asc' },
    })
    return reply.send(shows.map(mapShow))
  })

  // GET /api/shows/:id
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const show = await db.show.findUnique({
      where: { id: Number(req.params.id) },
      include: { seasons: { include: { episodes: { include: { mediaFiles: true } } } } },
    })
    if (!show) return reply.code(404).send({ error: 'Not found' })
    return reply.send(mapShow(show))
  })

  // POST /api/shows
  app.post<{ Body: AddShowRequest }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const { tmdbId, qualityProfileId, monitored = true } = req.body

    const existing = await db.show.findUnique({ where: { tmdbId } })
    if (existing) return reply.code(409).send({ error: 'Show already in library' })

    const tmdb = await getTmdbShow(tmdbId)

    const show = await db.show.create({
      data: {
        tmdbId,
        tvdbId: tmdb.tvdbId,
        title: tmdb.title,
        overview: tmdb.overview,
        posterPath: tmdb.posterPath,
        backdropPath: tmdb.backdropPath,
        genres: JSON.stringify(tmdb.genres),
        status: 'wanted',
        monitored,
        qualityProfileId: qualityProfileId ?? null,
      },
    })

    // Populate seasons + episodes
    for (const s of tmdb.seasons) {
      const season = await db.season.create({
        data: {
          showId: show.id,
          seasonNumber: s.seasonNumber,
          episodeCount: s.episodeCount,
          posterPath: s.posterPath,
        },
      })

      const episodes = await getTmdbSeason(tmdbId, s.seasonNumber)
      for (const ep of episodes) {
        await db.episode.create({
          data: {
            showId: show.id,
            seasonId: season.id,
            episodeNumber: ep.episodeNumber,
            title: ep.title,
            overview: ep.overview,
            airDate: ep.airDate,
            status: 'wanted',
            monitored,
          },
        })
      }
    }

    const fullShow = await db.show.findUnique({
      where: { id: show.id },
      include: { seasons: { include: { episodes: { include: { mediaFiles: true } } } } },
    })

    return reply.code(201).send(mapShow(fullShow!))
  })

  // PATCH /api/shows/:id
  app.patch<{ Params: { id: string }; Body: Partial<{ monitored: boolean; qualityProfileId: number }> }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const show = await db.show.update({
        where: { id: Number(req.params.id) },
        data: req.body,
        include: { seasons: { include: { episodes: { include: { mediaFiles: true } } } } },
      })
      return reply.send(mapShow(show))
    }
  )

  // GET /api/shows/:showId/episodes/:episodeId/search — manual indexer search
  app.get<{ Params: { showId: string; episodeId: string } }>(
    '/:showId/episodes/:episodeId/search',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const ep = await db.episode.findUnique({
        where: { id: Number(req.params.episodeId) },
        include: { show: true, season: true },
      })
      if (!ep) return reply.code(404).send({ error: 'Not found' })

      const indexers = await db.indexer.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
      if (!indexers.length) return reply.send([])

      const allResults = await Promise.all(
        indexers.map((idx) =>
          searchEpisodeOnIndexer(
            idx.url, idx.apiKey, idx.id, idx.name, idx.type,
            ep.show.tvdbId, ep.show.title,
            ep.season.seasonNumber, ep.episodeNumber
          ).catch(() => [])
        )
      )

      const filtered = filterEpisodeResults(allResults.flat(), ep.show.title, ep.season.seasonNumber, ep.episodeNumber)
      const keywords = await loadKeywords()
      const scored = filtered.map((r) => ({ ...r, score: scoreRelease(r.title, keywords) }))
      scored.sort((a, b) => b.score - a.score || b.seeders - a.seeders)
      return reply.send(scored)
    }
  )

  // POST /api/shows/:showId/episodes/:episodeId/grab — grab a specific release
  app.post<{ Params: { showId: string; episodeId: string }; Body: IndexerSearchResult }>(
    '/:showId/episodes/:episodeId/grab',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const episodeId = Number(req.params.episodeId)
      const ep = await db.episode.findUnique({ where: { id: episodeId } })
      if (!ep) return reply.code(404).send({ error: 'Not found' })
      const downloadId = await grabRelease(req.body, null, episodeId)
      return reply.code(201).send({ downloadId })
    }
  )

  // POST /api/shows/:showId/episodes/:episodeId/auto-grab — auto search + grab best result
  app.post<{ Params: { showId: string; episodeId: string } }>(
    '/:showId/episodes/:episodeId/auto-grab',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const episodeId = Number(req.params.episodeId)
      const ep = await db.episode.findUnique({ where: { id: episodeId }, include: { show: true, season: true } })
      if (!ep) return reply.code(404).send({ error: 'Not found' })
      const result = await autoGrabEpisode(ep)
      if (!result) return reply.code(404).send({ error: 'No results found' })
      return reply.code(201).send({ downloadId: result })
    }
  )

  // POST /api/shows/:showId/seasons/:seasonId/auto-grab — auto search + grab all wanted episodes in a season
  app.post<{ Params: { showId: string; seasonId: string } }>(
    '/:showId/seasons/:seasonId/auto-grab',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const seasonId = Number(req.params.seasonId)
      const episodes = await db.episode.findMany({
        where: { seasonId, status: { in: ['wanted', 'missing'] } },
        include: { show: true, season: true },
      })
      const keywords = await loadKeywords()
      const results = await Promise.allSettled(episodes.map((ep) => autoGrabEpisode(ep, keywords)))
      const grabbed = results.filter((r) => r.status === 'fulfilled' && r.value != null).length
      return reply.send({ grabbed, total: episodes.length })
    }
  )

  // POST /api/shows/:showId/auto-grab — auto search + grab all wanted episodes in the show
  app.post<{ Params: { showId: string } }>(
    '/:showId/auto-grab',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const showId = Number(req.params.showId)
      const episodes = await db.episode.findMany({
        where: { showId, status: { in: ['wanted', 'missing'] } },
        include: { show: true, season: true },
      })
      const keywords = await loadKeywords()
      const results = await Promise.allSettled(episodes.map((ep) => autoGrabEpisode(ep, keywords)))
      const grabbed = results.filter((r) => r.status === 'fulfilled' && r.value != null).length
      return reply.send({ grabbed, total: episodes.length })
    }
  )

  // POST /api/shows/:id/refresh — re-fetch metadata from TMDB and sync seasons/episodes
  app.post<{ Params: { id: string } }>('/:id/refresh', { preHandler: [requireAuth] }, async (req, reply) => {
    const showId = Number(req.params.id)
    const show = await db.show.findUnique({ where: { id: showId } })
    if (!show) return reply.code(404).send({ error: 'Not found' })

    const tmdb = await getTmdbShow(show.tmdbId)

    await db.show.update({
      where: { id: showId },
      data: {
        title: tmdb.title,
        overview: tmdb.overview,
        posterPath: tmdb.posterPath,
        backdropPath: tmdb.backdropPath,
        genres: JSON.stringify(tmdb.genres),
        tvdbId: tmdb.tvdbId,
      },
    })

    for (const s of tmdb.seasons) {
      const season = await db.season.upsert({
        where: { showId_seasonNumber: { showId, seasonNumber: s.seasonNumber } },
        create: { showId, seasonNumber: s.seasonNumber, episodeCount: s.episodeCount, posterPath: s.posterPath },
        update: { episodeCount: s.episodeCount, posterPath: s.posterPath },
      })
      const episodes = await getTmdbSeason(show.tmdbId, s.seasonNumber)
      for (const ep of episodes) {
        await db.episode.upsert({
          where: { showId_seasonId_episodeNumber: { showId, seasonId: season.id, episodeNumber: ep.episodeNumber } },
          create: {
            showId, seasonId: season.id, episodeNumber: ep.episodeNumber,
            title: ep.title, overview: ep.overview, airDate: ep.airDate,
            status: 'wanted', monitored: true,
          },
          update: { title: ep.title, overview: ep.overview, airDate: ep.airDate },
        })
      }
    }

    const fullShow = await db.show.findUnique({
      where: { id: showId },
      include: { seasons: { include: { episodes: { include: { mediaFiles: true } } } } },
    })
    return reply.send(mapShow(fullShow!))
  })

  // PATCH /api/shows/:showId/seasons/:seasonId — bulk set monitored on all episodes
  app.patch<{ Params: { showId: string; seasonId: string }; Body: { monitored: boolean } }>(
    '/:showId/seasons/:seasonId',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      await db.episode.updateMany({
        where: { seasonId: Number(req.params.seasonId) },
        data: { monitored: req.body.monitored },
      })
      return reply.code(204).send()
    }
  )

  // PATCH /api/shows/:showId/episodes/:episodeId — toggle monitored
  app.patch<{ Params: { showId: string; episodeId: string }; Body: { monitored: boolean } }>(
    '/:showId/episodes/:episodeId',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const ep = await db.episode.update({
        where: { id: Number(req.params.episodeId) },
        data: { monitored: req.body.monitored },
        include: { mediaFiles: true },
      })
      return reply.send(mapEpisode(ep))
    }
  )

  // DELETE /api/shows/:id
  // DELETE /api/shows/:showId/episodes/:episodeId/file — remove media file(s) for a single episode
  app.delete<{ Params: { showId: string; episodeId: string } }>(
    '/:showId/episodes/:episodeId/file',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { unlink } = await import('fs/promises')
      const episodeId = Number(req.params.episodeId)
      const files = await db.mediaFile.findMany({ where: { episodeId } })
      for (const f of files) {
        await unlink(f.path).catch(() => {})
        await db.mediaFile.delete({ where: { id: f.id } })
      }
      if (files.length > 0) {
        await db.episode.update({ where: { id: episodeId }, data: { status: 'wanted' } })
      }
      return reply.code(204).send()
    }
  )

  // DELETE /api/shows/:showId/seasons/:seasonId/files — remove media files for all episodes in a season
  app.delete<{ Params: { showId: string; seasonId: string } }>(
    '/:showId/seasons/:seasonId/files',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { unlink } = await import('fs/promises')
      const episodes = await db.episode.findMany({
        where: { seasonId: Number(req.params.seasonId) },
        include: { mediaFiles: true },
      })
      for (const ep of episodes) {
        for (const f of ep.mediaFiles) {
          await unlink(f.path).catch(() => {})
          await db.mediaFile.delete({ where: { id: f.id } })
        }
        if (ep.mediaFiles.length > 0) {
          await db.episode.update({ where: { id: ep.id }, data: { status: 'wanted' } })
        }
      }
      return reply.code(204).send()
    }
  )

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const id = Number(req.params.id)
    const show = await db.show.findUnique({ where: { id } })
    if (!show) return reply.code(404).send({ error: 'Not found' })
    await db.show.delete({ where: { id } })
    return reply.code(204).send()
  })

  // PATCH /api/shows/bulk
  app.patch<{ Body: { ids: number[]; data: { monitored?: boolean } } }>(
    '/bulk',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { ids, data } = req.body
      if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids required' })
      await db.show.updateMany({ where: { id: { in: ids } }, data })
      return reply.send({ updated: ids.length })
    }
  )

  // DELETE /api/shows/bulk
  app.delete<{ Body: { ids: number[] } }>(
    '/bulk',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { ids } = req.body
      if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids required' })
      await db.show.deleteMany({ where: { id: { in: ids } } })
      return reply.send({ deleted: ids.length })
    }
  )
}

function mapShow(s: any) {
  return {
    id: s.id,
    tmdbId: s.tmdbId,
    tvdbId: s.tvdbId,
    title: s.title,
    overview: s.overview,
    posterPath: s.posterPath,
    backdropPath: s.backdropPath,
    genres: JSON.parse(s.genres ?? '[]'),
    status: s.status,
    monitored: s.monitored,
    qualityProfileId: s.qualityProfileId,
    optimizationProfileId: s.optimizationProfileId ?? null,
    added: s.added,
    seasons: (s.seasons ?? []).map(mapSeason),
  }
}

function mapSeason(s: any) {
  return {
    id: s.id,
    showId: s.showId,
    seasonNumber: s.seasonNumber,
    episodeCount: s.episodeCount,
    posterPath: s.posterPath,
    episodes: (s.episodes ?? []).map(mapEpisode),
  }
}

function mapEpisode(e: any) {
  return {
    id: e.id,
    showId: e.showId,
    seasonId: e.seasonId,
    episodeNumber: e.episodeNumber,
    title: e.title,
    overview: e.overview,
    airDate: e.airDate,
    status: e.status,
    monitored: e.monitored,
    mediaFiles: (e.mediaFiles ?? []).map((f: any) => ({
      id: f.id,
      path: f.path,
      size: f.size != null ? Number(f.size) : null,
      codec: f.codec,
      resolution: f.resolution,
      container: f.container,
      duration: f.duration,
      audioCodec: f.audioCodec,
      audioChannels: f.audioChannels,
      videoBitrate: f.videoBitrate,
      audioBitrate: f.audioBitrate,
      addedAt: f.addedAt,
    })),
  }
}

/** Search all enabled indexers for an episode and grab the best-scored result. Returns downloadId or null. */
async function autoGrabEpisode(
  ep: { id: number; show: { id: number; title: string; tvdbId: number | null }; season: { seasonNumber: number }; episodeNumber: number },
  keywords?: ScorerKeywords
): Promise<number | null> {
  const indexers = await db.indexer.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
  if (!indexers.length) return null

  const allResults = await Promise.all(
    indexers.map((idx) =>
      searchEpisodeOnIndexer(
        idx.url, idx.apiKey, idx.id, idx.name, idx.type,
        ep.show.tvdbId, ep.show.title,
        ep.season.seasonNumber, ep.episodeNumber
      ).catch(() => [])
    )
  )

  const filtered = filterEpisodeResults(
    allResults.flat(), ep.show.title, ep.season.seasonNumber, ep.episodeNumber
  )
  if (!filtered.length) return null

  const kw = keywords ?? await loadKeywords()
  const scored = filtered
    .map((r) => ({ ...r, score: scoreRelease(r.title, kw) }))
    .sort((a, b) => b.score - a.score || b.seeders - a.seeders)

  return grabRelease(scored[0], null, ep.id)
}
