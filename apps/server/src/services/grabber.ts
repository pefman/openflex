import { db } from '../db/client.js'
import { PATHS } from '../lib/dataDirs.js'
import { processQueue } from './queue.js'
import { log } from '../lib/logger.js'
import type { IndexerSearchResult } from '@openflex/shared'

export async function grabRelease(
  release: IndexerSearchResult,
  movieId: number | null,
  episodeId: number | null
): Promise<number> {
  const isTorrent = !!(release.magnetUrl || release.infoHash || release.link.includes('.torrent'))
  const type = isTorrent ? 'torrent' : 'usenet'
  const sourceUrl = isTorrent
    ? (release.magnetUrl || (release.infoHash ? `magnet:?xt=urn:btih:${release.infoHash}` : release.link))
    : release.link

  // Find current max queuePos so new item goes to the end
  const maxPos = await db.download.aggregate({ _max: { queuePos: true }, where: { status: 'queued' } })
  const queuePos = (maxPos._max.queuePos ?? -1) + 1

  const download = await db.download.create({
    data: {
      type,
      title: release.title,
      status: 'queued',
      progress: 0,
      size: release.size || null,
      savePath: PATHS.downloads,
      sourceUrl,
      queuePos,
      movieId,
      episodeId,
    },
  })

  log('info', 'grabber', `queued ${type} download #${download.id}: "${release.title}" size=${release.size ? (release.size / 1024 / 1024).toFixed(0) + ' MB' : 'unknown'} indexer=${release.indexerId ?? 'n/a'}`)
  processQueue().catch((err) => log('error', 'grabber', `queue error: ${err}`))

  return download.id
}
