import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { PATHS } from '../lib/dataDirs.js'
import { db } from '../db/client.js'
import type { TmdbMovieResult, TmdbShowResult } from '@openflex/shared'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280'

async function getApiKey(): Promise<string> {
  // DB setting takes precedence over env var so users can configure it in the UI
  const setting = await db.setting.findUnique({ where: { key: 'TMDB_API_KEY' } })
  const key = setting?.value || process.env.TMDB_API_KEY
  if (!key) throw new Error('TMDB API key is not configured. Set it in Settings → General.')
  return key
}

async function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.status_code && parsed.status_message) {
            reject(new Error(`TMDB error ${parsed.status_code}: ${parsed.status_message}`))
          } else {
            resolve(parsed as T)
          }
        } catch (e) {
          reject(e)
        }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function downloadImage(tmdbPath: string, localPath: string, isBackdrop = false): Promise<void> {
  if (!tmdbPath) return
  if (fs.existsSync(localPath)) return

  const base = isBackdrop ? TMDB_BACKDROP_BASE : TMDB_IMAGE_BASE
  const url = `${base}${tmdbPath}`

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localPath)
    https.get(url, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    }).on('error', (err) => {
      fs.unlink(localPath, () => {})
      reject(err)
    })
  })
}

function posterCachePath(tmdbPath: string): string {
  const filename = tmdbPath.replace(/\//g, '_')
  return path.join(PATHS.posters, filename)
}

function backdropCachePath(tmdbPath: string): string {
  const filename = tmdbPath.replace(/\//g, '_')
  return path.join(PATHS.backdrops, filename)
}

function localPosterUrl(tmdbPath: string | null): string | null {
  if (!tmdbPath) return null
  return `/cache/posters/${tmdbPath.replace(/\//g, '_')}`
}

function localBackdropUrl(tmdbPath: string | null): string | null {
  if (!tmdbPath) return null
  return `/cache/backdrops/${tmdbPath.replace(/\//g, '_')}`
}

// ─── Movie ────────────────────────────────────────────────────────────────────

export async function searchTmdbMovies(query: string): Promise<TmdbMovieResult[]> {
  const apiKey = await getApiKey()
  const url = `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`
  const data = await fetchJson<{ results: any[] }>(url)
  return (data.results ?? []).map((r) => ({
    tmdbId: r.id,
    title: r.title,
    year: r.release_date ? parseInt(r.release_date.substring(0, 4)) : null,
    overview: r.overview || null,
    posterPath: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
    rating: r.vote_average ?? null,
  }))
}

export async function getTmdbMovie(tmdbId: number) {
  const apiKey = await getApiKey()
  const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}&append_to_response=external_ids`
  const r = await fetchJson<any>(url)

  // Cache images before returning so they are ready when the frontend renders
  await Promise.all([
    r.poster_path ? downloadImage(r.poster_path, posterCachePath(r.poster_path)).catch(() => {}) : Promise.resolve(),
    r.backdrop_path ? downloadImage(r.backdrop_path, backdropCachePath(r.backdrop_path), true).catch(() => {}) : Promise.resolve(),
  ])

  return {
    tmdbId: r.id,
    imdbId: r.imdb_id || r.external_ids?.imdb_id || null,
    title: r.title,
    year: r.release_date ? parseInt(r.release_date.substring(0, 4)) : null,
    overview: r.overview || null,
    posterPath: localPosterUrl(r.poster_path),
    backdropPath: localBackdropUrl(r.backdrop_path),
    genres: (r.genres ?? []).map((g: any) => g.name),
    runtime: r.runtime || null,
    rating: r.vote_average ?? null,
  }
}

// ─── Shows ────────────────────────────────────────────────────────────────────

export async function searchTmdbShows(query: string): Promise<TmdbShowResult[]> {
  const apiKey = await getApiKey()
  const url = `${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`
  const data = await fetchJson<{ results: any[] }>(url)
  return (data.results ?? []).map((r) => ({
    tmdbId: r.id,
    title: r.name,
    year: r.first_air_date ? parseInt(r.first_air_date.substring(0, 4)) : null,
    overview: r.overview || null,
    posterPath: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
    rating: r.vote_average ?? null,
  }))
}

export async function getTmdbShow(tmdbId: number) {
  const apiKey = await getApiKey()
  const url = `${TMDB_BASE}/tv/${tmdbId}?api_key=${apiKey}&append_to_response=external_ids`
  const r = await fetchJson<any>(url)

  // Cache show poster and backdrop before returning
  await Promise.all([
    r.poster_path ? downloadImage(r.poster_path, posterCachePath(r.poster_path)).catch(() => {}) : Promise.resolve(),
    r.backdrop_path ? downloadImage(r.backdrop_path, backdropCachePath(r.backdrop_path), true).catch(() => {}) : Promise.resolve(),
  ])

  // Cache season posters asynchronously (non-blocking — they aren't needed immediately)
  for (const s of r.seasons ?? []) {
    if (s.poster_path) {
      downloadImage(s.poster_path, posterCachePath(s.poster_path)).catch(() => {})
    }
  }

  return {
    tmdbId: r.id,
    tvdbId: r.external_ids?.tvdb_id ?? null,
    title: r.name,
    year: r.first_air_date ? parseInt(r.first_air_date.substring(0, 4)) : null,
    overview: r.overview || null,
    posterPath: localPosterUrl(r.poster_path),
    backdropPath: localBackdropUrl(r.backdrop_path),
    genres: (r.genres ?? []).map((g: any) => g.name),
    seasons: (r.seasons ?? []).filter((s: any) => s.season_number > 0).map((s: any) => ({
      seasonNumber: s.season_number,
      episodeCount: s.episode_count,
      // Store direct CDN URL for season posters (more reliable than local cache)
      posterPath: s.poster_path ? `${TMDB_IMAGE_BASE}${s.poster_path}` : null,
    })),
  }
}

export async function getTmdbSeason(tmdbId: number, seasonNumber: number) {
  const apiKey = await getApiKey()
  const url = `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${apiKey}`
  const r = await fetchJson<any>(url)

  return (r.episodes ?? []).map((e: any) => ({
    episodeNumber: e.episode_number,
    title: e.name || null,
    overview: e.overview || null,
    airDate: e.air_date || null,
  }))
}
