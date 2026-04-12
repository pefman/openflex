import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { getTmdbMovie } from '../services/tmdb.js'
import { searchMovieOnIndexer } from '../services/indexer.js'
import { scoreRelease, type ScorerKeywords } from '../services/scorer.js'
import { grabRelease } from '../services/grabber.js'
import { probeFile } from '../services/ffprobe.js'
import type { AddMovieRequest, IndexerSearchResult } from '@openflex/shared'

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

export const movieRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/movies
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const movies = await db.movie.findMany({
      include: { mediaFiles: true },
      orderBy: { title: 'asc' },
    })
    return reply.send(movies.map(mapMovie))
  })

  // GET /api/movies/:id
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const movie = await db.movie.findUnique({
      where: { id: Number(req.params.id) },
      include: { mediaFiles: true },
    })
    if (!movie) return reply.code(404).send({ error: 'Not found' })
    return reply.send(mapMovie(movie))
  })

  // POST /api/movies
  app.post<{ Body: AddMovieRequest }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const { tmdbId, qualityProfileId, monitored = true } = req.body

    const existing = await db.movie.findUnique({ where: { tmdbId } })
    if (existing) return reply.code(409).send({ error: 'Movie already in library' })

    const tmdb = await getTmdbMovie(tmdbId)

    const movie = await db.movie.create({
      data: {
        tmdbId,
        imdbId: tmdb.imdbId,
        title: tmdb.title,
        year: tmdb.year,
        overview: tmdb.overview,
        posterPath: tmdb.posterPath,
        backdropPath: tmdb.backdropPath,
        genres: JSON.stringify(tmdb.genres),
        runtime: tmdb.runtime,
        rating: tmdb.rating,
        status: 'wanted',
        monitored,
        qualityProfileId: qualityProfileId ?? null,
      },
      include: { mediaFiles: true },
    })

    return reply.code(201).send(mapMovie(movie))
  })

  // PATCH /api/movies/:id
  app.patch<{ Params: { id: string }; Body: Partial<{ monitored: boolean; qualityProfileId: number; status: string }> }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const movie = await db.movie.update({
        where: { id: Number(req.params.id) },
        data: req.body,
        include: { mediaFiles: true },
      })
      return reply.send(mapMovie(movie))
    }
  )

  // GET /api/movies/:id/search — manual indexer search
  app.get<{ Params: { id: string } }>('/:id/search', { preHandler: [requireAuth] }, async (req, reply) => {
    const movie = await db.movie.findUnique({ where: { id: Number(req.params.id) } })
    if (!movie) return reply.code(404).send({ error: 'Not found' })

    const indexers = await db.indexer.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
    if (!indexers.length) return reply.send([])

    const allResults = await Promise.all(
      indexers.map((idx) =>
        searchMovieOnIndexer(idx.url, idx.apiKey, idx.id, idx.name, idx.type, movie.imdbId, movie.title, movie.year).catch(() => [])
      )
    )

    const keywords = await loadKeywords()
    const scored = allResults.flat().map((r) => ({ ...r, score: scoreRelease(r.title, keywords) }))
    scored.sort((a, b) => b.score - a.score || b.seeders - a.seeders)
    return reply.send(scored)
  })

  // POST /api/movies/:id/grab — grab a specific release
  app.post<{ Params: { id: string }; Body: IndexerSearchResult }>('/:id/grab', { preHandler: [requireAuth] }, async (req, reply) => {
    const movieId = Number(req.params.id)
    const movie = await db.movie.findUnique({ where: { id: movieId } })
    if (!movie) return reply.code(404).send({ error: 'Not found' })
    const downloadId = await grabRelease(req.body, movieId, null)
    return reply.code(201).send({ downloadId })
  })

  // DELETE /api/movies/:id/files — remove media files but keep movie in library
  app.delete<{ Params: { id: string } }>('/:id/files', { preHandler: [requireAuth] }, async (req, reply) => {
    const id = Number(req.params.id)
    const movie = await db.movie.findUnique({ where: { id }, include: { mediaFiles: true } })
    if (!movie) return reply.code(404).send({ error: 'Not found' })

    const { unlink } = await import('fs/promises')
    for (const f of movie.mediaFiles) {
      await unlink(f.path).catch(() => {})
    }

    await db.mediaFile.deleteMany({ where: { movieId: id } })
    await db.movie.update({ where: { id }, data: { status: 'wanted' } })

    return reply.send({ removedFiles: movie.mediaFiles.length })
  })

  // DELETE /api/movies/:id/files/:fileId — remove one media file for a movie
  app.delete<{ Params: { id: string; fileId: string } }>('/:id/files/:fileId', { preHandler: [requireAuth] }, async (req, reply) => {
    const id = Number(req.params.id)
    const fileId = Number(req.params.fileId)
    const file = await db.mediaFile.findFirst({ where: { id: fileId, movieId: id } })
    if (!file) return reply.code(404).send({ error: 'File not found' })

    const { unlink } = await import('fs/promises')
    await unlink(file.path).catch(() => {})
    await db.mediaFile.delete({ where: { id: fileId } })

    const remaining = await db.mediaFile.count({ where: { movieId: id } })
    if (remaining === 0) {
      await db.movie.update({ where: { id }, data: { status: 'wanted' } })
    }

    return reply.send({ success: true, remainingFiles: remaining })
  })

  // DELETE /api/movies/:id
  app.delete<{ Params: { id: string }; Querystring: { deleteFiles?: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const id = Number(req.params.id)
      const movie = await db.movie.findUnique({ where: { id }, include: { mediaFiles: true } })
      if (!movie) return reply.code(404).send({ error: 'Not found' })

      if (req.query.deleteFiles === 'true') {
        const { unlink } = await import('fs/promises')
        for (const f of movie.mediaFiles) {
          await unlink(f.path).catch(() => {})
        }
      }

      await db.movie.delete({ where: { id } })
      return reply.code(204).send()
    }
  )

  // PATCH /api/movies/bulk — bulk updates
  app.patch<{ Body: { ids: number[]; data?: { monitored?: boolean; status?: string }; monitored?: boolean; status?: string } }>(
    '/bulk',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const ids = req.body?.ids
      const data = req.body?.data ?? {
        monitored: req.body?.monitored,
        status: req.body?.status,
      }
      if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids required' })
      if (data.monitored == null && data.status == null) {
        return reply.code(400).send({ error: 'update data required' })
      }
      if (data.status != null && !['wanted', 'downloaded', 'missing', 'unwanted'].includes(data.status)) {
        return reply.code(400).send({ error: 'invalid status' })
      }
      await db.movie.updateMany({ where: { id: { in: ids } }, data })
      return reply.send({ updated: ids.length })
    }
  )

  // DELETE /api/movies/bulk
  app.delete<{ Body: { ids: number[]; deleteFiles?: boolean } }>(
    '/bulk',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { ids, deleteFiles = false } = req.body
      if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids required' })
      if (deleteFiles) {
        const { unlink } = await import('fs/promises')
        const movies = await db.movie.findMany({ where: { id: { in: ids } }, include: { mediaFiles: true } })
        for (const m of movies) {
          for (const f of m.mediaFiles) { await unlink(f.path).catch(() => {}) }
        }
      }
      await db.movie.deleteMany({ where: { id: { in: ids } } })
      return reply.send({ deleted: ids.length })
    }
  )

  // POST /api/movies/:id/reprobe — re-probe all media files for a movie and update metadata
  app.post<{ Params: { id: string } }>('/:id/reprobe', { preHandler: [requireAuth] }, async (req, reply) => {
    const movieId = Number(req.params.id)
    const files = await db.mediaFile.findMany({ where: { movieId } })
    let updated = 0
    for (const f of files) {
      try {
        const info = await probeFile(f.path)
        await db.mediaFile.update({
          where: { id: f.id },
          data: {
            codec: info.codec ?? undefined,
            resolution: info.resolution ?? undefined,
            container: info.container ?? undefined,
            duration: info.duration ?? undefined,
            audioCodec: info.audioCodec ?? undefined,
            audioChannels: info.audioChannels ?? undefined,
            videoBitrate: info.videoBitrate ?? undefined,
            audioBitrate: info.audioBitrate ?? undefined,
          },
        })
        updated++
      } catch { /* skip unreadable files */ }
    }
    return reply.send({ updated, total: files.length })
  })
}

function mapMovie(m: any) {
  return {
    id: m.id,
    tmdbId: m.tmdbId,
    imdbId: m.imdbId,
    title: m.title,
    year: m.year,
    overview: m.overview,
    posterPath: m.posterPath,
    backdropPath: m.backdropPath,
    genres: JSON.parse(m.genres ?? '[]'),
    runtime: m.runtime,
    rating: m.rating,
    status: m.status,
    monitored: m.monitored,
    qualityProfileId: m.qualityProfileId,
    optimizationProfileId: m.optimizationProfileId ?? null,
    added: m.added,
    mediaFiles: (m.mediaFiles ?? []).map(mapMediaFile),
  }
}

function mapMediaFile(f: any) {
  return {
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
  }
}
