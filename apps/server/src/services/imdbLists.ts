import { load } from 'cheerio'
import { db } from '../db/client.js'
import { log } from '../lib/logger.js'
import {
  findTmdbByImdbId,
  getTmdbMovie,
  getTmdbPopularMovieIds,
  getTmdbSeason,
  getTmdbShow,
  getTmdbTopRatedMovieIds,
} from './tmdb.js'

const IMDB_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const FETCH_TIMEOUT_MS = 15_000
const FETCH_RETRIES = 2

export type ImdbContentType = 'movie' | 'show'

export interface NormalizedImdbList {
  externalListId: string
  externalUrl: string
}

export interface ImdbImportSummary {
  source: 'imdb'
  externalListId: string
  externalUrl: string
  totalCandidates: number
  processed: number
  addedMovies: number
  addedShows: number
  skippedExisting: number
  skippedUnsupported: number
  errors: Array<{ imdbId?: string; message: string }>
}

function isWafChallengeHtml(html: string): boolean {
  const haystack = html.toLowerCase()
  return haystack.includes('securitycompromiseerror')
    || haystack.includes('x-amzn-waf-action')
    || haystack.includes('captcha')
    || haystack.includes('challenge')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseJsonLdIds(jsonText: string, ids: Set<string>) {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return
  }

  const stack: unknown[] = [parsed]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue

    if (Array.isArray(node)) {
      for (const item of node) stack.push(item)
      continue
    }

    const asRecord = node as Record<string, unknown>
    const maybeUrl = asRecord.url
    if (typeof maybeUrl === 'string') {
      const match = maybeUrl.match(/\/title\/(tt\d+)/)
      if (match) ids.add(match[1])
    }

    for (const value of Object.values(asRecord)) stack.push(value)
  }
}

function extractImdbIdsFromHtml(html: string): string[] {
  const ids = new Set<string>()
  const $ = load(html)

  $('script[type="application/ld+json"]').each((_, el) => {
    const jsonText = $(el).contents().text()
    if (jsonText) parseJsonLdIds(jsonText, ids)
  })

  $('a[href*="/title/tt"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const match = href.match(/\/title\/(tt\d+)/)
    if (match) ids.add(match[1])
  })

  return Array.from(ids)
}

export function normalizeImdbListUrl(inputUrl: string): NormalizedImdbList {
  let url: URL
  try {
    url = new URL(inputUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'imdb.com' && host !== 'www.imdb.com') {
    throw new Error('Only imdb.com URLs are supported')
  }

  const path = url.pathname.replace(/\/+$/, '')

  if (path === '/chart/top') {
    return {
      externalListId: 'chart-top',
      externalUrl: 'https://www.imdb.com/chart/top/',
    }
  }

  if (path === '/chart/moviemeter') {
    return {
      externalListId: 'chart-moviemeter',
      externalUrl: 'https://www.imdb.com/chart/moviemeter/',
    }
  }

  const listMatch = path.match(/^\/list\/(ls\d+)/)
  if (listMatch) {
    const listId = listMatch[1]
    return {
      externalListId: listId,
      externalUrl: `https://www.imdb.com/list/${listId}/`,
    }
  }

  throw new Error('Unsupported IMDb URL. Supported: /chart/top/, /chart/moviemeter/, /list/ls.../')
}

async function fetchImdbListHtml(url: string): Promise<string> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'user-agent': IMDB_USER_AGENT,
          'accept-language': 'en-US,en;q=0.9',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'cache-control': 'no-cache',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (!res.ok) {
        throw new Error(`IMDb request failed with ${res.status}`)
      }

      return await res.text()
    } catch (err) {
      lastError = err
      if (attempt < FETCH_RETRIES) {
        await sleep(500 * (attempt + 1))
      }
    }
  }

  throw new Error(`Failed to fetch IMDb list: ${String(lastError)}`)
}

async function ensureMovieByTmdbId(tmdbId: number): Promise<'added' | 'existing'> {
  const existing = await db.movie.findUnique({ where: { tmdbId } })
  if (existing) return 'existing'

  const tmdb = await getTmdbMovie(tmdbId)
  await db.movie.create({
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
      monitored: true,
    },
  })

  return 'added'
}

async function ensureShowByTmdbId(tmdbId: number): Promise<'added' | 'existing'> {
  const existing = await db.show.findUnique({ where: { tmdbId } })
  if (existing) return 'existing'

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
      monitored: true,
    },
  })

  for (const seasonMeta of tmdb.seasons) {
    const season = await db.season.create({
      data: {
        showId: show.id,
        seasonNumber: seasonMeta.seasonNumber,
        episodeCount: seasonMeta.episodeCount,
        posterPath: seasonMeta.posterPath,
      },
    })

    const episodes = await getTmdbSeason(tmdbId, seasonMeta.seasonNumber)
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
          monitored: true,
        },
      })
    }
  }

  return 'added'
}

export async function importImdbListForUser(input: {
  userId: number
  imdbUrl: string
  contentTypes?: ImdbContentType[]
}): Promise<ImdbImportSummary> {
  const normalized = normalizeImdbListUrl(input.imdbUrl)
  const contentTypes = new Set<ImdbContentType>(input.contentTypes?.length ? input.contentTypes : ['movie', 'show'])

  const html = await fetchImdbListHtml(normalized.externalUrl)
  const imdbIds = extractImdbIdsFromHtml(html)
  const wafChallenge = isWafChallengeHtml(html)

  const summary: ImdbImportSummary = {
    source: 'imdb',
    externalListId: normalized.externalListId,
    externalUrl: normalized.externalUrl,
    totalCandidates: imdbIds.length,
    processed: 0,
    addedMovies: 0,
    addedShows: 0,
    skippedExisting: 0,
    skippedUnsupported: 0,
    errors: [],
  }

  if (imdbIds.length === 0) {
    if (normalized.externalListId === 'chart-top') {
      const tmdbIds = await getTmdbTopRatedMovieIds(100)
      for (const tmdbId of tmdbIds) {
        try {
          summary.processed += 1
          const result = await ensureMovieByTmdbId(tmdbId)
          if (result === 'added') summary.addedMovies += 1
          else summary.skippedExisting += 1
        } catch (err) {
          summary.errors.push({ message: String(err) })
        }
      }
      return summary
    }

    if (normalized.externalListId === 'chart-moviemeter') {
      const tmdbIds = await getTmdbPopularMovieIds(100)
      for (const tmdbId of tmdbIds) {
        try {
          summary.processed += 1
          const result = await ensureMovieByTmdbId(tmdbId)
          if (result === 'added') summary.addedMovies += 1
          else summary.skippedExisting += 1
        } catch (err) {
          summary.errors.push({ message: String(err) })
        }
      }
      return summary
    }

    if (wafChallenge) {
      throw new Error('IMDb blocked this request with a WAF challenge. Chart imports use TMDB fallback, but custom IMDb list pages may fail from this environment.')
    }

    throw new Error('No titles found on IMDb page')
  }

  for (const imdbId of imdbIds) {
    try {
      summary.processed += 1
      const match = await findTmdbByImdbId(imdbId)

      if (match.movieTmdbId && contentTypes.has('movie')) {
        const result = await ensureMovieByTmdbId(match.movieTmdbId)
        if (result === 'added') summary.addedMovies += 1
        else summary.skippedExisting += 1
        continue
      }

      if (match.showTmdbId && contentTypes.has('show')) {
        const result = await ensureShowByTmdbId(match.showTmdbId)
        if (result === 'added') summary.addedShows += 1
        else summary.skippedExisting += 1
        continue
      }

      summary.skippedUnsupported += 1
    } catch (err) {
      summary.errors.push({ imdbId, message: String(err) })
    }
  }

  return summary
}

export function parseContentTypes(raw: string): ImdbContentType[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return ['movie', 'show']
    const allowed = parsed.filter((v) => v === 'movie' || v === 'show') as ImdbContentType[]
    return allowed.length ? allowed : ['movie', 'show']
  } catch {
    return ['movie', 'show']
  }
}

let syncRunning = false
const syncingSubscriptionIds = new Set<number>()

export async function syncImdbSubscription(subscriptionId: number) {
  if (syncingSubscriptionIds.has(subscriptionId)) {
    return { skipped: true, reason: 'already-running' as const }
  }

  syncingSubscriptionIds.add(subscriptionId)
  try {
    const subscription = await db.imdbListSubscription.findUnique({ where: { id: subscriptionId } })
    if (!subscription) return { skipped: true, reason: 'not-found' as const }
    if (!subscription.enabled) return { skipped: true, reason: 'disabled' as const }

    const summary = await importImdbListForUser({
      userId: subscription.userId,
      imdbUrl: subscription.externalUrl,
      contentTypes: parseContentTypes(subscription.contentTypes),
    })

    await db.imdbListSubscription.update({
      where: { id: subscription.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
      },
    })

    log('info', 'imdb-sync', `subscription ${subscription.id} synced: +${summary.addedMovies} movies, +${summary.addedShows} shows`)
    return { skipped: false, summary }
  } catch (err) {
    const message = String(err)
    await db.imdbListSubscription.update({
      where: { id: subscriptionId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncError: message.slice(0, 1000),
      },
    }).catch(() => {})
    log('error', 'imdb-sync', `subscription ${subscriptionId} failed: ${message}`)
    throw err
  } finally {
    syncingSubscriptionIds.delete(subscriptionId)
  }
}

function isSubscriptionDue(lastSyncedAt: Date | null, intervalHours: number): boolean {
  if (!lastSyncedAt) return true
  const next = new Date(lastSyncedAt.getTime() + intervalHours * 60 * 60 * 1000)
  return next <= new Date()
}

export async function syncDueImdbSubscriptions() {
  if (syncRunning) {
    log('warn', 'imdb-sync', 'skipping due-sync run — previous run still in progress')
    return
  }

  syncRunning = true
  try {
    const subscriptions = await db.imdbListSubscription.findMany({ where: { enabled: true } })
    const due = subscriptions.filter((sub) => isSubscriptionDue(sub.lastSyncedAt, sub.syncIntervalHours))

    for (const sub of due) {
      try {
        await syncImdbSubscription(sub.id)
      } catch {
        // continue with next subscription
      }
    }

    if (due.length > 0) {
      log('info', 'imdb-sync', `due-sync run finished (${due.length} subscription(s))`)
    }
  } finally {
    syncRunning = false
  }
}
