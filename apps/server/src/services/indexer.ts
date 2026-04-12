import https from 'https'
import http from 'http'
import { XMLParser } from 'fast-xml-parser'
import type { IndexerSearchResult } from '@openflex/shared'
import { log } from '../lib/logger.js'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '_' })

async function fetchXml(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const options = {
      headers: { 'User-Agent': 'OpenFlex/1.0 (compatible; newznab)' },
    }
    proto.get(url, options, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(parser.parse(data)) } catch (e) { reject(e) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function buildUrl(baseUrl: string, apiKey: string, params: Record<string, string>): string {
  const url = new URL(baseUrl.trim().replace(/\/$/, '') + '/api')
  url.searchParams.set('apikey', apiKey)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return url.toString()
}

function parseItems(xml: any): IndexerSearchResult[] {
  const items = xml?.rss?.channel?.item
  if (!items) return []
  const arr = Array.isArray(items) ? items : [items]

  return arr.map((item: any): IndexerSearchResult => {
    const attrs: Record<string, string> = {}
    const torznabAttrs = item['torznab:attr'] ?? item['newznab:attr'] ?? []
    const attrArr = Array.isArray(torznabAttrs) ? torznabAttrs : [torznabAttrs]
    for (const a of attrArr) {
      if (a?._name) attrs[a._name] = a._value ?? ''
    }

    const enclosure = item.enclosure || {}
    const link = item.link || enclosure._url || ''
    const magnetUrl = attrs['magneturl'] || item.magneturl || null
    const infoHash = attrs['infohash'] || null

    return {
      title: item.title ?? '',
      size: parseInt(attrs['size'] || enclosure._length || '0') || 0,
      seeders: parseInt(attrs['seeders'] || '0') || 0,
      leechers: parseInt(attrs['peers'] || '0') || 0,
      grabs: parseInt(attrs['grabs'] || '0') || 0,
      link,
      magnetUrl,
      infoHash,
      indexerId: 0,
      indexerName: '',
      indexerType: '',
      publishDate: item.pubDate || null,
    }
  }).filter((r) => r.title)
}

export async function testIndexer(url: string, apiKey: string): Promise<boolean> {
  try {
    const fullUrl = buildUrl(url, apiKey, { t: 'caps' })
    const xml = await fetchXml(fullUrl)
    return !!xml?.caps || !!xml?.rss
  } catch {
    return false
  }
}

export async function searchIndexer(
  baseUrl: string,
  apiKey: string,
  indexerId: number,
  indexerName: string,
  indexerType: string,
  params: Record<string, string>
): Promise<IndexerSearchResult[]> {
  const url = buildUrl(baseUrl, apiKey, { t: 'search', limit: '50', ...params })
  log('info', 'indexer', `querying indexer #${indexerId} (${indexerName}) — ${describeParams(params)}`)
  try {
    const xml = await fetchXml(url)
    const results = parseItems(xml).map((r) => ({ ...r, indexerId, indexerName, indexerType }))
    log('info', 'indexer', `indexer #${indexerId} (${indexerName}) returned ${results.length} result(s) for ${describeParams(params)}`)
    return results
  } catch (err) {
    log('error', 'indexer', `indexer #${indexerId} (${indexerName}) request failed: ${err}`)
    throw err
  }
}

function describeParams(params: Record<string, string>): string {
  if (params.tvdbid) return `tvsearch tvdbid=${params.tvdbid} S${String(params.season ?? '').padStart(2,'0')}E${String(params.ep ?? '').padStart(2,'0')}`
  if (params.season || params.ep) return `tvsearch q="${params.q ?? ''}" S${String(params.season ?? '').padStart(2,'0')}E${String(params.ep ?? '').padStart(2,'0')}`
  if (params.q) return `q="${params.q}"`
  if (params.imdbid) return `imdbid=${params.imdbid}`
  return JSON.stringify(params)
}

export async function searchMovieOnIndexer(
  baseUrl: string,
  apiKey: string,
  indexerId: number,
  indexerName: string,
  indexerType: string,
  imdbId: string | null,
  title: string,
  year: number | null
): Promise<IndexerSearchResult[]> {
  const params: Record<string, string> = { t: 'movie', limit: '100' }
  if (imdbId) params['imdbid'] = imdbId.replace('tt', '')
  else params['q'] = year ? `${title} ${year}` : title
  return searchIndexer(baseUrl, apiKey, indexerId, indexerName, indexerType, params)
}

export async function searchEpisodeOnIndexer(
  baseUrl: string,
  apiKey: string,
  indexerId: number,
  indexerName: string,
  indexerType: string,
  tvdbId: number | null,
  showTitle: string,
  season: number,
  episode: number
): Promise<IndexerSearchResult[]> {
  const sxxexx = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`

  // Tier 1: TVDB structured tvsearch — most precise, returns only the exact episode
  if (tvdbId) {
    const results = await searchIndexer(baseUrl, apiKey, indexerId, indexerName, indexerType, {
      t: 'tvsearch', limit: '100',
      tvdbid: String(tvdbId), season: String(season), ep: String(episode),
    })
    if (results.length > 0) return results
    log('info', 'indexer', `indexer #${indexerId} (${indexerName}) TVDB tvsearch returned 0 — trying title tvsearch`)
  }

  // Tier 2: title-based tvsearch with structured season/ep params
  const tvTitleResults = await searchIndexer(baseUrl, apiKey, indexerId, indexerName, indexerType, {
    t: 'tvsearch', limit: '100',
    q: showTitle, season: String(season), ep: String(episode),
  })
  if (tvTitleResults.length > 0) return tvTitleResults
  log('info', 'indexer', `indexer #${indexerId} (${indexerName}) tvsearch q returned 0 — falling back to full text search`)

  // Tier 3: plain text search — for indexers that don't support tvsearch at all
  return searchIndexer(baseUrl, apiKey, indexerId, indexerName, indexerType, {
    q: `${showTitle} ${sxxexx}`, limit: '100',
  })
}
