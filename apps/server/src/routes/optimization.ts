import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import {
  queueOptimizationJob,
  cancelOptimizationJob,
  processOptimizationQueue,
} from '../services/optimizer.js'

export const optimizationRoutes: FastifyPluginAsync = async (app) => {

  // ── Profiles ─────────────────────────────────────────────────────────────

  app.get('/profiles', { preHandler: [requireAuth] }, async (_req, reply) => {
    const profiles = await db.optimizationProfile.findMany({ orderBy: { createdAt: 'asc' } })
    return reply.send(profiles)
  })

  app.post<{ Body: Record<string, unknown> }>(
    '/profiles',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const body = req.body as any
      const profile = await db.optimizationProfile.create({
        data: {
          name: String(body.name),
          videoMode: String(body.videoMode ?? 'copy_compatible'),
          videoCodec: String(body.videoCodec ?? 'h264'),
          videoCrf: Number(body.videoCrf ?? 23),
          videoPreset: String(body.videoPreset ?? 'fast'),
          audioMode: String(body.audioMode ?? 'reencode'),
          audioChannels: Number(body.audioChannels ?? 2),
          audioBitrate: Number(body.audioBitrate ?? 128),
          useHwEncoder: Boolean(body.useHwEncoder ?? true),
          applyToNew: Boolean(body.applyToNew ?? false),
        },
      })
      return reply.code(201).send(profile)
    },
  )

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/profiles/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const id = Number(req.params.id)
      const body = req.body as any
      const allowed = ['name', 'videoMode', 'videoCodec', 'videoCrf', 'videoPreset',
        'audioMode', 'audioChannels', 'audioBitrate', 'useHwEncoder', 'applyToNew']
      const data: Record<string, unknown> = {}
      for (const k of allowed) {
        if (k in body) data[k] = body[k]
      }
      const profile = await db.optimizationProfile.update({ where: { id }, data })
      return reply.send(profile)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/profiles/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const id = Number(req.params.id)
      const pending = await db.optimizationJob.count({
        where: { profileId: id, status: { in: ['queued', 'running'] } },
      })
      if (pending > 0) {
        return reply.code(409).send({ error: `Cannot delete profile — ${pending} job(s) pending` })
      }
      // Clear profile assignment from movies/shows before deleting
      await db.movie.updateMany({ where: { optimizationProfileId: id }, data: { optimizationProfileId: null } })
      await db.show.updateMany({ where: { optimizationProfileId: id }, data: { optimizationProfileId: null } })
      await db.optimizationProfile.delete({ where: { id } })
      return reply.code(204).send()
    },
  )

  // ── Jobs ──────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/jobs',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { status, limit } = req.query
      const jobs = await db.optimizationJob.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit ? Number(limit) : 200,
        include: {
          mediaFile: { select: { id: true, path: true, size: true, codec: true } },
          profile: { select: { id: true, name: true } },
        },
      })
      return reply.send(jobs)
    },
  )

  app.post<{ Body: { mediaFileIds: number[]; profileId: number } }>(
    '/jobs',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { mediaFileIds, profileId } = req.body
      if (!Array.isArray(mediaFileIds) || mediaFileIds.length === 0) {
        return reply.code(400).send({ error: 'mediaFileIds must be a non-empty array' })
      }
      const profile = await db.optimizationProfile.findUnique({ where: { id: profileId } })
      if (!profile) return reply.code(404).send({ error: 'Profile not found' })

      let queued = 0
      for (const mediaFileId of mediaFileIds) {
        const file = await db.mediaFile.findUnique({ where: { id: mediaFileId } })
        if (!file) continue
        await queueOptimizationJob(mediaFileId, profileId)
        queued++
      }

      return reply.code(201).send({ queued })
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/jobs/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const id = Number(req.params.id)
      const job = await db.optimizationJob.findUnique({ where: { id } })
      if (!job) return reply.code(404).send({ error: 'Job not found' })

      if (job.status === 'running') {
        await cancelOptimizationJob(id)
      } else {
        await db.optimizationJob.delete({ where: { id } })
      }
      return reply.code(204).send()
    },
  )

  // Clear all completed/failed/cancelled jobs
  app.delete('/jobs', { preHandler: [requireAuth] }, async (_req, reply) => {
    await db.optimizationJob.deleteMany({
      where: { status: { in: ['completed', 'failed', 'cancelled'] } },
    })
    return reply.code(204).send()
  })

  // ── Profile-assignment helpers ────────────────────────────────────────────

  // PATCH /api/optimization/movies/:id/profile
  app.patch<{ Params: { id: string }; Body: { profileId: number | null } }>(
    '/movies/:id/profile',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const movieId = Number(req.params.id)
      const { profileId } = req.body
      const movie = await db.movie.update({
        where: { id: movieId },
        data: { optimizationProfileId: profileId ?? null },
        include: { mediaFiles: true },
      })
      // Auto-queue existing files when a profile is assigned
      if (profileId) {
        for (const file of movie.mediaFiles) {
          await queueOptimizationJob(file.id, profileId)
        }
      }
      return reply.send(movie)
    },
  )

  // PATCH /api/optimization/shows/:id/profile
  app.patch<{ Params: { id: string }; Body: { profileId: number | null } }>(
    '/shows/:id/profile',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const showId = Number(req.params.id)
      const { profileId } = req.body
      const show = await db.show.update({
        where: { id: showId },
        data: { optimizationProfileId: profileId ?? null },
      })
      // Auto-queue all existing episode files when a profile is assigned
      if (profileId) {
        const episodes = await db.episode.findMany({
          where: { season: { showId } },
          include: { mediaFiles: true },
        })
        for (const ep of episodes) {
          for (const file of ep.mediaFiles) {
            await queueOptimizationJob(file.id, profileId)
          }
        }
      }
      return reply.send(show)
    },
  )

  // POST /api/optimization/jobs/resume — kick the queue (e.g. after server restart)
  app.post('/jobs/resume', { preHandler: [requireAuth] }, async (_req, reply) => {
    processOptimizationQueue()
    return reply.send({ ok: true })
  })
}
