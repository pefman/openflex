import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { addTorrent, pauseTorrent, resumeTorrent, removeTorrent } from '../services/torrent.js'
import { PATHS } from '../lib/dataDirs.js'
import { processQueue } from '../services/queue.js'
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
    const downloads = await db.download.findMany({ orderBy: [{ queuePos: 'asc' }, { addedAt: 'desc' }] })
    return reply.send(downloads.map(serializeDownload))
  })

  // POST /api/downloads/torrent
  app.post<{ Body: AddTorrentRequest }>('/torrent', { preHandler: [requireAuth] }, async (req, reply) => {
    const { magnetOrUrl, movieId, episodeId } = req.body
    const maxPos = await db.download.aggregate({ _max: { queuePos: true }, where: { status: 'queued' } })
    const queuePos = (maxPos._max.queuePos ?? -1) + 1

    const download = await db.download.create({
      data: {
        type: 'torrent',
        title: magnetOrUrl.substring(0, 100),
        status: 'queued',
        progress: 0,
        savePath: PATHS.downloads,
        sourceUrl: magnetOrUrl,
        queuePos,
        movieId: movieId ?? null,
        episodeId: episodeId ?? null,
      },
    })

    processQueue().catch(() => {})
    return reply.code(201).send(serializeDownload(download))
  })

  // POST /api/downloads/nzb
  app.post<{ Body: AddNzbRequest }>('/nzb', { preHandler: [requireAuth] }, async (req, reply) => {
    const { nzbUrl, movieId, episodeId } = req.body
    const maxPos = await db.download.aggregate({ _max: { queuePos: true }, where: { status: 'queued' } })
    const queuePos = (maxPos._max.queuePos ?? -1) + 1

    const download = await db.download.create({
      data: {
        type: 'usenet',
        title: nzbUrl.substring(0, 100),
        status: 'queued',
        progress: 0,
        savePath: PATHS.downloads,
        sourceUrl: nzbUrl,
        queuePos,
        movieId: movieId ?? null,
        episodeId: episodeId ?? null,
      },
    })

    processQueue().catch(() => {})
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
    // If the deleted item was active, kick the queue to start the next one
    processQueue().catch(() => {})
    return reply.code(204).send()
  })

  // POST /api/downloads/:id/move — reorder queued items
  app.post<{ Params: { id: string }; Body: { direction: 'up' | 'down' } }>(
    '/:id/move', { preHandler: [requireAuth] },
    async (req, reply) => {
      const targetId = Number(req.params.id)
      const { direction } = req.body

      const queued = await db.download.findMany({
        where: { status: 'queued' },
        orderBy: [{ queuePos: 'asc' }, { addedAt: 'asc' }],
      })

      const idx = queued.findIndex((d) => d.id === targetId)
      if (idx === -1) return reply.code(400).send({ error: 'Download is not queued' })

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= queued.length) return reply.send({ success: true })

      // Normalise positions (0, 1, 2, ...) then swap the two
      const positions = queued.map((d, i) => ({ id: d.id, pos: i }))
      ;[positions[idx].pos, positions[swapIdx].pos] = [positions[swapIdx].pos, positions[idx].pos]

      await Promise.all(
        positions.map((p) => db.download.update({ where: { id: p.id }, data: { queuePos: p.pos } }))
      )
      return reply.send({ success: true })
    }
  )

  // POST /api/downloads/:id/retry — requeue a failed download
  app.post<{ Params: { id: string } }>('/:id/retry', { preHandler: [requireAuth] }, async (req, reply) => {
    const updated = await db.download.updateMany({
      where: { id: Number(req.params.id), status: 'failed', sourceUrl: { not: null } },
      data: { status: 'queued', progress: 0, error: null, queuePos: 0 },
    })
    if (updated.count === 0) return reply.code(400).send({ error: 'Cannot retry: download not found or not failed' })
    processQueue().catch(() => {})
    return reply.send({ success: true })
  })
}
