import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { addTorrent, pauseTorrent, resumeTorrent, removeTorrent } from '../services/torrent.js'
import { addNzbDownload } from '../services/usenet.js'
import { PATHS } from '../lib/dataDirs.js'
import type { AddTorrentRequest, AddNzbRequest } from '@openflex/shared'

// Prisma returns BigInt for size columns — serialize to Number for JSON transport.
// File sizes are capped at Number.MAX_SAFE_INTEGER (~9PB) which is safe in practice.
function serializeDownload(d: Awaited<ReturnType<typeof db.download.findUnique>>) {
  if (!d) return d
  return { ...d, size: d.size != null ? Number(d.size) : null }
}

export const downloadRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/downloads
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const downloads = await db.download.findMany({ orderBy: { addedAt: 'desc' } })
    return reply.send(downloads.map(serializeDownload))
  })

  // POST /api/downloads/torrent
  app.post<{ Body: AddTorrentRequest }>('/torrent', { preHandler: [requireAuth] }, async (req, reply) => {
    const { magnetOrUrl, movieId, episodeId } = req.body

    const download = await db.download.create({
      data: {
        type: 'torrent',
        title: magnetOrUrl.substring(0, 100),
        status: 'queued',
        progress: 0,
        savePath: PATHS.downloads,
        movieId: movieId ?? null,
        episodeId: episodeId ?? null,
      },
    })

    addTorrent(magnetOrUrl, download.id, PATHS.downloads).catch((err) => {
      db.download.update({ where: { id: download.id }, data: { status: 'failed', error: String(err) } }).catch(() => {})
    })

    return reply.code(201).send(serializeDownload(download))
  })

  // POST /api/downloads/nzb
  app.post<{ Body: AddNzbRequest }>('/nzb', { preHandler: [requireAuth] }, async (req, reply) => {
    const { nzbUrl, movieId, episodeId } = req.body

    const download = await db.download.create({
      data: {
        type: 'usenet',
        title: nzbUrl.substring(0, 100),
        status: 'queued',
        progress: 0,
        savePath: PATHS.downloads,
        movieId: movieId ?? null,
        episodeId: episodeId ?? null,
      },
    })

    addNzbDownload(nzbUrl, download.id, PATHS.downloads).catch((err) => {
      db.download.update({ where: { id: download.id }, data: { status: 'failed', error: String(err) } }).catch(() => {})
    })

    return reply.code(201).send(serializeDownload(download))
  })

  // POST /api/downloads/:id/pause
  app.post<{ Params: { id: string } }>('/:id/pause', { preHandler: [requireAuth] }, async (req, reply) => {
    const download = await db.download.findUnique({ where: { id: Number(req.params.id) } })
    if (!download) return reply.code(404).send({ error: 'Not found' })
    if (download.infoHash) await pauseTorrent(download.infoHash)
    return reply.send({ success: true })
  })

  // POST /api/downloads/:id/resume
  app.post<{ Params: { id: string } }>('/:id/resume', { preHandler: [requireAuth] }, async (req, reply) => {
    const download = await db.download.findUnique({ where: { id: Number(req.params.id) } })
    if (!download) return reply.code(404).send({ error: 'Not found' })
    if (download.infoHash) await resumeTorrent(download.infoHash)
    return reply.send({ success: true })
  })

  // DELETE /api/downloads/history — clear completed and failed
  app.delete('/history', { preHandler: [requireAuth] }, async (req, reply) => {
    await db.download.deleteMany({ where: { status: { in: ['completed', 'failed'] } } })
    return reply.code(204).send()
  })

  // DELETE /api/downloads/:id
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const download = await db.download.findUnique({ where: { id: Number(req.params.id) } })
    if (!download) return reply.code(404).send({ error: 'Not found' })
    if (download.infoHash) await removeTorrent(download.infoHash)
    await db.download.delete({ where: { id: Number(req.params.id) } })
    return reply.code(204).send()
  })
}
