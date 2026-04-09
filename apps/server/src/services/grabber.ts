import { db } from '../db/client.js'
import { PATHS } from '../lib/dataDirs.js'
import { addTorrent } from './torrent.js'
import { addNzbDownload } from './usenet.js'
import { log } from '../lib/logger.js'
import type { IndexerSearchResult } from '@openflex/shared'

export async function grabRelease(
  release: IndexerSearchResult,
  movieId: number | null,
  episodeId: number | null
): Promise<number> {
  const isTorrent = !!(release.magnetUrl || release.infoHash || release.link.includes('.torrent'))
  const type = isTorrent ? 'torrent' : 'usenet'

  const download = await db.download.create({
    data: {
      type,
      title: release.title,
      status: 'queued',
      progress: 0,
      size: release.size || null,
      savePath: PATHS.downloads,
      movieId,
      episodeId,
    },
  })

  if (isTorrent) {
    const magnet = release.magnetUrl || (release.infoHash ? `magnet:?xt=urn:btih:${release.infoHash}` : release.link)
    log('info', 'grabber', `queuing torrent for download #${download.id}: ${release.title}`)
    addTorrent(magnet, download.id, PATHS.downloads).catch((err) => {
      log('error', 'grabber', `torrent error for download #${download.id}: ${err}`)
      db.download.update({ where: { id: download.id }, data: { status: 'failed', error: String(err) } }).catch(() => {})
    })
  } else {
    log('info', 'grabber', `queuing usenet NZB for download #${download.id}: ${release.title}`)
    addNzbDownload(release.link, download.id, PATHS.downloads).catch((err) => {
      log('error', 'grabber', `usenet error for download #${download.id}: ${err}`)
      db.download.update({ where: { id: download.id }, data: { status: 'failed', error: String(err) } }).catch(() => {})
    })
  }

  return download.id
}
