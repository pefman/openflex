import type { IndexerSearchResult, QualityItem } from '@openflex/shared'
import { log } from '../lib/logger.js'

const RESOLUTION_SCORES: Record<string, number> = {
  '2160p': 100,
  '4k': 100,
  '1080p': 80,
  '720p': 60,
  '480p': 30,
  '360p': 10,
}

const SOURCE_SCORES: Record<string, number> = {
  bluray: 100,
  'blu-ray': 100,
  bdrip: 90,
  brrip: 90,
  webdl: 85,
  'web-dl': 85,
  webrip: 75,
  'web-rip': 75,
  hdtv: 60,
  dvdrip: 50,
  dvdscr: 30,
  telesync: 20,
  ts: 20,
  cam: 5,
}

export interface ScorerKeywords {
  preferred: string[]  // each match adds +10 (max +20 total)
  rejected: string[]   // any match → score 0 instantly
}

export function scoreRelease(title: string, keywords: ScorerKeywords = { preferred: [], rejected: [] }): number {
  const lower = title.toLowerCase()

  // Rejected keywords take absolute priority — score 0, excluded from auto-grab
  for (const kw of keywords.rejected) {
    if (kw && lower.includes(kw.toLowerCase())) return 0
  }

  let resScore = 0
  for (const [key, score] of Object.entries(RESOLUTION_SCORES)) {
    if (lower.includes(key)) { resScore = Math.max(resScore, score); break }
  }

  let srcScore = 0
  for (const [key, score] of Object.entries(SOURCE_SCORES)) {
    if (lower.includes(key)) { srcScore = Math.max(srcScore, score); break }
  }

  // Penalize CAM/SCR heavily
  if (lower.includes('cam') || lower.includes('scr') || lower.includes('ts ') || lower.endsWith('.ts')) {
    srcScore = Math.min(srcScore, 10)
  }

  let base = Math.round((resScore + srcScore) / 2)

  // Preferred keywords boost score (capped at +20 total)
  let bonus = 0
  for (const kw of keywords.preferred) {
    if (kw && lower.includes(kw.toLowerCase())) bonus += 10
    if (bonus >= 20) break
  }

  return Math.min(100, base + bonus)
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Filter raw search results to those that plausibly match the requested episode.
 * Requires the result title to contain:
 *   - The show title as a contiguous phrase (normalized)
 *   - The SxxExx (or NxNN) episode designator
 */
export function filterEpisodeResults(
  results: IndexerSearchResult[],
  showTitle: string,
  season: number,
  episode: number
): IndexerSearchResult[] {
  const normShow = normalizeTitle(showTitle)
  const sxxexx = `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`
  const altEp = `${season}x${String(episode).padStart(2, '0')}`

  const filtered = results.filter((r) => {
    const n = normalizeTitle(r.title)
    if (!n.includes(sxxexx) && !n.includes(altEp)) return false
    return n.includes(normShow)
  })
  log('info', 'indexer', `episode filter "${showTitle}" ${sxxexx}: ${filtered.length}/${results.length} results matched`)
  return filtered
}

export function bestRelease(
  results: IndexerSearchResult[],
  profile: { items: QualityItem[]; minScore: number } | null,
  keywords: ScorerKeywords = { preferred: [], rejected: [] }
): IndexerSearchResult | null {
  if (!results.length) return null

  const minScore = profile?.minScore ?? 0
  const scored = results
    .map((r) => ({ r, score: scoreRelease(r.title, keywords) }))
    .filter(({ score }) => score > 0 && score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Prefer more seeders
      return b.r.seeders - a.r.seeders
    })

  return scored[0]?.r ?? null
}
