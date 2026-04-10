import cron from 'node-cron'
import { db } from '../db/client.js'
import { searchMovieOnIndexer, searchEpisodeOnIndexer } from './indexer.js'
import { bestRelease, filterEpisodeResults, type ScorerKeywords } from './scorer.js'
import { grabRelease } from './grabber.js'
import { log } from '../lib/logger.js'

const DEFAULT_INTERVAL_MINUTES = 30

let task: cron.ScheduledTask | null = null
let lastRun: Date | null = null
let isRunning = false
let currentIntervalMinutes = DEFAULT_INTERVAL_MINUTES

export function getSchedulerStatus() {
  return {
    intervalMinutes: currentIntervalMinutes,
    lastRun: lastRun?.toISOString() ?? null,
    running: isRunning,
  }
}

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

async function getIntervalMinutes(): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: 'SCHEDULER_INTERVAL_MINUTES' } })
  const value = Number(setting?.value)
  return value > 0 ? value : DEFAULT_INTERVAL_MINUTES
}

export async function startScheduler() {
  stopScheduler()

  currentIntervalMinutes = await getIntervalMinutes()
  const cronExpr = `*/${currentIntervalMinutes} * * * *`

  task = cron.schedule(cronExpr, async () => {
    if (isRunning) {
      log('warn', 'scheduler', 'skipping run — previous check still in progress')
      return
    }
    isRunning = true
    log('info', 'scheduler', 'running auto-grab check...')
    try {
      await checkMovies()
      await checkEpisodes()
    } catch (err) {
      log('error', 'scheduler', String(err))
    } finally {
      lastRun = new Date()
      isRunning = false
    }
  })

  log('info', 'scheduler', `started — interval: every ${currentIntervalMinutes} min (${cronExpr})`)
}

export function stopScheduler() {
  if (task) {
    task.stop()
    task = null
  }
}

export async function runNow() {
  if (isRunning) {
    log('warn', 'scheduler', 'manual run requested but check already in progress')
    return
  }
  isRunning = true
  log('info', 'scheduler', 'manual run triggered')
  try {
    await checkMovies()
    await checkEpisodes()
    log('info', 'scheduler', 'manual run complete')
  } catch (err) {
    log('error', 'scheduler', `manual run error: ${err}`)
    throw err
  } finally {
    lastRun = new Date()
    isRunning = false
  }
}

async function checkMovies() {
  const movies = await db.movie.findMany({
    where: { monitored: true, status: 'wanted' },
    include: { qualityProfile: true },
  })

  const indexers = await db.indexer.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
  if (!indexers.length) {
    log('warn', 'scheduler', 'no enabled indexers — skipping movie check')
    return
  }

  log('info', 'scheduler', `checking ${movies.length} wanted movie(s) against ${indexers.length} indexer(s)`)

  const keywords = await loadKeywords()

  for (const movie of movies) {
    // Skip if already has an active download
    const activeDownload = await db.download.findFirst({
      where: { movieId: movie.id, status: { in: ['queued', 'downloading'] } },
    })
    if (activeDownload) {
      log('info', 'scheduler', `skipping "${movie.title}" — download already active`)
      continue
    }

    log('info', 'scheduler', `searching for "${movie.title}" (${movie.year ?? '?'})...`)

    const allResults = await Promise.all(
      indexers.map((idx) =>
        searchMovieOnIndexer(idx.url, idx.apiKey, idx.id, idx.name, idx.type, movie.imdbId, movie.title, movie.year).catch(() => [])
      )
    )

    const profile = movie.qualityProfile
      ? {
          items: JSON.parse(movie.qualityProfile.items),
          minScore: movie.qualityProfile.minScore,
        }
      : null

    const best = bestRelease(allResults.flat(), profile, keywords)
    if (best) {
      log('info', 'scheduler', `grabbing movie "${movie.title}" — "${best.title}"`)
      await grabRelease(best, movie.id, null)
    } else {
      log('info', 'scheduler', `no suitable release found for "${movie.title}"`)
    }
  }
}

async function checkEpisodes() {
  const episodes = await db.episode.findMany({
    where: { monitored: true, status: 'wanted' },
    include: { show: { include: { qualityProfile: true } }, season: true },
  })

  const indexers = await db.indexer.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })
  if (!indexers.length) {
    log('warn', 'scheduler', 'no enabled indexers — skipping episode check')
    return
  }

  log('info', 'scheduler', `checking ${episodes.length} wanted episode(s) against ${indexers.length} indexer(s)`)

  const keywords = await loadKeywords()

  for (const ep of episodes) {
    const airDate = ep.airDate ? new Date(ep.airDate) : null
    if (airDate && airDate > new Date()) {
      log('info', 'scheduler', `skipping "${ep.show.title}" S${ep.season.seasonNumber}E${ep.episodeNumber} — not aired yet (${ep.airDate})`)
      continue
    }

    const activeDownload = await db.download.findFirst({
      where: { episodeId: ep.id, status: { in: ['queued', 'downloading'] } },
    })
    if (activeDownload) {
      log('info', 'scheduler', `skipping "${ep.show.title}" S${ep.season.seasonNumber}E${ep.episodeNumber} — download already active`)
      continue
    }

    log('info', 'scheduler', `searching for "${ep.show.title}" S${ep.season.seasonNumber}E${ep.episodeNumber}...`)

    const allResults = await Promise.all(
      indexers.map((idx) =>
        searchEpisodeOnIndexer(
          idx.url, idx.apiKey, idx.id, idx.name, idx.type,
          ep.show.tvdbId, ep.show.title,
          ep.season.seasonNumber, ep.episodeNumber
        ).catch(() => [])
      )
    )

    const profile = ep.show.qualityProfile
      ? {
          items: JSON.parse(ep.show.qualityProfile.items),
          minScore: ep.show.qualityProfile.minScore,
        }
      : null

    const filtered = filterEpisodeResults(allResults.flat(), ep.show.title, ep.season.seasonNumber, ep.episodeNumber)
    const best = bestRelease(filtered, profile, keywords)
    if (best) {
      log('info', 'scheduler', `grabbing episode "${ep.show.title}" S${ep.season.seasonNumber}E${ep.episodeNumber} — "${best.title}"`)
      await grabRelease(best, null, ep.id)
    } else {
      log('info', 'scheduler', `no suitable release found for "${ep.show.title}" S${ep.season.seasonNumber}E${ep.episodeNumber}`)
    }
  }
}
