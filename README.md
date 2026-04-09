# OpenFlex

A self-hosted media manager for movies and TV shows. Search, download, organise, and stream your library — all from one interface.

## Features

**Library**
- Add movies and shows via TMDB search
- Automatic metadata (posters, overviews, ratings, genres)
- Monitored status — mark content as wanted and let the scheduler find it

**Downloads**
- Usenet (NZB) — multi-part download, yEnc decode, RAR extraction
- Torrent — magnet / .torrent support via WebTorrent
- Auto-import: moves completed files into your library and links them to movies/episodes
- Download queue with live progress, speed, and ETA

**Indexer Search**
- Newznab-compatible indexers (NZBGeek, etc.)
- Torznab-compatible indexers
- Manual search dialog with sortable results (score, size, date, seeders)
- Quality scoring based on resolution and source (BluRay, WEB-DL, etc.)
- **Keyword filters** — define rejected keywords (score 0, excluded from auto-grab) and preferred keywords (score boost) in Settings → Quality

**Scheduler**
- Configurable interval (15 min – 24 h)
- Searches all enabled indexers for every wanted movie and episode
- Respects quality profiles and keyword filters
- Skips episodes that haven't aired yet

**Streaming & Playback**
- Direct play with HTTP range support
- HLS transcoding via ffmpeg — non-blocking, starts streaming after the first segment
- Quality presets: original, 1080p, 720p, 480p
- Subtitle extraction and in-player selector (WebVTT)
- Chromecast support via Google Cast SDK
- Playback position save/restore per user

**Settings**
- TMDB API key
- Scheduler interval
- Downloads cleanup (scheduled removal of orphaned files)
- Indexer management
- Usenet server configuration (SSL, connection pooling)
- Quality profiles with min-score thresholds
- Keyword filters (preferred / rejected)

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node 20, Fastify v5, Prisma + SQLite |
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| Transcoding | ffmpeg (ffmpeg-static), fluent-ffmpeg |
| Monorepo | pnpm workspaces, TypeScript throughout |

## Quick Start

### Docker (recommended)

```bash
TMDB_API_KEY=your_key_here docker compose up -d
```

Open [http://localhost:7878](http://localhost:7878), register your account, and add your TMDB key in Settings → General.

### Development

Requires Node 20+ and pnpm.

```bash
pnpm install
bash run.sh --dev
```

The dev server runs on [http://localhost:5173](http://localhost:5173) with hot reload. The API runs on port 7878.

## Configuration

All configuration is via environment variables (or `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7878` | API + web server port |
| `DATA_DIR` | `./data` | Library data, cache, downloads |
| `DATABASE_URL` | `file:./data/openflex.db` | SQLite database path |
| `JWT_SECRET` | dev default | **Change in production** |
| `TMDB_API_KEY` | — | Required for metadata search |
| `LOG_LEVEL` | `info` | Fastify log level |

## Data Layout

```
data/
  openflex.db          # SQLite database
  cache/
    images/            # Cached TMDB posters/backdrops
    hls/               # HLS transcode segments
  downloads/           # Active download working directory
  media/               # Organised library (movies + shows)
```

## API

All routes require `Authorization: Bearer <jwt>` except `/auth/register` and `/auth/login`.

| Prefix | Description |
|--------|-------------|
| `POST /auth/register` | Create account |
| `POST /auth/login` | Get JWT |
| `GET/POST /api/movies` | Movie library |
| `GET /api/movies/:id/search` | Search indexers for a movie |
| `POST /api/movies/:id/grab` | Grab a specific release |
| `GET/POST /api/shows` | Show library |
| `GET /api/shows/:id/episodes/:eid/search` | Search indexers for an episode |
| `GET/PUT /api/downloads` | Download queue |
| `GET /api/stream/:id` | Direct play (Range support) |
| `GET /api/stream/:id/hls` | Start HLS transcode |
| `POST /api/stream/:id/token` | Issue stream token (for Chromecast) |
| `GET /api/stream/:id/subtitles` | Extract subtitle tracks |
| `GET/PUT /api/settings` | App settings |
| `GET/POST /api/quality-profiles` | Quality profiles |
| `GET /api/logs` | Recent server logs |
