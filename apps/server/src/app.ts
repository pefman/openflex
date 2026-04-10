import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

import { authRoutes } from './routes/auth.js'
import { movieRoutes } from './routes/movies.js'
import { showRoutes } from './routes/shows.js'
import { downloadRoutes } from './routes/downloads.js'
import { indexerRoutes } from './routes/indexers.js'
import { qualityRoutes } from './routes/quality.js'
import { settingsRoutes } from './routes/settings.js'
import { streamRoutes } from './routes/stream.js'
import { searchRoutes } from './routes/search.js'
import { usenetServerRoutes } from './routes/usenetServers.js'
import { playbackRoutes } from './routes/playback.js'
import { logRoutes } from './routes/logs.js'
import { schedulerRoutes } from './routes/scheduler.js'
import { systemRoutes } from './routes/system.js'
import { statsRoutes } from './routes/stats.js'
import { optimizationRoutes } from './routes/optimization.js'
import { userRoutes } from './routes/users.js'
import { getHwEncoder } from './services/hls.js'
import { seedOptimizationProfiles, processOptimizationQueue, startOptimizationScheduler } from './services/optimizer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const JWT_SECRET = process.env.JWT_SECRET ?? 'openflex-dev-secret-change-in-production'

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 50 * 1024 * 1024,
  })

  // SQLite via Prisma can return BigInt for aggregate/count fields — coerce globally
  ;(BigInt.prototype as any).toJSON = function () { return Number(this) }

  // Probe hardware encoder once at startup so it's ready and logged early
  setImmediate(() => getHwEncoder())
  // Seed default optimization profiles & resume any queued jobs that survived restart
  setImmediate(async () => {
    await seedOptimizationProfiles()
    processOptimizationQueue()
    startOptimizationScheduler()
  })

  await app.register(fastifyCors, { origin: true })
  await app.register(fastifyJwt, { secret: JWT_SECRET })
  await app.register(fastifyMultipart)

  // Serve React build in production (inside Docker) or development build
  // In Docker the web dist is symlinked to /app/web/dist
  // In dev it's at apps/web/dist
  const webDistPath = process.env.WEB_DIST_PATH ?? path.resolve(__dirname, '../../web/dist')
  if (fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      decorateReply: false,
    })
  }

  // Serve cached images
  const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data')
  await app.register(fastifyStatic, {
    root: path.join(DATA_DIR, 'cache'),
    prefix: '/cache/',
    decorateReply: false,
  })

  // API Routes
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(movieRoutes, { prefix: '/api/movies' })
  await app.register(showRoutes, { prefix: '/api/shows' })
  await app.register(downloadRoutes, { prefix: '/api/downloads' })
  await app.register(indexerRoutes, { prefix: '/api/indexers' })
  await app.register(qualityRoutes, { prefix: '/api/quality-profiles' })
  await app.register(settingsRoutes, { prefix: '/api/settings' })
  await app.register(streamRoutes, { prefix: '/api/stream' })
  await app.register(searchRoutes, { prefix: '/api/search' })
  await app.register(usenetServerRoutes, { prefix: '/api/usenet-servers' })
  await app.register(playbackRoutes, { prefix: '/api/playback' })
  await app.register(logRoutes, { prefix: '/api/logs' })
  await app.register(schedulerRoutes, { prefix: '/api/scheduler' })
  await app.register(systemRoutes, { prefix: '/api/system' })
  await app.register(statsRoutes, { prefix: '/api/stats' })
  await app.register(optimizationRoutes, { prefix: '/api/optimization' })
  await app.register(userRoutes, { prefix: '/api/users' })

  // Fallback to React SPA for non-API routes
  app.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/auth') && !req.url.startsWith('/cache')) {
      const indexPath = path.join(webDistPath, 'index.html')
      if (fs.existsSync(indexPath)) {
        return reply.type('text/html').send(fs.readFileSync(indexPath))
      }
    }
    reply.code(404).send({ error: 'Not Found' })
  })

  return app
}
