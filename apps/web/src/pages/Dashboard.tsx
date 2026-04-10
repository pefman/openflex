import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { moviesApi, showsApi, downloadsApi, systemApi } from '../api/index.ts'
import type { MovieDto, ShowDto } from '@openflex/shared'
import { slugify } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface RecentEpisode {
  episodeId: number
  showId: number
  showTitle: string
  showPosterPath: string | null
  seasonNumber: number
  episodeNumber: number
  title: string | null
  addedAt: string
}

export default function Dashboard() {
  const { data: movies = [] } = useQuery({ queryKey: ['movies'], queryFn: moviesApi.list })
  const { data: shows = [] } = useQuery({ queryKey: ['shows'], queryFn: showsApi.list })
  const { data: downloads = [] } = useQuery({ queryKey: ['downloads'], queryFn: downloadsApi.list, refetchInterval: 3000 })

  const { data: disk } = useQuery({ queryKey: ['disk'], queryFn: systemApi.disk, refetchInterval: 60_000 })

  const recentMovies = [...movies].sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime()).slice(0, 10)
  const recentShows = [...shows].sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime()).slice(0, 10)

  const recentEpisodes: RecentEpisode[] = shows
    .flatMap((show) =>
      show.seasons.flatMap((season) =>
        season.episodes
          .filter((ep) => ep.mediaFiles.length > 0)
          .map((ep) => ({
            episodeId: ep.id,
            showId: show.id,
            showTitle: show.title,
            showPosterPath: show.posterPath,
            seasonNumber: season.seasonNumber,
            episodeNumber: ep.episodeNumber,
            title: ep.title,
            addedAt: ep.mediaFiles.reduce((latest, f) =>
              f.addedAt > latest ? f.addedAt : latest, ep.mediaFiles[0].addedAt),
          }))
      )
    )
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, 12)
  const activeDownloads = downloads.filter((d) => d.status === 'downloading' || d.status === 'queued')

  return (
    <div className="p-6 space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Movies', value: movies.length },
          { label: 'TV Shows', value: shows.length },
          { label: 'Active Downloads', value: activeDownloads.length },
          {
            label: 'Episodes Available',
            value: shows.reduce((acc, s) => acc + s.seasons.flatMap((se) => se.episodes).filter((e) => e.status === 'downloaded').length, 0),
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Disk Space */}
      {disk && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Free Disk Space</p>
              <p className="text-sm font-semibold">{formatBytes(disk.free)}</p>
            </div>
            <Progress
              value={Math.round((disk.used / disk.total) * 100)}
              className="h-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formatBytes(disk.used)} used of {formatBytes(disk.total)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active Downloads */}
      {activeDownloads.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Active Downloads</h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {activeDownloads.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <Progress value={Math.round(d.progress * 100)} className="mt-1.5 h-1.5" />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {Math.round(d.progress * 100)}%
                    {d.speed ? ` · ${formatSpeed(d.speed)}` : ''}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Recently Added Movies */}
      {recentMovies.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recently Added Movies</h2>
            <Button variant="link" asChild className="text-primary p-0 h-auto">
              <Link to="/movies">View all</Link>
            </Button>
          </div>
          <MediaGrid items={recentMovies} type="movie" />
        </section>
      )}

      {/* Recently Added Shows */}
      {recentShows.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recently Added Shows</h2>
            <Button variant="link" asChild className="text-primary p-0 h-auto">
              <Link to="/shows">View all</Link>
            </Button>
          </div>
          <MediaGrid items={recentShows} type="show" />
        </section>
      )}

      {/* Recently Added Episodes */}
      {recentEpisodes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Recently Added Episodes</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-3">
            {recentEpisodes.map((ep) => (
              <Link
                key={ep.episodeId}
                to={`/shows/${slugify(ep.showTitle)}`}
                className="group"
              >
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted relative">
                  {ep.showPosterPath ? (
                    <img
                      src={ep.showPosterPath}
                      alt={ep.showTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
                      {ep.showTitle}
                    </div>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-semibold text-center py-0.5">
                    S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-medium truncate text-muted-foreground group-hover:text-foreground">{ep.showTitle}</p>
                <p className="text-xs text-muted-foreground truncate">{ep.title ?? ''}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {movies.length === 0 && shows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🎬</p>
          <p className="text-lg font-medium text-foreground">Your library is empty</p>
          <p className="text-sm mt-1">Add movies or shows to get started</p>
          <div className="flex gap-3 justify-center mt-4">
            <Button asChild><Link to="/movies">Add Movies</Link></Button>
            <Button variant="outline" asChild><Link to="/shows">Add Shows</Link></Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MediaGrid({ items, type }: { items: (MovieDto | ShowDto)[]; type: 'movie' | 'show' }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-3">
      {items.map((item) => (
        <Link
          key={item.id}
          to={type === 'movie' ? `/movies/${item.id}` : `/shows/${slugify(item.title)}`}
          className="group"
        >
          <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted">
            {item.posterPath ? (
              <img
                src={item.posterPath}
                alt={item.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
                {item.title}
              </div>
            )}
          </div>
          <p className="mt-1.5 text-xs font-medium truncate text-muted-foreground group-hover:text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">{'year' in item ? item.year : ''}</p>
        </Link>
      ))}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function formatSpeed(bps: number): string {
  if (bps > 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps > 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps.toFixed(0)} B/s`
}
