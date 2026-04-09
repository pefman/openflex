import fs from 'fs/promises'
import path from 'path'

export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data')

export const PATHS = {
  db: path.join(DATA_DIR, 'openflex.db'),
  downloads: path.join(DATA_DIR, 'downloads'),
  media: path.join(DATA_DIR, 'media'),
  movies: path.join(DATA_DIR, 'media', 'Movies'),
  shows: path.join(DATA_DIR, 'media', 'Shows'),
  cache: path.join(DATA_DIR, 'cache'),
  posters: path.join(DATA_DIR, 'cache', 'posters'),
  backdrops: path.join(DATA_DIR, 'cache', 'backdrops'),
  hls: path.join(DATA_DIR, 'cache', 'hls'),
}

export async function ensureDataDirs() {
  for (const dir of Object.values(PATHS)) {
    if (dir.endsWith('.db')) continue
    await fs.mkdir(dir, { recursive: true })
  }
}
