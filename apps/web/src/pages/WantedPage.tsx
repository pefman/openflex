import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { moviesApi, showsApi } from '../api/index.ts'
import { slugify } from '@/lib/utils'
import ManualSearchDialog from '../components/ManualSearchDialog.tsx'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export default function WantedPage() {
  const { data: movies = [] } = useQuery({ queryKey: ['movies'], queryFn: moviesApi.list })
  const { data: shows = [] } = useQuery({ queryKey: ['shows'], queryFn: showsApi.list })

  const wantedMovies = movies.filter((m) => m.status === 'wanted' && m.monitored)

  type WantedEpisode = {
    showId: number
    showTitle: string
    showSlug: string
    seasonNumber: number
    episodeId: number
    episodeNumber: number
    episodeTitle: string | null
    airDate: string | null
  }

  const wantedEpisodes: WantedEpisode[] = []
  for (const show of shows) {
    for (const season of show.seasons) {
      for (const ep of season.episodes) {
        if (ep.status === 'wanted' && ep.monitored) {
          wantedEpisodes.push({
            showId: show.id,
            showTitle: show.title,
            showSlug: slugify(show.title),
            seasonNumber: season.seasonNumber,
            episodeId: ep.id,
            episodeNumber: ep.episodeNumber,
            episodeTitle: ep.title,
            airDate: ep.airDate,
          })
        }
      }
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Wanted</h1>

      {/* Movies */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Movies ({wantedMovies.length})
        </h2>
        {wantedMovies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wanted movies.</p>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {wantedMovies.map((movie) => (
                <div key={movie.id} className="flex items-center gap-3 px-4 py-3">
                  {movie.posterPath && (
                    <img src={movie.posterPath} alt="" className="h-10 w-7 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/movies/${movie.id}`}
                      className="text-sm font-medium hover:text-primary truncate block"
                    >
                      {movie.title}
                    </Link>
                    {movie.year && <p className="text-xs text-muted-foreground">{movie.year}</p>}
                  </div>
                  <Badge variant="outline" className="badge-wanted shrink-0">wanted</Badge>
                  <ManualSearchDialog type="movie" movieId={movie.id} label={movie.title} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Episodes */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Episodes ({wantedEpisodes.length})
        </h2>
        {wantedEpisodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wanted episodes.</p>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {wantedEpisodes.map((ep) => (
                <div key={ep.episodeId} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/shows/${ep.showSlug}`}
                      className="text-sm font-medium hover:text-primary truncate block"
                    >
                      {ep.showTitle}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                      {ep.episodeTitle && ` · ${ep.episodeTitle}`}
                      {ep.airDate && ` · ${ep.airDate}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="badge-wanted shrink-0">wanted</Badge>
                  <ManualSearchDialog
                    type="episode"
                    showId={ep.showId}
                    episodeId={ep.episodeId}
                    label={`${ep.showTitle} S${String(ep.seasonNumber).padStart(2,'0')}E${String(ep.episodeNumber).padStart(2,'0')}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
